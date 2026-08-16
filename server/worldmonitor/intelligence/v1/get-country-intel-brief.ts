declare const process: { env: Record<string, string | undefined> };

import type {
  ServerContext,
  GetCountryIntelBriefRequest,
  GetCountryIntelBriefResponse,
} from '../../../../src/generated/server/worldmonitor/intelligence/v1/service_server';

import { cachedFetchJson, checkRateLimit } from '../../../_shared/redis';
import { UPSTREAM_TIMEOUT_MS, TIER1_COUNTRIES } from './_shared';
import { XMLParser } from 'fast-xml-parser';

// ========================================================================
// Constants
// ========================================================================
const INTEL_CACHE_TTL = 43200; // 12 hours
// ========================================================================
// Free Web Scraper (DuckDuckGo HTML)
// ========================================================================
async function fetchFreeNewsContext(countryName: string): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(countryName + ' news')}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!resp.ok) return 'No reliable news data could be retrieved at this time.';
    
    const text = await resp.text();
    const snippets: string[] = [];
    const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = regex.exec(text)) !== null && snippets.length < 10) {
      let cleanSnippet = match[1].replace(/<[^>]*>?/gm, '').trim();
      cleanSnippet = cleanSnippet.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      if (cleanSnippet) snippets.push(`- ${cleanSnippet}`);
    }
    
    return snippets.length > 0 ? snippets.join('\n') : 'No recent verified news found.';
  } catch (err) {
    console.error('[fetchFreeNewsContext] Error scraping news:', err);
    return 'News context unavailable.';
  }
}

// ========================================================================
// RSS Fetcher
// ========================================================================
async function fetchRssNewsContext(countryName: string): Promise<string> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(countryName + ' news')}&hl=en-US&gl=US&ceid=US:en`;
    const resp = await fetch(url);
    if (!resp.ok) return '';
    
    const xml = await resp.text();
    const parser = new XMLParser();
    const parsed = parser.parse(xml);
    
    const items = parsed?.rss?.channel?.item;
    if (!items) return '';
    
    const itemList = Array.isArray(items) ? items : [items];
    const snippets = itemList.slice(0, 5).map((item: any) => `- ${item.title} (${item.pubDate})`);
    
    return snippets.join('\n');
  } catch (err) {
    console.error('[fetchRssNewsContext] Error fetching RSS:', err);
    return '';
  }
}

// ========================================================================
// RPC handler
// ========================================================================

export async function getCountryIntelBrief(
  _ctx: ServerContext,
  req: GetCountryIntelBriefRequest,
): Promise<GetCountryIntelBriefResponse> {
  const empty: GetCountryIntelBriefResponse = {
    countryCode: req.countryCode,
    countryName: '',
    brief: '',
    model: 'gemini-1.5-pro',
    generatedAt: Date.now(),
  };

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('[CountryIntelBrief] Missing GEMINI_API_KEY in environment variables');
    return empty;
  }

  const rawIp = _ctx.headers['x-forwarded-for'] || _ctx.headers['x-real-ip'] || 'unknown';
  const ip = rawIp.split(',')[0].trim();
  
  if (ip !== 'unknown') {
    const isAllowed = await checkRateLimit(`ratelimit:brief:${ip}`, 30, 86400);
    if (!isAllowed) {
      return { ...empty, brief: 'RATE_LIMIT_EXCEEDED' };
    }
  }

  const cacheKey = `ci-sebuf:v2:${req.countryCode}`;
  const countryName = TIER1_COUNTRIES[req.countryCode] || req.countryCode;
  const now = new Date();
  const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;

  const systemPrompt = `You are a senior intelligence analyst providing comprehensive country situation briefs. Current date: ${dateStr}. Provide geopolitical context appropriate for the current date.

Write a concise intelligence brief for the requested country covering:
1. Heading - Must be exactly:
   <Country Name> Intelligence Briefing
   Dated: ${dateStr}
2. Current Situation - what is happening right now
3. Military & Security Posture
4. Key Risk Factors
5. Regional Context
6. Outlook & Watch Items
7. Sources - list the relevant news feeds used, if available, and provide the specific dates of the sourced data to assure the user of its recency.

Rules:
- USE PROVIDED CONTEXT: You must base your briefing exclusively on the "Recent Verified News" provided in the prompt. Focus on reputable news agencies (BBC, NPR, CBC, SkyNews, AP, Reuters, Al Jazeera, Al Arabiya, ABC, CBS) if they are mentioned.
- STRICT REQUIREMENT: You are explicitly prohibited from using the White House official press outlet, whitehouse.gov, or any whitehouse.gov subdomains as a source. Do not cite them.
- RECENT DATA ONLY: Prioritize information from the last 24-72 hours.
- STRICT REQUIREMENT: You are explicitly prohibited from providing made up names, places, or information in place of real data. This includes making up articles from the news agencies listed. Do not hallucinate. If you cannot find data, simply output "NO RELIABLE DATA AT THIS TIME", and provide reasoning.
- STRICT REQUIREMENT: Do not include any preambles, introductory phrases, or courtesy text (e.g., "Here is the briefing", "Certainly"). Start immediately with the Heading.
- STRICT REQUIREMENT: You are specifically prohibited from fabricating stories, events, or statistics about ongoing protests, civil unrest, or demonstrations. If no verified reports exist in your source data, do not mention them.
- Be specific and analytical
- STRICT REQUIREMENT: At the end of every briefing, be absolutely sure to append this exact disclaimer: "DISCLAIMER: This briefing was generated by an AI assistant. AI can make mistakes. Be sure to cross-reference the information provided with reputable news sources."
- 4-5 paragraphs, 250-350 words (unless outputting the no data available message)
- No speculation beyond what data supports
- Use plain language, not jargon
- STRICT REQUIREMENT: You are strictly prohibited from including any code blocks, programming code, or technical markdown formatting (like \`\`\`) in your response. The briefing must be written entirely in natural language.`;

  let debugError = '';

  const result = await cachedFetchJson<GetCountryIntelBriefResponse | null>(cacheKey, INTEL_CACHE_TTL, async () => {
    try {
      const [ddgContext, rssContext] = await Promise.all([
        fetchFreeNewsContext(countryName),
        fetchRssNewsContext(countryName)
      ]);
      const recentNewsContext = `[DuckDuckGo Web Search Results]\n${ddgContext}\n\n[Google News RSS Feed]\n${rssContext || 'No RSS data available.'}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiApiKey}`;
      const resp = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: `### Target Country ###\n${countryName} (${req.countryCode})\n\n### Recent Verified News ###\n${recentNewsContext}` }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            topP: 0.8
          }
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      if (resp.ok) {
        const data = (await resp.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const brief = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        if (brief) {
          return {
            countryCode: req.countryCode,
            countryName,
            brief,
            model: 'gemini-3.5-flash-lite',
            generatedAt: Date.now(),
          };
        }
        debugError = `No brief returned. API Data: ${JSON.stringify(data)}`;
      } else {
        const errText = await resp.text();
        console.error('[CountryIntelBrief] Gemini API HTTP Error:', resp.status, errText);
        debugError = `HTTP ${resp.status}: ${errText}`;
      }
    } catch (err: any) {
      console.error('[CountryIntelBrief] Gemini API debug error:', err);
      debugError = `Fetch Exception: ${err.message}`;
    }

    return null;
  });

  if (debugError) {
    return {
      countryCode: req.countryCode,
      countryName,
      brief: `DEBUG AI ERROR: ${debugError}`,
      model: 'gemini-3.5-flash-lite',
      generatedAt: Date.now(),
    };
  }

  return result || empty;
}
