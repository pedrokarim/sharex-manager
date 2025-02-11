#!/usr/bin/env bun
import { join } from "path";
import chalk from "chalk";
import prompts from "prompts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { logDb } from "../../lib/utils/db";
import type { Log, LogLevel, LogAction } from "../../lib/types/logs";

export const description = "Gestion des logs du système";
export const usage = "bun cli logs [list|search|clear|stats|live]";

const LOG_LEVELS: LogLevel[] = ["info", "warning", "error", "debug"];
const LOG_ACTIONS: LogAction[] = [
  "auth.login",
  "auth.logout",
  "auth.register",
  "file.upload",
  "file.delete",
  "file.update",
  "file.download",
  "config.update",
  "user.create",
  "user.update",
  "user.delete",
  "admin.action",
  "system.error",
  "api.request",
  "api.error",
];

function formatDate(date: string) {
  return format(new Date(date), "dd/MM/yyyy HH:mm:ss", { locale: fr });
}

function formatLogLevel(level: LogLevel) {
  const colors: Record<LogLevel, (text: string) => string> = {
    info: chalk.blue,
    warning: chalk.yellow,
    error: chalk.red,
    debug: chalk.gray,
  };
  return colors[level](level.toUpperCase());
}

function formatTableData(logs: Log[]) {
  return logs.map((log) => {
    // Formater et tronquer les metadata
    let metadataStr = "-";
    if (log.metadata && Object.keys(log.metadata).length > 0) {
      const fullMetadata = JSON.stringify(log.metadata);
      metadataStr =
        fullMetadata.length > 30
          ? fullMetadata.slice(0, 27) + "..."
          : fullMetadata;
    }

    return {
      Date: formatDate(log.timestamp),
      Niveau: formatLogLevel(log.level),
      Action: chalk.cyan(log.action),
      Utilisateur: log.userEmail ? chalk.green(log.userEmail) : "-",
      Message:
        log.message.length > 50
          ? log.message.slice(0, 47) + "..."
          : log.message,
      Metadata: chalk.gray(metadataStr),
    };
  });
}

function displayLogs(logs: Log[]) {
  if (logs.length === 0) {
    console.log(chalk.yellow("\nAucun log trouvé."));
    return;
  }

  console.table(formatTableData(logs));
}

async function listLogs(limit = 50, offset = 0) {
  const logs = logDb.getLogs(limit, offset);
  displayLogs(logs);
}

async function watchLogs() {
  console.log(
    chalk.blue(
      "📡 Surveillance des logs en temps réel (Ctrl+C pour arrêter)..."
    )
  );
  console.log(chalk.gray("Les nouveaux logs apparaîtront automatiquement.\n"));

  let lastCheck = new Date();
  let isFirstCheck = true;

  // Fonction pour vérifier les nouveaux logs
  async function checkNewLogs() {
    const currentDate = new Date();
    const logs = logDb.getLogs(100, 0, {
      startDate: isFirstCheck ? undefined : lastCheck.toISOString(),
      endDate: currentDate.toISOString(),
    });

    if (logs.length > 0) {
      // Effacer la ligne précédente si ce n'est pas le premier check
      if (!isFirstCheck) {
        process.stdout.write("\x1b[1A\x1b[2K");
      }
      displayLogs(logs);
      console.log(chalk.gray("En attente de nouveaux logs..."));
    }

    lastCheck = currentDate;
    isFirstCheck = false;
  }

  // Première vérification
  await checkNewLogs();

  // Vérifier toutes les secondes
  const interval = setInterval(checkNewLogs, 1000);

  // Gérer l'arrêt propre
  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log(chalk.yellow("\n\nSurveillance arrêtée."));
    process.exit(0);
  });

  // Maintenir le processus en vie
  return new Promise(() => {});
}

