import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../components/ProgressBar';

describe('ProgressBar', () => {
  describe('percentage calculation', () => {
    it('calculates correct percentage', () => {
      const { container } = render(<ProgressBar current={5} max={10} />);
      const progressFill = container.querySelector('[style*="width: 50%"]');
      expect(progressFill).toBeInTheDocument();
    });

    it('handles 0 iterations correctly (shows 0%)', () => {
      const { container } = render(<ProgressBar current={0} max={10} />);
      const progressFill = container.querySelector('[style*="width: 0%"]');
      expect(progressFill).toBeInTheDocument();
    });

    it('handles max iterations (shows 100%)', () => {
      const { container } = render(<ProgressBar current={10} max={10} />);
      const progressFill = container.querySelector('[style*="width: 100%"]');
      expect(progressFill).toBeInTheDocument();
    });

    it('caps percentage at 100% when current exceeds max', () => {
      const { container } = render(<ProgressBar current={15} max={10} />);
      const progressFill = container.querySelector('[style*="width: 100%"]');
      expect(progressFill).toBeInTheDocument();
    });

    it('handles division by zero when max is 0', () => {
      const { container } = render(<ProgressBar current={5} max={0} />);
      const progressFill = container.querySelector('[style*="width: 0%"]');
      expect(progressFill).toBeInTheDocument();
    });
  });

  describe('null iterations handling', () => {
    it('shows N/A when iterations is null', () => {
      render(<ProgressBar current={null} max={10} />);
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('does not show progress bar when iterations is null', () => {
      const { container } = render(<ProgressBar current={null} max={10} />);
      const progressBar = container.querySelector('.bg-gray-200');
      expect(progressBar).not.toBeInTheDocument();
    });
  });

  describe('label display', () => {
    it('shows label when showLabel is true (sm size)', () => {
      render(<ProgressBar current={5} max={20} size="sm" showLabel />);
      expect(screen.getByText('5/20')).toBeInTheDocument();
    });

    it('shows label when showLabel is true (md size)', () => {
      render(<ProgressBar current={5} max={20} size="md" showLabel />);
      expect(screen.getByText('5 / 20 iterations')).toBeInTheDocument();
    });

    it('hides label when showLabel is false', () => {
      render(<ProgressBar current={5} max={20} size="sm" showLabel={false} />);
      expect(screen.queryByText('5/20')).not.toBeInTheDocument();
    });
  });

  describe('percentage display', () => {
    it('shows percentage when showPercentage is true', () => {
      render(<ProgressBar current={5} max={10} size="md" showPercentage />);
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('hides percentage when showPercentage is false', () => {
      render(
        <ProgressBar current={5} max={10} size="md" showPercentage={false} />
      );
      expect(screen.queryByText('50%')).not.toBeInTheDocument();
    });
  });

  describe('color based on percentage', () => {
    it('uses green for low percentage (< 50%)', () => {
      const { container } = render(<ProgressBar current={2} max={10} />);
      const progressFill = container.querySelector('.bg-green-500');
      expect(progressFill).toBeInTheDocument();
    });

    it('uses claude-coral for mid percentage (50-69%)', () => {
      const { container } = render(<ProgressBar current={5} max={10} />);
      const progressFill = container.querySelector('.bg-claude-coral');
      expect(progressFill).toBeInTheDocument();
    });

    it('uses orange for high percentage (70-89%)', () => {
      const { container } = render(<ProgressBar current={8} max={10} />);
      const progressFill = container.querySelector('.bg-orange-400');
      expect(progressFill).toBeInTheDocument();
    });

    it('uses red for very high percentage (>= 90%)', () => {
      const { container } = render(<ProgressBar current={9} max={10} />);
      const progressFill = container.querySelector('.bg-red-500');
      expect(progressFill).toBeInTheDocument();
    });

    it('uses red for max_iterations status regardless of percentage', () => {
      const { container } = render(
        <ProgressBar current={5} max={10} status="max_iterations" />
      );
      const progressFill = container.querySelector('.bg-red-500');
      expect(progressFill).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('renders small size by default', () => {
      const { container } = render(<ProgressBar current={5} max={10} />);
      const progressBar = container.querySelector('.h-2');
      expect(progressBar).toBeInTheDocument();
    });

    it('renders medium size when specified', () => {
      const { container } = render(
        <ProgressBar current={5} max={10} size="md" />
      );
      const progressBar = container.querySelector('.h-3');
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('active session animation', () => {
    it('adds pulse animation for active sessions', () => {
      const { container } = render(
        <ProgressBar current={5} max={10} status="active" />
      );
      const progressFill = container.querySelector('.animate-pulse');
      expect(progressFill).toBeInTheDocument();
    });

    it('does not add pulse animation for non-active sessions', () => {
      const { container } = render(
        <ProgressBar current={5} max={10} status="success" />
      );
      const progressFill = container.querySelector('.animate-pulse');
      expect(progressFill).not.toBeInTheDocument();
    });
  });

  describe('iterations label in md size', () => {
    it('shows Iterations header label', () => {
      render(<ProgressBar current={5} max={10} size="md" />);
      expect(screen.getByText('Iterations')).toBeInTheDocument();
    });
  });
});
