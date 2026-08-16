declare const process: { env: Record<string, string | undefined> };

// ========================================================================
// Constants
// ========================================================================

export const CACHE_TTL_SECONDS = 86400; // 24 hours
export const CACHE_VERSION = 'v5';

// ========================================================================
// Hash utility (unified FNV-1a 52-bit -- H-7 fix)
// ========================================================================

import { hashString } from '../../../_shared/hash';
export { hashString };

// ========================================================================
// Cache key builder (ported from _summarize-handler.js)
// ========================================================================

export function getCacheKey(
  headlines: string[],
  mode: string,
  geoContext: string = '',
  variant: string = 'full',
  lang: string = 'en',
): string {
  const sorted = headlines.slice(0, 5).sort().join('|');
  const geoHash = geoContext ? ':g' + hashString(geoContext).slice(0, 6) : '';
  const hash = hashString(`${mode}:${sorted}`);
  const normalizedVariant = typeof variant === 'string' && variant ? variant.toLowerCase() : 'full';
  const normalizedLang = typeof lang === 'string' && lang ? lang.toLowerCase() : 'en';

  if (mode === 'translate') {
    const targetLang = normalizedVariant || normalizedLang;
    return `summary:${CACHE_VERSION}:${mode}:${targetLang}:${hash}${geoHash}`;
  }

  return `summary:${CACHE_VERSION}:${mode}:${normalizedVariant}:${normalizedLang}:${hash}${geoHash}`;
}

// ========================================================================
// Headline deduplication (used by SummarizeArticle)
// ========================================================================

// @ts-ignore -- plain JS module, no .d.mts needed for this pure function
export { deduplicateHeadlines } from './dedup.mjs';

// ========================================================================
// SummarizeArticle: Full prompt builder (ported from _summarize-handler.js)
// ========================================================================

export function buildArticlePrompts(
  headlines: string[],
  uniqueHeadlines: string[],
  opts: { mode: string; geoContext: string; variant: string; lang: string },
): { systemPrompt: string; userPrompt: string } {
  const headlineText = uniqueHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n');
  const intelSection = opts.geoContext ? `\n\n${opts.geoContext}` : '';
  const isTechVariant = opts.variant === 'tech';
  const dateContext = `Current date: ${new Date().toISOString().split('T')[0]}.${isTechVariant ? '' : ' Provide geopolitical context appropriate for the current date.'}`;
  const langInstruction = opts.lang && opts.lang !== 'en' ? `\nIMPORTANT: Output the summary in ${opts.lang.toUpperCase()} language.` : '';

  let systemPrompt: string;
  let userPrompt: string;

  if (opts.mode === 'brief') {
    if (isTechVariant) {
      systemPrompt = `${dateContext}

Summarize the single most important tech/startup headline in 2 concise sentences (under 60 words total).
Rules:
- Treat each numbered headline as a separate story.
- Select only the one most significant headline and summarize its facts exclusively.
- Focus strictly on technology, startups, AI, funding, product launches, or developer news.
- Exclude political news or government actions unless directly related to tech regulation.
- Lead with the company, product, or technology name.
- Output direct facts only in paragraph form. Omit bullet points, meta-commentary, or elaboration.${langInstruction}`;
    } else {
      systemPrompt = `${dateContext}

Summarize the single most important headline in 2 concise sentences (under 60 words total).
Rules:
- Treat each numbered headline as a separate, unrelated story.
- Select only the one most significant headline and summarize its facts exclusively.
- Lead directly with what happened and where.
- Start your response immediately with the subject of the chosen headline. Omit introductory phrases (e.g., "Breaking news", "Good evening").
- If intelligence context is provided, integrate it only if it relates directly to your chosen headline.
- Output direct facts only. Omit bullet points, meta-commentary, or elaboration.${langInstruction}`;
    }
    userPrompt = `Pick the most important single story from the headlines below and summarize it:\n\n### Headlines ###\n${headlineText}\n### Context ###${intelSection}`;
  } else if (opts.mode === 'analysis') {
    if (isTechVariant) {
      systemPrompt = `${dateContext}

Analyze the most significant tech/startup development in 2 concise sentences (under 60 words total).
Rules:
- Treat each numbered headline as a separate, unrelated story.
- Select only the one most significant story and analyze its implications exclusively.
- Focus strictly on technology implications: funding trends, AI developments, market shifts, product strategy.
- Exclude political implications or government actions unless directly related to tech policy.
- Lead directly with the insight. Omit filler text or elaboration.`;
    } else {
      systemPrompt = `${dateContext}

Analyze the most significant development in 2 concise sentences (under 60 words total). Be direct and specific.
Rules:
- Treat each numbered headline as a separate, unrelated story.
- Select only the one most significant story and analyze its implications exclusively.
- Lead directly with the insight explaining what is significant and why.
- Start your response immediately with substance. Omit introductory phrases (e.g., "Breaking news", "The key narrative is").
- Omit filler text or elaboration.
- If intelligence context is provided, integrate it only if it relates directly to your chosen headline.`;
    }
    userPrompt = isTechVariant
      ? `What is the key tech trend based on these headlines?\n\n### Headlines ###\n${headlineText}\n### Context ###${intelSection}`
      : `What is the key pattern or risk based on these headlines?\n\n### Headlines ###\n${headlineText}\n### Context ###${intelSection}`;
  } else if (opts.mode === 'translate') {
    const targetLang = opts.variant;
    systemPrompt = `You are a professional news translator. Translate the following text into ${targetLang}.
Rules:
- Maintain the original tone and journalistic style.
- Output ONLY the translated text. Omit all conversational filler.
- If the text is already in ${targetLang}, return it as is.`;
    userPrompt = `Translate the following to ${targetLang}:\n\n### Text to Translate ###\n${headlines[0]}`;
  } else {
    systemPrompt = isTechVariant
      ? `${dateContext}\n\nSummarize the most important tech headline in 2 concise sentences (under 60 words). Treat each headline as a separate story. Select one story and summarize it exclusively. Focus on startups, AI, funding, and products. Exclude politics unless directly about tech regulation.${langInstruction}`
      : `${dateContext}\n\nSummarize the most important headline in 2 concise sentences (under 60 words). Treat each headline as a separate, unrelated story. Select one story and summarize it exclusively. Lead directly with substance. Omit introductory phrases like "Breaking news".${langInstruction}`;
    userPrompt = `Key takeaway from the most important headline:\n\n### Headlines ###\n${headlineText}\n### Context ###${intelSection}`;
  }

  return { systemPrompt, userPrompt };
}

// ========================================================================
// SummarizeArticle: Provider credential resolution
// ========================================================================

export interface ProviderCredentials {
  apiUrl: string;
  model: string;
  headers: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

export function getProviderCredentials(provider: string): ProviderCredentials | null {
  if (provider === 'ollama') {
    const baseUrl = process.env.OLLAMA_API_URL;
    if (!baseUrl) return null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.OLLAMA_API_KEY;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return {
      apiUrl: new URL('/v1/chat/completions', baseUrl).toString(),
      model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
      headers,
      extraBody: { think: false },
    };
  }

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'gemini-3.6-flash',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openrouter/free',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://worldmonitor.app',
        'X-Title': 'WorldMonitor',
      },
    };
  }

  return null;
}
