# Test Fixtures

Real Claude Code transcript samples for testing the Ralph Wiggum stop hook.

## Why Real Fixtures?

These fixtures are based on actual Claude Code transcripts to ensure tests validate against real-world data structures. This prevents bugs like the `.role` vs `.message.role` mismatch that caused completion promise detection to fail.

## Transcript Format

Claude Code transcripts use this JSON structure:

```json
{
  "message": {
    "role": "assistant",
    "content": [
      {"type": "text", "text": "..."},
      {"type": "tool_use", "id": "...", "name": "...", "input": {...}}
    ]
  }
}
```

**Important:** The `role` field is inside `message`, NOT at the top level.

## Fixture Files

| File | Description | Use Case |
|------|-------------|----------|
| `transcript-simple.jsonl` | Single assistant text message | Basic text extraction |
| `transcript-with-promise.jsonl` | Message with `<promise>` tags | Promise detection |
| `transcript-tool-only.jsonl` | Assistant message with only tool_use | Edge case: no text content |
| `transcript-mixed.jsonl` | Message with both text and tool_use | Mixed content handling |
| `transcript-user.jsonl` | User message | Filtering by role |
| `transcript-multi-message.jsonl` | Multiple messages (user + assistant) | Multi-message promise scan |
| `transcript-empty-assistant.jsonl` | Assistant with empty content array | Edge case handling |

## Updating Fixtures

If Claude Code's transcript format changes:

1. Extract new samples from `~/.claude/projects/<project>/*.jsonl`
2. Sanitize sensitive data (paths, tokens, personal info)
3. Update fixtures while preserving the structural format
4. Run tests to verify compatibility

## Source

Extracted from real Claude Code sessions on 2026-01-04.
Original transcript: `~/.claude/projects/-Users-eric-Dev-energy-tracker/cd781de1-*.jsonl`
