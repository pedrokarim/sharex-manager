"use server";

import { SubscriptionRequiredError } from "@/types/errors";
import { SubscriptionCheck } from "@/types/subscription";
import { NextRequest } from "next/server";
import { getCurrentUserId } from "./shared";
import { db } from "@/db";
import { subscription } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function getMyActiveSubscription(
  userId: string
): Promise<typeof subscription.$inferSelect | null> {
  const sub = await db
    .select()
    .from(subscription)
    .where(and(eq(subscription.userId, userId), eq(subscription.status, "active")));
  return sub[0];
}

export async function validateSubscriptionAndUsage(userId: string): Promise<SubscriptionCheck> {
  return {
    canProceed: true,
    isSubscribed: true,
    requestsUsed: 0,
    requestsRemaining: Infinity,
  };
}

export async function requireSubscriptionOrFreeUsage(req: NextRequest): Promise<void> {
  const userId = await getCurrentUserId(req);
  const validation = await validateSubscriptionAndUsage(userId);

  if (!validation.canProceed) {
    throw new SubscriptionRequiredError(validation.error, {
      requestsRemaining: validation.requestsRemaining,
    });
  }
}
