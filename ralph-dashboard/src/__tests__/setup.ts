import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock fetch globally for tests
global.fetch = vi.fn() as unknown as typeof fetch;

// Mock window.alert globally for tests
global.alert = vi.fn() as unknown as typeof alert;
