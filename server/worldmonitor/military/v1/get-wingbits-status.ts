declare const process: { env: Record<string, string | undefined> };

import type {
  ServerContext,
  GetWingbitsStatusRequest,
  GetWingbitsStatusResponse,
} from '../../../../src/generated/server/worldmonitor/military/v1/service_server';

export async function getWingbitsStatus(
  _ctx: ServerContext,
  _req: GetWingbitsStatusRequest,
): Promise<GetWingbitsStatusResponse> {
  return { configured: true };
}
