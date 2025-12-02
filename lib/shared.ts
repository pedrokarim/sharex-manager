import { UnauthorizedError } from "@/types/errors";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

export async function getCurrentUserId(req?: NextRequest): Promise<string> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  return session.user.id;
}

export async function getCurrentUser(req?: NextRequest) {
  const session = await auth();

  if (!session) {
    throw new UnauthorizedError();
  }

  return session.user;
}

export function logError(error: Error, context?: Record<string, unknown>) {
  console.error("Action error:", error, context);

  if (error.name === "UnauthorizedError" || error.name === "ValidationError") {
    console.warn("Expected error:", { error: error.message, context });
  } else {
    console.error("Unexpected error:", {
      error: error.message,
      stack: error.stack,
      context,
    });
  }
}
