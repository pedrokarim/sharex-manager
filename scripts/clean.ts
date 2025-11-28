#!/usr/bin/env bun

import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

/**
 * Script de nettoyage du projet
 * Supprime tous les fichiers et dossiers générés
 * Détecte automatiquement l'OS et utilise les bonnes commandes
 */

const filesToRemove = [
  ".next",
  "node_modules",
  "bun.lockb",
  "package-lock.json",
  "yarn.lock",
  ".turbo",
  "dist",
  "build",
  "out",
  ".vercel",
];

const extensionsToRemove = [".log", ".tmp", ".temp"];

// Détecter l'OS
const isWindows = process.platform === "win32";
const isLinux = process.platform === "linux";
const isMac = process.platform === "darwin";

function getOSInfo(): string {
  if (isWindows) return "Windows";
  if (isLinux) return "Linux";
  if (isMac) return "macOS";
  return "Unknown";
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function removeFileOrDir(path: string): void {
  if (!existsSync(path)) {
    console.log(`⚠️  ${path} n'existe pas, ignoré`);
    return;
  }

  try {
    let command: string;

    if (isWindows) {
      // Windows: utiliser rmdir /s /q pour les dossiers, del /f /q pour les fichiers
      if (isDirectory(path)) {
        command = `rmdir /s /q "${path}"`;
        console.log(`🗑️  Suppression du dossier: ${path} (Windows)`);
      } else {
        command = `del /f /q "${path}"`;
        console.log(`🗑️  Suppression du fichier: ${path} (Windows)`);
      }
    } else {
      // Linux/macOS: utiliser rm -rf
      command = `rm -rf "${path}"`;
      console.log(`🗑️  Suppression: ${path} (${getOSInfo()})`);
    }

    execSync(command, { stdio: "pipe" });
    console.log(`✅ ${path} supprimé avec succès`);
  } catch (error) {
    console.error(`❌ Erreur lors de la suppression de ${path}:`, error);
  }
}

function cleanLogFiles(dir: string): void {
  if (!existsSync(dir)) return;

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const ext = file.substring(file.lastIndexOf("."));

      if (extensionsToRemove.includes(ext)) {
        removeFileOrDir(filePath);
      }
    }
  } catch (error) {
    console.error(`❌ Erreur lors du nettoyage des logs dans ${dir}:`, error);
  }
}

function main(): void {
  console.log("🧹 Début du nettoyage du projet...");
  console.log(`🖥️  OS détecté: ${getOSInfo()}\n`);

  // Supprimer les fichiers et dossiers principaux
  for (const item of filesToRemove) {
    removeFileOrDir(item);
  }

  // Nettoyer les fichiers de logs dans le dossier racine
  cleanLogFiles(".");

  // Nettoyer les logs dans les sous-dossiers
  const subdirs = ["app", "components", "lib", "scripts"];
  for (const subdir of subdirs) {
    if (existsSync(subdir)) {
      cleanLogFiles(subdir);
    }
  }

  console.log("\n🎉 Nettoyage terminé !");
  console.log("💡 Tu peux maintenant relancer: bun install");
}

// Vérifier qu'on est dans le bon répertoire
if (!existsSync("package.json")) {
  console.error(
    "❌ Erreur: Ce script doit être lancé depuis la racine du projet (où se trouve package.json)"
  );
  process.exit(1);
}

main();
