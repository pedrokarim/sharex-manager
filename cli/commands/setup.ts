#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import prompts from "prompts";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

import {
  mergeEnvironmentFile,
  parseSetupOptions,
  setupOptionValue,
  setupEnvironment,
  type SetupOptions,
} from "../setup-config";
import { resolveAuthProvider } from "../../lib/auth-config";

export const description = "Configuration initiale de ShareX Manager";
export const usage = `bun run setup [options]
  --auth builtin|ascencia
  --app-url <url>
  --port <port>
  --admin-username <nom>
  --admin-password <mot-de-passe>
  --ascencia-issuer <url>
  --ascencia-client-id <id>
  --ascencia-client-secret <secret>
  --ascencia-admin-roles <role,role>`;

const DATA_DIR = join(process.cwd(), "data");
const CONFIG_DIR = join(process.cwd(), "config");

const DEFAULT_FILES = {
  "data/users.json": [],
  "data/history.json": [],
  "data/deletion-tokens.json": [],
  "data/api-keys.json": [],
  "data/secure-files.json": {
    files: [],
  },
  "data/starred-files.json": {
    files: [],
  },
  "config/uploads.json": {
    allowedTypes: {
      images: true,
      documents: true,
      archives: true,
    },
    limits: {
      maxFileSize: 10,
      minFileSize: 1,
      maxFilesPerUpload: 50,
      maxFilesPerType: {
        images: 30,
        documents: 20,
        archives: 10,
      },
    },
    filenamePattern: "{random}",
    thumbnails: {
      enabled: true,
      blur: 2.5,
      maxWidth: 200,
      maxHeight: 200,
      quality: 80,
    },
    storage: {
      path: "./uploads",
      structure: "flat",
      preserveFilenames: false,
      replaceExisting: false,
      thumbnailsPath: "thumbnails",
      dateFormat: {
        folderStructure: "YYYY/MM",
        timezone: "Europe/Paris",
      },
      permissions: {
        files: "0644",
        directories: "0755",
      },
    },
    domains: {
      list: [
        {
          id: "default",
          name: "Local Development",
          url: "http://localhost:4001",
          isDefault: true,
        },
      ],
      defaultDomain: "default",
      useSSL: true,
      pathPrefix: "/",
    },
    uploads: [],
    lastUpdate: "",
  },
};

function ensureDirectoryExists(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(chalk.green(`✅ Dossier créé : ${dir}`));
  }
}

async function createFile(
  path: string,
  content: unknown,
  force = false,
  interactive = true
) {
  try {
    const fileExists = existsSync(path);

    if (fileExists && !force) {
      console.log(chalk.yellow(`⚠️ Le fichier existe déjà : ${path}`));
      return;
    }

    if (fileExists && force && interactive) {
      const response = await prompts({
        type: "confirm",
        name: "confirm",
        message: `⚠️ Êtes-vous sûr de vouloir écraser le fichier ${path} ?`,
        initial: false,
      });

      if (!response.confirm) {
        console.log(chalk.yellow(`⚠️ Opération annulée pour : ${path}`));
        return;
      }
    }

    writeFileSync(path, JSON.stringify(content, null, 2));
    console.log(
      chalk.green(
        `✅ Fichier ${fileExists ? "écrasé" : "créé"} avec succès : ${path}`
      )
    );
  } catch (error) {
    console.error(
      chalk.red(`❌ Erreur lors de la création du fichier ${path}`),
      error
    );
  }
}

