import { useState, useMemo } from 'react';
import type { Session } from '../../server/types';
import { SessionRow } from './SessionRow';

interface SessionTableProps {
  sessions: Session[];
}

type Tab = 'active' | 'archived';

export function SessionTable({ sessions }: SessionTableProps) {
  const [activeTab, setActiveTab] = useState<Tab>('active');

  const { activeSessions, archivedSessions } = useMemo(() => {
    const active = sessions.filter((s) => s.status === 'active');
    const archived = sessions.filter((s) => s.status !== 'active');

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

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
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
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
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

      {/* Table */}
      {displaySessions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Iterations
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displaySessions.map((session) => (
                <SessionRow key={session.session_id} session={session} />
              ))}
            </tbody>
          </table>
        </div>
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
