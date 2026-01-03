import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { handleGetSessions, handleGetSession } from './api/sessions';
import { handleCancelSession } from './api/cancel';

interface ServerOptions {
  port: number;
  host: string;
}

const DIST_DIR = join(import.meta.dir, '..', 'dist');

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
  };
  return mimeTypes[ext ?? ''] ?? 'application/octet-stream';
}

function serveStaticFile(path: string): Response | null {
  const filePath = join(DIST_DIR, path);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath);
    return new Response(content, {
      headers: { 'Content-Type': getMimeType(path) },
    });
  } catch {
    return null;
  }
}

export function createServer(options: ServerOptions) {
  const { port, host } = options;

  return Bun.serve({
    port,
    hostname: host,

    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // API routes
      if (path.startsWith('/api/')) {
        // CORS headers for API
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle preflight
        if (req.method === 'OPTIONS') {
          return new Response(null, { headers: corsHeaders });
        }

        let response: Response;

        // GET /api/sessions
        if (path === '/api/sessions' && req.method === 'GET') {
          response = handleGetSessions();
        }
        // GET /api/sessions/:id
        else if (
          path.match(/^\/api\/sessions\/[^/]+$/) &&
          req.method === 'GET'
        ) {
          const sessionId = path.split('/').pop()!;
          response = handleGetSession(sessionId);
        }
        // POST /api/sessions/:id/cancel
        else if (
          path.match(/^\/api\/sessions\/[^/]+\/cancel$/) &&
          req.method === 'POST'
        ) {
          const parts = path.split('/');
          const sessionId = parts[parts.length - 2];
          response = handleCancelSession(sessionId);
        }
        // 404 for unknown API routes
        else {
          response = Response.json(
            { error: 'NOT_FOUND', message: 'API endpoint not found' },
            { status: 404 }
          );
        }

        // Add CORS headers to response
        const headers = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          headers.set(key, value);
        });

        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }

      // Static file serving
      if (existsSync(DIST_DIR)) {
        // Try exact path
        const staticResponse = serveStaticFile(
          path === '/' ? 'index.html' : path.slice(1)
        );
        if (staticResponse) {
          return staticResponse;
        }

        // SPA fallback - serve index.html for non-file routes
        if (!path.includes('.')) {
          const indexResponse = serveStaticFile('index.html');
          if (indexResponse) {
            return indexResponse;
          }
        }
      }

      // Fallback 404
      return new Response('Not Found', { status: 404 });
    },
  });
}
