// Google Pre-Trained Translation API Hook & Neural Translation Utilities
// Shared lightweight module to prevent loading heavy scraping logic in /api/translate

export const NON_ENGLISH_REGEX = /[\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u4E00-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\u0E00-\u0E7F\u0370-\u03FF]/;

export const NON_ENGLISH_CHARS_REGEX = /[\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u4E00-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\u0E00-\u0E7F\u0370-\u03FF\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF¿¡]/;

const NON_LATIN_GLOBAL_REGEX = /[\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u4E00-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\u0E00-\u0E7F\u0370-\u03FF]/g;
const ASCII_LATIN_GLOBAL_REGEX = /[A-Za-z]/g;
const ACCENTED_LATIN_REGEX = /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]/;
const LOWERCASE_START_REGEX = /^[a-z\u00DF-\u00F6\u00F8-\u00FF\u0101-\u024F\u1E01-\u1EFF]/;

const ENGLISH_MARKER_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those', 'after',
  'into', 'amid', 'amidst', 'against', 'between', 'about', 'while', 'through',
  'during', 'before', 'without', 'within', 'across', 'toward', 'towards', 'around',
  'behind', 'beyond', 'near', 'since', 'until', 'upon', 'says', 'said', 'warns',
  'warned', 'reported', 'killed', 'kills', 'strikes', 'struck', 'attacks', 'attacked',
  'troops', 'officials', 'lawmakers', 'court', 'world', 'country', 'countries',
  'state', 'states', 'house', 'senate', 'talks', 'meeting', 'summit', 'market',
  'markets', 'stocks', 'shares', 'prices', 'trade', 'tariff', 'tariffs', 'sanctions',
  'missiles', 'drones', 'ukrainian', 'russian', 'israeli', 'chinese', 'american',
  'british', 'turkish', 'iranian', 'have', 'had', 'will', 'would', 'could', 'should',
  'their', 'they', 'them', 'what', 'when', 'where', 'which', 'who', 'whose', 'why',
  'how', 'most', 'some', 'other', 'such', 'only', 'also', 'than', 'then', 'first',
  'last', 'next', 'new', 'high', 'low', 'year', 'years', 'week', 'weeks', 'month',
  'months', 'today', 'yesterday', 'tomorrow', 'breaking', 'update', 'news', 'leader',
  'leaders', 'ministers', 'defense', 'security', 'foreign', 'rates', 'growth',
  'power', 'food', 'health', 'law', 'election', 'protests', 'clash', 'clashes',
  'dead', 'injured', 'wounded', 'arrested', 'charged', 'accused', 'despite',
  'following', 'according', 'announces', 'announced', 'launches', 'launched',
  'targets', 'targeted', 'hits', 'south', 'north', 'east', 'west', 'southern',
  'northern', 'eastern', 'western', 'down', 'its', 'his', 'our', 'your', 'been',
  'were', 'are', 'over', 'under',
]);

