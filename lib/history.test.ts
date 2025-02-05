import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
	getAllHistory,
	addHistoryEntry,
	deleteHistoryEntry,
	searchHistory,
	recordUpload,
} from "./history";
import type { HistoryEntry } from "./types/history";

// Mock des modules
vi.mock("fs", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import("fs");
	return {
		...actual,
		promises: {
			access: vi.fn(),
			writeFile: vi.fn(),
			readFile: vi.fn(),
		},
	};
});

vi.mock("nanoid", () => ({
	nanoid: vi.fn().mockReturnValue("test-id"),
}));

describe("History", () => {
	const mockHistoryFile = path.join(process.cwd(), "data", "history.json");

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("getAllHistory", () => {
		it("retourne un tableau vide si le fichier n'existe pas", async () => {
			vi.mocked(fs.access).mockRejectedValueOnce(new Error());
			vi.mocked(fs.readFile).mockResolvedValueOnce("[]");

			const history = await getAllHistory();

			expect(history).toEqual([]);
			expect(fs.writeFile).toHaveBeenCalledWith(mockHistoryFile, "[]");
		});

		it("retourne les entrées existantes", async () => {
			const mockEntries = [
				{ id: "1", filename: "test.jpg" },
				{ id: "2", filename: "test2.jpg" },
			];

			vi.mocked(fs.access).mockResolvedValueOnce(undefined);
			vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockEntries));

			const history = await getAllHistory();

			expect(history).toEqual(mockEntries);
		});
	});

	describe("addHistoryEntry", () => {
		it("ajoute une nouvelle entrée avec un ID", async () => {
			const mockEntries: HistoryEntry[] = [];
			vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockEntries));

			const newEntry = await addHistoryEntry({
				filename: "test.jpg",
				originalFilename: "test.jpg",
				uploadDate: "2024-01-01",
				fileSize: 1024,
				mimeType: "image/jpeg",
				uploadMethod: "web",
				fileUrl: "http://test.com/test.jpg",
				ipAddress: "127.0.0.1",
			});

			expect(newEntry.id).toBe("test-id");
			expect(fs.writeFile).toHaveBeenCalledWith(
				mockHistoryFile,
				expect.stringContaining("test-id"),
			);
		});
	});

	describe("deleteHistoryEntry", () => {
		it("supprime une entrée existante", async () => {
			const mockEntries = [{ id: "test-id", filename: "test.jpg" }];

			vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockEntries));

			const result = await deleteHistoryEntry("test-id");

			expect(result).toBe(true);
			expect(fs.writeFile).toHaveBeenCalledWith(mockHistoryFile, "[]");
		});

		it("retourne false si l'entrée n'existe pas", async () => {
			const mockEntries = [{ id: "other-id", filename: "test.jpg" }];

			vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockEntries));

			const result = await deleteHistoryEntry("test-id");

			expect(result).toBe(false);
			expect(fs.writeFile).not.toHaveBeenCalled();
		});
	});

	describe("searchHistory", () => {
		const mockEntries = [
			{
				id: "1",
				filename: "test1.jpg",
				originalFilename: "test1.jpg",
				uploadDate: "2024-01-01T12:00:00.000Z",
				userId: "user1",
				uploadMethod: "web" as const,
				userName: "User One",
			},
			{
				id: "2",
				filename: "test2.jpg",
				originalFilename: "test2.jpg",
				uploadDate: "2024-02-01T12:00:00.000Z",
				userId: "user2",
				uploadMethod: "api" as const,
				userName: "User Two",
			},
		];

		beforeEach(() => {
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockEntries));
		});

		it("filtre par date de début", async () => {
			const results = await searchHistory({
				startDate: new Date("2024-01-15"),
			});

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("2");
		});

		it("filtre par utilisateur", async () => {
			const results = await searchHistory({
				userId: "user1",
			});

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("1");
		});

		it("filtre par méthode d'upload", async () => {
			const results = await searchHistory({
				uploadMethod: "api",
			});

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("2");
		});

		it("recherche par texte", async () => {
			const results = await searchHistory({
				searchQuery: "one",
			});

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("1");
		});
	});

	describe("recordUpload", () => {
		it("enregistre un nouvel upload", async () => {
			const mockEntries: HistoryEntry[] = [];
			vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockEntries));

			const uploadData = {
				filename: "test.jpg",
				originalFilename: "original.jpg",
				fileSize: 1024,
				mimeType: "image/jpeg",
				uploadMethod: "web" as const,
				fileUrl: "http://test.com/test.jpg",
				thumbnailUrl: "http://test.com/thumb.jpg",
				deletionToken: "delete-token",
				ipAddress: "127.0.0.1",
				userId: "user1",
				userName: "Test User",
			};

			const result = await recordUpload(uploadData);

			expect(result.id).toBe("test-id");
			expect(result.filename).toBe(uploadData.filename);
			expect(result.uploadMethod).toBe(uploadData.uploadMethod);
			expect(fs.writeFile).toHaveBeenCalledWith(
				mockHistoryFile,
				expect.stringContaining(uploadData.filename),
			);
		});
	});
});
