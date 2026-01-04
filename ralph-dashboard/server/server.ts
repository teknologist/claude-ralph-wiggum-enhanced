import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { handleGetSessions, handleGetSession } from './api/sessions';
import { handleCancelSession } from './api/cancel';
import { handleDeleteSession } from './api/delete';

interface ServerOptions {
  port: number;
  host: string;
}

const DIST_DIR = join(import.meta.dir, '..', 'dist');

/**
 * Validate loop ID to prevent path traversal and injection attacks.
 * Matches the validation logic in the bash hooks for consistency.
 * Allows UUIDs, alphanumeric with hyphens/underscores/dots (but not .. for path traversal).
 */
function validateLoopId(loopId: string): boolean {
  // Allow UUIDs, alphanumeric with hyphens/underscores/dots
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  // Explicitly reject path traversal attempts
  const noPathTraversal = !loopId.includes('..');

  return validPattern.test(loopId) && noPathTraversal;
}

/**
 * Create a standardized error response for invalid loop IDs.
 */
function invalidLoopIdResponse(): Response {
  return Response.json(
    {
      error: 'INVALID_LOOP_ID',
      message:
        'Invalid loop ID format. Loop ID must contain only alphanumeric characters, hyphens, underscores, and dots.',
    },
    { status: 400 }
  );
}

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
        // Security headers for API
        const securityHeaders = {
          // CORS
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          // Security headers
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        };

        // Handle preflight
        if (req.method === 'OPTIONS') {
          return new Response(null, { headers: securityHeaders });
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
          const loopId = path.split('/').pop()!;
          if (!validateLoopId(loopId)) {
            response = invalidLoopIdResponse();
          } else {
            response = handleGetSession(loopId);
          }
        }
        // POST /api/sessions/:id/cancel
        else if (
          path.match(/^\/api\/sessions\/[^/]+\/cancel$/) &&
          req.method === 'POST'
        ) {
          const parts = path.split('/');
          const loopId = parts[parts.length - 2];
          if (!validateLoopId(loopId)) {
            response = invalidLoopIdResponse();
          } else {
            response = handleCancelSession(loopId);
          }
        }
        // DELETE /api/sessions/:id
        else if (
          path.match(/^\/api\/sessions\/[^/]+$/) &&
          req.method === 'DELETE'
        ) {
          const loopId = path.split('/').pop()!;
          if (!validateLoopId(loopId)) {
            response = invalidLoopIdResponse();
          } else {
            response = handleDeleteSession(loopId);
          }
        }
        // 404 for unknown API routes
        else {
          response = Response.json(
            { error: 'NOT_FOUND', message: 'API endpoint not found' },
            { status: 404 }
          );
        }

        // Add security headers to response
        const headers = new Headers(response.headers);
        Object.entries(securityHeaders).forEach(([key, value]) => {
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
