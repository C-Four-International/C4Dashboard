// Non-sebuf: returns XML/HTML, stays as standalone Vercel function
export const config = { runtime: 'edge' };

/**
 * Story Page for Social Crawlers
 * Returns HTML with proper og:image and twitter:card meta tags.
 * Twitter/Facebook/LinkedIn crawlers hit this, real users get redirected to the SPA.
 */

const COUNTRY_NAMES = {
  UA: 'Ukraine', RU: 'Russia', CN: 'China', US: 'United States',
  IR: 'Iran', IL: 'Israel', TW: 'Taiwan', KP: 'North Korea',
  SA: 'Saudi Arabia', TR: 'Turkey', PL: 'Poland', DE: 'Germany',
  FR: 'France', GB: 'United Kingdom', IN: 'India', PK: 'Pakistan',
  SY: 'Syria', YE: 'Yemen', MM: 'Myanmar', VE: 'Venezuela',
};

const BOT_UA = /twitterbot|facebookexternalhit|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|redditbot|googlebot/i;

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function handler(req, res) {
  const host = req.headers?.host || (req.headers?.get && req.headers.get('host')) || 'worldmonitor.app';
  const url = new URL(req.url, `https://${host}`);
  const countryCode = (url.searchParams.get('c') || '').toUpperCase();
  const type = url.searchParams.get('t') || 'ciianalysis';
  const ts = url.searchParams.get('ts') || '';
  const score = url.searchParams.get('s') || '';
  const level = url.searchParams.get('l') || '';

  const ua = req.headers?.['user-agent'] || (req.headers?.get && req.headers.get('user-agent')) || '';
  const isBot = BOT_UA.test(ua);

  const baseUrl = `https://${host}`;
  const spaUrl = `${baseUrl}/?c=${countryCode}&t=${type}${ts ? `&ts=${ts}` : ''}`;

  // Real users → redirect to SPA
  if (!isBot) {
    if (res && typeof res.writeHead === 'function') {
      res.writeHead(302, { Location: spaUrl, 'Cache-Control': 'public, max-age=300, s-maxage=300' });
      res.end();
      return;
    }
    return new Response(null, {
      status: 302,
      headers: {
        'Location': spaUrl,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  }

  // Bots → serve meta tags
  const countryName = COUNTRY_NAMES[countryCode] || countryCode || 'Global';
  const title = `${countryName} Intelligence Brief | World Monitor`;
  const description = `Real-time instability analysis for ${countryName}. Country Instability Index, military posture, threat classification, and prediction markets. Free, open-source geopolitical intelligence.`;
  const imageParams = `c=${countryCode}&t=${type}${score ? `&s=${score}` : ''}${level ? `&l=${level}` : ''}`;
  const imageUrl = `${baseUrl}/api/og-story?${imageParams}`;
  const storyUrl = `${baseUrl}/api/story?c=${countryCode}&t=${type}${ts ? `&ts=${ts}` : ''}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}"/>

  <meta property="og:type" content="article"/>
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:description" content="${esc(description)}"/>
  <meta property="og:image" content="${esc(imageUrl)}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:url" content="${esc(storyUrl)}"/>
  <meta property="og:site_name" content="World Monitor"/>

  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:site" content="@WorldMonitorApp"/>
  <meta name="twitter:title" content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(description)}"/>
  <meta name="twitter:image" content="${esc(imageUrl)}"/>

  <link rel="canonical" href="${esc(storyUrl)}"/>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p>${esc(description)}</p>
  <p><a href="${esc(spaUrl)}">View live analysis</a></p>
</body>
</html>`;

  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
    return res.status(200).send(html);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
    },
  });
}
