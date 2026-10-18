import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { getApiKeySettings } from "@/lib/security/settings";
import type { ApiKeyPolicy } from "@/types/api-key";

/**
 * Durée de vie des nouvelles clés (écran Sécurité), lue par la fenêtre de
 * création pour ne proposer que les durées permises. Le serveur applique ces
 * bornes de toute façon.
 */
export const GET = withAuth(async () => {
  const { defaultExpiryDays, maxExpiryDays } = getApiKeySettings();
  const policy: ApiKeyPolicy = { defaultExpiryDays, maxExpiryDays };
  return NextResponse.json(policy);
});
