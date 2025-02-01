import "@testing-library/jest-dom";
import { expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { mockNextNavigation } from "./mocks";

// Configuration globale
beforeAll(() => {
  // Mock fetch global
  global.fetch = vi.fn();
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockImplementation(() => mockNextNavigation.useRouter()),
  useSearchParams: vi
    .fn()
    .mockImplementation(() => mockNextNavigation.useSearchParams()),
  usePathname: vi
    .fn()
    .mockImplementation(() => mockNextNavigation.usePathname()),
}));

// Étend les assertions de Vitest avec les matchers de testing-library
expect.extend(matchers);

// Nettoie après chaque test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

afterAll(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.restoreAllMocks();
});
