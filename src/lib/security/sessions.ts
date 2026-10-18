/**
 * Sessions actives (table `session` de better-auth, `data/auth.db`) : liste
 * et révocation, pour l'administration et pour « Mon compte ».
 *
 * Aucune fonction ne renvoie le jeton d'une session : il sert de cookie, le
 * connaître suffit à prendre la session. La révocation se fait par
 * l'identifiant de la ligne.
 *
 * L'adaptateur de base est passé en paramètre (celui de `auth.$context`) :
 * ce fichier n'importe pas `lib/auth.ts` et se teste sous Node.
 */

export interface SessionRow {
  id: string;
  token?: string;
  userId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type DeviceType = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

export interface DeviceInfo {
  type: DeviceType;
  browser: string | null;
  os: string | null;
  /** Libellé court pour l'écran : « Firefox sur Windows ». */
  label: string;
}

export interface SessionView {
  id: string;
  userId: string;
  device: DeviceInfo;
  ip: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  current: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

type Where = { field: string; value: unknown; operator?: "eq" | "in" | "lt" | "gt" | "ne" };

/** Sous-ensemble de l'adaptateur better-auth utilisé ici. */
export interface SessionAdapter {
  findMany<T>(query: { model: string; where?: Where[]; limit?: number; sortBy?: { field: string; direction: "asc" | "desc" } }): Promise<T[]>;
  findOne<T>(query: { model: string; where: Where[] }): Promise<T | null>;
  delete(query: { model: string; where: Where[] }): Promise<void>;
  deleteMany(query: { model: string; where: Where[] }): Promise<number>;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Vivaldi\//, "Vivaldi"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
  [/ShareX\//, "ShareX"],
  [/^curl\//, "curl"],
];

const SYSTEMS: [RegExp, string][] = [
  [/Windows NT/, "Windows"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

/** Lecture sommaire de l'agent utilisateur : navigateur, système, type d'appareil. */
export function parseUserAgent(userAgent: string | null | undefined): DeviceInfo {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return { type: "unknown", browser: null, os: null, label: "Appareil inconnu" };

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const type: DeviceType = /bot|crawler|spider|curl|wget|python-requests/i.test(ua)
    ? "bot"
    : /iPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
      ? "tablet"
      : /Mobi|iPhone|iPod|Android/i.test(ua)
        ? "mobile"
        : browser || os
          ? "desktop"
          : "unknown";

  const label = browser && os ? `${browser} sur ${os}` : (browser ?? os ?? "Appareil inconnu");
  return { type, browser, os, label };
}

const iso = (value: Date | string) => new Date(value).toISOString();

export function toSessionView(row: SessionRow, currentSessionId?: string | null): SessionView {
  return {
    id: row.id,
    userId: row.userId,
    device: parseUserAgent(row.userAgent),
    ip: row.ipAddress || null,
    createdAt: iso(row.createdAt),
    lastActiveAt: iso(row.updatedAt ?? row.createdAt),
    expiresAt: iso(row.expiresAt),
    current: Boolean(currentSessionId) && row.id === currentSessionId,
  };
}

/** Sessions non expirées, de la plus récemment active à la plus ancienne. */
export async function listSessionViews(
  adapter: SessionAdapter,
  options: { userId?: string; currentSessionId?: string | null; now?: Date; limit?: number } = {}
): Promise<SessionView[]> {
  const now = options.now ?? new Date();
  const rows = await adapter.findMany<SessionRow>({
    model: "session",
    where: options.userId ? [{ field: "userId", value: options.userId, operator: "eq" }] : undefined,
    limit: options.limit ?? 1000,
  });
  return rows
    .filter((row) => new Date(row.expiresAt).getTime() > now.getTime())
    .map((row) => toSessionView(row, options.currentSessionId))
    .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}

/** Comptes des sessions listées, sans secret, pour la vue d'administration. */
export async function sessionUsers(adapter: SessionAdapter, userIds: string[]): Promise<Record<string, SessionUser>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return {};
  const users = await adapter.findMany<{
    id: string;
    username?: string | null;
    displayUsername?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  }>({ model: "user", where: [{ field: "id", value: ids, operator: "in" }], limit: ids.length });
  return Object.fromEntries(
    users.map((user) => [
      user.id,
      {
        id: user.id,
        username: user.displayUsername || user.username || user.name || user.email || user.id,
        role: user.role === "admin" ? "admin" : "user",
      } satisfies SessionUser,
    ])
  );
}

/**
 * Révoque une session par son identifiant. Avec `userId`, seulement si elle
 * appartient à ce compte (révocation par soi-même). Renvoie la session révoquée, ou `null`.
 */
export async function revokeSessionById(
  adapter: SessionAdapter,
  sessionId: string,
  options: { userId?: string } = {}
): Promise<SessionRow | null> {
  const where: Where[] = [{ field: "id", value: sessionId, operator: "eq" }];
  if (options.userId) where.push({ field: "userId", value: options.userId, operator: "eq" });
  const row = await adapter.findOne<SessionRow>({ model: "session", where });
  if (!row) return null;
  await adapter.delete({ model: "session", where: [{ field: "id", value: row.id, operator: "eq" }] });
  return row;
}

/** Révoque toutes les sessions d'un compte, sauf éventuellement celle en cours. */
export async function revokeSessionsOfUser(
  adapter: SessionAdapter,
  userId: string,
  options: { exceptSessionId?: string | null } = {}
): Promise<number> {
  const where: Where[] = [{ field: "userId", value: userId, operator: "eq" }];
  if (options.exceptSessionId) where.push({ field: "id", value: options.exceptSessionId, operator: "ne" });
  return adapter.deleteMany({ model: "session", where });
}