const FOREIGN_STOPWORDS = new Set([
  'el', 'los', 'las', 'del', 'por', 'para', 'con', 'una', 'uno', 'unos', 'unas',
  'como', 'más', 'pero', 'tras', 'bajo', 'sobre', 'entre', 'hasta', 'desde', 'según',
  'contra', 'durante', 'mediante', 'hacia', 'donde', 'cuando', 'porque', 'aunque',
  'mientras', 'les', 'des', 'une', 'du', 'aux', 'dans', 'sur', 'pour', 'avec',
  'sans', 'sous', 'chez', 'vers', 'mais', 'où', 'donc', 'comme', 'très', 'après',
  'avant', 'depuis', 'pendant', 'contre', 'selon', 'cette', 'ces', 'ses', 'leur',
  'leurs', 'notre', 'votre', 'être', 'avoir', 'sont', 'ont', 'été', 'não', 'uma',
  'umas', 'dos', 'das', 'pelo', 'pela', 'pelos', 'pelas', 'nos', 'nas', 'aos', 'às',
  'numa', 'muito', 'também', 'após', 'até', 'já', 'só', 'quando', 'sem', 'segundo',
  'gli', 'della', 'dello', 'dei', 'degli', 'delle', 'nel', 'nello', 'nella', 'nei',
  'negli', 'nelle', 'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle', 'dal', 'dallo',
  'dalla', 'dai', 'dagli', 'dalle', 'non', 'più', 'anche', 'sono', 'hanno', 'stata',
  'stati', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli',
  'quelle', 'perché', 'mentre', 'contro', 'dopo', 'senza', 'sotto', 'sopra', 'der',
  'das', 'den', 'dem', 'ein', 'eine', 'einer', 'einem', 'einen', 'und', 'mit', 'von',
  'auf', 'für', 'nicht', 'sich', 'auch', 'als', 'nach', 'bei', 'aus', 'über', 'vor',
  'durch', 'gegen', 'zwischen', 'wird', 'werden', 'wurde', 'wurden', 'haben', 'sind',
  'waren', 'oder', 'aber', 'wenn', 'weil', 'dass', 'noch', 'nur', 'schon', 'mehr',
  'sehr', 'wie', 'ihr', 'zum', 'zur', 'vom', 'beim', 'het', 'een', 'voor', 'niet',
  'zijn', 'naar', 'ook', 'maar', 'bij', 'uit', 'veel', 'meer', 'tegen', 'tussen',
  'zonder', 'tijdens', 'volgens', 'wordt', 'worden', 'werd', 'heeft', 'hebben',
  'deze', 'dit', 'waar', 'wanneer', 'waarom', 'och', 'det', 'för', 'på', 'från',
  'inte', 'hade', 'vara', 'skulle', 'eller', 'när', 'där', 'här', 'vad', 'vem',
  'mycket', 'också', 'efter', 'över', 'mellan', 'utan', 'genom', 'enligt', 'için',
  'ile', 'fakat', 'ancak', 'veya', 'gibi', 'kadar', 'göre', 'karşı', 'sonra', 'önce',
  'üzere', 'olarak', 'oldu', 'olduğu', 'się', 'że', 'jak', 'przez', 'przy', 'przed',
  'między', 'według', 'wobec', 'podczas', 'jednak', 'tylko', 'już', 'jeszcze',
  'bardzo', 'więcej', 'jest', 'są', 'był', 'była', 'było', 'byli', 'będzie', 'mają',
]);

export function hasNonEnglishText(text) {
  if (!text || typeof text !== 'string') return false;
  const nonLatinMatches = text.match(NON_LATIN_GLOBAL_REGEX);
  const nonLatinCount = nonLatinMatches ? nonLatinMatches.length : 0;
  if (nonLatinCount === 0) return false;

  const asciiMatches = text.match(ASCII_LATIN_GLOBAL_REGEX);
  const asciiCount = asciiMatches ? asciiMatches.length : 0;
  const totalScriptChars = nonLatinCount + asciiCount;
  if (totalScriptChars === 0) return false;

  const ratio = nonLatinCount / totalScriptChars;
  return (nonLatinCount >= 4 && ratio >= 0.35) || ratio >= 0.5;
}

export function hasNonEnglishCharacters(text, lang) {
  if (!text || typeof text !== 'string') return false;
  if (hasNonEnglishText(text)) return true;

  const normalizedLang = (lang || '').toLowerCase();
  const isExplicitForeignLang = Boolean(normalizedLang && normalizedLang !== 'en' && normalizedLang !== 'auto');

  const tokens = text
    .split(/[\s,.;:!?()"'“”‘’«»\[\]{}\/\\|<>—–-]+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;

  let englishMarkerCount = 0;
  let foreignStopwordCount = 0;
  let lowerAccentedWordCount = 0;

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (ENGLISH_MARKER_WORDS.has(lower)) {
      englishMarkerCount++;
    }
    if (FOREIGN_STOPWORDS.has(lower)) {
      foreignStopwordCount++;
    }
    if (LOWERCASE_START_REGEX.test(token) && ACCENTED_LATIN_REGEX.test(token)) {
      lowerAccentedWordCount++;
    }
  }

  if (englishMarkerCount >= 2 && englishMarkerCount >= foreignStopwordCount) {
    return false;
  }
  if (englishMarkerCount >= 1 && foreignStopwordCount === 0) {
    return false;
  }

  if (foreignStopwordCount >= 2 && (lowerAccentedWordCount >= 1 || foreignStopwordCount >= 3 || isExplicitForeignLang)) {
    return true;
  }
  if (lowerAccentedWordCount >= 3) {
    return true;
  }
  if (isExplicitForeignLang && lowerAccentedWordCount >= 2) {
    return true;
  }

  return false;
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
