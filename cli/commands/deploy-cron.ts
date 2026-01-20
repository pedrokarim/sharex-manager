#!/usr/bin/env bun

import { execSync } from "node:child_process";
import { existsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import chalk from "chalk";

export const description =
  "Déploiement pull-based (cron): git fetch/reset + docker compose up --build";
export const usage = "bun run cli -- -c deploy-cron --no-interactive";

function readEnv(name: string, fallback: string) {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

function readEnvNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readEnvBool(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function sh(command: string) {
  return execSync(command, { stdio: "pipe", encoding: "utf8" }).trim();
}

function shInherit(command: string) {
  execSync(command, { stdio: "inherit" });
}

function nowIso() {
  return new Date().toISOString();
}

function acquireLock(lockFilePath: string, staleAfterMinutes: number) {
  if (existsSync(lockFilePath)) {
    try {
      const ageMs = Date.now() - statSync(lockFilePath).mtimeMs;
      const ageMinutes = ageMs / 1000 / 60;
      if (ageMinutes < staleAfterMinutes) {
        console.log(
          chalk.yellow(
            `[${nowIso()}] Lock déjà présent (${lockFilePath}). Un déploiement est probablement en cours.`
          )
        );
        process.exit(0);
      }

      console.log(
        chalk.yellow(
          `[${nowIso()}] Lock stale détecté (${Math.round(
            ageMinutes
          )} min > ${staleAfterMinutes} min). Suppression et reprise.`
        )
      );
      unlinkSync(lockFilePath);
    } catch (error) {
      console.error(
        chalk.red(
          `[${nowIso()}] Impossible d'analyser/supprimer le lock (${lockFilePath}).`
        ),
        error
      );
      process.exit(1);
    }
  }

  try {
    writeFileSync(
      lockFilePath,
      JSON.stringify(
        { pid: process.pid, startedAt: nowIso(), cwd: process.cwd() },
        null,
        2
      ) + "\n",
      { flag: "wx" }
    );
  } catch (error: any) {
    if (error?.code === "EEXIST") {
      console.log(
        chalk.yellow(
          `[${nowIso()}] Lock déjà présent (${lockFilePath}). Un déploiement est probablement en cours.`
        )
      );
      process.exit(0);
    }
    console.error(chalk.red(`[${nowIso()}] Impossible de créer le lock.`), error);
    process.exit(1);
  }
}

function releaseLock(lockFilePath: string) {
  try {
    if (existsSync(lockFilePath)) unlinkSync(lockFilePath);
  } catch {
    // best-effort
  }
}

function parseArgs(args: string[]) {
  // CLI minimal (optionnel): privilégie les variables d'env pour le cron,
  // mais permet de surcharger à la main si besoin.
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  const has = (flag: string) => args.includes(flag);

  return {
    branch: get("--branch"),
    remote: get("--remote"),
    lockFile: get("--lock-file"),
    lockStaleMinutes: get("--lock-stale-minutes"),
    composeCommand: get("--compose-command"),
    composeFile: get("--compose-file"),
    clean: has("--no-clean") ? "false" : undefined,
  };
}

export default async function deployCron(args: string[], _interactive: boolean) {
  if (!existsSync("package.json")) {
    console.error(
      chalk.red(
        "❌ Ce script doit être lancé depuis la racine du projet (où se trouve package.json)."
      )
    );
    process.exit(1);
  }

  const parsed = parseArgs(args);

  const branch = parsed.branch ?? readEnv("DEPLOY_BRANCH", "main");
  const remote = parsed.remote ?? readEnv("DEPLOY_REMOTE", "origin");
  const lockFile = parsed.lockFile ?? readEnv("DEPLOY_LOCK_FILE", ".deploy.lock");
  const lockStaleMinutes = readEnvNumber(
    "DEPLOY_LOCK_STALE_MINUTES",
    parsed.lockStaleMinutes ? Number(parsed.lockStaleMinutes) : 60
  );

  const gitClean = readEnvBool(
    "DEPLOY_GIT_CLEAN",
    parsed.clean ? parsed.clean === "true" : true
  );

  // Commande docker compose configurable pour s'adapter aux serveurs:
  // - "docker compose" (plugin)
  // - "docker-compose" (legacy)
  const composeCmd =
    parsed.composeCommand ?? readEnv("DEPLOY_DOCKER_COMPOSE_COMMAND", "docker compose");
  const composeFile =
    parsed.composeFile ?? readEnv("DEPLOY_DOCKER_COMPOSE_FILE", "docker-compose.yml");

  acquireLock(lockFile, lockStaleMinutes);

  try {
    console.log(
      chalk.blue(`[${nowIso()}] Début du check: remote=${remote} branch=${branch}`)
    );

    shInherit(`git fetch --prune ${remote} ${branch}`);

    const localSha = sh(`git rev-parse HEAD`);
    const remoteSha = sh(`git rev-parse ${remote}/${branch}`);

    if (localSha === remoteSha) {
      console.log(chalk.green(`[${nowIso()}] Aucun changement (HEAD=${localSha}).`));
      return;
    }

    console.log(
      chalk.yellow(
        `[${nowIso()}] Mise à jour détectée: ${localSha.slice(
          0,
          8
        )} -> ${remoteSha.slice(0, 8)}`
      )
    );

    shInherit(`git checkout -f ${branch}`);
    shInherit(`git reset --hard ${remote}/${branch}`);
    if (gitClean) shInherit(`git clean -fd`);

    console.log(chalk.blue(`[${nowIso()}] Rebuild & restart via Docker Compose...`));
    shInherit(`${composeCmd} -f ${composeFile} up -d --build --remove-orphans`);

    console.log(chalk.green(`[${nowIso()}] Déploiement terminé (HEAD=${remoteSha}).`));
  } finally {
    releaseLock(lockFile);
  }
}

