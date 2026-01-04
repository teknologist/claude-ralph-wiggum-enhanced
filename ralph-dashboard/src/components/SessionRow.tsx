import { useState } from 'react';
import type { Session } from '../../server/types';
import { SessionDetail } from './SessionDetail';
import { ConfirmModal } from './ConfirmModal';
import { useCancelLoop } from '../hooks/useCancelLoop';
import { useDeleteSession } from '../hooks/useDeleteSession';

interface SessionRowProps {
  session: Session;
}

export function SessionRow({ session }: SessionRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const cancelMutation = useCancelLoop();
  const deleteMutation = useDeleteSession();

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatDuration = (seconds: number | undefined): string => {
    if (seconds === undefined) return '—';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const getStatusBadge = () => {
    switch (session.status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Active
          </span>
        );
      case 'success':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            ✓ Success
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            ⏹ Cancelled
          </span>
        );
      case 'max_iterations':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            ⚠ Max Iterations
          </span>
        );
      case 'error':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            ✗ Error
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Unknown
          </span>
        );
    }
  };

  const handleCancel = () => {
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    cancelMutation.mutate(session.session_id, {
      onSuccess: () => {
        setShowCancelModal(false);
        setIsExpanded(false);
      },
      onError: (error) => {
        alert(`Failed to cancel: ${error.message}`);
      },
    });
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate(session.session_id, {
      onSuccess: () => {
        setShowDeleteModal(false);
        setIsExpanded(false);
      },
      onError: (error) => {
        alert(`Failed to delete: ${error.message}`);
      },
    });
  };

  const truncateTask = (task: string | undefined, maxLength: number = 60) => {
    if (!task) return '—';
    if (task.length <= maxLength) return task;
    return task.slice(0, maxLength) + '...';
  };

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`transform transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <span className="font-medium text-claude-dark">
              {session.project_name}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-gray-600 max-w-md">
          {truncateTask(session.task)}
        </td>
        <td className="px-4 py-3">{getStatusBadge()}</td>
        <td className="px-4 py-3 text-gray-600 text-sm">
          {formatDate(session.started_at)}
        </td>
        <td className="px-4 py-3 text-gray-600">
          {formatDuration(session.duration_seconds)}
        </td>
        <td className="px-4 py-3 text-gray-600">
          {/* Show N/A only when iterations is truly unknown (null/undefined), 0 is valid */}
          {session.iterations != null
            ? `${session.iterations}/${session.max_iterations}`
            : `N/A`}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6}>
            <SessionDetail
              session={session}
              onCancel={handleCancel}
              isCancelling={cancelMutation.isPending}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
            />
          </td>
        </tr>
      )}
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
    </>
  );
}
