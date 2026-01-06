#!/bin/bash

# Ralph Wiggum Checklist Service
# Manages task and completion criteria tracking for Ralph loops

set -euo pipefail

# Transcript directory for storing checklists
TRANSCRIPT_DIR="$HOME/.claude/ralph-wiggum-pro/transcripts"

# Debug logging helper - uses unique name to avoid overwriting parent script's debug_log
DEBUG_LOG="$HOME/.claude/ralph-wiggum-pro/logs/debug.log"
_checklist_debug_log() {
  local msg="$1"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] checklist-service: $msg" >> "$DEBUG_LOG"
}

# Validate loop_id format (alphanumeric, dots, dashes, underscores only - prevents path traversal)
validate_loop_id() {
  local loop_id="$1"
  if [[ -z "$loop_id" ]]; then
    _checklist_debug_log "ERROR: loop_id is empty"
    return 1
  fi
  if [[ ! "$loop_id" =~ ^[a-zA-Z0-9._-]{1,256}$ ]]; then
    _checklist_debug_log "ERROR: Invalid loop_id format: $loop_id"
    return 1
  fi
  if [[ "$loop_id" == *".."* ]]; then
    _checklist_debug_log "ERROR: loop_id contains path traversal sequence: $loop_id"
    return 1
  fi
  return 0
}

# Get checklist file path for a loop_id
checklist_get_path() {
  local loop_id="$1"
  echo "$TRANSCRIPT_DIR/${loop_id}-checklist.json"
}

# Check if checklist exists
checklist_exists() {
  local loop_id="$1"
  local checklist_path
  checklist_path=$(checklist_get_path "$loop_id")
  [[ -f "$checklist_path" ]]
}

# Get checklist JSON
checklist_get() {
  local loop_id="$1"
  if ! validate_loop_id "$loop_id"; then
    echo "ERROR: Invalid loop_id format" >&2
    return 1
  fi

  local checklist_path
  checklist_path=$(checklist_get_path "$loop_id")

  if [[ ! -f "$checklist_path" ]]; then
    echo "ERROR: Checklist not found for loop_id: $loop_id" >&2
    return 1
  fi

  cat "$checklist_path"
}

# Initialize checklist (first iteration only)
# Usage: checklist_init "<loop_id>" '<json>'
# JSON format: {"task_checklist": [...], "completion_criteria": [...]}
checklist_init() {
  local loop_id="$1"
  local json="$2"

  if ! validate_loop_id "$loop_id"; then
    echo "ERROR: Invalid loop_id format" >&2
    return 1
  fi

  if [[ -z "$json" ]]; then
    echo "ERROR: JSON input is required" >&2
    return 1
  fi

  local checklist_path
  checklist_path=$(checklist_get_path "$loop_id")

  # Check if checklist already exists
  if [[ -f "$checklist_path" ]]; then
    echo "ERROR: Checklist already exists for loop_id: $loop_id" >&2
    echo "Use checklist_status to update items or checklist_add to add new items" >&2
    return 1
  fi

  # Validate JSON structure
  if ! echo "$json" | jq empty 2>/dev/null; then
    echo "ERROR: Invalid JSON format" >&2
    return 1
  fi

  # Create transcript directory if it doesn't exist
  mkdir -p "$TRANSCRIPT_DIR"

  # Get loop metadata from state file (for session_id, project, project_name)
  # We'll get these from the environment or state file
  local session_id="${CLAUDE_SESSION_ID:-}"
  local project="${PWD}"
  local project_name
  project_name=$(basename "$project")
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Build checklist JSON with metadata
  local checklist_json
  checklist_json=$(jq -n \
    --argjson data "$json" \
    --arg loop_id "$loop_id" \
    --arg session_id "$session_id" \
    --arg project "$project" \
    --arg project_name "$project_name" \
    --arg created_at "$now" \
    --arg updated_at "$now" \
    '{
      loop_id: $loop_id,
      session_id: $session_id,
      project: $project,
      project_name: $project_name,
      created_at: $created_at,
      updated_at: $updated_at
    } + $data |
      .task_checklist |= map(. + {
        created_at: $created_at,
        completed_at: null,
        completed_iteration: null,
        status: "pending"
      }) |
      .completion_criteria |= map(. + {
        created_at: $created_at,
        completed_at: null,
        completed_iteration: null,
        status: "pending"
      })')

  # Write checklist file
  echo "$checklist_json" > "$checklist_path"

  _checklist_debug_log "Created checklist for loop_id: $loop_id"
  return 0
}

