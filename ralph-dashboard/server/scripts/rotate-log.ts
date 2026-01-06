#!/usr/bin/env bun
/**
 * CLI script to rotate the session log file.
 * Called from log-session.sh to safely purge old complete sessions.
 */
import { rotateSessionLog } from '../services/log-parser.js';

const result = rotateSessionLog();

if (result.success) {
  if (result.sessionsPurged > 0) {
    console.log(
      `Rotated: ${result.entriesBefore} → ${result.entriesAfter} entries (${result.sessionsPurged} sessions purged)`
    );
  }
  process.exit(0);
} else {
  console.error(`Rotation failed: ${result.error}`);
  process.exit(1);
}
