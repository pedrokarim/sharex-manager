import { NextRequest, NextResponse } from "next/server";
import { handleDeauthorize, readSignedRequest, signedRequestFromBody } from "@/lib/connections/meta-callbacks";

/**
 * Rappel de Meta quand une personne retire l'autorisation de l'application
 * (Facebook, Instagram, Threads). Sans session : la demande signée par le
 * secret de l'application fait foi. Les comptes concernés passent « à
 * reconnecter » ; rien d'autre n'est touché.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ connector: string }> }) {
  const { connector } = await params;
  const signed = readSignedRequest(connector, await signedRequestFromBody(request));
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: signed.status });
  handleDeauthorize(connector, signed.userId);
  return NextResponse.json({ ok: true });
}
