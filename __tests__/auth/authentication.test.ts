import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";

// Mock des données utilisateur
const mockUsers = [
	{
		id: "usr_test1",
		username: "testadmin",
		password: "", // Sera défini dans beforeAll
		role: "admin",
	},
];

// Mock de fs
vi.mock("node:fs", () => ({
	readFileSync: vi.fn(() => JSON.stringify(mockUsers)),
}));

describe("Authentication", () => {
	beforeAll(async () => {
		// Hasher le mot de passe pour le mock user
		mockUsers[0].password = await bcrypt.hash("testpass123", 10);
	});

	it("should authenticate valid credentials", async () => {
		const credentials = {
			username: "testadmin",
			password: "testpass123",
		};

		const user = await auth().signIn("credentials", {
			redirect: false,
			...credentials,
		});

		expect(user?.error).toBeUndefined();
	});

	it("should reject invalid credentials", async () => {
		const credentials = {
			username: "testadmin",
			password: "wrongpass",
		};

		const result = await auth().signIn("credentials", {
			redirect: false,
			...credentials,
		});

		expect(result?.error).toBeDefined();
	});
});
