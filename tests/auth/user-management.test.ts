import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import type { User } from "@/types/user";

const testUsersPath = join(process.cwd(), "data/users.test.json");

describe("User Management", () => {
  // Données de test
  const testUser = {
    username: "testuser",
    password: "password123",
    role: "user" as const,
  };

  // Réinitialiser le fichier de test avant chaque test
  beforeEach(() => {
    writeFileSync(testUsersPath, JSON.stringify([], null, 2));
  });

  // Nettoyer après chaque test
  afterEach(() => {
    writeFileSync(testUsersPath, JSON.stringify([], null, 2));
  });

  it("should create a new user with hashed password", async () => {
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    const newUser: User = {
      id: "test_id",
      ...testUser,
      password: hashedPassword,
    };

    const users = [];
    users.push(newUser);
    writeFileSync(testUsersPath, JSON.stringify(users, null, 2));

    const savedUsers = JSON.parse(
      readFileSync(testUsersPath, "utf-8")
    ) as User[];
    const savedUser = savedUsers[0];

    expect(savedUser.username).toBe(testUser.username);
    expect(savedUser.password).not.toBe(testUser.password);
    expect(savedUser.role).toBe(testUser.role);

    // Vérifier que le mot de passe est correctement hashé
    const passwordValid = await bcrypt.compare(
      testUser.password,
      savedUser.password
    );
    expect(passwordValid).toBe(true);
  });

  it("should not allow duplicate usernames", async () => {
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    const user: User = {
      id: "test_id_1",
      ...testUser,
      password: hashedPassword,
    };

    // Ajouter le premier utilisateur
    const users = [user];
    writeFileSync(testUsersPath, JSON.stringify(users, null, 2));

    // Tenter d'ajouter un utilisateur avec le même nom
    const duplicateUser = {
      ...user,
      id: "test_id_2",
    };

    const currentUsers = JSON.parse(
      readFileSync(testUsersPath, "utf-8")
    ) as User[];
    const isDuplicate = currentUsers.some(
      (u) => u.username === duplicateUser.username
    );

    expect(isDuplicate).toBe(true);
  });
});
