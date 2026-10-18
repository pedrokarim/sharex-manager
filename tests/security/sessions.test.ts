import { describe, expect, it } from "vitest";
import {
  listSessionViews,
  parseUserAgent,
  revokeSessionById,
  revokeSessionsOfUser,
  sessionUsers,
  type SessionAdapter,
  type SessionRow,
} from "@/lib/security/sessions";

type Where = { field: string; value: unknown; operator?: string };

/** Adaptateur en mémoire, au comportement de celui de better-auth pour ces requêtes. */
function fakeAdapter(tables: Record<string, object[]>): SessionAdapter & { tables: Record<string, Record<string, unknown>[]> } {
  const matches = (row: Record<string, unknown>, where: Where[] = []) =>
    where.every(({ field, value, operator = "eq" }) => {
      if (operator === "in") return (value as unknown[]).includes(row[field]);
      if (operator === "ne") return row[field] !== value;
      return row[field] === value;
    });
  return createAdapter(tables as Record<string, Record<string, unknown>[]>, matches);
}

function createAdapter(
  tables: Record<string, Record<string, unknown>[]>,
  matches: (row: Record<string, unknown>, where?: Where[]) => boolean
): SessionAdapter & { tables: Record<string, Record<string, unknown>[]> } {
  return {
    tables,
    async findMany<T>({ model, where, limit }: { model: string; where?: Where[]; limit?: number }) {
      return (tables[model] ?? []).filter((row) => matches(row, where)).slice(0, limit) as T[];
    },
    async findOne<T>({ model, where }: { model: string; where: Where[] }) {
      return ((tables[model] ?? []).find((row) => matches(row, where)) ?? null) as T | null;
    },
    async delete({ model, where }: { model: string; where: Where[] }) {
      const index = (tables[model] ?? []).findIndex((row) => matches(row, where));
      if (index >= 0) tables[model].splice(index, 1);
    },
    async deleteMany({ model, where }: { model: string; where: Where[] }) {
      const before = tables[model]?.length ?? 0;
      tables[model] = (tables[model] ?? []).filter((row) => !matches(row, where));
      return before - tables[model].length;
    },
  };
}

const now = new Date("2026-10-18T12:00:00.000Z");
const future = new Date("2026-10-25T12:00:00.000Z");

function session(id: string, userId: string, updatedAt: string, extra: Partial<SessionRow> = {}): SessionRow {
  return {
    id,
    token: `jeton-secret-${id}`,
    userId,
    createdAt: new Date("2026-10-10T08:00:00.000Z"),
    updatedAt: new Date(updatedAt),
    expiresAt: future,
    ipAddress: "203.0.113.7",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    ...extra,
  };
}

describe("appareils", () => {
  it("reconnaît navigateur, système et type", () => {
    expect(parseUserAgent(session("a", "u", now.toISOString()).userAgent)).toEqual({
      type: "desktop",
      browser: "Chrome",
      os: "Windows",
      label: "Chrome sur Windows",
    });
    expect(
      parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
    ).toMatchObject({ type: "mobile", browser: "Safari", os: "iOS" });
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).toMatchObject({
      label: "Firefox sur Linux",
    });
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0) Edg/130.0")).toMatchObject({ browser: "Edge" });
    expect(parseUserAgent("curl/8.4.0")).toMatchObject({ type: "bot", browser: "curl" });
    expect(parseUserAgent(null)).toMatchObject({ type: "unknown", label: "Appareil inconnu" });
  });
});

describe("sessions actives", () => {
  it("liste sans jeton, la plus récente d'abord, sans les sessions expirées", async () => {
    const adapter = fakeAdapter({
      session: [
        session("s1", "u1", "2026-10-18T10:00:00.000Z"),
        session("s2", "u1", "2026-10-18T11:00:00.000Z"),
        session("s3", "u2", "2026-10-18T09:00:00.000Z"),
        session("old", "u1", "2026-10-01T09:00:00.000Z", { expiresAt: new Date("2026-10-08T09:00:00.000Z") }),
      ],
    });
    const sessions = await listSessionViews(adapter, { userId: "u1", currentSessionId: "s1", now });
    expect(sessions.map((item) => item.id)).toEqual(["s2", "s1"]);
    expect(sessions[1]).toMatchObject({ current: true, ip: "203.0.113.7", lastActiveAt: "2026-10-18T10:00:00.000Z" });
    expect(JSON.stringify(sessions)).not.toContain("jeton-secret");

    const all = await listSessionViews(adapter, { now });
    expect(all).toHaveLength(3);
  });

  it("joint les comptes, sans secret", async () => {
    const adapter = fakeAdapter({
      user: [
        { id: "u1", username: "karim", displayUsername: "Karim", role: "admin", email: "k@local" },
        { id: "u2", username: "invite", role: "user" },
      ],
    });
    expect(await sessionUsers(adapter, ["u1", "u2", "u1"])).toEqual({
      u1: { id: "u1", username: "Karim", role: "admin" },
      u2: { id: "u2", username: "invite", role: "user" },
    });
  });

  it("ne révoque, pour soi-même, que ses propres sessions", async () => {
    const adapter = fakeAdapter({ session: [session("s1", "u1", now.toISOString()), session("s3", "u2", now.toISOString())] });
    expect(await revokeSessionById(adapter, "s3", { userId: "u1" })).toBeNull();
    expect(adapter.tables.session).toHaveLength(2);
    expect((await revokeSessionById(adapter, "s3"))?.userId).toBe("u2");
    expect(adapter.tables.session.map((row) => row.id)).toEqual(["s1"]);
  });

  it("révoque toutes les sessions d'un compte, sauf celle en cours", async () => {
    const adapter = fakeAdapter({
      session: [session("s1", "u1", now.toISOString()), session("s2", "u1", now.toISOString()), session("s3", "u2", now.toISOString())],
    });
    expect(await revokeSessionsOfUser(adapter, "u1", { exceptSessionId: "s1" })).toBe(1);
    expect(adapter.tables.session.map((row) => row.id)).toEqual(["s1", "s3"]);
  });
});
