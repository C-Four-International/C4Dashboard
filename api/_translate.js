// Google Pre-Trained Translation API Hook & Neural Translation Utilities
// Shared lightweight module to prevent loading heavy scraping logic in /api/translate

export const NON_ENGLISH_REGEX = /[\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u4E00-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\u0E00-\u0E7F\u0370-\u03FF]/;

export const NON_ENGLISH_CHARS_REGEX = /[\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u4E00-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\u0E00-\u0E7F\u0370-\u03FF\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF¿¡]/;

export function hasNonEnglishText(text) {
  if (!text || typeof text !== 'string') return false;
  return NON_ENGLISH_REGEX.test(text);
}

export function hasNonEnglishCharacters(text) {
  if (!text || typeof text !== 'string') return false;
  return NON_ENGLISH_CHARS_REGEX.test(text);
}

export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

// In-memory translation cache (preserves translated strings across isolate invocations)
const translationCache = new Map();
const MAX_TRANSLATION_CACHE = 1000;

function storeTranslation(key, val) {
  if (translationCache.size >= MAX_TRANSLATION_CACHE) {
    translationCache.clear();
  }
  translationCache.set(key, val);
  return val;
}

/**
 * Translates arbitrary text snippets into English (or another target language)
 * using Google Cloud Translation API Basic v2 with automatic fallback to Google's
 * pre-trained neural machine translation engine and Gemini 1.5 Flash.
 */
export async function translateTextWithGoogle(text, targetLang = 'en', sourceLang = 'auto') {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return '';
  }

  const trimmed = text.trim();
  const normalizedSource = (sourceLang || 'auto').toLowerCase();
  const normalizedTarget = (targetLang || 'en').toLowerCase();

  // If source and target are identical and specified, return directly
  if (normalizedSource !== 'auto' && normalizedSource === normalizedTarget) {
    return trimmed;
  }

  // If target is English, skip only if source is explicitly English, or if source is auto and text has no foreign characters
  const isExplicitlyNonEnglish = normalizedSource !== 'auto' && normalizedSource !== 'en';
  if (normalizedTarget === 'en' && !isExplicitlyNonEnglish && !hasNonEnglishCharacters(trimmed)) {
    return trimmed;
  }

  const cacheKey = `${normalizedTarget}:${normalizedSource}:${trimmed}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  // 1. Google Cloud Translation API Basic v2 (Pre-Trained Neural Translation)
  if (apiKey) {
    try {
      const v2Url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
      const res = await fetch(v2Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: trimmed,
          target: normalizedTarget,
          ...(normalizedSource !== 'auto' ? { source: normalizedSource } : {}),
          format: 'text',
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const json = await res.json();
        const translated = json.data?.translations?.[0]?.translatedText;
        if (translated && typeof translated === 'string' && translated.trim().length > 0) {
          return storeTranslation(cacheKey, decodeHtmlEntities(translated.trim()));
        }
      }
    } catch {
      // Fall through to Tier 2
    }
  }

  // 2. Google Pre-Trained Neural Translation Engine (client=gtx with dict-chrome-ex fallback)
  for (const client of ['gtx', 'dict-chrome-ex']) {
    try {
      const slParam = normalizedSource !== 'auto' ? encodeURIComponent(normalizedSource) : 'auto';
      const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=${slParam}&tl=${encodeURIComponent(normalizedTarget)}&dt=t&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(gtxUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && Array.isArray(json[0])) {
          const parts = json[0].map(item => (Array.isArray(item) ? item[0] : '')).filter(Boolean);
          const translated = parts.join('').trim();
          if (translated.length > 0) {
            return storeTranslation(cacheKey, decodeHtmlEntities(translated));
          }
        }
      }
    } catch {
      // Try next client or fallback
    }
  }

  // 3. Gemini 1.5 Flash Translation Fallback
  if (apiKey) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${apiKey}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `Translate the following source text accurately into English. Output ONLY the translated text, no quotes, no markdown, no notes:\n${trimmed}` }],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 120 },
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        const json = await res.json();
        const translated = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (translated && !hasNonEnglishText(translated)) {
          return storeTranslation(cacheKey, translated);
        }
      }
    } catch {
      // Fall through
    }
  }

  return trimmed;
}

/**
 * Batch translates an array of text snippets using Google pre-trained translation.
 */
export async function batchTranslateWithGoogle(texts, targetLang = 'en') {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const uniqueTexts = Array.from(new Set(texts.map(t => (t || '').trim()).filter(Boolean)));
  const translationMap = new Map();

  const CONCURRENCY = 8;
  for (let i = 0; i < uniqueTexts.length; i += CONCURRENCY) {
    const chunk = uniqueTexts.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(text => translateTextWithGoogle(text, targetLang))
    );
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        translationMap.set(chunk[idx], res.value);
      }
    });
  }

  return texts.map(t => {
    const trimmed = (t || '').trim();
    return translationMap.get(trimmed) || t;
  });
}
