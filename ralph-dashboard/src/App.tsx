import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { SessionTable } from './components/SessionTable';
import { useSessions } from './hooks/useSessions';

export function App() {
  const { data, isLoading, error } = useSessions();

  return (
    <div className="min-h-screen bg-claude-cream">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600">
              <svg
                className="animate-spin h-6 w-6"
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
              <span>Loading sessions...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-red-700">
              <span>⚠</span>
              <span>Failed to load sessions: {error.message}</span>
            </div>
          </div>
        )}

        {data && (
          <>
            <StatsBar
              sessions={data.sessions}
              activeCount={data.active_count}
            />
            <SessionTable sessions={data.sessions} />
          </>
        )}
      </main>

      <footer className="mt-8 py-4 text-center text-gray-500 text-sm">
        <p>Ralph Dashboard - Part of the Ralph Wiggum plugin for Claude Code</p>
      </footer>
    </div>
  );
}
