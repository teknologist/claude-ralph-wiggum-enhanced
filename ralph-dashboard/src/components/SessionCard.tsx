import { useState } from 'react';
import type { Session } from '../../server/types';
import { SessionDetail } from './SessionDetail';
import { ConfirmModal } from './ConfirmModal';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';
import { useCancelLoop } from '../hooks/useCancelLoop';
import { useDeleteSession } from '../hooks/useDeleteSession';
import { useArchiveLoop } from '../hooks/useArchiveLoop';

interface SessionCardProps {
  session: Session;
}

export function SessionCard({ session }: SessionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const cancelMutation = useCancelLoop();
  const deleteMutation = useDeleteSession();
  const archiveMutation = useArchiveLoop();

  const handleCancel = () => {
    setShowCancelModal(true);
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const formatDuration = (seconds: number | undefined): string => {
    if (seconds === undefined) return 'Active';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const getTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const truncateTask = (task: string | undefined, maxLength: number = 80) => {
    if (!task) return 'No task description';
    if (task.length <= maxLength) return task;
    return task.slice(0, maxLength) + '...';
  };

  const confirmCancel = () => {
    cancelMutation.mutate(session.loop_id, {
      onSuccess: () => {
        setShowCancelModal(false);
        setIsExpanded(false);
      },
      onError: (error) => {
        alert(`Failed to cancel: ${error.message}`);
      },
    });
  };

  const confirmDelete = () => {
    deleteMutation.mutate(session.loop_id, {
      onSuccess: () => {
        setShowDeleteModal(false);
        setIsExpanded(false);
      },
      onError: (error) => {
        alert(`Failed to delete: ${error.message}`);
      },
    });
  };

  const handleArchive = () => {
    setShowArchiveModal(true);
  };

  const confirmArchive = () => {
    archiveMutation.mutate(session.loop_id, {
      onSuccess: () => {
        setShowArchiveModal(false);
        setIsExpanded(false);
      },
      onError: (error) => {
        alert(`Failed to archive: ${error.message}`);
      },
    });
  };

  return (
    <>
      <div
        data-testid="session-card"
        className="relative rounded-lg shadow-md overflow-hidden"
      >
        {/* Card Header - Always Visible */}
        <div
          role="button"
          aria-expanded={isExpanded}
          aria-controls="session-detail"
          tabIndex={0}
          className="relative bg-white p-3 sm:p-4 cursor-pointer active:scale-[0.99] active:opacity-80 transition-transform z-10"
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsExpanded(!isExpanded);
            }
          }}
        >
          {/* Top Row: Status Badge + Expand Icon */}
          <div className="flex items-center justify-between mb-2">
            <StatusBadge status={session.status} />
            <span
              className={`transform transition-transform text-gray-400 ${
                isExpanded ? 'rotate-90' : ''
              }`}
              aria-hidden="true"
            >
              ▶
            </span>
          </div>

          {/* Project Name */}
          <h3 className="text-base sm:text-lg font-semibold text-claude-dark mb-1">
            {session.project_name}
          </h3>

          {/* Task Description (truncated) */}
          <p className="text-xs sm:text-sm text-gray-600 mb-3 line-clamp-2">
            {truncateTask(session.task, 100)}
          </p>

          {/* Separator */}
          <div className="border-t border-gray-100 my-3" />

          {/* Progress Bar + Iterations - hidden when expanded to avoid duplicate with SessionDetail */}
          {!isExpanded && (
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <ProgressBar
                  current={session.iterations}
                  max={session.max_iterations}
                  size="sm"
                  showLabel
                  status={session.status}
                  compact
                />
              </div>
            </div>
          )}

          {/* Time Info */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Started: {getTimeAgo(session.started_at)}</span>
            <span>•</span>
            <span>{formatDuration(session.duration_seconds)}</span>
          </div>
        </div>

        {/* Expanded SessionDetail */}
        {isExpanded && (
          <SessionDetail
            id="session-detail"
            session={session}
            onCancel={handleCancel}
            isCancelling={cancelMutation.isPending}
            onDelete={handleDelete}
            isDeleting={deleteMutation.isPending}
            onArchive={handleArchive}
            isArchiving={archiveMutation.isPending}
          />
        )}
      </div>

      {/* Confirm Modals */}
      <ConfirmModal
        isOpen={showCancelModal}
        title="Cancel Loop?"
        message={`Are you sure you want to cancel the loop for "${session.project_name}"? This will delete the state file and stop the loop.`}
        confirmLabel="Cancel Loop"
        cancelLabel="Keep Running"
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelModal(false)}
        isLoading={cancelMutation.isPending}
      />
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Permanently?"
        message={`Are you sure you want to permanently delete "${session.project_name}" from history? This action cannot be undone.`}
        confirmLabel="Delete Permanently"
        cancelLabel="Keep in History"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
        isLoading={deleteMutation.isPending}
      />
      <ConfirmModal
        isOpen={showArchiveModal}
        title="Archive Orphaned Loop?"
        message={`This loop "${session.project_name}" is orphaned (no state file found). Archiving will mark it as completed and move it to the archived tab.`}
        confirmLabel="Archive Loop"
        cancelLabel="Keep as Orphaned"
        onConfirm={confirmArchive}
        onCancel={() => setShowArchiveModal(false)}
        isLoading={archiveMutation.isPending}
      />
    </>
  );
}
