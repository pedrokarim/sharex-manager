import { describe, expect, it } from "vitest";
import {
  buildMobileConfig,
  buildSxcu,
  canUpload,
  DEFAULT_SXCU_NAME,
  looksLikeApiKey,
  serializeSxcu,
  sxcuFileName,
} from "@/lib/integrations/client-config";

/**
 * Fichiers remis aux outils d'envoi : le `.sxcu` de ShareX et de fu, la
 * configuration du QR code de l'application mobile.
 */

const KEY = "sk_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
const none = { uploadImages: false, uploadText: false, uploadFiles: false };

describe("buildSxcu", () => {
  it("ouvre les destinations selon les permissions, dans l'ordre images, texte, fichiers", () => {
    const all = buildSxcu({ baseUrl: "https://sxm.example.test", key: KEY, permissions: { uploadImages: true, uploadText: true, uploadFiles: true } });
    expect(all.DestinationType).toBe("ImageUploader, TextUploader, FileUploader");

    const images = buildSxcu({ baseUrl: "https://sxm.example.test", key: KEY, permissions: { ...none, uploadImages: true } });
    expect(images.DestinationType).toBe("ImageUploader");

    const filesOnly = buildSxcu({ baseUrl: "https://sxm.example.test", key: KEY, permissions: { ...none, uploadFiles: true, extractColors: true } });
    expect(filesOnly.DestinationType).toBe("FileUploader");

    expect(canUpload(none)).toBe(false);
    expect(canUpload({ ...none, extractColors: true })).toBe(false);
    expect(canUpload({ ...none, uploadText: true })).toBe(true);
  });

  it("garde la forme que ShareX et fu importent", () => {
    const config = buildSxcu({
      baseUrl: "https://sxm.example.test/",
      key: KEY,
      permissions: { ...none, uploadImages: true },
      name: "Flameshot – Linux",
    });
    expect(config).toEqual({
      Version: "14.0.0",
      Name: "Flameshot – Linux",
      DestinationType: "ImageUploader",
      RequestMethod: "POST",
      RequestURL: "https://sxm.example.test/api/upload",
      Headers: { "x-api-key": KEY },
      Body: "MultipartFormData",
      FileFormName: "file",
      URL: "{json:url}",
      ThumbnailURL: "{json:thumbnail_url}",
      DeletionURL: "{json:deletion_url}",
      ErrorMessage: "{json:error}",
    });
    expect(JSON.parse(serializeSxcu(config))).toEqual(config);
  });

  it("nomme l'uploader « ShareX Upload » sans nom donné", () => {
    expect(buildSxcu({ baseUrl: "https://a.test", key: KEY, permissions: { ...none, uploadImages: true } }).Name).toBe(DEFAULT_SXCU_NAME);
    expect(buildSxcu({ baseUrl: "https://a.test", key: KEY, permissions: { ...none, uploadImages: true }, name: "  " }).Name).toBe("ShareX Upload");
  });
});

describe("sxcuFileName", () => {
  it("tire un nom de fichier propre du nom de la clé", () => {
    expect(sxcuFileName("ShareX – Windows")).toBe("sharex-windows.sxcu");
    expect(sxcuFileName("Flameshot – Linux")).toBe("flameshot-linux.sxcu");
    expect(sxcuFileName("Poste de Léa / bureau")).toBe("poste-de-lea-bureau.sxcu");
    expect(sxcuFileName("../../etc/passwd")).toBe("etc-passwd.sxcu");
    expect(sxcuFileName("— ✦ —")).toBe("sharex-manager.sxcu");
    expect(sxcuFileName("a".repeat(120))).toBe(`${"a".repeat(60)}.sxcu`);
  });
});

describe("buildMobileConfig", () => {
  it("rend exactement le format lu par QRCodeScannerScreen", () => {
    const permissions = { uploadImages: true, uploadText: false, uploadFiles: true, extractColors: false };
    const config = buildMobileConfig({ baseUrl: "https://sxm.example.test/", key: KEY, permissions });
    expect(config).toEqual({
      type: "sharex-mobile-config",
      version: "1.0.0",
      serverUrl: "https://sxm.example.test",
      apiKey: KEY,
      permissions,
    });
    // L'ordre des champs du JSON reste celui que l'application a toujours reçu.
    expect(Object.keys(JSON.parse(JSON.stringify(config)))).toEqual(["type", "version", "serverUrl", "apiKey", "permissions"]);
  });
});

describe("looksLikeApiKey", () => {
  it("accepte une clé d'un seul bloc, refuse le reste", () => {
    expect(looksLikeApiKey(KEY)).toBe(true);
    expect(looksLikeApiKey(`  ${KEY}  `)).toBe(true);
    expect(looksLikeApiKey("abcdefgh")).toBe(true);
    expect(looksLikeApiKey("sk_abc")).toBe(false);
    expect(looksLikeApiKey("sk_abc def ghi jkl")).toBe(false);
    expect(looksLikeApiKey("")).toBe(false);
  });
});
