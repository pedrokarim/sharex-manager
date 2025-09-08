import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { storageConfig, getAbsoluteUploadPath } from "../../lib/config";

describe("lib/config", () => {
  describe("storageConfig", () => {
    it("should use default upload path when UPLOAD_PATH is not set", () => {
      expect(storageConfig.uploadPath).toBe("./uploads");
    });

    it("should have correct interface structure", () => {
      expect(storageConfig).toHaveProperty("uploadPath");
      expect(typeof storageConfig.uploadPath).toBe("string");
    });
  });

  describe("getAbsoluteUploadPath", () => {
    it("should return a string path", () => {
      const result = getAbsoluteUploadPath();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle default upload path", () => {
      const result = getAbsoluteUploadPath();
      expect(result).toContain("uploads");
    });
  });
});
