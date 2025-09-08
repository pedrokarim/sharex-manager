import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cn,
  formatBytes,
  generateId,
  isEdgeRuntime,
  capitalize,
  hslToHex,
  hexToHsl,
} from "../../lib/utils";

describe("lib/utils", () => {
  describe("cn", () => {
    it("should merge class names correctly", () => {
      expect(cn("class1", "class2")).toBe("class1 class2");
    });

    it("should handle conditional classes", () => {
      expect(cn("base", { conditional: true, hidden: false })).toBe(
        "base conditional"
      );
    });

    it("should merge conflicting Tailwind classes", () => {
      expect(cn("px-2 px-4")).toBe("px-4");
    });

    it("should handle empty inputs", () => {
      expect(cn()).toBe("");
      expect(cn("")).toBe("");
    });
  });

  describe("formatBytes", () => {
    it("should format bytes correctly", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    });

    it("should handle decimal places", () => {
      expect(formatBytes(1536, 0)).toBe("2 KB");
      expect(formatBytes(1536, 1)).toBe("1.5 KB");
      expect(formatBytes(1536, 3)).toBe("1.5 KB");
    });

    it("should handle negative decimals", () => {
      expect(formatBytes(1024, -1)).toBe("1 KB");
    });

    it("should handle large numbers", () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
    });
  });

  describe("generateId", () => {
    it("should generate id with default length", () => {
      const id = generateId();
      expect(id).toHaveLength(12);
      expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it("should generate id with custom length", () => {
      const id = generateId(8);
      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it("should generate unique ids", () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it("should handle zero length", () => {
      const id = generateId(0);
      expect(id).toBe("");
    });
  });

  describe("isEdgeRuntime", () => {
    it("should return true when NEXT_RUNTIME is edge", () => {
      const originalRuntime = process.env.NEXT_RUNTIME;
      process.env.NEXT_RUNTIME = "edge";
      expect(isEdgeRuntime()).toBe(true);
      process.env.NEXT_RUNTIME = originalRuntime;
    });

    it("should return false when NEXT_RUNTIME is not edge", () => {
      const originalRuntime = process.env.NEXT_RUNTIME;
      process.env.NEXT_RUNTIME = "nodejs";
      expect(isEdgeRuntime()).toBe(false);
      process.env.NEXT_RUNTIME = originalRuntime;
    });

    it("should return false when NEXT_RUNTIME is undefined", () => {
      const originalRuntime = process.env.NEXT_RUNTIME;
      delete process.env.NEXT_RUNTIME;
      expect(isEdgeRuntime()).toBe(false);
      process.env.NEXT_RUNTIME = originalRuntime;
    });
  });

  describe("capitalize", () => {
    it("should capitalize first letter", () => {
      expect(capitalize("hello")).toBe("Hello");
      expect(capitalize("world")).toBe("World");
    });

    it("should handle empty string", () => {
      expect(capitalize("")).toBe("");
    });

    it("should handle single character", () => {
      expect(capitalize("a")).toBe("A");
    });

    it("should handle already capitalized string", () => {
      expect(capitalize("Hello")).toBe("Hello");
    });

    it("should handle string with numbers", () => {
      expect(capitalize("123abc")).toBe("123abc");
    });
  });

  describe("hslToHex", () => {
    it("should convert HSL to hex correctly", () => {
      expect(hslToHex(0, 100, 50)).toBe("#ff0000"); // Red
      expect(hslToHex(120, 100, 50)).toBe("#00ff00"); // Green
      expect(hslToHex(240, 100, 50)).toBe("#0000ff"); // Blue
    });

    it("should handle grayscale colors", () => {
      expect(hslToHex(0, 0, 0)).toBe("#000000"); // Black
      expect(hslToHex(0, 0, 100)).toBe("#ffffff"); // White
      expect(hslToHex(0, 0, 50)).toBe("#808080"); // Gray
    });

    it("should handle edge cases", () => {
      expect(hslToHex(360, 100, 50)).toBe("#ff0000"); // 360° = 0°
      expect(hslToHex(180, 50, 25)).toBe("#206060"); // Custom color
    });
  });

  describe("hexToHsl", () => {
    it("should convert hex to HSL correctly", () => {
      expect(hexToHsl("#ff0000")).toBe("0 100% 50%"); // Red
      expect(hexToHsl("#00ff00")).toBe("120 100% 50%"); // Green
      expect(hexToHsl("#0000ff")).toBe("240 100% 50%"); // Blue
    });

    it("should handle hex without hash", () => {
      expect(hexToHsl("ff0000")).toBe("0 100% 50%");
      expect(hexToHsl("00ff00")).toBe("120 100% 50%");
    });

    it("should handle grayscale colors", () => {
      expect(hexToHsl("#000000")).toBe("0 0% 0%"); // Black
      expect(hexToHsl("#ffffff")).toBe("0 0% 100%"); // White
      expect(hexToHsl("#808080")).toBe("0 0% 50%"); // Gray
    });

    it("should handle mixed case hex", () => {
      expect(hexToHsl("#FF0000")).toBe("0 100% 50%");
      expect(hexToHsl("#Ff0000")).toBe("0 100% 50%");
    });

    it("should handle custom colors", () => {
      expect(hexToHsl("#206060")).toBe("180 50% 25%");
    });
  });

  describe("Color conversion roundtrip", () => {
    it("should maintain consistency between hslToHex and hexToHsl", () => {
      const testColors = [
        { h: 0, s: 100, l: 50 },
        { h: 120, s: 100, l: 50 },
        { h: 240, s: 100, l: 50 },
        { h: 180, s: 50, l: 25 },
        { h: 45, s: 75, l: 60 },
      ];

      testColors.forEach(({ h, s, l }) => {
        const hex = hslToHex(h, s, l);
        const hsl = hexToHsl(hex);

        // Parse the HSL result
        const [hResult, sResult, lResult] = hsl
          .split(" ")
          .map((val) => (val.includes("%") ? parseInt(val) : parseInt(val)));

        // Allow for small rounding differences
        expect(Math.abs(hResult - h)).toBeLessThanOrEqual(1);
        expect(Math.abs(sResult - s)).toBeLessThanOrEqual(1);
        expect(Math.abs(lResult - l)).toBeLessThanOrEqual(1);
      });
    });
  });
});
