import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleHoldedRequest } from './server/holdedProxy.ts';

/** Mounts the same read-only Holded proxy the Vercel function uses at /api/holded. */
function holdedProxy(): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/holded')) return next();
    const headers = new Headers();
    if (req.headers.authorization) headers.set('authorization', req.headers.authorization);
    try {
      const request = new Request(`http://localhost${req.url}`, { method: req.method, headers });
      const response = await handleHoldedRequest(request);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      // Never let a proxy error take the dev server down.
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end('{"error":"proxy_failed"}');
    }
  };
  return {
    name: 'holded-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [holdedProxy()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
