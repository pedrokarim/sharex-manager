import { NextRequest, NextResponse } from "next/server";
import { drawSkin2DHead } from "@/lib/minecraft/skin-renderer";
import {
  validateSkinParam,
  validateDimensions,
  parseBooleanParam,
  parseNumberParam,
} from "@/lib/minecraft/api-validation";

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      error: true,
      message: "Fonctionnalité désactivée",
      details: "Le rendu 3D des skins Minecraft côté serveur a été désactivé car les dépendances node-canvas-webgl et gl ne fonctionnent pas en production. Utilisez le rendu côté client à la place.",
    },
    { status: 503 }
  );
}