async function searchLogs() {
  const response = await prompts([
    {
      type: "select",
      name: "level",
      message: "Niveau de log",
      choices: [
        { title: "Tous", value: "" },
        ...LOG_LEVELS.map((level) => ({ title: level, value: level })),
      ],
    },
    {
      type: "select",
      name: "action",
      message: "Type d'action",
      choices: [
        { title: "Toutes", value: "" },
        ...LOG_ACTIONS.map((action) => ({ title: action, value: action })),
      ],
    },
    {
      type: "text",
      name: "userId",
      message: "ID utilisateur (optionnel)",
    },
    {
      type: "text",
      name: "startDate",
      message: "Date de début (YYYY-MM-DD, optionnel)",
      validate: (value) =>
        !value ||
        /^\d{4}-\d{2}-\d{2}$/.test(value) ||
        "Format invalide (YYYY-MM-DD)",
    },
    {
      type: "text",
      name: "endDate",
      message: "Date de fin (YYYY-MM-DD, optionnel)",
      validate: (value) =>
        !value ||
        /^\d{4}-\d{2}-\d{2}$/.test(value) ||
        "Format invalide (YYYY-MM-DD)",
    },
  ]);

  const filters = {
    level: response.level || undefined,
    action: response.action || undefined,
    userId: response.userId || undefined,
    startDate: response.startDate
      ? `${response.startDate}T00:00:00.000Z`
      : undefined,
    endDate: response.endDate ? `${response.endDate}T23:59:59.999Z` : undefined,
  };

  const logs = logDb.getLogs(100, 0, filters);
  displayLogs(logs);
}

async function clearLogs() {
  const response = await prompts({
    type: "confirm",
    name: "confirm",
    message: "⚠️ Êtes-vous sûr de vouloir supprimer tous les logs ?",
    initial: false,
  });

  if (!response.confirm) {
    console.log(chalk.yellow("❌ Opération annulée"));
    return;
  }

  logDb.clearLogs();
  console.log(chalk.green("✅ Tous les logs ont été supprimés"));
}

async function showStats() {
  const allLogs = logDb.getLogs(1000000, 0);

  // Statistiques par niveau
  const statsByLevel = LOG_LEVELS.map((level) => ({
    level,
    count: allLogs.filter((log) => log.level === level).length,
  }));

  // Statistiques par action
  const statsByAction = LOG_ACTIONS.map((action) => ({
    action,
    count: allLogs.filter((log) => log.action === action).length,
  })).filter((stat) => stat.count > 0);

  // Statistiques par utilisateur
  const userStats = new Map<string, number>();
  allLogs.forEach((log) => {
    if (log.userEmail) {
      userStats.set(log.userEmail, (userStats.get(log.userEmail) || 0) + 1);
    }
  });

  console.log(chalk.blue("\n📊 Statistiques des logs"));

  console.log(chalk.yellow("\nPar niveau :"));
  statsByLevel.forEach(({ level, count }) => {
    console.log(`${formatLogLevel(level)} : ${count}`);
  });

  console.log(chalk.yellow("\nPar action :"));
  statsByAction
    .sort((a, b) => b.count - a.count)
    .forEach(({ action, count }) => {
      console.log(`${chalk.cyan(action.padEnd(15))} : ${count}`);
    });

  if (userStats.size > 0) {
    console.log(chalk.yellow("\nPar utilisateur :"));
    Array.from(userStats.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([email, count]) => {
        console.log(`${chalk.green(email.padEnd(30))} : ${count}`);
      });
  }
}

export default async function logs(args: string[], interactive: boolean) {
  const subcommand = args[0];

  switch (subcommand) {
    case "list":
      await listLogs();
      break;
    case "live":
      await watchLogs();
      break;
    case "search":
      await searchLogs();
      break;
    case "clear":
      await clearLogs();
      break;
    case "stats":
      await showStats();
      break;
    default:
      if (interactive) {
        const response = await prompts({
          type: "select",
          name: "action",
          message: "Que souhaitez-vous faire ?",
          choices: [
            { title: "Lister les derniers logs", value: "list" },
            { title: "Surveiller les logs en temps réel", value: "live" },
            { title: "Rechercher des logs", value: "search" },
            { title: "Voir les statistiques", value: "stats" },
            { title: "Supprimer tous les logs", value: "clear" },
          ],
        });

        switch (response.action) {
          case "list":
            await listLogs();
            break;
          case "live":
            await watchLogs();
            break;
          case "search":
            await searchLogs();
            break;
          case "stats":
            await showStats();
            break;
          case "clear":
            await clearLogs();
            break;
        }
      } else {
        console.log(chalk.red("❌ Sous-commande invalide"));
        console.log("\nUtilisation :");
        console.log("  bun cli logs list    # Lister les derniers logs");
        console.log(
          "  bun cli logs live    # Surveiller les logs en temps réel"
        );
        console.log("  bun cli logs search  # Rechercher des logs");
        console.log("  bun cli logs stats   # Voir les statistiques");
        console.log("  bun cli logs clear   # Supprimer tous les logs");
      }
  }
}
