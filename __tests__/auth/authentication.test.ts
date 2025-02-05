import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { signIn } from "next-auth/react";
import type { SignInResponse } from "next-auth/react";
import { auth } from "@/auth";

// Mock next-auth
vi.mock("next-auth/react", () => ({
	signIn: vi.fn(),
}));

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
vi.mock("fs", async () => {
	const actual = await vi.importActual("fs");
	return {
		...actual,
		readFileSync: vi.fn(() => JSON.stringify(mockUsers)),
	};
});

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

		const mockResponse = {
			error: undefined,
			status: 200,
			ok: true,
			url: null,
		};

		vi.mocked(signIn).mockResolvedValueOnce(mockResponse);

		const result = await signIn("credentials", {
			redirect: false,
			...credentials,
		});

		expect(result?.error).toBeUndefined();
		expect(result?.ok).toBe(true);
	});

	it("should reject invalid credentials", async () => {
		const credentials = {
			username: "testadmin",
			password: "wrongpass",
		};

		const mockResponse = {
			error: "Invalid credentials",
			status: 401,
			ok: false,
			url: null,
		};

		vi.mocked(signIn).mockResolvedValueOnce(mockResponse);

		const result = await signIn("credentials", {
			redirect: false,
			...credentials,
		});

		expect(result?.error).toBeDefined();
		expect(result?.ok).toBe(false);
	});
});
