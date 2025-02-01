#!/usr/bin/env bun
import { program } from "commander";
import prompts from "prompts";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { nanoid } from "nanoid";
import chalk from "chalk";

const usersPath = join(process.cwd(), "data/users.json");

interface User {
  id: string;
  username: string;
  password: string;
  role: "admin" | "user";
}

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

    const newUser: User = {
      id: `usr_${nanoid()}`,
      username: response.username,
      password: response.password,
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

program.name("users").description("Gestion des utilisateurs ShareX Manager");

program
  .command("add")
  .description("Ajouter un nouvel utilisateur")
  .action(addUser);

program
  .command("list")
  .description("Lister tous les utilisateurs")
  .action(listUsers);

program
  .command("delete")
  .description("Supprimer un utilisateur")
  .action(deleteUser);

program.parse();
