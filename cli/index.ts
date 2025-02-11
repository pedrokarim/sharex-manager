#!/usr/bin/env bun
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "ts-command-line-args";
import prompts from "prompts";
import chalk from "chalk";

interface GlobalArguments {
  command?: string;
  help?: boolean;
  _unknown?: string[];
}

interface CommandInfo {
  name: string;
  description: string;
  usage?: string;
}

// Fonction de recherche floue pour l'autocomplétion
function fuzzySearch(query: string, items: string[]): string[] {
  const lowercaseQuery = query.toLowerCase();
  return items
    .filter((item) => {
      const lowercaseItem = item.toLowerCase();
      let queryIndex = 0;
      for (
        let i = 0;
        i < lowercaseItem.length && queryIndex < lowercaseQuery.length;
        i++
      ) {
        if (lowercaseItem[i] === lowercaseQuery[queryIndex]) {
          queryIndex++;
        }
      }
      return queryIndex === lowercaseQuery.length;
    })
    .sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aExact = aLower.startsWith(lowercaseQuery);
      const bExact = bLower.startsWith(lowercaseQuery);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.localeCompare(b);
    });
}

const COMMANDS_DIR = join(__dirname, "commands");

async function getCommandInfo(commandName: string): Promise<CommandInfo> {
  try {
    const commandModule = await import(join(COMMANDS_DIR, `${commandName}.ts`));
    return {
      name: commandName,
      description:
        commandModule.description || `Exécuter la commande ${commandName}`,
      usage: commandModule.usage || `bun cli ${commandName}`,
    };
  } catch {
    return {
      name: commandName,
      description: `Exécuter la commande ${commandName}`,
      usage: `bun cli ${commandName}`,
    };
  }
}

async function showHelp() {
  console.log(chalk.blue("\n🚀 ShareX Manager CLI\n"));
  console.log("Utilisation:");
  console.log("  bun cli [options] [commande]");
  console.log("  bun cli -c <commande>");
  console.log("  bun cli --help\n");

  console.log("Options:");
  console.log("  --command, -c        Commande à exécuter");
  console.log("  --help, -h          Afficher ce message d'aide");
  console.log("  --no-interactive    Désactiver le mode interactif\n");

  console.log("Exemples:");
  console.log("  bun cli                     # Mode interactif");
  console.log(
    "  bun cli -c users            # Exécuter une commande spécifique"
  );
  console.log("  bun cli --no-interactive    # Mode non-interactif\n");

  console.log("Commandes disponibles:");

  if (!existsSync(COMMANDS_DIR)) {
    console.log(chalk.yellow("  Aucune commande disponible"));
    return;
  }

  const files = readdirSync(COMMANDS_DIR).filter((file) =>
    file.endsWith(".ts")
  );

  for (const file of files) {
    const commandName = file.replace(".ts", "");
    const info = await getCommandInfo(commandName);
    console.log(chalk.green(`  ${info.name.padEnd(20)} ${info.description}`));
    if (info.usage) {
      console.log(`${" ".repeat(22)}Usage: ${info.usage}`);
    }
    console.log(""); // Espacement entre les commandes
  }
}

async function main() {
  // Gestion du flag --no-interactive
  const noInteractiveIndex = process.argv.indexOf("--no-interactive");
  const isNoInteractive = noInteractiveIndex !== -1;

  if (isNoInteractive) {
    process.argv.splice(noInteractiveIndex, 1);
  }

  const { _unknown, ...globalArgs } = parse<GlobalArguments>(
    {
      command: {
        type: String,
        optional: true,
        alias: "c",
        description: "Commande à exécuter",
      },
      help: {
        type: Boolean,
        optional: true,
        alias: "h",
        description: "Afficher l'aide",
      },
      _unknown: { type: String, multiple: true, optional: true },
    },
    {
      stopAtFirstUnknown: true,
      partial: true,
    }
  );

  const commandArgs = _unknown || [];
  const interactive = !isNoInteractive;

  if (globalArgs.help) {
    await showHelp();
    return;
  }

  if (!existsSync(COMMANDS_DIR)) {
    console.error(chalk.red("Répertoire des commandes introuvable."));
    return;
  }

  const availableCommands = readdirSync(COMMANDS_DIR)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.replace(".ts", ""));

  let selectedCommand = globalArgs.command;

  if (!selectedCommand && interactive) {
    const commandChoices = await Promise.all(
      availableCommands.map(async (cmd) => {
        const info = await getCommandInfo(cmd);
        return {
          title: cmd,
          value: cmd,
          description: info.description,
        };
      })
    );

    const response = await prompts([
      {
        type: "autocomplete",
        name: "command",
        message: "Sélectionnez une commande à exécuter:",
        choices: commandChoices,
        suggest: (input: string, choices) => {
          const filtered = fuzzySearch(
            input,
            choices.map((c) => c.title)
          );
          return Promise.resolve(
            filtered.map((title) => choices.find((c) => c.title === title)!)
          );
        },
      },
    ]);
    selectedCommand = response.command;
  }

  if (!selectedCommand) {
    console.error(chalk.red("\n❌ Aucune commande spécifiée."));
    console.log("\nPour voir les commandes disponibles, exécutez:");
    console.log("  bun cli --help");
    console.log("  # ou");
    console.log("  bun cli -h\n");
    process.exit(1);
  }

  try {
    const commandModule = await import(
      join(COMMANDS_DIR, `${selectedCommand}.ts`)
    );
    await commandModule.default(commandArgs, interactive);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot find module")
    ) {
      console.error(
        chalk.red(`\n❌ Commande '${selectedCommand}' introuvable.`)
      );
      console.log("\nPour voir les commandes disponibles, exécutez:");
      console.log("  bun cli --help");
      process.exit(1);
    }
    throw error;
  }
}

// On n'exécute le main que si ce fichier est appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red("\n❌ Une erreur est survenue:"), error.message);
    console.log("\nPour obtenir de l'aide, exécutez:");
    console.log("  bun cli --help");
    console.log("  # ou");
    console.log("  bun cli -h\n");
    process.exit(1);
  });
}
