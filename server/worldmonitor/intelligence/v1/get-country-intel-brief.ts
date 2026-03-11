declare const process: { env: Record<string, string | undefined> };

import type {
  ServerContext,
  GetCountryIntelBriefRequest,
  GetCountryIntelBriefResponse,
} from '../../../../src/generated/server/worldmonitor/intelligence/v1/service_server';

import { cachedFetchJson } from '../../../_shared/redis';
import { UPSTREAM_TIMEOUT_MS, GROQ_API_URL, TIER1_COUNTRIES } from './_shared';
import { CHROME_UA } from '../../../_shared/constants';

// ========================================================================
// Constants
// ========================================================================
const INTEL_CACHE_TTL = 1800; // 30 minutes
// ========================================================================
// RPC handler
// ========================================================================

const GROQ_MODEL = ['groq/compound-mini'];

export async function getCountryIntelBrief(
  _ctx: ServerContext,
  req: GetCountryIntelBriefRequest,
): Promise<GetCountryIntelBriefResponse> {
  const empty: GetCountryIntelBriefResponse = {
    countryCode: req.countryCode,
    countryName: '',
    brief: '',
    model: GROQ_MODEL[0],
    generatedAt: Date.now(),
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return empty;

  const cacheKey = `ci-sebuf:v1:${req.countryCode}`;
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
- STRICT REQUIREMENT: Your briefing must be fed ONLY news feeds (BBC, NPR, CBC, SkyNews, AP, Reuters, Al Jazeera, Al Arabiya, ABC, CBS) for the designated country.
- STRICT REQUIREMENT: If no recent data (within 3 days of ${dateStr}) is available, you must simply output: "NO CURRENT DATA IS AVAILABLE, CHECK BACK LATER."
- STRICT REQUIREMENT: You are explicitly prohibited from providing made up names, places, or information in place of real data. Do not hallucinate.
- STRICT REQUIREMENT: Do not include any preambles, introductory phrases, or courtesy text (e.g., "Here is the briefing", "Certainly"). Start immediately with the Heading.
- STRICT REQUIREMENT: You are specifically prohibited from fabricating stories, events, or statistics about ongoing protests, civil unrest, or demonstrations. If no verified reports exist in your source data, do not mention them.
- Be specific and analytical
- 4-5 paragraphs, 250-350 words (unless outputting the no data available message)
- No speculation beyond what data supports
- Use plain language, not jargon`;

  const result = await cachedFetchJson<GetCountryIntelBriefResponse | null>(cacheKey, INTEL_CACHE_TTL, async () => {
    for (const model of GROQ_MODEL) {
      try {
        const resp = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': CHROME_UA,
            'Groq-Model-Version': 'latest'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Country: ${countryName} (${req.countryCode})` },
            ],
            temperature: 0.4,
            max_tokens: 900,
            compound_custom: {
              tools: {
                enabled_tools: ['browser_automation', 'web_search', 'visit_website']
              }
            }
          }),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });

        if (!resp.ok) continue;
        const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const brief = data.choices?.[0]?.message?.content?.trim() || '';
        if (!brief) continue;

        return {
          countryCode: req.countryCode,
          countryName,
          brief,
          model: model,
          generatedAt: Date.now(),
        };
      } catch {
        continue;
      }
    }
    return null;
  });

  return result || empty;
}
