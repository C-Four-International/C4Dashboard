import { createCircuitBreaker } from '@/utils';

export interface SocialSourcePost {
  id: string;
  platform: 'bluesky' | 'telegram';
  author: string;
  authorName?: string;
  url: string;
  publishedAt: string;
  freshness: string;
  rawText: string;
  cleanedText: string;
  translatedText?: string | null;
  isTranslated?: boolean;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  provider: string;
}

/**
 * Client API hook for Google pre-trained translation.
 * Calls /api/translate with fallback to /api/social-intel?action=translate.
 */
export async function translateSnippetWithGoogle(
  text: string,
  target = 'en',
): Promise<string> {
  if (!text || !text.trim()) return '';

  try {
    const res = await fetch(
      `/api/translate?text=${encodeURIComponent(text)}&target=${encodeURIComponent(target)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.ok) {
      const data = (await res.json()) as TranslationResult;
      if (data?.translatedText) {
        return data.translatedText;
      }
    }
  } catch {
    // Try fallback endpoint
    try {
      const fbRes = await fetch(
        `/api/social-intel?action=translate&text=${encodeURIComponent(text)}&target=${encodeURIComponent(target)}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (fbRes.ok) {
        const fbData = (await fbRes.json()) as TranslationResult;
        if (fbData?.translatedText) {
          return fbData.translatedText;
        }
      }
    } catch {
      // Return original text if both fail
    }
  }

  return text;
}

export interface SocialIntelBriefing {
  id: string;
  briefing: string;
  wordCount: number;
  createdAt: string;
  freshness: string;
  sources: SocialSourcePost[];
  platforms: Array<'bluesky' | 'telegram'>;
  corroborationScore: number;
  isMultiSource: boolean;
}

export interface SocialIntelResponse {
  briefings: SocialIntelBriefing[];
  totalPostsScraped: number;
  totalSubstantivePosts: number;
  generatedAt: string;
  cachedUntil: string;
  cacheExpiresInSeconds: number;
  modelUsed: string;
  sourcesMonitored: {
    bluesky: string[];
    telegram: string[];
  };
}

const STORAGE_CACHE_KEY = 'worldmonitor:social-intel:cache:v1';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

const defaultEmptyResponse: SocialIntelResponse = {
  briefings: [],
  totalPostsScraped: 0,
  totalSubstantivePosts: 0,
  generatedAt: new Date().toISOString(),
  cachedUntil: new Date().toISOString(),
  cacheExpiresInSeconds: 0,
  modelUsed: 'none',
  sourcesMonitored: {
    bluesky: [],
    telegram: [],
  },
};

const socialIntelCircuitBreaker = createCircuitBreaker<SocialIntelResponse>({
  name: 'Social Media Intel',
  maxFailures: 3,
  cooldownMs: 60_000,
  cacheTtlMs: CACHE_TTL_MS,
  persistCache: true,
});

function getStoredCache(): SocialIntelResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: SocialIntelResponse; expiresAt: number };
    if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
      return parsed.data;
    }
    localStorage.removeItem(STORAGE_CACHE_KEY);
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

function setStoredCache(data: SocialIntelResponse): void {
  try {
    const payload = {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchSocialIntelBriefings(forceRefresh = false): Promise<SocialIntelResponse> {
  if (forceRefresh) {
    socialIntelCircuitBreaker.clearCache();
    try {
      localStorage.removeItem(STORAGE_CACHE_KEY);
    } catch {
      // Ignore
    }
  } else {
    // Check client storage cache (valid for 3 hours)
    const cached = getStoredCache();
    if (cached && cached.briefings && cached.briefings.length > 0) {
      return cached;
    }
  }

  return socialIntelCircuitBreaker.execute(async () => {
    const url = `/api/social-intel${forceRefresh ? '?fresh=1' : ''}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      throw new Error(`Social intel service error: HTTP ${res.status}`);
    }

    const data = (await res.json()) as SocialIntelResponse;
    if (data && Array.isArray(data.briefings)) {
      setStoredCache(data);
    }
    return data;
  }, defaultEmptyResponse);
}

