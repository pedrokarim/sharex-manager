import type { CreateLogOptions, LogLevel, LogAction } from "@/lib/types/logs";
import { logDb } from "./db";

class Logger {
  private static instance: Logger;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async log(options: CreateLogOptions) {
    try {
      await logDb.createLog(options);
    } catch (error) {
      console.error("Erreur lors de la création du log:", error);
    }
  }

  public async info(
    action: LogAction,
    message: string,
    options?: Partial<CreateLogOptions>
  ) {
    await this.log({
      level: "info",
      action,
      message,
      ...options,
    });
  }

  public async warning(
    action: LogAction,
    message: string,
    options?: Partial<CreateLogOptions>
  ) {
    await this.log({
      level: "warning",
      action,
      message,
      ...options,
    });
  }

  public async error(
    action: LogAction,
    message: string,
    options?: Partial<CreateLogOptions>
  ) {
    await this.log({
      level: "error",
      action,
      message,
      ...options,
    });
  }

  public async debug(
    action: LogAction,
    message: string,
    options?: Partial<CreateLogOptions>
  ) {
    await this.log({
      level: "debug",
      action,
      message,
      ...options,
    });
  }

  public async logApiRequest(
    action: LogAction,
    message: string,
    options: {
      userId?: string;
      userEmail?: string;
      ip?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    await this.info(action, message, {
      ...options,
    });
  }

  public async logAuthAction(
    action: LogAction,
    message: string,
    options: {
      userId: string;
      userEmail: string;
      ip?: string;
      userAgent?: string;
    }
  ) {
    await this.info(action, message, {
      ...options,
    });
  }

  public async logFileAction(
    action: LogAction,
    message: string,
    options: {
      userId: string;
      userEmail: string;
      metadata?: {
        fileId?: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
      };
    }
  ) {
    await this.info(action, message, {
      ...options,
    });
  }

  public async logAdminAction(
    action: LogAction,
    message: string,
    options: {
      adminId: string;
      adminEmail: string;
      targetUserId?: string;
      targetResource?: string;
      changes?: Record<string, unknown>;
    }
  ) {
    await this.info(action, message, {
      userId: options.adminId,
      userEmail: options.adminEmail,
      metadata: {
        targetUserId: options.targetUserId,
        targetResource: options.targetResource,
        changes: options.changes,
      },
    });
  }
}

export const logger = Logger.getInstance();
