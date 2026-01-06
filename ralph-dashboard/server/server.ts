import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { ServerWebSocket } from 'bun';
import { handleGetSessions, handleGetSession } from './api/sessions';
import { handleCancelSession } from './api/cancel';
import {
  handleDeleteSession,
  handleDeleteAllArchivedSessions,
} from './api/delete';
import { handleArchiveSession } from './api/archive';
import {
  handleGetIterations,
  handleGetFullTranscript,
  handleCheckTranscriptAvailability,
} from './api/transcript';
import { handleGetChecklist } from './api/checklist';
import {
  subscribeToLoop,
  unsubscribeFromAll,
  cleanupAllWatchers,
} from './services/websocket-service';
import type { WebSocketData } from './types';

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

  const server = Bun.serve<WebSocketData>({
    port,
    hostname: host,

    fetch(req, server) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Handle WebSocket upgrade requests
      if (path === '/ws' && req.headers.get('upgrade') === 'websocket') {
        const loopId = url.searchParams.get('loopId');
        if (!loopId || !validateLoopId(loopId)) {
          return new Response('Invalid loopId', { status: 400 });
        }
        const success = server.upgrade(req, { data: { loopId } });
        if (success) {
          return undefined; // Bun handles the response
        }
        return new Response('WebSocket upgrade failed', { status: 500 });
      }

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
        // POST /api/sessions/:id/archive
        else if (
          path.match(/^\/api\/sessions\/[^/]+\/archive$/) &&
          req.method === 'POST'
        ) {
          const parts = path.split('/');
          const loopId = parts[parts.length - 2];
          if (!validateLoopId(loopId)) {
            response = invalidLoopIdResponse();
          } else {
            response = handleArchiveSession(loopId);
          }
        }
        // DELETE /api/sessions (delete all archived)
        else if (path === '/api/sessions' && req.method === 'DELETE') {
          response = handleDeleteAllArchivedSessions();
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
        // GET /api/transcript/:loopId/iterations
        else if (
          path.match(/^\/api\/transcript\/[^/]+\/iterations$/) &&
          req.method === 'GET'
        ) {
          const parts = path.split('/');
          const loopId = parts[parts.length - 2];
          if (!validateLoopId(loopId)) {
            response = invalidLoopIdResponse();
          } else {
            response = handleGetIterations(loopId);
          }
        }
        // GET /api/transcript/:loopId/full
        else if (
          path.match(/^\/api\/transcript\/[^/]+\/full$/) &&
          req.method === 'GET'
        ) {
          const parts = path.split('/');
          const loopId = parts[parts.length - 2];
          if (!validateLoopId(loopId)) {
            response = invalidLoopIdResponse();
          } else {
            response = handleGetFullTranscript(loopId);
          }
        }
        // GET /api/transcript/:loopId (check availability)
        else if (
          path.match(/^\/api\/transcript\/[^/]+$/) &&
          req.method === 'GET'
        ) {
          const loopId = path.split('/').pop()!;
          if (!validateLoopId(loopId)) {
            response = invalidLoopIdResponse();
          } else {
            response = handleCheckTranscriptAvailability(loopId);
          }
        }
        // GET /api/checklist/:loopId
        else if (
          path.match(/^\/api\/checklist\/[^/]+$/) &&
          req.method === 'GET'
        ) {
          const loopId = path.split('/').pop()!;
          if (!validateLoopId(loopId)) {
            response = invalidLoopIdResponse();
          } else {
            response = handleGetChecklist(loopId);
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

    // WebSocket handlers
    websocket: {
      open(ws: ServerWebSocket<WebSocketData>) {
        const { loopId } = ws.data;
        console.log(`WebSocket connected for loop: ${loopId}`);
        const result = subscribeToLoop(loopId, ws);
        if (!result.success) {
          ws.send(JSON.stringify({ type: 'error', message: result.message }));
        }
      },
      close(ws: ServerWebSocket<WebSocketData>) {
        console.log(`WebSocket disconnected for loop: ${ws.data.loopId}`);
        unsubscribeFromAll(ws);
      },
      message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
        // Handle client messages if needed (e.g., ping/pong, subscribe to different loop)
        try {
          const data = JSON.parse(message.toString());
          if (
            data.type === 'subscribe' &&
            data.loopId &&
            validateLoopId(data.loopId)
          ) {
            // Allow subscribing to additional loops (with rate limiting)
            const result = subscribeToLoop(data.loopId, ws);
            if (!result.success) {
              ws.send(
                JSON.stringify({ type: 'error', message: result.message })
              );
            }
          }
        } catch {
          // Ignore invalid messages
        }
      },
    },
  });

  // Cleanup on process exit (use once to avoid duplicate handlers on hot reload)
  process.once('SIGINT', () => {
    cleanupAllWatchers();
    server.stop();
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    cleanupAllWatchers();
    server.stop();
    process.exit(0);
  });

  return server;
}
