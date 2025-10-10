// tests/setup.ts
import { afterEach, beforeEach, vi } from "vitest";

// -----------------------------------------------------------------------------
// 🧹 1. Reset mocks and timers between tests
// -----------------------------------------------------------------------------
beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------------
// 🔧 3. Optionally configure Vitest defaults
// -----------------------------------------------------------------------------
vi.setConfig({
  testTimeout: 10_000,     // 10 seconds per test
  hookTimeout: 5_000,      // 5 seconds for before/after hooks
});

// -----------------------------------------------------------------------------
// 🧩 4. (Optional) Load environment variables from .env
// -----------------------------------------------------------------------------
// import dotenv from "dotenv";
// dotenv.config();
