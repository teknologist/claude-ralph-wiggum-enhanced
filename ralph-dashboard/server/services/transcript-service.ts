import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';

// Global paths
const RALPH_BASE_DIR = join(homedir(), '.claude', 'ralph-wiggum-pro');
const TRANSCRIPT_DIR = join(RALPH_BASE_DIR, 'transcripts');

// Old path for backward compatibility
const OLD_TRANSCRIPT_DIR = join(
  homedir(),
  '.claude',
  'ralph-wiggum-pro-logs',
  'transcripts'
);

export interface IterationEntry {
  iteration: number;
  timestamp: string;
  output: string;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Find the iterations file path for a given loop ID.
 * Handles both new naming ({session_id}-{loop_id}-iterations.jsonl) and
 * old naming ({loop_id}-iterations.jsonl).
 */
export function getIterationsFilePath(loopId: string): string | null {
  // Try new directory with glob pattern (new naming: *-{loop_id}-iterations.jsonl)
  if (existsSync(TRANSCRIPT_DIR)) {
    const files = readdirSync(TRANSCRIPT_DIR);
    const match = files.find(
      (f) =>
        f.endsWith(`-${loopId}-iterations.jsonl`) ||
        f === `${loopId}-iterations.jsonl`
    );
    if (match) {
      return join(TRANSCRIPT_DIR, match);
    }
  }

  // Try old directory (backward compatibility)
  if (existsSync(OLD_TRANSCRIPT_DIR)) {
    const files = readdirSync(OLD_TRANSCRIPT_DIR);
    const match = files.find(
      (f) =>
        f.endsWith(`-${loopId}-iterations.jsonl`) ||
        f === `${loopId}-iterations.jsonl`
    );
    if (match) {
      return join(OLD_TRANSCRIPT_DIR, match);
    }
  }

  return null;
}

/**
 * Find the full transcript file path for a given loop ID.
 * Handles both new naming ({session_id}-{loop_id}-full.jsonl) and
 * old naming ({loop_id}-full.jsonl).
 */
export function getFullTranscriptFilePath(loopId: string): string | null {
  // Try new directory with glob pattern
  if (existsSync(TRANSCRIPT_DIR)) {
    const files = readdirSync(TRANSCRIPT_DIR);
    const match = files.find(
      (f) => f.endsWith(`-${loopId}-full.jsonl`) || f === `${loopId}-full.jsonl`
    );
    if (match) {
      return join(TRANSCRIPT_DIR, match);
    }
  }

  // Try old directory (backward compatibility)
  if (existsSync(OLD_TRANSCRIPT_DIR)) {
    const files = readdirSync(OLD_TRANSCRIPT_DIR);
    const match = files.find(
      (f) => f.endsWith(`-${loopId}-full.jsonl`) || f === `${loopId}-full.jsonl`
    );
    if (match) {
      return join(OLD_TRANSCRIPT_DIR, match);
    }
  }

  return null;
}

/**
 * Check if iterations file exists for a given loop ID.
 */
export function hasIterations(loopId: string): boolean {
  return getIterationsFilePath(loopId) !== null;
}

/**
 * Check if full transcript file exists for a given loop ID.
 */
export function hasFullTranscript(loopId: string): boolean {
  return getFullTranscriptFilePath(loopId) !== null;
}

/**
 * Get iterations for a given loop ID.
 * Returns null if no iterations file exists.
 */
export function getIterations(loopId: string): IterationEntry[] | null {
  const filePath = getIterationsFilePath(loopId);

  if (!filePath || !existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    const entries: IterationEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as IterationEntry;
        entries.push(entry);
      } catch {
        // Skip malformed lines
        console.warn('Skipping malformed iteration entry:', line.slice(0, 50));
      }
    }

    return entries;
  } catch (error) {
    console.error('Failed to read iterations for loop:', loopId, error);
    return null;
  }
}

/**
 * Parse the full transcript file and extract messages.
 * The transcript is in Claude Code's internal JSONL format.
 * Returns null if file doesn't exist.
 */
export function getFullTranscript(loopId: string): TranscriptMessage[] | null {
  const filePath = getFullTranscriptFilePath(loopId);

  if (!filePath || !existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    const messages: TranscriptMessage[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Claude Code transcript format: {"message": {"role": "...", "content": [...]}}
        if (entry.message?.role && entry.message?.content) {
          const role = entry.message.role as 'user' | 'assistant';
          // Extract text content from content array
          const textContent = entry.message.content
            .filter(
              (c: { type: string; text?: string }) =>
                c.type === 'text' && c.text
            )
            .map((c: { text: string }) => c.text)
            .join('\n');

          if (textContent) {
            messages.push({ role, content: textContent });
          }
        }
      } catch {
        // Skip malformed lines
        console.warn('Skipping malformed transcript entry:', line.slice(0, 50));
      }
    }

    return messages;
  } catch (error) {
    console.error('Failed to read full transcript for loop:', loopId, error);
    return null;
  }
}

/**
 * Get raw full transcript file content.
 * Returns null if file doesn't exist.
 */
export function getRawFullTranscript(loopId: string): string | null {
  const filePath = getFullTranscriptFilePath(loopId);

  if (!filePath || !existsSync(filePath)) {
    return null;
  }

  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error('Failed to read raw transcript for loop:', loopId, error);
    return null;
  }
}
