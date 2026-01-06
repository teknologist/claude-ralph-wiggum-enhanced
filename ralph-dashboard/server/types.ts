// Log entry types (as stored in JSONL)
export interface StartLogEntry {
  loop_id: string; // Unique per loop invocation
  session_id: string; // Claude Code terminal session (for grouping)
  status: 'active';
  project: string;
  project_name: string;
  state_file_path?: string; // Optional for backward compat with old entries
  task: string;
  started_at: string;
  max_iterations: number;
  completion_promise: string | null;
}

export interface CompletionLogEntry {
  loop_id: string; // Unique per loop invocation
  session_id: string; // Claude Code terminal session (for grouping)
  status: 'completed';
  outcome: 'success' | 'max_iterations' | 'cancelled' | 'error' | 'orphaned';
  ended_at: string;
  duration_seconds: number;
  iterations: number;
  error_reason?: string | null;
}

export type LogEntry = StartLogEntry | CompletionLogEntry;

// Merged session type (for API responses)
export interface Session {
  loop_id: string; // Unique per loop invocation (primary identifier)
  session_id: string; // Claude Code terminal session (for grouping)
  status:
    | 'active'
    | 'success'
    | 'cancelled'
    | 'error'
    | 'max_iterations'
    | 'orphaned';
  outcome?: 'success' | 'cancelled' | 'error' | 'max_iterations' | 'orphaned';
  project: string;
  project_name: string;
  state_file_path?: string; // Optional for backward compat with old entries
  task: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  iterations: number | null;
  max_iterations: number;
  completion_promise: string | null;
  error_reason: string | null;
  // Checklist fields (optional)
  has_checklist: boolean;
  checklist_progress: string | null; // e.g. "3/5 tasks • 1/2 criteria"
}

export interface SessionsResponse {
  sessions: Session[];
  total: number;
  active_count: number;
}

export interface CancelResponse {
  success: boolean;
  message: string;
  loop_id: string;
}

export interface DeleteResponse {
  success: boolean;
  message: string;
  loop_id: string;
}

export interface ArchiveResponse {
  success: boolean;
  message: string;
  loop_id: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

// Transcript types
export interface IterationEntry {
  iteration: number;
  timestamp: string;
  output: string;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface IterationsResponse {
  iterations: IterationEntry[];
}

export interface FullTranscriptResponse {
  messages: TranscriptMessage[];
}

export interface TranscriptAvailabilityResponse {
  hasIterations: boolean;
  hasFullTranscript: boolean;
}

// Checklist types
export type ChecklistItemStatus = 'pending' | 'in_progress' | 'completed';

export interface ChecklistItem {
  id: string;
  text: string;
  status: ChecklistItemStatus;
  created_at: string;
  completed_at?: string | null;
  completed_iteration?: number | null;
}

export interface Checklist {
  loop_id: string;
  session_id: string;
  project: string;
  project_name: string;
  created_at: string;
  updated_at: string;
  task_checklist: ChecklistItem[];
  completion_criteria: ChecklistItem[];
}

export interface ChecklistProgress {
  tasks: string;
  criteria: string;
  tasksCompleted: number;
  tasksTotal: number;
  criteriaCompleted: number;
  criteriaTotal: number;
}

export interface ChecklistResponse {
  checklist: Checklist | null;
  progress: ChecklistProgress | null;
}

// WebSocket types
export interface WebSocketData {
  loopId: string;
}
