import { SITE_VARIANT } from '@/config';
import { getAiFlowSettings } from '@/services/ai-flow-settings';

const AI_CLASSIFY_DEDUP_MS = 60 * 60 * 1000; // 1 hour dedup
const AI_CLASSIFY_WINDOW_MS = 60 * 1000;
const AI_CLASSIFY_MAX_PER_WINDOW =
  SITE_VARIANT === 'finance' ? 15 : SITE_VARIANT === 'tech' ? 20 : 25;
export const AI_CLASSIFY_MAX_PER_FEED =
  SITE_VARIANT === 'finance' ? 1 : SITE_VARIANT === 'tech' ? 1 : 2;

const aiRecentlyQueued = new Map<string, number>();
const aiDispatches: number[] = [];

function toAiKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function canQueueAiClassification(title: string): boolean {
  // Respect user preference: if Cloud LLM is disabled, do not queue
  try {
    const settings = getAiFlowSettings();
    if (!settings.cloudLlm) {
      return false;
    }
  } catch {
    // Ignore settings read errors
  }

  const now = Date.now();
  while (aiDispatches.length > 0 && now - aiDispatches[0]! > AI_CLASSIFY_WINDOW_MS) {
    aiDispatches.shift();
  }
  for (const [key, queuedAt] of aiRecentlyQueued) {
    if (now - queuedAt > AI_CLASSIFY_DEDUP_MS) {
      aiRecentlyQueued.delete(key);
    }
  }
  if (aiDispatches.length >= AI_CLASSIFY_MAX_PER_WINDOW) {
    return false;
  }

  const key = toAiKey(title);
  const lastQueued = aiRecentlyQueued.get(key);
  if (lastQueued && now - lastQueued < AI_CLASSIFY_DEDUP_MS) {
    return false;
  }

  aiDispatches.push(now);
  aiRecentlyQueued.set(key, now);
  return true;
}
