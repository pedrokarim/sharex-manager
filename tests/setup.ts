import "@testing-library/jest-dom";
import { expect, afterEach, beforeAll, afterAll } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { webcrypto } from "crypto";

// Polyfill pour crypto dans l'environnement Node.js
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as any;
}

// Étend les assertions de Vitest avec les matchers de testing-library
expect.extend(matchers);

// Nettoie après chaque test
afterEach(() => {
  cleanup();
});
