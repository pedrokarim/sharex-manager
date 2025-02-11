#!/usr/bin/env bun
import chalk from "chalk";
import prompts from "prompts";

export const description = "Une commande simple pour dire bonjour";
export const usage = "bun cli hello [--name <nom>]";

interface HelloArgs {
  name?: string;
  _unknown?: string[];
}

export default async function hello(args: string[], interactive: boolean) {
  let name = "monde";

  if (interactive) {
    const response = await prompts({
      type: "text",
      name: "name",
      message: "Quel est votre nom ?",
      initial: "monde",
    });

    name = response.name;
  }

  console.log(chalk.green(`\n👋 Bonjour, ${name} !\n`));
}
