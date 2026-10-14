/**
 * ML Worker Manager — Inert stub for fallback dashboard
 * All AI inference is disabled in this build.
 */

import type { MLCapabilities } from './ml-capabilities';

interface NEREntity {
  text: string;
  type: string;
  confidence: number;
  start: number;
  end: number;
}

interface SentimentResult {
  label: 'positive' | 'negative' | 'neutral';
  score: number;
}

class MLWorkerManager {
  async init(): Promise<boolean> {
    console.log('[MLWorker] AI/ML functionality disabled in fallback dashboard');
    return false;
  }

  get isAvailable(): boolean {
    return false;
  }

  get isSupported(): boolean {
    return false;
  }

  get isReady(): boolean {
    return false;
  }

  get capabilities(): MLCapabilities {
    return {
      isSupported: false,
      isDesktop: false,
      hasWebGL: false,
      hasWebGPU: false,
      hasSIMD: false,
      hasThreads: false,
      estimatedMemoryMB: 0,
      recommendedExecutionProvider: 'wasm',
      recommendedThreads: 1,
    };
  }

  isModelLoaded(_modelId: string): boolean {
    return false;
  }

  getLoadedModels(): string[] {
    return [];
  }

  async loadModel(_modelId: string, _onProgress?: (progress: number) => void): Promise<boolean> {
    return false;
  }

  async unloadModel(_modelId: string): Promise<boolean> {
    return true;
  }

  unloadOptionalModels(): void {
    // No-op in fallback dashboard
  }

  async embedTexts(_texts: string[]): Promise<number[][]> {
    return [];
  }

  async summarize(_texts: string[], _modelId?: string): Promise<string[]> {
    return [];
  }

  async summarizeTexts(_texts: string[], _modelId?: string): Promise<string[]> {
    return [];
  }

  async classifySentiment(_texts: string[]): Promise<SentimentResult[]> {
    return [];
  }

  async extractEntities(_texts: string[]): Promise<NEREntity[][]> {
    return [];
  }

  async clusterBySemanticSimilarity(
    _items: Array<{ id: string; text: string }>,
    _threshold?: number
  ): Promise<string[][]> {
    return [];
  }

  async reset(): Promise<void> {
    return;
  }

  terminate(): void {
    // No worker to terminate
  }

  getStatus(): { isReady: boolean; loadedModels: string[]; isSupported: boolean } {
    return {
      isReady: false,
      loadedModels: [],
      isSupported: false,
    };
  }
}

export const mlWorker = new MLWorkerManager();
