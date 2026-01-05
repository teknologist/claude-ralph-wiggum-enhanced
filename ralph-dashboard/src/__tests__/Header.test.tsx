import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../components/Header';

describe('Header', () => {
  it('should render the title', () => {
    render(<Header viewMode="table" setViewMode={vi.fn()} />);
    expect(screen.getByText('Ralph Dashboard')).toBeInTheDocument();
  });

  it('should render the subtitle', () => {
    render(<Header viewMode="card" setViewMode={vi.fn()} />);
    expect(
      screen.getByText('Monitor and manage Ralph Wiggum loops')
    ).toBeInTheDocument();
  });

  it('should call setViewMode with "table" when table button is clicked', () => {
    const mockSetViewMode = vi.fn();
    render(<Header viewMode="card" setViewMode={mockSetViewMode} />);

    const tableButton = screen.getByTestId('view-toggle-table');
    fireEvent.click(tableButton);

    expect(mockSetViewMode).toHaveBeenCalledWith('table');
  });

  it('should call setViewMode with "card" when card button is clicked', () => {
    const mockSetViewMode = vi.fn();
    render(<Header viewMode="table" setViewMode={mockSetViewMode} />);

    const cardButton = screen.getByTestId('view-toggle-card');
    fireEvent.click(cardButton);

    expect(mockSetViewMode).toHaveBeenCalledWith('card');
  });
});
