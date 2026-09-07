import { describe, expect, it } from "vitest";

import {
  mergeEnvironmentFile,
  parseSetupOptions,
  setupEnvironment,
} from "../../cli/setup-config";

describe("setup configuration", () => {
  it("uses builtin authentication by default", () => {
    const options = parseSetupOptions([], {});

    expect(options.authProvider).toBe("builtin");
    expect(options.appUrl).toBe("http://localhost:3000");
    expect(options.port).toBe(3000);
    expect(options.authSecret).toHaveLength(43);
  });

  it("validates and keeps the initial builtin administrator", () => {
    const options = parseSetupOptions(
      [
        "--admin-username",
        "karim",
        "--admin-password",
        "a-secure-password",
      ],
      {}
    );

    expect(options.builtinAdmin).toEqual({
      username: "karim",
      password: "a-secure-password",
    });
    expect(setupEnvironment(options)).not.toHaveProperty(
      "SHAREX_SETUP_ADMIN_PASSWORD"
    );
  });

  it("rejects an incomplete builtin administrator", () => {
    expect(() =>
      parseSetupOptions(["--admin-username", "karim"], {})
    ).toThrow("doivent être fournis ensemble");
  });

  it("parses a non-interactive Ascencia ID setup", () => {
    const options = parseSetupOptions(
      [
        "--auth=ascencia",
        "--app-url",
        "https://sxm.example.test/",
        "--ascencia-issuer=https://id.example.test/",
        "--ascencia-client-id",
        "client-id",
        "--ascencia-client-secret",
        "client-secret",
      ],
      {}
    );

    expect(options).toMatchObject({
      authProvider: "ascencia",
      appUrl: "https://sxm.example.test",
      port: 3000,
      ascenciaIssuer: "https://id.example.test",
      ascenciaClientId: "client-id",
      ascenciaClientSecret: "client-secret",
      ascenciaAdminRoles: "superadmin",
    });
  });

  it("updates managed keys while preserving unrelated settings", () => {
    const result = mergeEnvironmentFile(
      '# Exemple\nAUTH_URL="http://old.test"\nCUSTOM_VALUE="kept"\n',
      setupEnvironment({
        authProvider: "ascencia",
        appUrl: "https://sxm.example.test",
        port: 3000,
        authSecret: "secret$with-dollar",
        ascenciaIssuer: "https://id.example.test",
        ascenciaClientId: "client-id",
        ascenciaClientSecret: "client-secret",
        ascenciaAdminRoles: "superadmin,owner",
      })
    );

    expect(result).toContain('AUTH_URL="https://sxm.example.test"');
    expect(result).toContain('PORT="3000"');
    expect(result).toContain('AUTH_SECRET="secret\\$with-dollar"');
    expect(result).toContain('CUSTOM_VALUE="kept"');
    expect(result).toContain('SHAREX_AUTH_PROVIDER="ascencia"');
    expect(result).toContain('ASCENCIA_CLIENT_ID="client-id"');
  });

  it("replaces an empty port copied from the example environment", () => {
    const options = parseSetupOptions([], { PORT: "" });

    expect(options.port).toBe(3000);
    expect(setupEnvironment(options).PORT).toBe("3000");
  });
});
