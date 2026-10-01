import { describe, expect, it } from "vitest";
import { canBeCleaned } from "@/lib/provenance/client";

describe("version propre : formats proposés", () => {
  it("ne propose le retrait que pour les formats gérés sans recompression", () => {
    for (const name of ["a.png", "b.JPG", "c.jpeg", "d.webp"]) expect(canBeCleaned(name)).toBe(true);
    for (const name of ["e.gif", "f.mp4", "g.zip", "png", "h.png.txt"]) expect(canBeCleaned(name)).toBe(false);
  });
});
