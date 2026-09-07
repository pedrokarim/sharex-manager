import { describe, expect, it } from "vitest";

import {
  resolveAuthConfig,
  resolveAuthProvider,
} from "@/lib/auth-config";

describe("auth configuration", () => {
  it("keeps builtin authentication as the default", () => {
    expect(resolveAuthProvider(undefined)).toBe("builtin");
    expect(resolveAuthConfig({})).toEqual({ provider: "builtin" });
  });

  it("normalizes a complete Ascencia ID configuration", () => {
    expect(
      resolveAuthConfig({
        SHAREX_AUTH_PROVIDER: " ASCENCIA ",
        ASCENCIA_ISSUER: "https://id.example.test/",
        ASCENCIA_CLIENT_ID: "client-id",
        ASCENCIA_CLIENT_SECRET: "client-secret",
        ASCENCIA_ADMIN_ROLES: "superadmin, owner,superadmin",
      })
    ).toEqual({
      provider: "ascencia",
      issuer: "https://id.example.test",
      clientId: "client-id",
      clientSecret: "client-secret",
      adminRoles: ["superadmin", "owner", "superadmin"],
    });
  });

  it("rejects incomplete or unknown configurations", () => {
    expect(() => resolveAuthProvider("external")).toThrow(
      "SHAREX_AUTH_PROVIDER"
    );
    expect(() =>
      resolveAuthConfig({ SHAREX_AUTH_PROVIDER: "ascencia" })
    ).toThrow("ASCENCIA_ISSUER");
  });
});
