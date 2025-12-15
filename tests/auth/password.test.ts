import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

describe("Password Hashing", () => {
  const password = "test123";

  it("should hash password correctly", async () => {
    const hashedPassword = await bcrypt.hash(password, 10);
    expect(hashedPassword).not.toBe(password);
    expect(hashedPassword.startsWith("$2b$")).toBe(true);
  });

  it("should verify password correctly", async () => {
    const hashedPassword = await bcrypt.hash(password, 10);
    const isValid = await bcrypt.compare(password, hashedPassword);
    const isInvalid = await bcrypt.compare("wrongpassword", hashedPassword);

    expect(isValid).toBe(true);
    expect(isInvalid).toBe(false);
  });
});
