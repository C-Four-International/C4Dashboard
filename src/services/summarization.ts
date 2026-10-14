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
 * Translate text — disabled in fallback mode.
 */
export async function translateText(
  _text: string,
  _targetLang: string,
  _onProgress?: ProgressCallback,
): Promise<string | null> {
  return null;
}
