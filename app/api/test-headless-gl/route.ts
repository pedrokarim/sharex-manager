import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

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

// Fonction pour sécuriser les entrées utilisateur
function sanitizeInput(input: string): string {
  // Supprimer les caractères dangereux
  return input
    .replace(/[<>:"/\\|?*]/g, "") // Caractères de fichiers interdits
    .replace(/[;|&$`]/g, "") // Caractères de commande dangereux
    .substring(0, 50); // Limiter la longueur
}
