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
// Brave Search API (News)
// ========================================================================
async function fetchBraveNewsContext(countryName: string): Promise<string> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.warn('[fetchBraveNewsContext] Missing BRAVE_API_KEY, skipping Brave news search.');
    return 'Brave API key not configured.';
  }

  try {
    const url = `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(countryName + ' news')}&count=10&freshness=pw`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey
      }
    });

    if (!resp.ok) return 'No reliable news data could be retrieved at this time.';
    
    const data = await resp.json() as { results?: Array<{ title?: string, description?: string }> };
    if (!data.results || data.results.length === 0) {
      return 'No recent verified news found.';
    }

    const snippets = data.results.map(item => {
      const title = item.title || '';
      const desc = item.description || '';
      return `- ${title}: ${desc}`;
    });
    
    return snippets.join('\n');
  } catch (err) {
    console.error('[fetchBraveNewsContext] Error fetching Brave news:', err);
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
  const ipStr = Array.isArray(rawIp) ? rawIp[0] : rawIp;
  const ip = (ipStr || 'unknown').split(',')[0].trim();
  
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
      const [braveContext, rssContext] = await Promise.all([
        fetchBraveNewsContext(countryName),
        fetchRssNewsContext(countryName)
      ]);
      const recentNewsContext = `[Brave Web Search Results]\n${braveContext}\n\n[Google News RSS Feed]\n${rssContext || 'No RSS data available.'}`;

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
