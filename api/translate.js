import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { translateTextWithGoogle } from './social-intel.js';

export const config = {
  runtime: 'edge',
};

/**
 * Dedicated API hook for Google Pre-Trained Translation.
 * Translates arbitrary text snippets into English (or another target language)
 * using Google Cloud Translation API v2 with automatic fallback to Google's
 * pre-trained neural machine translation engine.
 */
export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, POST, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  let text = url.searchParams.get('text') || url.searchParams.get('q') || '';
  let target = url.searchParams.get('target') || url.searchParams.get('tl') || 'en';

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      if (body.text) text = body.text;
      if (body.q) text = body.q;
      if (body.target) target = body.target;
    } catch {
      // Ignore JSON parse error, fall back to query params
    }
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Missing text parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const translatedText = await translateTextWithGoogle(text, target);
    return new Response(
      JSON.stringify({
        originalText: text,
        translatedText,
        targetLanguage: target,
        provider: 'google-pretrained-translation-api',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          ...corsHeaders,
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Translation failed',
        details: err.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
