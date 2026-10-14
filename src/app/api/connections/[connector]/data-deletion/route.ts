import { NextRequest, NextResponse } from "next/server";
import { findDeletion, handleDataDeletion, readSignedRequest, signedRequestFromBody } from "@/lib/connections/meta-callbacks";

/**
 * Demande de suppression des données envoyée par Meta (Facebook, Instagram,
 * Threads). Sans session : la demande signée par le secret de l'application
 * fait foi. Les comptes de la personne et leurs jetons sont retirés ; Meta
 * reçoit l'adresse de suivi et le code de confirmation qu'il exige.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ connector: string }> }) {
  const { connector } = await params;
  const signed = readSignedRequest(connector, await signedRequestFromBody(request));
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: signed.status });
  return NextResponse.json(await handleDataDeletion(connector, signed.userId));
}

/** Suivi d'une demande par son code : la personne vérifie que ses données ont bien été supprimées. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ connector: string }> }) {
  const { connector } = await params;
  const record = findDeletion(connector, request.nextUrl.searchParams.get("code"));
  if (!record) return NextResponse.json({ error: "Demande inconnue" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    {
      code: record.code,
      status: "Données supprimées",
      processedAt: new Date(record.processedAt).toISOString(),
      accounts: record.accounts,
    },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );
}
