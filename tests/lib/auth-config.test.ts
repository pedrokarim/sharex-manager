import { describe, expect, it } from "vitest";

import {
  isAscenciaCallback,
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

  it("recognizes the Ascencia callback from the better-auth route template", () => {
    expect(
      isAscenciaCallback({
        path: "/oauth2/callback/:providerId",
        params: { providerId: "ascencia" },
      })
    ).toBe(true);
    expect(isAscenciaCallback({ path: "/oauth2/callback/ascencia" })).toBe(
      true
    );
  });

  it("rejects other callbacks and client endpoints", () => {
    expect(
      isAscenciaCallback({
        path: "/oauth2/callback/:providerId",
        params: { providerId: "other" },
      })
    ).toBe(false);
    expect(isAscenciaCallback({ path: "/oauth2/callback/:providerId" })).toBe(
      false
    );
    expect(isAscenciaCallback({ path: "/update-user" })).toBe(false);
    expect(isAscenciaCallback(null)).toBe(false);
  });
});
