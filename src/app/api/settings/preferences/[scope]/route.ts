import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import {
  deleteUserPreference,
  getUserPreference,
  isPreferenceScope,
  parsePreferenceValue,
  setUserPreference,
} from "@/lib/user-preferences";

type Context = { params: Promise<{ scope: string }> };

/**
 * Préférences du compte connecté, par portée (`ai-image-gen.composer`…).
 * Chacun ne lit et n'écrit que les siennes : l'identifiant vient de la
 * session, jamais de la requête.
 */
export async function GET(_request: NextRequest, { params }: Context) {
  const guard = await requireAccess("user");
  if (!guard.ok) return guard.response;
  const { scope } = await params;
  if (!isPreferenceScope(scope)) {
    return NextResponse.json({ error: "Portée invalide" }, { status: 400 });
  }
  return NextResponse.json({ value: getUserPreference(guard.session.user.id, scope) });
}

export async function PUT(request: NextRequest, { params }: Context) {
  const guard = await requireAccess("user");
  if (!guard.ok) return guard.response;
  const { scope } = await params;
  if (!isPreferenceScope(scope)) {
    return NextResponse.json({ error: "Portée invalide" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const value = parsePreferenceValue(body?.value);
  if (!value) {
    return NextResponse.json({ error: "Préférence invalide ou trop volumineuse" }, { status: 400 });
  }
  if (!setUserPreference(guard.session.user.id, scope, value)) {
    return NextResponse.json({ error: "Trop de préférences pour ce compte" }, { status: 409 });
  }
  return NextResponse.json({ value });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const guard = await requireAccess("user");
  if (!guard.ok) return guard.response;
  const { scope } = await params;
  if (!isPreferenceScope(scope)) {
    return NextResponse.json({ error: "Portée invalide" }, { status: 400 });
  }
  deleteUserPreference(guard.session.user.id, scope);
  return NextResponse.json({ success: true });
}
