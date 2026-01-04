import { useState } from 'react';
import type { Session } from '../../server/types';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { BREAKPOINTS } from '../constants/breakpoints';

interface SessionDetailProps {
  id?: string;
  session: Session;
  onCancel: () => void;
  isCancelling: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function SessionDetail({
  id,
  session,
  onCancel,
  isCancelling,
  onDelete,
  isDeleting = false,
}: SessionDetailProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // On desktop (>= 768px), always show details
  const isDesktop = useMediaQuery(BREAKPOINTS.DESKTOP);
  const shouldShowAdvanced = isDesktop || showAdvanced;

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
    <div id={id} className="bg-gray-50 p-3 sm:p-4 border-t border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Always visible: Status and Duration */}
        <div>
          <label className="text-xs sm:text-sm font-medium text-gray-500">
            Status
          </label>
          <p className="mt-1 text-claude-dark text-sm">
            <StatusBadge status={session.status} />
          </p>
        </div>

        <div>
          <label className="text-xs sm:text-sm font-medium text-gray-500">
            Duration
          </label>
          <p className="mt-1 text-claude-dark text-sm">
            {formatDuration(session.duration_seconds)}
          </p>
        </div>

        {/* Always visible: Iterations */}
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

        {/* Advanced section - collapsible on mobile, always visible on desktop */}
        <div className="md:col-span-2">
          {/* Toggle button - mobile only */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="md:hidden text-xs sm:text-sm text-claude-coral hover:text-claude-coral-dark font-medium flex items-center gap-1"
            aria-expanded={showAdvanced}
          >
            <span
              className={`transform transition-transform ${
                showAdvanced ? 'rotate-90' : ''
              }`}
              aria-hidden="true"
            >
              ▶
            </span>
            {showAdvanced ? 'Hide' : 'Show'} details
          </button>

          {shouldShowAdvanced && (
            <div className="md:mt-0 mt-3 sm:mt-4 space-y-3 sm:space-y-4">
              {/* Loop ID */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-500">
                  Loop ID
                </label>
                <p
                  className="mt-1 text-claude-dark font-mono text-xs sm:text-sm break-all sm:truncate sm:break-normal"
                  title={session.loop_id}
                >
                  {session.loop_id}
                </p>
              </div>

              {/* Session ID */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-500">
                  Session ID
                </label>
                <p
                  className="mt-1 text-claude-dark font-mono text-xs sm:text-sm break-all sm:truncate sm:break-normal"
                  title={session.session_id}
                >
                  {session.session_id}
                </p>
              </div>

              {/* Project Path */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-500">
                  Project Path
                </label>
                <p className="mt-1 text-claude-dark font-mono text-xs sm:text-sm break-all">
                  {session.project}
                </p>
              </div>

              {/* Started At and Ended At */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-xs sm:text-sm font-medium text-gray-500">
                    Started
                  </label>
                  <p className="mt-1 text-claude-dark text-xs sm:text-sm">
                    {formatDate(session.started_at)}
                  </p>
                </div>
                {session.ended_at && (
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-gray-500">
                      Ended
                    </label>
                    <p className="mt-1 text-claude-dark text-xs sm:text-sm">
                      {formatDate(session.ended_at)}
                    </p>
                  </div>
                )}
              </div>

              {/* Task */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-500">
                  Task
                </label>
                <p className="mt-1 text-claude-dark whitespace-pre-wrap text-xs sm:text-sm break-words">
                  {session.task || 'No task description'}
                </p>
              </div>

              {/* Completion Promise */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-500">
                  Completion Promise
                </label>
                <p className="mt-1 text-claude-dark whitespace-pre-wrap text-xs sm:text-sm break-words">
                  {session.completion_promise || (
                    <span className="text-gray-400 italic">None set</span>
                  )}
                </p>
              </div>

              {/* State File Path (for active sessions) */}
              {session.status === 'active' && session.state_file_path && (
                <div>
                  <label className="text-xs sm:text-sm font-medium text-gray-500">
                    State File
                  </label>
                  <p className="mt-1 text-claude-dark font-mono text-xs sm:text-sm break-all">
                    {session.state_file_path}
                  </p>
                </div>
              )}

              {/* Error Reason (if any) */}
              {session.error_reason && (
                <div>
                  <label className="text-xs sm:text-sm font-medium text-red-500">
                    Error
                  </label>
                  <p className="mt-1 text-red-600 text-xs sm:text-sm">
                    {session.error_reason}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Button (for active sessions) */}
      {session.status === 'active' && (
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2 min-h-[44px] active:scale-[0.98] active:opacity-80 transition-transform"
            aria-disabled={isCancelling}
          >
            {isCancelling ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
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
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2 min-h-[44px] active:scale-[0.98] active:opacity-80 transition-transform"
            aria-disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
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
