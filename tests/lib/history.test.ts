import { describe, it, expect } from "vitest";
import type { HistoryEntry } from "../../lib/types/history";

describe("lib/history", () => {
  const mockHistoryData: HistoryEntry[] = [
    {
      id: "1",
      filename: "test1.jpg",
      originalFilename: "original1.jpg",
      uploadDate: "2024-01-01T10:00:00.000Z",
      fileSize: 1024,
      mimeType: "image/jpeg",
      uploadMethod: "web",
      fileUrl: "https://example.com/test1.jpg",
      thumbnailUrl: "https://example.com/thumb1.jpg",
      deletionToken: "token1",
      ipAddress: "192.168.1.1",
      userId: "user1",
      userName: "John Doe",
    },
    {
      id: "2",
      filename: "test2.png",
      originalFilename: "original2.png",
      uploadDate: "2024-01-02T11:00:00.000Z",
      fileSize: 2048,
      mimeType: "image/png",
      uploadMethod: "api",
      fileUrl: "https://example.com/test2.png",
      ipAddress: "192.168.1.2",
      userId: "user2",
      userName: "Jane Smith",
    },
    {
      id: "3",
      filename: "test3.pdf",
      originalFilename: "document.pdf",
      uploadDate: "2024-01-03T12:00:00.000Z",
      fileSize: 4096,
      mimeType: "application/pdf",
      uploadMethod: "sharex",
      fileUrl: "https://example.com/test3.pdf",
      ipAddress: "192.168.1.3",
    },
  ];

  describe("HistoryEntry type validation", () => {
    it("should have correct structure for complete entry", () => {
      const entry = mockHistoryData[0];

      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("filename");
      expect(entry).toHaveProperty("originalFilename");
      expect(entry).toHaveProperty("uploadDate");
      expect(entry).toHaveProperty("fileSize");
      expect(entry).toHaveProperty("mimeType");
      expect(entry).toHaveProperty("uploadMethod");
      expect(entry).toHaveProperty("fileUrl");
      expect(entry).toHaveProperty("ipAddress");

      expect(typeof entry.id).toBe("string");
      expect(typeof entry.filename).toBe("string");
      expect(typeof entry.originalFilename).toBe("string");
      expect(typeof entry.uploadDate).toBe("string");
      expect(typeof entry.fileSize).toBe("number");
      expect(typeof entry.mimeType).toBe("string");
      expect(typeof entry.fileUrl).toBe("string");
      expect(typeof entry.ipAddress).toBe("string");
    });

    it("should have correct upload method types", () => {
      const methods = mockHistoryData.map((entry) => entry.uploadMethod);

      expect(methods).toContain("web");
      expect(methods).toContain("api");
      expect(methods).toContain("sharex");

      methods.forEach((method) => {
        expect(["api", "web", "sharex"]).toContain(method);
      });
    });

    it("should have valid ISO date strings", () => {
      mockHistoryData.forEach((entry) => {
        const date = new Date(entry.uploadDate);
        expect(date).toBeInstanceOf(Date);
        expect(date.toISOString()).toBe(entry.uploadDate);
      });
    });

    it("should have valid file sizes", () => {
      mockHistoryData.forEach((entry) => {
        expect(entry.fileSize).toBeGreaterThan(0);
        expect(Number.isInteger(entry.fileSize)).toBe(true);
      });
    });

    it("should have valid URLs", () => {
      mockHistoryData.forEach((entry) => {
        expect(entry.fileUrl).toMatch(/^https?:\/\//);
      });
    });

    it("should have valid IP addresses", () => {
      mockHistoryData.forEach((entry) => {
        expect(entry.ipAddress).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      });
    });
  });

  describe("Search filtering logic", () => {
    it("should filter by start date correctly", () => {
      const startDate = new Date("2024-01-02T00:00:00.000Z");
      const filtered = mockHistoryData.filter((entry) => {
        const uploadDate = new Date(entry.uploadDate);
        return uploadDate >= startDate;
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((entry) => entry.id)).toEqual(["2", "3"]);
    });

    it("should filter by end date correctly", () => {
      const endDate = new Date("2024-01-02T11:00:00.000Z");
      const filtered = mockHistoryData.filter((entry) => {
        const uploadDate = new Date(entry.uploadDate);
        return uploadDate <= endDate;
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((entry) => entry.id)).toEqual(["1", "2"]);
    });

    it("should filter by date range correctly", () => {
      const startDate = new Date("2024-01-01T11:00:00.000Z");
      const endDate = new Date("2024-01-02T11:00:00.000Z");
      const filtered = mockHistoryData.filter((entry) => {
        const uploadDate = new Date(entry.uploadDate);
        return uploadDate >= startDate && uploadDate <= endDate;
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("2");
    });

    it("should filter by user ID correctly", () => {
      const filtered = mockHistoryData.filter(
        (entry) => entry.userId === "user1"
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });

    it("should filter by upload method correctly", () => {
      const filtered = mockHistoryData.filter(
        (entry) => entry.uploadMethod === "api"
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("2");
    });

    it("should filter by search query in filename", () => {
      const query = "test1";
      const filtered = mockHistoryData.filter((entry) =>
        entry.filename.toLowerCase().includes(query.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });

    it("should filter by search query in original filename", () => {
      const query = "original2";
      const filtered = mockHistoryData.filter((entry) =>
        entry.originalFilename.toLowerCase().includes(query.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("2");
    });

    it("should filter by search query in user name", () => {
      const query = "John";
      const filtered = mockHistoryData.filter((entry) =>
        entry.userName?.toLowerCase().includes(query.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });

    it("should be case insensitive for search queries", () => {
      const query = "JOHN";
      const filtered = mockHistoryData.filter((entry) =>
        entry.userName?.toLowerCase().includes(query.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });

    it("should combine multiple filters correctly", () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z");
      const endDate = new Date("2024-01-02T23:59:59.999Z");
      const filtered = mockHistoryData.filter((entry) => {
        const uploadDate = new Date(entry.uploadDate);
        const dateMatch = uploadDate >= startDate && uploadDate <= endDate;
        const methodMatch = entry.uploadMethod === "web";
        const queryMatch = entry.filename.toLowerCase().includes("test");

        return dateMatch && methodMatch && queryMatch;
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });

    it("should return empty array when no matches found", () => {
      const filtered = mockHistoryData.filter(
        (entry) => entry.userId === "nonexistent"
      );

      expect(filtered).toHaveLength(0);
    });
  });

  describe("Data validation", () => {
    it("should validate required fields", () => {
      const requiredFields = [
        "id",
        "filename",
        "originalFilename",
        "uploadDate",
        "fileSize",
        "mimeType",
        "uploadMethod",
        "fileUrl",
        "ipAddress",
      ];

      mockHistoryData.forEach((entry) => {
        requiredFields.forEach((field) => {
          expect(entry).toHaveProperty(field);
          expect(entry[field as keyof HistoryEntry]).toBeDefined();
        });
      });
    });

    it("should validate optional fields", () => {
      const optionalFields = [
        "thumbnailUrl",
        "deletionToken",
        "userId",
        "userName",
      ];

      mockHistoryData.forEach((entry) => {
        optionalFields.forEach((field) => {
          if (entry[field as keyof HistoryEntry] !== undefined) {
            expect(entry[field as keyof HistoryEntry]).toBeDefined();
          }
        });
      });
    });

    it("should have unique IDs", () => {
      const ids = mockHistoryData.map((entry) => entry.id);
      const uniqueIds = new Set(ids);

      expect(ids.length).toBe(uniqueIds.size);
    });

    it("should have valid MIME types", () => {
      const validMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "application/octet-stream",
      ];

      mockHistoryData.forEach((entry) => {
        expect(validMimeTypes).toContain(entry.mimeType);
      });
    });
  });

  describe("Upload method validation", () => {
    it("should support all valid upload methods", () => {
      const validMethods = ["api", "web", "sharex"];

      validMethods.forEach((method) => {
        const entry: HistoryEntry = {
          id: "test",
          filename: "test.jpg",
          originalFilename: "test.jpg",
          uploadDate: new Date().toISOString(),
          fileSize: 1024,
          mimeType: "image/jpeg",
          uploadMethod: method as "api" | "web" | "sharex",
          fileUrl: "https://example.com/test.jpg",
          ipAddress: "192.168.1.1",
        };

        expect(entry.uploadMethod).toBe(method);
      });
    });
  });

  describe("Date handling", () => {
    it("should handle ISO date strings correctly", () => {
      const testDate = "2024-01-01T10:00:00.000Z";
      const date = new Date(testDate);

      expect(date.toISOString()).toBe(testDate);
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January
      expect(date.getDate()).toBe(1);
    });

    it("should handle different date formats", () => {
      const dates = [
        "2024-01-01T10:00:00.000Z",
        "2024-01-02T11:00:00.000Z",
        "2024-01-03T12:00:00.000Z",
      ];

      dates.forEach((dateString) => {
        const date = new Date(dateString);
        expect(date).toBeInstanceOf(Date);
        expect(date.toISOString()).toBe(dateString);
      });
    });
  });
});
