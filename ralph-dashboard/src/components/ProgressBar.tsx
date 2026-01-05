import type { Session } from '../../server/types';

interface ProgressBarProps {
  current: number | null;
  max: number;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  showPercentage?: boolean;
  status?: Session['status'];
  compact?: boolean; // Hide "X/Y" label, show only bar
}

/**
 * Calculate progress percentage safely, handling edge cases.
 */
function calculatePercentage(current: number | null, max: number): number {
  if (current === null || max === 0) return 0;
  return Math.min(Math.round((current / max) * 100), 100);
}

/**
 * Get the appropriate color class based on progress percentage and status.
 */
function getProgressColor(
  percentage: number,
  status?: Session['status']
): string {
  // If max iterations was reached, show warning color
  if (status === 'max_iterations') return 'bg-red-500';

  // Color based on percentage thresholds
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 70) return 'bg-orange-400';
  if (percentage >= 50) return 'bg-claude-coral';
  return 'bg-green-500';
}

export function ProgressBar({
  current,
  max,
  size = 'sm',
  showLabel = false,
  showPercentage = false,
  status,
  compact = false,
}: ProgressBarProps) {
  const percentage = calculatePercentage(current, max);
  const colorClass = getProgressColor(percentage, status);
  const heightClass = size === 'sm' ? 'h-2' : 'h-3';
  const isActive = status === 'active';

  // Handle null iterations - show N/A state
  if (current === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">N/A</span>
      </div>
    );
  }

  if (size === 'sm') {
    // Compact view for table rows and cards
    return (
      <div className="flex items-center gap-1 sm:gap-2 min-w-[80px] sm:min-w-[100px]">
        <div
          className={`flex-1 ${heightClass} bg-gray-200 rounded-full overflow-hidden`}
        >
          <div
            className={`${heightClass} ${colorClass} transition-all duration-300 ${isActive ? 'animate-pulse' : ''}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {showLabel && !compact && (
          <span className="text-xs text-gray-600 whitespace-nowrap">
            {current}/{max}
          </span>
        )}
        {compact && (
          <span className="text-xs text-gray-600 whitespace-nowrap">
            {current}/{max}
          </span>
        )}
      </div>
    );
  }

  // Detailed view for SessionDetail
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs sm:text-sm font-medium text-gray-500">
          Iterations
        </label>
        {showPercentage && (
          <span className="text-xs sm:text-sm font-semibold text-claude-dark">
            {percentage}%
          </span>
        )}
      </div>
      <div
        className={`${heightClass} bg-gray-200 rounded-full overflow-hidden`}
      >
        <div
          className={`${heightClass} ${colorClass} transition-all duration-300 ${isActive ? 'animate-pulse' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="text-sm sm:text-base font-semibold text-claude-dark text-right mt-1">
          {current} / {max}
        </div>
      )}
    </div>
  );
}
