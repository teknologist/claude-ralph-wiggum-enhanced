import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmModal } from '../components/ConfirmModal';

describe('ConfirmModal', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Test Title',
    message: 'Test message',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('should not render when closed', () => {
    render(<ConfirmModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
  });

  it('should render title and message when open', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should use custom button labels', () => {
    render(
      <ConfirmModal
        {...defaultProps}
        confirmLabel="Yes, delete"
        cancelLabel="No, keep"
      />
    );
    expect(screen.getByText('Yes, delete')).toBeInTheDocument();
    expect(screen.getByText('No, keep')).toBeInTheDocument();
  });

  it('should disable buttons when loading', () => {
    render(<ConfirmModal {...defaultProps} isLoading={true} />);
    // Text is now wrapped in span, so we need to find the closest button
    expect(screen.getByText('Confirm').closest('button')).toBeDisabled();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
  });

  it('should call onCancel when clicking backdrop', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);

    // Find and click the backdrop
    const backdrop = document.querySelector('.bg-black\\/50');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onCancel).toHaveBeenCalledTimes(1);
    }
  });

  it('should call onCancel when pressing ESC key', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should not call onCancel when pressing ESC key while loading', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} isLoading />);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('should trap focus within modal when Tab is pressed', () => {
    render(<ConfirmModal {...defaultProps} />);

    const confirmButton = screen.getByText('Confirm').closest('button');
    const cancelButton = screen.getByText('Cancel').closest('button');

    // Focus should start on confirm button (via useEffect)
    expect(document.activeElement).toBe(confirmButton);

    // Press Tab - focus should move to cancel button
    if (confirmButton && cancelButton) {
      fireEvent.keyDown(confirmButton as HTMLElement, { key: 'Tab' });
      // Focus trap should keep focus within modal
      expect(document.activeElement).toBe(cancelButton);
    }
  });

  it('should trap focus in reverse when Shift+Tab is pressed', () => {
    render(<ConfirmModal {...defaultProps} />);

    const confirmButton = screen.getByText('Confirm').closest('button');
    const cancelButton = screen.getByText('Cancel').closest('button');

    if (cancelButton && confirmButton) {
      cancelButton.focus();
      fireEvent.keyDown(cancelButton as HTMLElement, {
        key: 'Tab',
        shiftKey: true,
      });
      // Focus trap should keep focus within modal, moving back to confirm
      expect(document.activeElement).toBe(confirmButton);
    }
  });
});
