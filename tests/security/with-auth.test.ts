import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `withAuth` : origine de confiance pour ce qui modifie, session exigée,
 * puis rôle. Le gestionnaire n'est jamais appelé quand un contrôle échoue.
 */

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } } }));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => state.session } },
  trustedOrigins: ["https://sxm.example.test"],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { withAuth } = await import("@/lib/api-guard");

function call(method: string, origin?: string) {
  return new Request("https://sxm.example.test/api/test", {
    method,
    headers: origin ? { origin } : {},
  });
}

describe("withAuth", () => {
  let calls = 0;
  const handler = async (_request: Request, _context: unknown, session: { user: { id: string } }) => {
    calls += 1;
    return Response.json({ id: session.user.id });
  };
  const userRoute = withAuth(handler);
  const adminRoute = withAuth(handler, { role: "admin" });

  beforeEach(() => {
    calls = 0;
    state.session = { user: { id: "u1", role: "user" } };
  });

  it("refuse une requête qui modifie venue d'un autre site, avant même de lire la session", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await userRoute(call(method, "https://evil.example.test"), {});
      expect(response.status).toBe(403);
    }
    expect(calls).toBe(0);
  });

  it("laisse passer la même origine et l'absence d'origine (ShareX, curl)", async () => {
    expect((await userRoute(call("POST", "https://sxm.example.test"), {})).status).toBe(200);
    expect((await userRoute(call("DELETE"), {})).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("ne contrôle pas l'origine d'une lecture", async () => {
    expect((await userRoute(call("GET", "https://evil.example.test"), {})).status).toBe(200);
  });

  it("peut couper le contrôle d'origine quand c'est déclaré", async () => {
    const route = withAuth(handler, { origin: false });
    expect((await route(call("POST", "https://evil.example.test"), {})).status).toBe(200);
  });

  it("exige une session", async () => {
    state.session = null;
    const response = await userRoute(call("GET"), {});
    expect(response.status).toBe(401);
    expect(calls).toBe(0);
  });

  it("réserve une route admin aux admins", async () => {
    const refused = await adminRoute(call("GET"), {});
    expect(refused.status).toBe(403);
    expect(calls).toBe(0);

    state.session = { user: { id: "a1", role: "admin" } };
    const allowed = await adminRoute(call("PUT", "https://sxm.example.test"), {});
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ id: "a1" });
  });
});
