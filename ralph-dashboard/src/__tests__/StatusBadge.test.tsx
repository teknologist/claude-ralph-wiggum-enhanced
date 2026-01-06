import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../components/StatusBadge';
import type { Session } from '../../server/types';

describe('StatusBadge', () => {
  it('renders active status with pulsing indicator', () => {
    render(<StatusBadge status="active" />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    // Check for the pulsing animation class
    const badge = screen.getByText('Active').closest('span');
    expect(badge).toHaveClass('bg-green-100', 'text-green-700');
  });

  it('renders success status', () => {
    render(<StatusBadge status="success" />);

    expect(screen.getByText('✓ Success')).toBeInTheDocument();
    const badge = screen.getByText('✓ Success');
    expect(badge).toHaveClass('bg-blue-100', 'text-blue-700');
  });

  it('renders cancelled status', () => {
    render(<StatusBadge status="cancelled" />);

    expect(screen.getByText('⏹ Cancelled')).toBeInTheDocument();
    const badge = screen.getByText('⏹ Cancelled');
    expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-700');
  });

  it('renders max_iterations status', () => {
    render(<StatusBadge status="max_iterations" />);

    expect(screen.getByText('⚠ Max Iterations')).toBeInTheDocument();
    const badge = screen.getByText('⚠ Max Iterations');
    expect(badge).toHaveClass('bg-orange-100', 'text-orange-700');
  });

  it('renders error status', () => {
    render(<StatusBadge status="error" />);

    expect(screen.getByText('✗ Error')).toBeInTheDocument();
    const badge = screen.getByText('✗ Error');
    expect(badge).toHaveClass('bg-red-100', 'text-red-700');
  });

  it('renders abandoned status', () => {
    render(<StatusBadge status="abandoned" />);

    expect(screen.getByText('⏹ Abandoned')).toBeInTheDocument();
    const badge = screen.getByText('⏹ Abandoned');
    expect(badge).toHaveClass('bg-orange-100', 'text-orange-700');
  });

  it('renders orphaned status with indicator', () => {
    render(<StatusBadge status="orphaned" />);

    expect(screen.getByText('Orphaned')).toBeInTheDocument();
    const badge = screen.getByText('Orphaned').closest('span');
    expect(badge).toHaveClass('bg-amber-100', 'text-amber-700');
  });

  it('renders archived status', () => {
    render(<StatusBadge status="archived" />);

    expect(screen.getByText('Archived')).toBeInTheDocument();
    const badge = screen.getByText('Archived');
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-600');
  });

  it('renders unknown status for any other value', () => {
    // Cast to bypass type checking for edge case
    render(<StatusBadge status={'unknown-status' as Session['status']} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    const badge = screen.getByText('Unknown');
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-600');
  });

  it('active badge contains pulsing animation indicator', () => {
    const { container } = render(<StatusBadge status="active" />);

    const pulsingDot = container.querySelector('.animate-pulse');
    expect(pulsingDot).toBeInTheDocument();
    expect(pulsingDot).toHaveClass('bg-green-500');
  });

  it('orphaned badge contains static indicator (non-pulsing)', () => {
    const { container } = render(<StatusBadge status="orphaned" />);

    const indicator = container.querySelector('.bg-amber-500');
    expect(indicator).toBeInTheDocument();
    // Orphaned indicator should NOT be pulsing
    expect(indicator).not.toHaveClass('animate-pulse');
  });
});
