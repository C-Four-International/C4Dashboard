declare const process: { env: Record<string, string | undefined> };

import type {
  ServerContext,
  AircraftDetails,
  GetAircraftDetailsRequest,
  GetAircraftDetailsResponse,
} from '../../../../src/generated/server/worldmonitor/military/v1/service_server';

import { mapHexdbDetails } from './_shared';
import { CHROME_UA } from '../../../_shared/constants';
import { cachedFetchJson } from '../../../_shared/redis';

const REDIS_CACHE_KEY = 'military:aircraft:v1:hexdb';
const REDIS_CACHE_TTL = 24 * 60 * 60; // 24 hours — aircraft metadata is mostly static

interface CachedAircraftDetails {
  details: AircraftDetails | null;
  configured: boolean;
}

export async function getAircraftDetails(
  _ctx: ServerContext,
  req: GetAircraftDetailsRequest,
): Promise<GetAircraftDetailsResponse> {
  const icao24 = req.icao24.toLowerCase();
  const cacheKey = `${REDIS_CACHE_KEY}:${icao24}`;

  try {
    const result = await cachedFetchJson<CachedAircraftDetails | null>(cacheKey, REDIS_CACHE_TTL, async () => {
      const resp = await fetch(`https://hexdb.io/api/v1/aircraft/${icao24}`, {
        headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(10_000),
      });

      // Cache not-found responses to avoid repeated misses for the same aircraft.
      if (resp.status === 404) {
        return { details: null, configured: true };
      }
      if (!resp.ok) return null;

      const text = await resp.text();
      try {
        const data = JSON.parse(text) as Record<string, unknown>;
        if (data.status === '404' || data.error === 'Aircraft not found.') {
          return { details: null, configured: true };
        }
        return {
          details: mapHexdbDetails(icao24, data),
          configured: true,
        };
      } catch {
        return null;
      }
    });

    if (!result || !result.details) {
      return { details: undefined, configured: true };
    }

    return {
      details: result.details,
      configured: true,
    };
  } catch {
    return { details: undefined, configured: true };
  }
}