# Update item status
# Usage: checklist_status "<loop_id>" "<item_id>" "<status>" [iteration]
checklist_status() {
  local loop_id="$1"
  local item_id="$2"
  local status="$3"
  local iteration="${4:-}"

  if ! validate_loop_id "$loop_id"; then
    echo "ERROR: Invalid loop_id format" >&2
    return 1
  fi

  if [[ -z "$item_id" ]]; then
    echo "ERROR: item_id is required" >&2
    return 1
  fi

  if [[ -z "$status" ]]; then
    echo "ERROR: status is required" >&2
    return 1
  fi

  # Validate status
  if [[ "$status" != "pending" ]] && [[ "$status" != "in_progress" ]] && [[ "$status" != "completed" ]]; then
    echo "ERROR: Invalid status. Must be: pending, in_progress, or completed" >&2
    return 1
  fi

  local checklist_path
  checklist_path=$(checklist_get_path "$loop_id")

  if [[ ! -f "$checklist_path" ]]; then
    echo "ERROR: Checklist not found for loop_id: $loop_id" >&2
    return 1
  fi

  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Build update script for jq
  local jq_script
  if [[ "$status" == "completed" ]]; then
    # For completed status, set completed_at and completed_iteration
    if [[ -z "$iteration" ]]; then
      echo "WARNING: iteration number not provided for completed status" >&2
    fi
    jq_script="
      (.task_checklist[] | select(.id == \"\$item_id\")) |= (.status = \"\$status\" | .completed_at = \"\$now\" | .completed_iteration = (\$iteration // null)) |
      (.completion_criteria[] | select(.id == \"\$item_id\")) |= (.status = \"\$status\" | .completed_at = \"\$now\" | .completed_iteration = (\$iteration // null)) |
      .updated_at = \"\$now\"
    "
  else
    # For pending/in_progress, clear completed_at and completed_iteration
    jq_script="
      (.task_checklist[] | select(.id == \"\$item_id\")) |= (.status = \"\$status\" | .completed_at = null | .completed_iteration = null) |
      (.completion_criteria[] | select(.id == \"\$item_id\")) |= (.status = \"\$status\" | .completed_at = null | .completed_iteration = null) |
      .updated_at = \"\$now\"
    "
  fi

  # Update checklist
  local updated
  updated=$(jq --arg item_id "$item_id" --arg status "$status" --arg now "$now" --arg iteration "$iteration" "$jq_script" "$checklist_path")

  if [[ -z "$updated" ]]; then
    echo "ERROR: Failed to update checklist item with id: $item_id" >&2
    return 1
  fi

  # Check if item was found
  local item_exists
  item_exists=$(echo "$updated" | jq "[.task_checklist[], .completion_criteria[]] | any(.id == \"\$item_id\")" --arg item_id "$item_id")

  if [[ "$item_exists" != "true" ]]; then
    echo "ERROR: Item with id '$item_id' not found in checklist" >&2
    return 1
  fi

  # Write updated checklist
  echo "$updated" > "$checklist_path"

  _checklist_debug_log "Updated item $item_id to status '$status' for loop_id: $loop_id"
  return 0
}

# Add new item to checklist
# Usage: checklist_add "<loop_id>" "<type>" "<item_id>" "<text>"
checklist_add() {
  local loop_id="$1"
  local type="$2"
  local item_id="$3"
  local text="$4"

  if ! validate_loop_id "$loop_id"; then
    echo "ERROR: Invalid loop_id format" >&2
    return 1
  fi

  if [[ -z "$type" ]]; then
    echo "ERROR: type is required (task or criteria)" >&2
    return 1
  fi

  if [[ "$type" != "task" ]] && [[ "$type" != "criteria" ]]; then
    echo "ERROR: Invalid type. Must be: task or criteria" >&2
    return 1
  fi

  if [[ -z "$item_id" ]]; then
    echo "ERROR: item_id is required" >&2
    return 1
  fi

  if [[ -z "$text" ]]; then
    echo "ERROR: text is required" >&2
    return 1
  fi

  local checklist_path
  checklist_path=$(checklist_get_path "$loop_id")

  if [[ ! -f "$checklist_path" ]]; then
    echo "ERROR: Checklist not found for loop_id: $loop_id" >&2
    return 1
  fi

  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Add new item
  local updated
  if [[ "$type" == "task" ]]; then
    updated=$(jq \
      --arg id "$item_id" \
      --arg text "$text" \
      --arg now "$now" \
      '.task_checklist += [{
        id: $id,
        text: $text,
        status: "pending",
        created_at: $now,
        completed_at: null,
        completed_iteration: null
      }] | .updated_at = $now' \
      "$checklist_path")
  else
    updated=$(jq \
      --arg id "$item_id" \
      --arg text "$text" \
      --arg now "$now" \
      '.completion_criteria += [{
        id: $id,
        text: $text,
        status: "pending",
        created_at: $now,
        completed_at: null,
        completed_iteration: null
      }] | .updated_at = $now' \
      "$checklist_path")
  fi

  if [[ -z "$updated" ]]; then
    echo "ERROR: Failed to add item to checklist" >&2
    return 1
  fi

  # Write updated checklist
  echo "$updated" > "$checklist_path"

  _checklist_debug_log "Added $type item $item_id to checklist for loop_id: $loop_id"
  return 0
}

# Get checklist summary
# Usage: checklist_summary "<loop_id>"
# Outputs: "3/5 tasks • 1/2 criteria"
checklist_summary() {
  local loop_id="$1"

  if ! validate_loop_id "$loop_id"; then
    echo "ERROR: Invalid loop_id format" >&2
    return 1
  fi

  local checklist_path
  checklist_path=$(checklist_get_path "$loop_id")

  if [[ ! -f "$checklist_path" ]]; then
    echo "ERROR: Checklist not found for loop_id: $loop_id" >&2
    return 1
  fi

  local tasks_total tasks_completed criteria_total criteria_completed
  tasks_total=$(jq '[.task_checklist[]] | length' "$checklist_path")
  tasks_completed=$(jq '[.task_checklist[] | select(.status == "completed")] | length' "$checklist_path")
  criteria_total=$(jq '[.completion_criteria[]] | length' "$checklist_path")
  criteria_completed=$(jq '[.completion_criteria[] | select(.status == "completed")] | length' "$checklist_path")

  echo "${tasks_completed}/${tasks_total} tasks • ${criteria_completed}/${criteria_total} criteria"
  return 0
}

# Main dispatch - allow calling functions directly
# Usage: source ./checklist-service.sh && checklist_init ...
# Or: ./checklist-service.sh <function> <args...
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  # Script is being executed directly
  if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <function> <args...>" >&2
    echo "Functions: checklist_init, checklist_status, checklist_add, checklist_get, checklist_exists, checklist_summary" >&2
    exit 1
  fi

  local func="$1"
  shift

  case "$func" in
    checklist_init|checklist_status|checklist_add|checklist_get|checklist_exists|checklist_summary)
      "$func" "$@"
      ;;
    *)
      echo "ERROR: Unknown function: $func" >&2
      exit 1
      ;;
  esac
fi
