// Vercel function: GET /api/holded?path=/v2/...  → Holded v2 API (read-only, allowlisted).
import { handleHoldedRequest } from '../server/holdedProxy.js';

export function GET(request: Request): Promise<Response> {
  return handleHoldedRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return handleHoldedRequest(request);
}
