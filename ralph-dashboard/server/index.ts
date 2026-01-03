#!/usr/bin/env bun

import { createServer } from './server';

function parseArgs(): { port: number; host: string } {
  const args = process.argv.slice(2);
  let port = 3847;
  let host = 'localhost';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' || arg === '-p') {
      const value = args[++i];
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`Invalid port: ${value}`);
        process.exit(1);
      }
      port = parsed;
    } else if (arg === '--host' || arg === '-h') {
      host = args[++i] || 'localhost';
    } else if (arg === '--help') {
      console.log(`
Ralph Dashboard - Web UI for Ralph Wiggum loops

USAGE:
  ralph-dashboard [OPTIONS]

OPTIONS:
  --port, -p <PORT>   Port to listen on (default: 3847)
  --host, -h <HOST>   Host to bind to (default: localhost)
                      Use 0.0.0.0 for public access
  --help              Show this help message

EXAMPLES:
  ralph-dashboard                        # Start on localhost:3847
  ralph-dashboard --port 8080            # Start on localhost:8080
  ralph-dashboard --host 0.0.0.0         # Allow remote access
  ralph-dashboard -p 8080 -h 0.0.0.0     # Both options
`);
      process.exit(0);
    }
  }

  return { port, host };
}

function main() {
  const { port, host } = parseArgs();

  console.log(`
🔄 Ralph Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  createServer({ port, host });

  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const publicNote = host === '0.0.0.0' ? ' (public access enabled)' : '';

  console.log(
    `  🌐 Server running at: http://${displayHost}:${port}${publicNote}`
  );
  console.log(`  📊 View your Ralph loops in the browser`);
  console.log(`  ⏹  Press Ctrl+C to stop`);
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main();
