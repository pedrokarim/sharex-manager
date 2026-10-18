export interface Log {
  id: number;
  timestamp: string;
  level: LogLevel;
  action: LogAction;
  userId?: string;
  userEmail?: string;
  message: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export type LogLevel = "info" | "warning" | "error" | "debug";

export type LogAction =
  // Connexions
  | "auth.login"
  | "auth.login.failed"
  | "auth.login.blocked"
  | "auth.logout"
  | "auth.register"
  | "auth.unauthorized"
  // Fichiers
  | "file.upload"
  | "file.delete"
  | "file.update"
  | "file.visibility"
  | "file.download"
  | "file.unauthorized"
  | "files.batch"
  // Albums
  | "album.list"
  | "album.get"
  | "album.create"
  | "album.update"
  | "album.delete"
  | "album.stats"
  | "album.public.get"
  | "album.files.list"
  | "album.files.add"
  | "album.files.remove"
  // Modules
  | "module.enable"
  | "module.disable"
  | "module.function"
  // Administration
  | "config.update"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "admin.action"
  // Sécurité
  | "security.alert"
  | "security.settings.update"
  | "security.session.revoke"
  | "logs.purge"
  // Système et API
  | "system.error"
  | "api.request"
  | "api.error";

/** Toutes les actions, pour les filtres de l'écran Journaux. */
export const LOG_ACTIONS: readonly LogAction[] = [
  "auth.login",
  "auth.login.failed",
  "auth.login.blocked",
  "auth.logout",
  "auth.register",
  "auth.unauthorized",
  "file.upload",
  "file.delete",
  "file.update",
  "file.visibility",
  "file.download",
  "file.unauthorized",
  "files.batch",
  "album.list",
  "album.get",
  "album.create",
  "album.update",
  "album.delete",
  "album.stats",
  "album.public.get",
  "album.files.list",
  "album.files.add",
  "album.files.remove",
  "module.enable",
  "module.disable",
  "module.function",
  "config.update",
  "user.create",
  "user.update",
  "user.delete",
  "admin.action",
  "security.alert",
  "security.settings.update",
  "security.session.revoke",
  "logs.purge",
  "system.error",
  "api.request",
  "api.error",
];

export interface CreateLogOptions {
  level: LogLevel;
  action: LogAction;
  message: string;
  userId?: string;
  userEmail?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}
