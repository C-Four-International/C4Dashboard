/**
 * Vercel edge function for sebuf RPC routes.
 *
 * Matches /api/{domain}/v1/{rpc} via Vercel dynamic segment routing.
 * CORS headers are applied to every response (200, 204, 403, 404).
 * Handlers are dynamically imported per domain to minimize fluid active CPU.
 */

export const config = { runtime: 'edge' };

import { createRouter, type RouteDescriptor, type Router } from '../../../server/router';
import { getCorsHeaders, isDisallowedOrigin } from '../../../server/cors';
// @ts-expect-error — JS module, no declaration file
import { validateApiKey } from '../../_api-key.js';
import { mapErrorToResponse } from '../../../server/error-mapper';
import type { ServerOptions } from '../../../src/generated/server/worldmonitor/seismology/v1/service_server';

const serverOptions: ServerOptions = { onError: mapErrorToResponse };

// Cache routers per domain to avoid re-evaluating routes on warm starts
const routerCache = new Map<string, Router>();

async function getRouterForDomain(domain: string): Promise<Router | null> {
  if (routerCache.has(domain)) {
    return routerCache.get(domain)!;
  }

  let routes: RouteDescriptor[];
  switch (domain) {
    case 'seismology': {
      const { createSeismologyServiceRoutes } = await import('../../../src/generated/server/worldmonitor/seismology/v1/service_server');
      const { seismologyHandler } = await import('../../../server/worldmonitor/seismology/v1/handler');
      routes = createSeismologyServiceRoutes(seismologyHandler, serverOptions);
      break;
    }
    case 'wildfire': {
      const { createWildfireServiceRoutes } = await import('../../../src/generated/server/worldmonitor/wildfire/v1/service_server');
      const { wildfireHandler } = await import('../../../server/worldmonitor/wildfire/v1/handler');
      routes = createWildfireServiceRoutes(wildfireHandler, serverOptions);
      break;
    }
    case 'climate': {
      const { createClimateServiceRoutes } = await import('../../../src/generated/server/worldmonitor/climate/v1/service_server');
      const { climateHandler } = await import('../../../server/worldmonitor/climate/v1/handler');
      routes = createClimateServiceRoutes(climateHandler, serverOptions);
      break;
    }
    case 'prediction': {
      const { createPredictionServiceRoutes } = await import('../../../src/generated/server/worldmonitor/prediction/v1/service_server');
      const { predictionHandler } = await import('../../../server/worldmonitor/prediction/v1/handler');
      routes = createPredictionServiceRoutes(predictionHandler, serverOptions);
      break;
    }
    case 'displacement': {
      const { createDisplacementServiceRoutes } = await import('../../../src/generated/server/worldmonitor/displacement/v1/service_server');
      const { displacementHandler } = await import('../../../server/worldmonitor/displacement/v1/handler');
      routes = createDisplacementServiceRoutes(displacementHandler, serverOptions);
      break;
    }
    case 'aviation': {
      const { createAviationServiceRoutes } = await import('../../../src/generated/server/worldmonitor/aviation/v1/service_server');
      const { aviationHandler } = await import('../../../server/worldmonitor/aviation/v1/handler');
      routes = createAviationServiceRoutes(aviationHandler, serverOptions);
      break;
    }
    case 'research': {
      const { createResearchServiceRoutes } = await import('../../../src/generated/server/worldmonitor/research/v1/service_server');
      const { researchHandler } = await import('../../../server/worldmonitor/research/v1/handler');
      routes = createResearchServiceRoutes(researchHandler, serverOptions);
      break;
    }
    case 'unrest': {
      const { createUnrestServiceRoutes } = await import('../../../src/generated/server/worldmonitor/unrest/v1/service_server');
      const { unrestHandler } = await import('../../../server/worldmonitor/unrest/v1/handler');
      routes = createUnrestServiceRoutes(unrestHandler, serverOptions);
      break;
    }
    case 'conflict': {
      const { createConflictServiceRoutes } = await import('../../../src/generated/server/worldmonitor/conflict/v1/service_server');
      const { conflictHandler } = await import('../../../server/worldmonitor/conflict/v1/handler');
      routes = createConflictServiceRoutes(conflictHandler, serverOptions);
      break;
    }
    case 'maritime': {
      const { createMaritimeServiceRoutes } = await import('../../../src/generated/server/worldmonitor/maritime/v1/service_server');
      const { maritimeHandler } = await import('../../../server/worldmonitor/maritime/v1/handler');
      routes = createMaritimeServiceRoutes(maritimeHandler, serverOptions);
      break;
    }
    case 'cyber': {
      const { createCyberServiceRoutes } = await import('../../../src/generated/server/worldmonitor/cyber/v1/service_server');
      const { cyberHandler } = await import('../../../server/worldmonitor/cyber/v1/handler');
      routes = createCyberServiceRoutes(cyberHandler, serverOptions);
      break;
    }
    case 'economic': {
      const { createEconomicServiceRoutes } = await import('../../../src/generated/server/worldmonitor/economic/v1/service_server');
      const { economicHandler } = await import('../../../server/worldmonitor/economic/v1/handler');
      routes = createEconomicServiceRoutes(economicHandler, serverOptions);
      break;
    }
    case 'infrastructure': {
      const { createInfrastructureServiceRoutes } = await import('../../../src/generated/server/worldmonitor/infrastructure/v1/service_server');
      const { infrastructureHandler } = await import('../../../server/worldmonitor/infrastructure/v1/handler');
      routes = createInfrastructureServiceRoutes(infrastructureHandler, serverOptions);
      break;
    }
    case 'market': {
      const { createMarketServiceRoutes } = await import('../../../src/generated/server/worldmonitor/market/v1/service_server');
      const { marketHandler } = await import('../../../server/worldmonitor/market/v1/handler');
      routes = createMarketServiceRoutes(marketHandler, serverOptions);
      break;
    }
    case 'news': {
      const { createNewsServiceRoutes } = await import('../../../src/generated/server/worldmonitor/news/v1/service_server');
      const { newsHandler } = await import('../../../server/worldmonitor/news/v1/handler');
      routes = createNewsServiceRoutes(newsHandler, serverOptions);
      break;
    }
    case 'intelligence': {
      const { createIntelligenceServiceRoutes } = await import('../../../src/generated/server/worldmonitor/intelligence/v1/service_server');
      const { intelligenceHandler } = await import('../../../server/worldmonitor/intelligence/v1/handler');
      routes = createIntelligenceServiceRoutes(intelligenceHandler, serverOptions);
      break;
    }
    case 'military': {
      const { createMilitaryServiceRoutes } = await import('../../../src/generated/server/worldmonitor/military/v1/service_server');
      const { militaryHandler } = await import('../../../server/worldmonitor/military/v1/handler');
      routes = createMilitaryServiceRoutes(militaryHandler, serverOptions);
      break;
    }
    case 'positive-events': {
      const { createPositiveEventsServiceRoutes } = await import('../../../src/generated/server/worldmonitor/positive_events/v1/service_server');
      const { positiveEventsHandler } = await import('../../../server/worldmonitor/positive-events/v1/handler');
      routes = createPositiveEventsServiceRoutes(positiveEventsHandler, serverOptions);
      break;
    }
    case 'giving': {
      const { createGivingServiceRoutes } = await import('../../../src/generated/server/worldmonitor/giving/v1/service_server');
      const { givingHandler } = await import('../../../server/worldmonitor/giving/v1/handler');
      routes = createGivingServiceRoutes(givingHandler, serverOptions);
      break;
    }
    case 'trade': {
      const { createTradeServiceRoutes } = await import('../../../src/generated/server/worldmonitor/trade/v1/service_server');
      const { tradeHandler } = await import('../../../server/worldmonitor/trade/v1/handler');
      routes = createTradeServiceRoutes(tradeHandler, serverOptions);
      break;
    }
    case 'supply-chain': {
      const { createSupplyChainServiceRoutes } = await import('../../../src/generated/server/worldmonitor/supply_chain/v1/service_server');
      const { supplyChainHandler } = await import('../../../server/worldmonitor/supply-chain/v1/handler');
      routes = createSupplyChainServiceRoutes(supplyChainHandler, serverOptions);
      break;
    }
    default:
      return null;
  }

  const router = createRouter(routes);
  routerCache.set(domain, router);
  return router;
}

