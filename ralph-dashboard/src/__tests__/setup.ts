import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock fetch globally for tests
global.fetch = vi.fn() as unknown as typeof fetch;
