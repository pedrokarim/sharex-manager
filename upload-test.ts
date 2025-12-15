#!/usr/bin/env bun

/**
 * Script ULTRA-simple pour tester SSE : upload une image via API ShareX
 */

import { readFileSync } from "fs";

async function main() {
  console.log("🚀 Upload de test-image.jpg...");

  // Utiliser un appel système à curl car Bun a des problèmes avec FormData
  const { execSync } = await import("child_process");

  try {
    const result = execSync(
      'curl.exe -X POST -H "x-api-key: sk_n7-kK56IUsmUQmBTbF4yrmzRPI-Y_2V-" -F "file=@test-image.jpg" http://localhost:3000/api/upload',
      { encoding: 'utf8' }
    );

    console.log("Status: 200");
    console.log("Response:", result.trim());

    console.log("✅ Upload réussi!");
    console.log("🎉 Vérifiez la galerie - l'image devrait apparaître automatiquement!");
    console.log("🔍 Ouvrez la console du navigateur (F12) pour voir les messages SSE!");
  } catch (error: any) {
    console.log("❌ Échec");
    console.log("Error:", error.message);
  }
}

main();
