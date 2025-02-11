#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import prompts from "prompts";

export const description = "Gestion des fichiers sécurisés et favoris";
export const usage = "bun cli files [secure|star] [add|remove|list] [filename]";

interface FileList {
  files: string[];
}

function readJsonFile(path: string): FileList {
  if (!existsSync(path)) {
    return { files: [] };
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJsonFile(path: string, data: FileList) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function addFile(path: string, filename: string) {
  const data = readJsonFile(path);
  if (data.files.includes(filename)) {
    console.log(
      chalk.yellow(`⚠️ Le fichier ${filename} est déjà dans la liste`)
    );
    return;
  }
  data.files.push(filename);
  writeJsonFile(path, data);
  console.log(
    chalk.green(`✅ Le fichier ${filename} a été ajouté avec succès`)
  );
}

function removeFile(path: string, filename: string) {
  const data = readJsonFile(path);
  if (!data.files.includes(filename)) {
    console.log(
      chalk.yellow(`⚠️ Le fichier ${filename} n'est pas dans la liste`)
    );
    return;
  }
  data.files = data.files.filter((f) => f !== filename);
  writeJsonFile(path, data);
  console.log(
    chalk.green(`✅ Le fichier ${filename} a été retiré avec succès`)
  );
}

function listFiles(path: string) {
  const data = readJsonFile(path);
  if (data.files.length === 0) {
    console.log(chalk.yellow("⚠️ Aucun fichier dans la liste"));
    return;
  }
  console.log(chalk.blue("\nListe des fichiers :"));
  data.files.forEach((file) => {
    console.log(`- ${file}`);
  });
}

export default async function files(args: string[], interactive: boolean) {
  const [type, action, filename] = args;

  if (!type || !action) {
    console.log(chalk.red("❌ Arguments manquants"));
    console.log(chalk.yellow("\nUtilisation :"));
    console.log(usage);
    return;
  }

  const filePath = join(
    process.cwd(),
    "data",
    type === "secure" ? "secure-files.json" : "starred-files.json"
  );

  if (!existsSync(filePath)) {
    console.log(
      chalk.red(
        `❌ Le fichier ${
          type === "secure" ? "secure-files.json" : "starred-files.json"
        } n'existe pas`
      )
    );
    return;
  }

  switch (action) {
    case "add":
      if (!filename) {
        console.log(chalk.red("❌ Nom de fichier manquant"));
        return;
      }
      addFile(filePath, filename);
      break;
    case "remove":
      if (!filename) {
        console.log(chalk.red("❌ Nom de fichier manquant"));
        return;
      }
      removeFile(filePath, filename);
      break;
    case "list":
      listFiles(filePath);
      break;
    default:
      console.log(chalk.red("❌ Action invalide"));
      console.log(chalk.yellow("\nActions disponibles :"));
      console.log("- add : Ajouter un fichier");
      console.log("- remove : Retirer un fichier");
      console.log("- list : Lister les fichiers");
  }
}
