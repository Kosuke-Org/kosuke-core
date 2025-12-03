import '@testing-library/jest-dom';
import { TextEncoder } from 'util';

// Setup global TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;

// Mock fetch globally
global.fetch = jest.fn();

// Suppress console.error and console.warn during tests unless explicitly needed
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: Parameters<typeof console.error>) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning:') || args[0].includes('Error:'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args: Parameters<typeof console.warn>) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning:')) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
