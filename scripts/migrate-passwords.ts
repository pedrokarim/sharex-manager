#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import type { User } from "../types/user";

async function migratePasswords() {
	const usersPath = join(process.cwd(), "data/users.json");
	const users = JSON.parse(readFileSync(usersPath, "utf-8")) as User[];

	const migratedUsers = await Promise.all(
		users.map(async (user) => ({
			...user,
			password: await bcrypt.hash(user.password, 10),
		})),
	);

	writeFileSync(usersPath, JSON.stringify(migratedUsers, null, 2));
	console.log("✅ Migration des mots de passe terminée");
}

migratePasswords().catch(console.error);
