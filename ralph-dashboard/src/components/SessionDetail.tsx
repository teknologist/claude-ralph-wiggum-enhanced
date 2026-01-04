import type { Session } from '../../server/types';
import { ProgressBar } from './ProgressBar';

interface SessionDetailProps {
  session: Session;
  onCancel: () => void;
  isCancelling: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function SessionDetail({
  session,
  onCancel,
  isCancelling,
  onDelete,
  isDeleting = false,
}: SessionDetailProps) {
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (seconds: number | undefined): string => {
    if (seconds === undefined) return 'In progress...';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="bg-gray-50 p-4 border-t border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Loop ID */}
        <div>
          <label className="text-sm font-medium text-gray-500">Loop ID</label>
          <p
            className="mt-1 text-claude-dark font-mono text-sm truncate"
            title={session.loop_id}
          >
            {session.loop_id}
          </p>
        </div>

        {/* Session ID */}
        <div>
          <label className="text-sm font-medium text-gray-500">
            Session ID
          </label>
          <p
            className="mt-1 text-claude-dark font-mono text-sm truncate"
            title={session.session_id}
          >
            {session.session_id}
          </p>
        </div>

        {/* Task */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-gray-500">Task</label>
          <p className="mt-1 text-claude-dark whitespace-pre-wrap">
            {session.task || 'No task description'}
          </p>
        </div>

        {/* Completion Promise */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-gray-500">
            Completion Promise
          </label>
          <p className="mt-1 text-claude-dark whitespace-pre-wrap">
            {session.completion_promise || (
              <span className="text-gray-400 italic">None set</span>
            )}
          </p>
        </div>

        {/* Project Path */}
        <div>
          <label className="text-sm font-medium text-gray-500">
            Project Path
          </label>
          <p className="mt-1 text-claude-dark font-mono text-sm">
            {session.project}
          </p>
        </div>

        {/* Started At */}
        <div>
          <label className="text-sm font-medium text-gray-500">Started</label>
          <p className="mt-1 text-claude-dark">
            {formatDate(session.started_at)}
          </p>
        </div>

        {/* Duration */}
        <div>
          <label className="text-sm font-medium text-gray-500">Duration</label>
          <p className="mt-1 text-claude-dark">
            {formatDuration(session.duration_seconds)}
          </p>
        </div>

        {/* Iterations */}
        <div className="md:col-span-2">
          <ProgressBar
            current={session.iterations}
            max={session.max_iterations}
            size="md"
            showLabel
            showPercentage
            status={session.status}
          />
        </div>

        {/* State File Path (for active sessions) */}
        {session.status === 'active' && session.state_file_path && (
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-500">
              State File
            </label>
            <p className="mt-1 text-claude-dark font-mono text-sm break-all">
              {session.state_file_path}
            </p>
          </div>
        )}

        {/* Error Reason (if any) */}
        {session.error_reason && (
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-red-500">Error</label>
            <p className="mt-1 text-red-600">{session.error_reason}</p>
          </div>
        )}
      </div>

      {/* Cancel Button (for active sessions) */}
      {session.status === 'active' && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isCancelling ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Cancelling...
              </>
            ) : (
              <>⏹ Cancel Loop</>
            )}
          </button>
        </div>
      )}

      {/* Delete Button (for archived/non-active sessions) */}
      {session.status !== 'active' && onDelete && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Deleting...
              </>
            ) : (
              <>🗑 Delete Permanently</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
