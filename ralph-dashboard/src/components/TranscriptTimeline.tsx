import { useState, useMemo } from 'react';
import type { Session, IterationEntry } from '../../server/types';
import { useTranscriptIterations } from '../hooks/useTranscript';
import { FullTranscriptModal } from './FullTranscriptModal';
import { ErrorBoundary } from './ErrorBoundary';
import {
  exportTranscriptAsMarkdown,
  downloadMarkdown,
  generateExportFilename,
} from '../utils/exportTranscript';

interface TranscriptTimelineProps {
  session: Session;
}

/**
 * Calculate duration between two timestamps in human-readable format.
 */
function formatIterationDuration(
  currentTimestamp: string,
  nextTimestamp: string | null
): string {
  if (!nextTimestamp) return '';

  const start = new Date(currentTimestamp).getTime();
  const end = new Date(nextTimestamp).getTime();
  const diffSeconds = Math.round((end - start) / 1000);

  if (diffSeconds < 60) return `${diffSeconds}s`;
  const minutes = Math.floor(diffSeconds / 60);
  const seconds = diffSeconds % 60;
  if (minutes < 60)
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Truncate text and add ellipsis if too long.
 */
function truncateText(text: string, maxLength: number = 300): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Highlight search term in text.
 */
function highlightText(text: string, searchTerm: string): React.ReactNode {
  if (!searchTerm.trim()) return text;

  const regex = new RegExp(
    `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi'
  );
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={index} className="bg-yellow-200 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function TranscriptTimeline({ session }: TranscriptTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedIterations, setExpandedIterations] = useState<Set<number>>(
    new Set()
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  // Check if session is active (needs real-time updates via WebSocket)
  const isActive = session.status === 'active' || session.status === 'orphaned';

  // Fetch iterations only when expanded, with WebSocket for active sessions
  const { data, isLoading, error } = useTranscriptIterations(
    session.loop_id,
    isExpanded,
    isActive
  );

  const iterations = data?.iterations ?? [];

  // Calculate durations between iterations
  const iterationsWithDuration = useMemo(() => {
    return iterations.map((iter, index) => {
      const nextTimestamp =
        index < iterations.length - 1
          ? iterations[index + 1].timestamp
          : session.ended_at;
      return {
        ...iter,
        duration: formatIterationDuration(iter.timestamp, nextTimestamp),
      };
    });
  }, [iterations, session.ended_at]);

  // Filter iterations by search term
  const filteredIterations = useMemo(() => {
    if (!searchTerm.trim()) return iterationsWithDuration;
    const lowerSearch = searchTerm.toLowerCase();
    return iterationsWithDuration.filter((iter) =>
      iter.output.toLowerCase().includes(lowerSearch)
    );
  }, [iterationsWithDuration, searchTerm]);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const toggleIterationExpand = (iterationNum: number) => {
    setExpandedIterations((prev) => {
      const next = new Set(prev);
      if (next.has(iterationNum)) {
        next.delete(iterationNum);
      } else {
        next.add(iterationNum);
      }
      return next;
    });
  };

  const handleExport = () => {
    const markdown = exportTranscriptAsMarkdown(session, iterations);
    const filename = generateExportFilename(session);
    downloadMarkdown(markdown, filename);
  };

  const iterationCount = iterations.length;
  const headerLabel =
    iterationCount > 0
      ? `Transcript (${iterationCount} iterations)`
      : 'Transcript';

  return (
    <div className="py-4 sm:py-6 ml-4 pl-4 border-l border-gray-300">
      {/* Collapsible Header */}
      <button
        onClick={toggleExpand}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-claude-coral transition-colors w-full text-left"
        aria-expanded={isExpanded}
        aria-controls="transcript-content"
      >
        <span
          className={`transform transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        >
          ▶
        </span>
        <span>{headerLabel}</span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div
          id="transcript-content"
          className="mt-4 ml-2 border-l-2 border-gray-200 pl-4"
        >
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-500 py-4">
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
              <span className="text-sm">Loading transcript...</span>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="text-gray-500 text-sm py-4 flex items-center gap-2">
              <span>📭</span>
              <span>No transcript available (recorded from v2.1.0+)</span>
            </div>
          )}

          {/* Timeline Content - always shown when not loading/error */}
          {!isLoading && !error && (
            <div className="space-y-4">
              {/* Toolbar - only shown when there are iterations */}
              {iterations.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between bg-gray-50 rounded-lg p-2 -ml-4 border-l-0">
                  {/* Search */}
                  <div className="relative flex-1 max-w-xs">
                    <input
                      type="text"
                      placeholder="Search iterations..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-claude-coral/50 focus:border-claude-coral"
                      aria-label="Search iterations"
                    />
                    <svg
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        aria-label="Clear search"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowFullTranscript(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-claude-coral hover:bg-white rounded-lg transition-colors"
                      title="View full transcript"
                    >
                      <span>📜</span>
                      <span className="hidden sm:inline">View Full</span>
                    </button>
                    <button
                      onClick={handleExport}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-claude-coral hover:bg-white rounded-lg transition-colors"
                      title="Export as Markdown"
                    >
                      <span>📥</span>
                      <span className="hidden sm:inline">Export</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Search Results Count - only shown when there are iterations */}
              {iterations.length > 0 && searchTerm && (
                <div className="text-xs text-gray-500">
                  Found {filteredIterations.length} of {iterations.length}{' '}
                  iterations
                </div>
              )}

              {/* User Prompt */}
              <div className="relative">
                <div className="absolute -left-[21px] top-3 w-3 h-3 bg-blue-400 rounded-full border-2 border-white" />
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-3 shadow-sm">
                  <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-2">
                    <span>📝</span>
                    <span>USER PROMPT</span>
                  </div>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap break-words">
                    {session.task || 'No task description'}
                  </p>
                </div>
              </div>

              {/* Iterations */}
              {filteredIterations.map((iteration) => (
                <IterationCard
                  key={iteration.iteration}
                  iteration={iteration}
                  isExpanded={expandedIterations.has(iteration.iteration)}
                  onToggleExpand={() =>
                    toggleIterationExpand(iteration.iteration)
                  }
                  searchTerm={searchTerm}
                />
              ))}

              {/* Completion Status */}
              <CompletionStatus session={session} />
            </div>
          )}
        </div>
      )}

      {/* Full Transcript Modal */}
      <ErrorBoundary>
        <FullTranscriptModal
          loopId={session.loop_id}
          isOpen={showFullTranscript}
          onClose={() => setShowFullTranscript(false)}
        />
      </ErrorBoundary>
    </div>
  );
}

