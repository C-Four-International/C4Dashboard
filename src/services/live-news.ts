import { isDesktopRuntime, getRemoteApiBaseUrl } from '@/services/runtime';

const liveVideoCache = new Map<string, { videoId: string | null; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchLiveVideoId(channelHandle: string, forceRefresh = false): Promise<string | null> {
  const cached = liveVideoCache.get(channelHandle);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.videoId;
  }

  try {
    const baseUrl = isDesktopRuntime() ? getRemoteApiBaseUrl() : '';
    const forceParam = forceRefresh ? '&force=true' : '';
    const res = await fetch(`${baseUrl}/api/youtube/live?channel=${encodeURIComponent(channelHandle)}${forceParam}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const videoId = data.videoId || null;
    liveVideoCache.set(channelHandle, { videoId, timestamp: Date.now() });
    return videoId;
  } catch (error) {
    console.warn(`[LiveNews] Failed to fetch live ID for ${channelHandle}:`, error);
    return null;
  }
}

export function clearLiveVideoCache(channelHandle?: string): void {
  if (channelHandle) {
    liveVideoCache.delete(channelHandle);
  } else {
    liveVideoCache.clear();
  }
}
