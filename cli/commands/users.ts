#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import prompts from "prompts";
import chalk from "chalk";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

export const description = "Gestion des utilisateurs ShareX Manager";
export const usage = "bun cli users [add|list|delete]";

interface User {
  id: string;
  username: string;
  password: string;
  role: "admin" | "user";
}

const usersPath = join(process.cwd(), "data/users.json");

async function addUser() {
  const response = await prompts([
    {
      type: "text",
      name: "username",
      message: "Nom d'utilisateur",
      validate: (value) =>
        value.length >= 3 || "Le nom doit faire au moins 3 caractères",
    },
    {
      type: "password",
      name: "password",
      message: "Mot de passe",
      validate: (value) =>
        value.length >= 6 || "Le mot de passe doit faire au moins 6 caractères",
    },
    {
      type: "select",
      name: "role",
      message: "Rôle",
      choices: [
        { title: "Administrateur", value: "admin" },
        { title: "Utilisateur", value: "user" },
      ],
    },
  ]);

  if (!response.username || !response.password || !response.role) {
    console.log(chalk.red("❌ Opération annulée"));
    return;
  }

  try {
    const users = JSON.parse(readFileSync(usersPath, "utf-8")) as User[];

    if (users.some((u) => u.username === response.username)) {
      console.log(chalk.red("❌ Ce nom d'utilisateur existe déjà"));
      return;
    }

    const hashedPassword = await bcrypt.hash(response.password, 10);

    const newUser: User = {
      id: `usr_${nanoid()}`,
      username: response.username,
      password: hashedPassword,
      role: response.role,
    };

    users.push(newUser);
    writeFileSync(usersPath, JSON.stringify(users, null, 2));
    console.log(chalk.green("✅ Utilisateur créé avec succès"));
  } catch (error) {
    console.error(
      chalk.red("❌ Erreur lors de la création de l'utilisateur"),
      error
    );
  }
}

function listUsers() {
  try {
    const users = JSON.parse(readFileSync(usersPath, "utf-8")) as User[];
    console.log(chalk.blue("\nListe des utilisateurs :"));
    console.table(
      users.map((u) => ({
        ID: u.id,
        Username: u.username,
        Role: u.role,
      }))
    );
  } catch (error) {
    console.error(
      chalk.red("❌ Erreur lors de la lecture des utilisateurs"),
      error
    );
  }
}

async function deleteUser() {
  try {
    const users = JSON.parse(readFileSync(usersPath, "utf-8")) as User[];

    const response = await prompts({
      type: "select",
      name: "userId",
      message: "Sélectionnez l'utilisateur à supprimer",
      choices: users.map((u) => ({
        title: `${u.username} (${u.role})`,
        value: u.id,
      })),
    });

    if (!response.userId) {
      console.log(chalk.red("❌ Opération annulée"));
      return;
    }

    const filteredUsers = users.filter((u) => u.id !== response.userId);
    writeFileSync(usersPath, JSON.stringify(filteredUsers, null, 2));
    console.log(chalk.green("✅ Utilisateur supprimé avec succès"));
  } catch (error) {
    console.error(
      chalk.red("❌ Erreur lors de la suppression de l'utilisateur"),
      error
    );
  }
}

export default async function users(args: string[], interactive: boolean) {
  const subcommand = args[0];

  switch (subcommand) {
    case "add":
      await addUser();
      break;
    case "list":
      listUsers();
      break;
    case "delete":
      await deleteUser();
      break;
    default:
      if (interactive) {
        const response = await prompts({
          type: "select",
          name: "action",
          message: "Que souhaitez-vous faire ?",
          choices: [
            { title: "Ajouter un utilisateur", value: "add" },
            { title: "Lister les utilisateurs", value: "list" },
            { title: "Supprimer un utilisateur", value: "delete" },
          ],
        });

        switch (response.action) {
          case "add":
            await addUser();
            break;
          case "list":
            listUsers();
            break;
          case "delete":
            await deleteUser();
            break;
        }
      } else {
        console.log(chalk.red("❌ Sous-commande invalide"));
        console.log("\nUtilisation :");
        console.log("  bun cli users add     # Ajouter un utilisateur");
        console.log("  bun cli users list    # Lister les utilisateurs");
        console.log("  bun cli users delete  # Supprimer un utilisateur");
      }
  }
}