export default async function handler(request: Request): Promise<Response> {
  // Origin check first — skip CORS headers for disallowed origins (M-2 fix)
  if (isDisallowedOrigin(request)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let corsHeaders: Record<string, string>;
  try {
    corsHeaders = getCorsHeaders(request);
  } catch {
    corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  }

  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // API key validation (origin-aware)
  const keyCheck = validateApiKey(request);
  if (keyCheck.required && !keyCheck.valid) {
    return new Response(JSON.stringify({ error: keyCheck.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Extract domain from URL
  const url = new URL(request.url);
  // URL pattern is /api/{domain}/v1/{rpc}
  const parts = url.pathname.split('/');
  const domainIndex = parts.indexOf('api') + 1;
  const domain = domainIndex > 0 && domainIndex < parts.length ? parts[domainIndex] : '';

  const router = await getRouterForDomain(domain);
  if (!router) {
    return new Response(JSON.stringify({ error: 'Domain not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Route matching
  const matchedHandler = router.match(request);
  if (!matchedHandler) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Execute handler with top-level error boundary (H-1 fix)
  let response: Response;
  try {
    response = await matchedHandler(request);
  } catch (err) {
    console.error('[gateway] Unhandled handler error:', err);
    response = new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Merge CORS headers into response
  const mergedHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    mergedHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: mergedHeaders,
  });
}
