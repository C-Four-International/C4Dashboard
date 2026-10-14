/**
 * ML Web Worker — Inert stub for fallback dashboard
 * AI functionality is disabled in this build.
 */

self.onmessage = (event: MessageEvent) => {
  const { id } = event.data || {};
  self.postMessage({
    type: 'error',
    id,
    error: 'AI inference is disabled in fallback dashboard',
  });
};
