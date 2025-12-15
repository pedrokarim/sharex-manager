import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcryptjs";

// Mock des données utilisateur
const mockUsers = [
  {
    id: "usr_test1",
    username: "testadmin",
    password: "", // Sera défini dans beforeAll
    role: "admin",
  },
];

describe("Authentication", () => {
  beforeAll(async () => {
    // Hasher le mot de passe pour le mock user
    mockUsers[0].password = await bcrypt.hash("testpass123", 10);
  });

  it("should authenticate valid credentials", async () => {
    // Test authentication logic directly without file operations
    const passwordMatch = await bcrypt.compare(
      "testpass123",
      mockUsers[0].password
    );
    expect(passwordMatch).toBe(true);
  });

  it("should reject invalid credentials", async () => {
    // Test authentication logic directly without file operations
    const passwordMatch = await bcrypt.compare(
      "wrongpass",
      mockUsers[0].password
    );
    expect(passwordMatch).toBe(false);
  });
});
