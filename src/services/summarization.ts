/**
 * Summarization & Translation Service — Inert stub for fallback dashboard
 * All AI summarization and inference is disabled.
 */

export type SummarizationProvider = 'ollama' | 'gemini' | 'openrouter' | 'browser' | 'cache';

export interface SummarizationResult {
  summary: string;
  provider: SummarizationProvider;
  model: string;
  cached: boolean;
}

export type ProgressCallback = (step: number, total: number, message: string) => void;

export interface SummarizeOptions {
  skipCloudProviders?: boolean;
  skipBrowserFallback?: boolean;
}

/**
 * Generate summary — disabled in fallback mode.
 */
export async function generateSummary(
  _headlines: string[],
  _onProgress?: ProgressCallback,
  _geoContext?: string,
  _lang: string = 'en',
  _options?: SummarizeOptions,
): Promise<SummarizationResult | null> {
  return null;
}

/**
 * Translate text using Google's non-LLM translation API hook (with automatic fallback
 * to Google's pre-trained neural translation engine; LLM providers disabled in fallback mode).
 * @param text Text to translate
 * @param targetLang Target language code (defaults to 'en')
 * @param sourceLang Optional source language code (e.g., 'es', 'de', 'ru', 'auto')
 */
export async function translateText(
  text: string,
  targetLang: string = 'en',
  sourceLang?: string,
  _onProgress?: ProgressCallback,
): Promise<string | null> {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const target = targetLang || 'en';
  const source = sourceLang && sourceLang !== 'auto' ? sourceLang : undefined;

  // 1. Google Pre-Trained Translation API Hook (non-LLM: Cloud Translation v2 & Neural Translation)
  try {
    const params = new URLSearchParams({
      text: trimmed,
      target,
    });
    if (source) {
      params.set('source', source);
    }
    const res = await fetch(`/api/translate?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.translatedText && typeof data.translatedText === 'string') {
        const translated = data.translatedText.trim();
        if (translated && translated !== trimmed) {
          return translated;
        }
      }
    }
  } catch (err) {
    console.warn('[translateText] Google translation via /api/translate failed, trying direct pre-trained engine fallback:', err);
  }

  // 2. Direct Google Pre-Trained Neural Translation Engine (client=gtx) fallback
  try {
    const sl = source ? encodeURIComponent(source) : 'auto';
    const tl = encodeURIComponent(target);
    const q = encodeURIComponent(trimmed);
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${q}`;
    const gtxRes = await fetch(gtxUrl, {
      signal: AbortSignal.timeout(6000),
    });
    if (gtxRes.ok) {
      const json = await gtxRes.json();
      if (Array.isArray(json) && Array.isArray(json[0])) {
        const parts = json[0].map((item: any) => (Array.isArray(item) ? item[0] : '')).filter(Boolean);
        const translated = parts.join('').trim();
        if (translated && translated !== trimmed) {
          return translated;
        }
      }
    }
  } catch {
    // LLM fallback is disabled in fallback mode
  }

  return null;
}
