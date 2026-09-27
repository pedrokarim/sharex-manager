import { describe, expect, test } from "vitest";
import { decodeImage, sniffImage } from "../../modules/ai-image-gen/lib/image-type";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

describe("sniffImage", () => {
  test("reconnaît les formats acceptés par leurs octets", () => {
    expect(sniffImage(png)?.extension).toBe("png");
    expect(sniffImage(jpeg)?.extension).toBe("jpg");
    expect(sniffImage(webp)?.extension).toBe("webp");
    expect(sniffImage(Buffer.from("GIF89a"))?.extension).toBe("gif");
  });

  test("refuse le reste, SVG compris", () => {
    expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(Buffer.from("export const x = 1;"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("decodeImage", () => {
  test("l'extension vient des octets, jamais du type annoncé", () => {
    // Le type annoncé n'est même pas lu : un `..\` ne peut plus finir dans le nom.
    expect(decodeImage(png.toString("base64")).kind.extension).toBe("png");
  });

  test("refuse un contenu qui n'est pas une image", () => {
    expect(() => decodeImage(Buffer.from("console.log(1)").toString("base64"))).toThrow();
  });
});
