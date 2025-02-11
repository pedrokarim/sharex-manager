#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import bcrypt from "bcryptjs";

export const description = "Migration des mots de passe vers bcrypt";
export const usage = "bun cli migrate-passwords";

interface User {
  id: string;
  username: string;
  password: string;
  role: "admin" | "user";
}

export default async function migratePasswords(
  args: string[],
  interactive: boolean
) {
  const usersPath = join(process.cwd(), "data/users.json");

  try {
    const users = JSON.parse(readFileSync(usersPath, "utf-8")) as User[];
    let migrated = false;

    for (const user of users) {
      // Si le mot de passe n'est pas déjà un hash bcrypt
      if (!user.password.startsWith("$2")) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        user.password = hashedPassword;
        migrated = true;
      }
    }

    if (migrated) {
      writeFileSync(usersPath, JSON.stringify(users, null, 2));
      console.log(chalk.green("✅ Migration des mots de passe terminée"));
    } else {
      console.log(chalk.blue("ℹ️ Aucun mot de passe à migrer"));
    }
  } catch (error) {
    console.error(
      chalk.red("❌ Erreur lors de la migration des mots de passe"),
      error
    );
  }
}