export default async function setup(args: string[], interactive: boolean) {
  // Vérifier si l'option --force ou -f est présente
  const force = args.includes("--force") || args.includes("-f");

  console.log(chalk.blue("🚀 Configuration initiale de ShareX Manager..."));

  const options = interactive
    ? await requestSetupOptions(args)
    : parseSetupOptions(args);

  if (force) {
    console.log(
      chalk.yellow(
        "⚠️ Mode force activé : les fichiers existants pourront être écrasés"
      )
    );
  }

  // Création des dossiers nécessaires
  ensureDirectoryExists(DATA_DIR);
  ensureDirectoryExists(CONFIG_DIR);
  ensureDirectoryExists(join(process.cwd(), "uploads"));
  ensureDirectoryExists(join(process.cwd(), "uploads/thumbnails"));

  // Création des fichiers par défaut
  for (const [path, content] of Object.entries(DEFAULT_FILES)) {
    await createFile(join(process.cwd(), path), content, force, interactive);
  }

  await createInitialBuiltinAdmin(options);
  writeEnvironmentFile(options);

  console.log(chalk.green("\n✨ Configuration initiale terminée !"));
  console.log(`Authentification : ${chalk.cyan(options.authProvider)}`);
  console.log(`URL publique : ${chalk.cyan(options.appUrl)}`);
  console.log(`Port d'écoute : ${chalk.cyan(options.port)}`);
  if (options.authProvider === "ascencia") {
    console.log(
      chalk.yellow(
        "\nDans Ascencia ID, enregistrez le callback suivant puis activez la politique role_gated :"
      )
    );
    console.log(`${options.appUrl}/api/auth/oauth2/callback/ascencia`);
  } else if (!options.builtinAdmin && needsInitialBuiltinAdmin()) {
    console.log(
      chalk.yellow(
        "\nAjoutez un administrateur avant le premier démarrage avec bun run cli -- users add."
      )
    );
  }
  console.log(
    chalk.gray(
      "\nVérifiez config/uploads.json, puis lancez bun run dev ou docker compose up -d --build."
    )
  );
}

async function requestSetupOptions(args: string[]): Promise<SetupOptions> {
  const defaultAuthProvider = resolveAuthProvider(
    setupOptionValue(args, "--auth") ?? process.env.SHAREX_AUTH_PROVIDER
  );
  const defaultAppUrl =
    setupOptionValue(args, "--app-url") ??
    process.env.AUTH_URL ??
    "http://localhost:3000";
  let urlPort = 3000;
  try {
    urlPort = Number(new URL(defaultAppUrl).port || 3000);
  } catch {
    // La validation du champ URL affichera le message approprié.
  }
  const defaultPort = Number(
    setupOptionValue(args, "--port") || process.env.PORT?.trim() || urlPort
  );
  const response = await prompts([
    {
      type: "text",
      name: "appUrl",
      message: "URL publique de ShareX Manager",
      initial: defaultAppUrl,
      validate: (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return "Saisissez une URL absolue";
        }
      },
    },
    {
      type: "number",
      name: "port",
      message: "Port d'écoute de ShareX Manager",
      initial: defaultPort,
      validate: (value) =>
        (Number.isInteger(value) && value >= 1 && value <= 65_535) ||
        "Le port doit être compris entre 1 et 65535",
    },
    {
      type: "select",
      name: "authProvider",
      message: "Système d'authentification",
      initial: defaultAuthProvider === "ascencia" ? 1 : 0,
      choices: [
        {
          title: "Intégré à ShareX Manager (recommandé)",
          value: "builtin",
        },
        { title: "Ascencia ID (OIDC)", value: "ascencia" },
      ],
    },
  ]);

  if (!response.appUrl || !response.port || !response.authProvider) {
    throw new Error("Configuration annulée");
  }

  if (response.authProvider === "builtin") {
    const builtinArgs = [
      "--auth",
      "builtin",
      "--app-url",
      response.appUrl,
      "--port",
      String(response.port),
    ];

    if (needsInitialBuiltinAdmin()) {
      const admin = await prompts([
        {
          type: "text",
          name: "username",
          message: "Nom du premier administrateur",
          initial: "admin",
          validate: (value) =>
            value.length >= 3 || "Le nom doit faire au moins 3 caractères",
        },
        {
          type: "password",
          name: "password",
          message: "Mot de passe administrateur (12 caractères minimum)",
          validate: (value) =>
            value.length >= 12 ||
            "Le mot de passe doit faire au moins 12 caractères",
        },
        {
          type: "password",
          name: "passwordConfirmation",
          message: "Confirmez le mot de passe",
        },
      ]);

      if (
        !admin.username ||
        !admin.password ||
        admin.password !== admin.passwordConfirmation
      ) {
        throw new Error(
          "Les mots de passe administrateur ne correspondent pas"
        );
      }

      builtinArgs.push(
        "--admin-username",
        admin.username,
        "--admin-password",
        admin.password
      );
    }

    return parseSetupOptions(builtinArgs);
  }

  const ascencia = await prompts([
    {
      type: "text",
      name: "issuer",
      message: "URL d'Ascencia ID",
      initial: process.env.ASCENCIA_ISSUER ?? "https://id.ascencia.re",
    },
    {
      type: "text",
      name: "clientId",
      message: "Client ID",
      initial: process.env.ASCENCIA_CLIENT_ID,
    },
    {
      type: "password",
      name: "clientSecret",
      message: "Client secret",
    },
    {
      type: "text",
      name: "adminRoles",
      message: "Rôles Ascencia donnant les droits administrateur (séparés par des virgules)",
      initial: process.env.ASCENCIA_ADMIN_ROLES ?? "superadmin",
    },
  ]);

  return parseSetupOptions([
    "--auth",
    "ascencia",
    "--app-url",
    response.appUrl,
    "--port",
    String(response.port),
    "--ascencia-issuer",
    ascencia.issuer ?? "",
    "--ascencia-client-id",
    ascencia.clientId ?? "",
    "--ascencia-client-secret",
    ascencia.clientSecret ?? "",
    "--ascencia-admin-roles",
    ascencia.adminRoles ?? "superadmin",
  ]);
}

