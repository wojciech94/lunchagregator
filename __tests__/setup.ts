// Global test setup
// Import jest-dom matchers only when in jsdom environment
if (typeof window !== 'undefined') {
  import('@testing-library/jest-dom');
}

// Import fast-check configuration to apply global settings
import './properties/fc-config';

