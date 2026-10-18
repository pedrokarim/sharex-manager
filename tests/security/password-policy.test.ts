import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import bcrypt from "bcryptjs";
import {
  BCRYPT_COST,
  checkPassword,
  getPasswordPolicy,
  hashPassword,
  isCommonPassword,
  verifyPassword,
} from "@/lib/security/password-policy";
import { COMMON_PASSWORDS } from "@/lib/security/common-passwords";
import { setSecuritySettingsPath, updateSecuritySettings } from "@/lib/security/settings";

let directory = "";

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-password-policy-"));
  setSecuritySettingsPath(path.join(directory, "security.json"));
});

afterEach(() => {
  setSecuritySettingsPath(null);
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("politique des mots de passe", () => {
  it("exige 12 caractères par défaut", () => {
    expect(getPasswordPolicy()).toEqual({ minLength: 12, rejectCommon: true });
    expect(checkPassword("court-mais-")).toMatchObject({ ok: false, reason: "too-short" });
    expect(checkPassword("un mot de passe assez long")).toEqual({ ok: true });
  });

  it("suit la longueur réglée dans l'écran Sécurité", () => {
    updateSecuritySettings({ passwords: { minLength: 16 } });
    const check = checkPassword("quinze-caracter");
    expect(check).toMatchObject({ ok: false, reason: "too-short" });
    expect(check.ok ? "" : check.message).toContain("16");
  });

  it("refuse les mots de passe les plus répandus, casse ignorée", () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThanOrEqual(900);
    expect(isCommonPassword("QwertyQwerty")).toBe(true);
    expect(checkPassword("qwertyqwerty")).toMatchObject({ ok: false, reason: "common" });
    expect(checkPassword("qwertyqwerty", { minLength: 12, rejectCommon: false })).toEqual({ ok: true });
    expect(checkPassword("password1", { minLength: 8, rejectCommon: true })).toMatchObject({ reason: "common" });
  });

  it("refuse un mot de passe démesuré", () => {
    expect(checkPassword("x".repeat(129))).toMatchObject({ ok: false, reason: "too-long" });
  });

  it("hache avec un seul coût bcrypt, et vérifie les anciens condensats", async () => {
    const hash = await hashPassword("un mot de passe assez long");
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST);
    expect(await verifyPassword("un mot de passe assez long", hash)).toBe(true);
    const legacy = await bcrypt.hash("ancien-mot-de-passe", 4);
    expect(await verifyPassword("ancien-mot-de-passe", legacy)).toBe(true);
  });
});
