import type { Session } from '../../server/types';

interface StatsBarProps {
  sessions: Session[];
  activeCount: number;
}

export function StatsBar({ sessions, activeCount }: StatsBarProps) {
  const completedSessions = sessions.filter((s) => s.status !== 'active');

  const successCount = completedSessions.filter(
    (s) => s.status === 'success'
  ).length;
  const successRate =
    completedSessions.length > 0
      ? Math.round((successCount / completedSessions.length) * 100)
      : 0;

  const totalDuration = completedSessions.reduce(
    (sum, s) => sum + (s.duration_seconds ?? 0),
    0
  );
  const avgDuration =
    completedSessions.length > 0
      ? Math.round(totalDuration / completedSessions.length)
      : 0;

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Loops"
          value={sessions.length.toString()}
          icon="📊"
        />
        <StatCard
          label="Active"
          value={activeCount.toString()}
          icon="🔄"
          highlight={activeCount > 0}
        />
        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          icon="✅"
          subtext={`${successCount}/${completedSessions.length}`}
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(avgDuration)}
          icon="⏱️"
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: string;
  subtext?: string;
  highlight?: boolean;
}

function StatCard({ label, value, icon, subtext, highlight }: StatCardProps) {
  return (
    <div
      className={`p-4 rounded-lg ${
        highlight
          ? 'bg-claude-coral/10 border border-claude-coral'
          : 'bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-2 text-gray-600 mb-1">
        <span>{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div
        className={`text-2xl font-bold ${
          highlight ? 'text-claude-coral' : 'text-claude-dark'
        }`}
      >
        {value}
      </div>
      {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
    </div>
  );
}
