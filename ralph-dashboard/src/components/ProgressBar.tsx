import type { Session } from '../../server/types';

interface ProgressBarProps {
  current: number | null;
  max: number;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  showPercentage?: boolean;
  status?: Session['status'];
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
    // Compact view for table rows
    return (
      <div className="flex items-center gap-2 min-w-[100px]">
        <div
          className={`flex-1 ${heightClass} bg-gray-200 rounded-full overflow-hidden`}
        >
          <div
            className={`${heightClass} ${colorClass} transition-all duration-300 ${isActive ? 'animate-pulse' : ''}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {showLabel && (
          <span className="text-xs text-gray-600 whitespace-nowrap">
            {current}/{max}
          </span>
        )}
      </div>
    );
  }

  // Detailed view for SessionDetail
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-500">Iterations</label>
        {showPercentage && (
          <span className="text-sm font-semibold text-claude-dark">
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
        <div className="text-xs text-gray-500 text-center">
          {current} / {max} iterations
        </div>
      )}
    </div>
  );
}