function needsInitialBuiltinAdmin(): boolean {
  if (authDatabaseHasUsers()) return false;

  const usersPath = join(DATA_DIR, "users.json");
  if (!existsSync(usersPath)) return true;

  try {
    const users = JSON.parse(readFileSync(usersPath, "utf8"));
    return Array.isArray(users) && users.length === 0;
  } catch {
    return false;
  }
}

function authDatabaseHasUsers(): boolean {
  const databasePath = join(DATA_DIR, "auth.db");
  if (!existsSync(databasePath)) return false;

  const database = new Database(databasePath, { readonly: true });
  try {
    const table = database
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user'")
      .get();
    if (!table) return false;

    const result = database
      .query("SELECT COUNT(*) AS count FROM user")
      .get() as { count: number } | null;
    return (result?.count ?? 0) > 0;
  } catch {
    return false;
  } finally {
    database.close();
  }
}

async function createInitialBuiltinAdmin(options: SetupOptions) {
  if (options.authProvider !== "builtin" || !options.builtinAdmin) return;
  if (!needsInitialBuiltinAdmin()) {
    console.log(
      chalk.yellow(
        "⚠️ Une base ou des utilisateurs existent déjà : administrateur initial ignoré"
      )
    );
    return;
  }

  const password = await bcrypt.hash(options.builtinAdmin.password, 10);
  const usersPath = join(DATA_DIR, "users.json");
  writeFileSync(
    usersPath,
    JSON.stringify(
      [
        {
          id: `usr_${nanoid()}`,
          username: options.builtinAdmin.username,
          password,
          role: "admin",
        },
      ],
      null,
      2
    ),
    { mode: 0o600 }
  );
  chmodSync(usersPath, 0o600);
  console.log(chalk.green("✅ Administrateur initial créé"));
}

function writeEnvironmentFile(options: SetupOptions) {
  const envPath = join(process.cwd(), ".env");
  const examplePath = join(process.cwd(), ".env.example");
  const existing = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : existsSync(examplePath)
      ? readFileSync(examplePath, "utf8")
      : "";
  const merged = mergeEnvironmentFile(existing, setupEnvironment(options));

  if (existsSync(envPath) && existing !== merged) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${envPath}.bak-${stamp}`;
    copyFileSync(envPath, backupPath);
    console.log(
      chalk.gray(`Sauvegarde de l'ancien environnement : ${backupPath}`)
    );
  }

  writeFileSync(envPath, merged, { mode: 0o600 });
  console.log(chalk.green(`✅ Configuration écrite : ${envPath}`));
}
