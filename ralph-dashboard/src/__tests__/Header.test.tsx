import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../components/Header';

describe('Header', () => {
  it('should render the title', () => {
    render(<Header />);
    expect(screen.getByText('Ralph Dashboard')).toBeInTheDocument();
  });

  it('should render the subtitle', () => {
    render(<Header />);
    expect(
      screen.getByText('Monitor and manage Ralph Wiggum loops')
    ).toBeInTheDocument();
  });
});
