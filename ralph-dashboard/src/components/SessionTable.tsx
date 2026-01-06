import { useState, useMemo } from 'react';
import type { Session } from '../../server/types';
import { SessionRow } from './SessionRow';
import { SessionCard } from './SessionCard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { BREAKPOINTS } from '../constants/breakpoints';

interface SessionTableProps {
  sessions: Session[];
  viewMode: 'table' | 'card';
  setViewMode: (mode: 'table' | 'card') => void;
}

type Tab = 'active' | 'archived';

export function SessionTable({
  sessions,
  viewMode,
  setViewMode: _setViewMode, // Kept for interface consistency; used by Header, not here
}: SessionTableProps) {
  const [activeTab, setActiveTab] = useState<Tab>('active');

  // Auto-detect mobile: switch to card view on screens < 768px
  const isMobile = useMediaQuery(BREAKPOINTS.MOBILE);

  const { activeSessions, archivedSessions } = useMemo(() => {
    // Include both active and orphaned sessions in the "active" tab
    const active = sessions.filter(
      (s) => s.status === 'active' || s.status === 'orphaned'
    );
    const archived = sessions.filter(
      (s) => s.status !== 'active' && s.status !== 'orphaned'
    );

    // Sort by started_at descending (most recent first)
    const sortByDate = (a: Session, b: Session) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime();

    return {
      activeSessions: active.sort(sortByDate),
      archivedSessions: archived.sort(sortByDate),
    };
  }, [sessions]);

  const displaySessions =
    activeTab === 'active' ? activeSessions : archivedSessions;

  // Determine effective view mode (mobile forces card view)
  const effectiveViewMode = isMobile ? 'card' : viewMode;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 px-3 sm:px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'active'
              ? 'text-claude-coral border-b-2 border-claude-coral bg-claude-coral/5'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          Active Loops
          {activeSessions.length > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-claude-coral text-white">
              {activeSessions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`flex-1 px-3 sm:px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'archived'
              ? 'text-claude-coral border-b-2 border-claude-coral bg-claude-coral/5'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          Archived
          <span className="ml-2 text-gray-400">
            ({archivedSessions.length})
          </span>
        </button>
      </div>

      {/* Content: Cards or Table */}
      {displaySessions.length > 0 ? (
        effectiveViewMode === 'card' ? (
          // Card Grid Layout (mobile or desktop card view)
          <div className="p-3 sm:p-4 grid grid-cols-1 gap-3 sm:gap-4">
            {displaySessions.map((session) => (
              <SessionCard key={session.loop_id} session={session} />
            ))}
          </div>
        ) : (
          // Table Layout (desktop)
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Task
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Started
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Iterations
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displaySessions.map((session) => (
                  <SessionRow key={session.loop_id} session={session} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="p-8 text-center text-gray-500">
          {activeTab === 'active' ? (
            <>
              <div className="text-4xl mb-2">🔄</div>
              <p>No active loops</p>
              <p className="text-sm mt-1">
                Start a Ralph loop with{' '}
                <code className="bg-gray-100 px-1 rounded">/ralph-loop</code>
              </p>
            </>
          ) : (
            <>
              <div className="text-4xl mb-2">📋</div>
              <p>No archived loops yet</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
