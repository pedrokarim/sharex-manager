import { afterEach, describe, expect, test } from "bun:test";
import { childEnv } from "@/lib/child-env";
import { assertSandboxSetting, resolveSandbox } from "@/modules/ai-image-gen/lib/engines/sandbox";

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("childEnv", () => {
  test("ne transmet aucun secret du serveur", () => {
    process.env.AUTH_SECRET = "secret";
    process.env.ASCENCIA_CLIENT_SECRET = "secret";
    process.env.DATABASE_URL = "postgres://secret";
    const env = childEnv({ prefixes: ["CODEX_"] });
    expect(env.AUTH_SECRET).toBeUndefined();
    expect(env.ASCENCIA_CLIENT_SECRET).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  test("garde le système, les préfixes demandés et les valeurs ajoutées", () => {
    process.env.CODEX_HOME = "/app/codex-home";
    process.env.GEMINI_API_KEY = "cle";
    const env = childEnv({ prefixes: ["CODEX_"], extra: { EXTRA: "1" } });
    expect(env.PATH ?? env.Path).toBeDefined();
    expect(env.CODEX_HOME).toBe("/app/codex-home");
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.EXTRA).toBe("1");
  });
});

describe("bac à sable de Codex", () => {
  test("« off » n'est appliqué que si le serveur l'autorise", () => {
    delete process.env.AI_IMAGE_GEN_ALLOW_UNSANDBOXED;
    expect(resolveSandbox("off")).toBe("read-only");
    expect(resolveSandbox("danger-full-access")).toBe("read-only");
    expect(() => assertSandboxSetting("off")).toThrow();
    expect(() => assertSandboxSetting("danger-full-access")).toThrow();
    process.env.AI_IMAGE_GEN_ALLOW_UNSANDBOXED = "1";
    expect(resolveSandbox("off")).toBe("off");
    expect(() => assertSandboxSetting("off")).not.toThrow();
  });

  test("les modes isolés passent tels quels", () => {
    expect(resolveSandbox("workspace-write")).toBe("workspace-write");
    expect(resolveSandbox(undefined)).toBe("read-only");
    expect(() => assertSandboxSetting("read-only")).not.toThrow();
  });
});