interface IterationCardProps {
  iteration: IterationEntry & { duration: string };
  isExpanded: boolean;
  onToggleExpand: () => void;
  searchTerm?: string;
}

function IterationCard({
  iteration,
  isExpanded,
  onToggleExpand,
  searchTerm = '',
}: IterationCardProps) {
  const needsTruncation = iteration.output.length > 300;
  const displayText = isExpanded
    ? iteration.output
    : truncateText(iteration.output, 300);

  return (
    <div className="relative">
      <div className="absolute -left-[21px] top-3 w-3 h-3 bg-gray-400 rounded-full border-2 border-white" />
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-700 font-medium text-sm">
            <span>🔄</span>
            <span>Iteration {iteration.iteration}</span>
          </div>
          {iteration.duration && (
            <span className="bg-claude-coral/10 text-claude-coral text-xs font-medium px-2 py-0.5 rounded-full">
              {iteration.duration}
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="text-gray-600 text-sm whitespace-pre-wrap break-words">
            {highlightText(displayText, searchTerm)}
          </p>
          {needsTruncation && (
            <button
              onClick={onToggleExpand}
              className="mt-2 text-xs text-claude-coral hover:text-claude-coral-dark font-medium"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface CompletionStatusProps {
  session: Session;
}

function CompletionStatus({ session }: CompletionStatusProps) {
  const isActive = session.status === 'active';
  const isSuccess = session.status === 'success';
  const isMaxIterations = session.status === 'max_iterations';
  const isCancelled = session.status === 'cancelled';
  const isError = session.status === 'error';
  const isOrphaned = session.status === 'orphaned';

  // Calculate total duration
  const formatTotalDuration = (): string => {
    const seconds = session.duration_seconds;
    if (!seconds) return '';
    if (seconds < 60) return `${seconds}s total`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60)
      return remainingSeconds > 0
        ? `${minutes}m ${remainingSeconds}s total`
        : `${minutes}m total`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m total`
      : `${hours}h total`;
  };

  if (isActive) {
    return (
      <div className="relative">
        <div className="absolute -left-[21px] top-3 w-3 h-3 bg-amber-400 rounded-full border-2 border-white animate-pulse" />
        <div className="border-2 border-dashed border-amber-400 bg-amber-50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
            <span>⏳</span>
            <span>IN PROGRESS...</span>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="relative">
        <div className="absolute -left-[21px] top-3 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
        <div className="bg-green-50 border-2 border-green-400 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
              <span>✅</span>
              <span>COMPLETED</span>
            </div>
            {session.duration_seconds && (
              <span className="text-green-600 text-xs font-medium">
                {formatTotalDuration()}
              </span>
            )}
          </div>
          {session.completion_promise && (
            <p className="text-green-600 text-sm">
              Promise fulfilled:{' '}
              <code className="bg-green-100 px-1 rounded">
                &lt;promise&gt;{session.completion_promise}&lt;/promise&gt;
              </code>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (isMaxIterations) {
    return (
      <div className="relative">
        <div className="absolute -left-[21px] top-3 w-3 h-3 bg-orange-500 rounded-full border-2 border-white" />
        <div className="bg-orange-50 border-2 border-orange-400 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-orange-700 font-medium text-sm">
              <span>🔁</span>
              <span>MAX ITERATIONS REACHED</span>
            </div>
            {session.duration_seconds && (
              <span className="text-orange-600 text-xs font-medium">
                {formatTotalDuration()}
              </span>
            )}
          </div>
          <p className="text-orange-600 text-sm">
            Loop stopped after {session.iterations} iterations (max:{' '}
            {session.max_iterations})
          </p>
        </div>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="relative">
        <div className="absolute -left-[21px] top-3 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
              <span>⏹</span>
              <span>CANCELLED</span>
            </div>
            {session.duration_seconds && (
              <span className="text-red-600 text-xs font-medium">
                {formatTotalDuration()}
              </span>
            )}
          </div>
          <p className="text-red-600 text-sm">
            Loop was cancelled by user after {session.iterations} iterations
          </p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="relative">
        <div className="absolute -left-[21px] top-3 w-3 h-3 bg-red-600 rounded-full border-2 border-white" />
        <div className="bg-red-50 border-2 border-red-400 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
              <span>❌</span>
              <span>ERROR</span>
            </div>
            {session.duration_seconds && (
              <span className="text-red-600 text-xs font-medium">
                {formatTotalDuration()}
              </span>
            )}
          </div>
          {session.error_reason && (
            <p className="text-red-600 text-sm">{session.error_reason}</p>
          )}
        </div>
      </div>
    );
  }

  if (isOrphaned) {
    return (
      <div className="relative">
        <div className="absolute -left-[21px] top-3 w-3 h-3 bg-gray-500 rounded-full border-2 border-white" />
        <div className="bg-gray-100 border-2 border-gray-300 rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-2 text-gray-700 font-medium text-sm">
            <span>👻</span>
            <span>ORPHANED</span>
          </div>
          <p className="text-gray-600 text-sm mt-1">
            Session became orphaned (terminal closed or state file missing)
          </p>
        </div>
      </div>
    );
  }

  return null;
}
