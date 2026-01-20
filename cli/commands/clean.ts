#!/usr/bin/env bun

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

export const description =
  "Nettoyage du projet (supprime .next, node_modules, etc.)";
export const usage = "bun run cli -- -c clean --no-interactive";

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
    console.log(chalk.gray(`- ${path} n'existe pas, ignoré`));
    return;
  }

  try {
    let command: string;

    if (isWindows) {
      if (isDirectory(path)) {
        command = `rmdir /s /q "${path}"`;
        console.log(chalk.yellow(`Suppression du dossier: ${path} (Windows)`));
      } else {
        command = `del /f /q "${path}"`;
        console.log(chalk.yellow(`Suppression du fichier: ${path} (Windows)`));
      }
    } else {
      command = `rm -rf "${path}"`;
      console.log(chalk.yellow(`Suppression: ${path} (${getOSInfo()})`));
    }

    execSync(command, { stdio: "pipe" });
    console.log(chalk.green(`OK: ${path} supprimé`));
  } catch (error) {
    console.error(chalk.red(`Erreur lors de la suppression de ${path}:`), error);
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
    console.error(chalk.red(`Erreur lors du nettoyage des logs dans ${dir}:`), error);
  }
}

function runClean(): void {
  console.log(chalk.blue("Début du nettoyage du projet..."));
  console.log(chalk.gray(`OS détecté: ${getOSInfo()}\n`));

  for (const item of filesToRemove) {
    removeFileOrDir(item);
  }

  cleanLogFiles(".");

  // Nettoyer les logs dans les sous-dossiers connus (sans inclure "scripts" puisqu'il n'existe plus)
  const subdirs = ["app", "components", "lib", "cli"];
  for (const subdir of subdirs) {
    if (existsSync(subdir)) {
      cleanLogFiles(subdir);
    }
  }

  console.log(chalk.green("\nNettoyage terminé !"));
  console.log(chalk.yellow("Tu peux maintenant relancer: bun install"));
}

export default async function clean(_args: string[], _interactive: boolean) {
  if (!existsSync("package.json")) {
    console.error(
      chalk.red(
        "❌ Erreur: Cette commande doit être lancée depuis la racine du projet (où se trouve package.json)"
      )
    );
    process.exit(1);
  }

  runClean();
}

