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
  | "auth.login"
  | "auth.logout"
  | "auth.register"
  | "file.upload"
  | "file.delete"
  | "file.update"
  | "file.download"
  | "config.update"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "admin.action"
  | "system.error"
  | "api.request"
  | "api.error"
  | "file.unauthorized";

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
