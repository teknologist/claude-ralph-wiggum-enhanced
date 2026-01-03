import { describe, it, expect } from 'vitest';
import * as components from '../components';

describe('components index', () => {
  it('exports Header component', () => {
    expect(components.Header).toBeDefined();
    expect(typeof components.Header).toBe('function');
  });

  it('exports StatsBar component', () => {
    expect(components.StatsBar).toBeDefined();
    expect(typeof components.StatsBar).toBe('function');
  });

  it('exports SessionTable component', () => {
    expect(components.SessionTable).toBeDefined();
    expect(typeof components.SessionTable).toBe('function');
  });

  it('exports SessionRow component', () => {
    expect(components.SessionRow).toBeDefined();
    expect(typeof components.SessionRow).toBe('function');
  });

  it('exports SessionDetail component', () => {
    expect(components.SessionDetail).toBeDefined();
    expect(typeof components.SessionDetail).toBe('function');
  });

  it('exports ConfirmModal component', () => {
    expect(components.ConfirmModal).toBeDefined();
    expect(typeof components.ConfirmModal).toBe('function');
  });
});
