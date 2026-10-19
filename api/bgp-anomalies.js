import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Cloudflare API Token from environment variables (supports common naming variations)
  const apiToken = process.env.CLOUDFLARE_RADAR_API_TOKEN
    || process.env.CLOUDFLARE_API_TOKEN
    || process.env.CF_RADAR_API_TOKEN
    || process.env.CF_RADAR_TOKEN
    || process.env.CF_API_TOKEN;

  if (req.method === 'HEAD') {
    return new Response(null, {
      status: apiToken ? 200 : 503,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!apiToken) {
    return new Response(JSON.stringify({
      configured: false,
      anomalies: [],
      message: 'Cloudflare Radar API token not configured. Please set CLOUDFLARE_RADAR_API_TOKEN in environment variables.',
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
        ...corsHeaders,
      },
    });
  }

  try {
    const url = new URL(req.url);
    const dateRange = url.searchParams.get('dateRange') || '7d';
    const limit = url.searchParams.get('limit') || '50';

    const headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json',
      'User-Agent': 'WorldMonitor/BgpAnomaliesEdge',
    };

    const hijacksUrl = `https://api.cloudflare.com/client/v4/radar/bgp/hijacks/events?dateRange=${encodeURIComponent(dateRange)}&per_page=${encodeURIComponent(limit)}`;
    const leaksUrl = `https://api.cloudflare.com/client/v4/radar/bgp/leaks/events?dateRange=${encodeURIComponent(dateRange)}&per_page=${encodeURIComponent(limit)}`;

    const [hijacksResult, leaksResult] = await Promise.allSettled([
      fetch(hijacksUrl, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(leaksUrl, { headers, signal: AbortSignal.timeout(8000) }),
    ]);

    const anomalies = [];
    const upstreamErrors = [];

    // Helper to build ASN lookup table from asn_info array
    const buildAsnMap = (asnInfo) => {
      const map = new Map();
      if (Array.isArray(asnInfo)) {
        for (const info of asnInfo) {
          if (info && info.asn) {
            map.set(Number(info.asn), {
              asn: Number(info.asn),
              orgName: info.org_name || info.org || '',
              countryCode: (info.country_code || info.country || '').toUpperCase(),
            });
          }
        }
      }
      return map;
    };

    // 1. Process BGP Hijacks
    if (hijacksResult.status === 'rejected') {
      const errMsg = hijacksResult.reason?.message || String(hijacksResult.reason);
      console.error('[BGP Anomalies API] Cloudflare Radar hijacks network request failed:', errMsg);
      upstreamErrors.push({ endpoint: 'hijacks', type: 'network_failure', message: errMsg });
    } else if (!hijacksResult.value.ok) {
      const status = hijacksResult.value.status;
      const body = await hijacksResult.value.text().catch(() => '');
      console.error(`[BGP Anomalies API] Cloudflare Radar hijacks HTTP ${status}:`, body);
      upstreamErrors.push({ endpoint: 'hijacks', type: 'http_error', status, details: body });
    } else {
      try {
        const json = await hijacksResult.value.json();
        if (!json?.success) {
          console.error('[BGP Anomalies API] Cloudflare Radar hijacks returned success:false:', json?.errors);
          upstreamErrors.push({ endpoint: 'hijacks', type: 'api_error', errors: json?.errors || [] });
        } else if (json?.result) {
          const asnMap = buildAsnMap(json.result.asn_info);
          const events = Array.isArray(json.result.events) ? json.result.events : [];

          for (const ev of events) {
            const hijackerAsn = Number(ev.hijacker_asn || ev.hijackerAsn || 0);
            const hijackerInfo = asnMap.get(hijackerAsn);
            const victimAsns = Array.isArray(ev.victim_asns || ev.victimAsns)
              ? (ev.victim_asns || ev.victimAsns).map(Number)
              : [];
            const victimOrgs = victimAsns.map(asn => asnMap.get(asn)?.orgName).filter(Boolean);
            const victimCountries = victimAsns.map(asn => asnMap.get(asn)?.countryCode).filter(Boolean);

            const confidence = Number(ev.confidence_score ?? ev.confidenceScore ?? 5);
            let severity = 'medium';
            if (confidence >= 8) severity = 'critical';
            else if (confidence >= 5) severity = 'high';
            else if (confidence < 3) severity = 'low';

            const prefixes = Array.isArray(ev.prefixes) ? ev.prefixes : [];

            anomalies.push({
              id: `hijack-${ev.id || `${hijackerAsn}-${Date.now()}`}`,
              type: 'hijack',
              detectedTime: ev.max_hijack_ts || ev.min_hijack_ts || ev.max_msg_ts || new Date().toISOString(),
              startTime: ev.min_hijack_ts,
              endTime: ev.max_hijack_ts,
              duration: ev.duration,
              confidence,
              severity,
              originAsn: hijackerAsn,
              originOrg: hijackerInfo?.orgName || (hijackerAsn ? `AS${hijackerAsn}` : 'Unknown ASN'),
              originCountry: hijackerInfo?.countryCode || '',
              targetAsns: victimAsns,
              targetOrgs: victimOrgs,
              targetCountries: victimCountries,
              prefixes,
              prefixCount: prefixes.length,
              peerCount: ev.peer_ip_count || (Array.isArray(ev.peer_asns) ? ev.peer_asns.length : 0),
              messageCount: ev.hijack_msgs_count || 0,
              tags: Array.isArray(ev.tags) ? ev.tags.map(t => (typeof t === 'string' ? t : t.name)) : [],
              countryCode: hijackerInfo?.countryCode || victimCountries[0] || '',
            });
          }
        }
      } catch (err) {
        console.error('[BGP Anomalies API] Failed to parse hijacks payload JSON:', err);
        upstreamErrors.push({ endpoint: 'hijacks', type: 'parse_error', message: err.message });
      }
    }

    // 2. Process BGP Route Leaks
    if (leaksResult.status === 'rejected') {
      const errMsg = leaksResult.reason?.message || String(leaksResult.reason);
      console.error('[BGP Anomalies API] Cloudflare Radar leaks network request failed:', errMsg);
      upstreamErrors.push({ endpoint: 'leaks', type: 'network_failure', message: errMsg });
    } else if (!leaksResult.value.ok) {
      const status = leaksResult.value.status;
      const body = await leaksResult.value.text().catch(() => '');
      console.error(`[BGP Anomalies API] Cloudflare Radar leaks HTTP ${status}:`, body);
      upstreamErrors.push({ endpoint: 'leaks', type: 'http_error', status, details: body });
    } else {
      try {
        const json = await leaksResult.value.json();
        if (!json?.success) {
          console.error('[BGP Anomalies API] Cloudflare Radar leaks returned success:false:', json?.errors);
          upstreamErrors.push({ endpoint: 'leaks', type: 'api_error', errors: json?.errors || [] });
        } else if (json?.result) {
          const asnMap = buildAsnMap(json.result.asn_info);
          const events = Array.isArray(json.result.events) ? json.result.events : [];

          for (const ev of events) {
            const leakerAsn = Number(ev.leak_asn || ev.leakerAsn || ev.leakAsn || 0);
            const leakerInfo = asnMap.get(leakerAsn);
            const affectedAsns = Array.isArray(ev.affectedAsns || ev.affected_asns)
              ? (ev.affectedAsns || ev.affected_asns).map(Number)
              : [];
            const affectedOrgs = affectedAsns.map(asn => asnMap.get(asn)?.orgName).filter(Boolean);
            const affectedCountries = affectedAsns.map(asn => asnMap.get(asn)?.countryCode).filter(Boolean);

            const confidence = Number(ev.confidence_score ?? ev.confidenceScore ?? 5);
            let severity = 'medium';
            if (confidence >= 8 || (ev.leak_count && ev.leak_count > 1000)) severity = 'high';
            else if (confidence < 4) severity = 'low';

            const prefixes = Array.isArray(ev.prefixes) ? ev.prefixes : [];

            anomalies.push({
              id: `leak-${ev.id || ev.eventId || `${leakerAsn}-${Date.now()}`}`,
              type: 'leak',
              detectedTime: ev.max_ts || ev.min_ts || ev.startTime || new Date().toISOString(),
              startTime: ev.min_ts || ev.startTime,
              endTime: ev.max_ts || ev.endTime,
              confidence,
              severity,
              originAsn: leakerAsn,
              originOrg: leakerInfo?.orgName || (leakerAsn ? `AS${leakerAsn}` : 'Unknown ASN'),
              originCountry: leakerInfo?.countryCode || '',
              targetAsns: affectedAsns,
              targetOrgs: affectedOrgs,
              targetCountries: affectedCountries,
              prefixes,
              prefixCount: ev.prefix_count ?? prefixes.length,
              peerCount: ev.peer_count || 0,
              messageCount: ev.leak_count || 0,
              countryCode: leakerInfo?.countryCode || affectedCountries[0] || '',
            });
          }
        }
      } catch (err) {
        console.error('[BGP Anomalies API] Failed to parse leaks payload JSON:', err);
        upstreamErrors.push({ endpoint: 'leaks', type: 'parse_error', message: err.message });
      }
    }

    return new Response(JSON.stringify({
      configured: true,
      anomalies,
      total: anomalies.length,
      upstreamErrors: upstreamErrors.length > 0 ? upstreamErrors : undefined,
      updatedAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error('[BGP Anomalies API] Proxy handler unhandled exception:', err);
    return new Response(JSON.stringify({
      configured: true,
      anomalies: [],
      error: 'Failed to retrieve Cloudflare Radar BGP anomalies',
      details: err?.message || String(err),
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
