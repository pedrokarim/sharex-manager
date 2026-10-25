import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SVG_LIMITS, SvgRefusedError, looksLikeSvg, rasterSize, rasterizeSvg, sanitizeSvg } from "@/modules/clip-studio/lib/svg-logo";

const svg = (body: string, root = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${root}>${body}</svg>`;

/** Ce qui ne doit jamais survivre au nettoyage, quelle que soit sa forme. */
const DANGEROUS = /script|onload|onclick|onerror|onmouseover|foreignObject|iframe|javascript:|https?:|file:|@import|evil|<animate|<set|data:image\/svg/i;

/** Le document réécrit, sans les déclarations d'espaces de noms de sa racine (des adresses http). */
const body = (markup: string) => markup.replace(' xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"', '');

/** Pixel RGBA d'un PNG. */
async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return Array.from(data.subarray(offset, offset + 4));
}

describe("logos SVG : nettoyage", () => {
  it("retire scripts, gestionnaires d'évènements, foreignObject et animations", () => {
    const result = sanitizeSvg(
      svg(
        `<script>alert(1)</script>` +
          `<script xlink:href="https://evil.example/x.js"/>` +
          `<rect width="10" height="10" onclick="alert(1)" onmouseover="alert(2)" fill="#f00"/>` +
          `<foreignObject width="100" height="100"><iframe xmlns="http://www.w3.org/1999/xhtml" src="https://evil.example"/></foreignObject>` +
          `<a xlink:href="javascript:alert(1)"><circle cx="50" cy="50" r="10"/></a>` +
          `<circle cx="20" cy="20" r="5"><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="fill" to="red"/></circle>`,
        'viewBox="0 0 100 100" onload="alert(1)"'
      )
    );
    expect(body(result.markup)).not.toMatch(DANGEROUS);
    // Le dessin reste : le rectangle, le cercle du lien (devenu un groupe) et l'autre cercle.
    expect(result.markup).toContain('<rect width="10" height="10" fill="#f00"/>');
    expect(result.markup).toContain('<g><circle cx="50" cy="50" r="10"/></g>');
    expect(result.markup.match(/<circle/g)).toHaveLength(2);
    expect(result.removed).toEqual(expect.arrayContaining(["script", "foreignObject", "animate", "set", "@onclick", "@onload"]));
  });

  it("ne garde aucune référence vers l'extérieur : images, use, url(), styles", () => {
    const result = sanitizeSvg(
      svg(
        `<image xlink:href="https://evil.example/x.png" width="10" height="10"/>` +
          `<image href="file:///etc/passwd" width="10" height="10"/>` +
          `<image xlink:href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="10" height="10"/>` +
          `<use xlink:href="https://evil.example/sprite.svg#a"/>` +
          `<use xlink:href="#missing"/>` +
          `<rect width="10" height="10" fill="url(https://evil.example/#g)" stroke="url('#g')"/>` +
          `<rect width="10" height="10" style="fill:url(http://evil.example/a);stroke:#000;behavior:url(x.htc)"/>` +
          `<rect width="10" height="10" style="fill:u\\72 l(http://evil.example/a)"/>` +
          `<style>@import url(https://evil.example/a.css); .a{fill:red}</style>` +
          `<style>.b{fill:url(https://evil.example/p)}</style>` +
          `<linearGradient id="g" xlink:href="https://evil.example/g.svg#x"><stop offset="0" stop-color="#00f"/></linearGradient>` +
          `<a xlink:href="https://evil.example"><rect width="5" height="5"/></a>`
      )
    );
    expect(body(result.markup)).not.toMatch(DANGEROUS);
    expect(result.markup).not.toContain("<image");
    expect(result.markup).not.toContain("<use");
    expect(result.markup).not.toContain("<style");
    // Une référence interne reste : le dégradé du document.
    expect(result.markup).toContain(`stroke="url('#g')"`);
    expect(result.markup).toContain('style="stroke:#000"');
  });

  it("garde une feuille de style sûre, une image incorporée en PNG et un use interne", () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
    const result = sanitizeSvg(
      svg(
        `<defs><path id="p" d="M0 0h10v10z"/></defs>` +
          `<style><![CDATA[.a{fill:#123456} .b{fill:url(#g)}]]></style>` +
          `<use xlink:href="#p" class="a"/>` +
          `<image xlink:href="${png}" width="1" height="1"/>` +
          `<text x="1" y="9" font-family="Inter">A &amp; B</text>`
      )
    );
    expect(result.markup).toContain("<style>.a{fill:#123456} .b{fill:url(#g)}</style>");
    expect(result.markup).toContain('<use xlink:href="#p" class="a"/>');
    expect(result.markup).toContain(`<image xlink:href="${png}"`);
    expect(result.markup).toContain(">A &amp; B</text>");
  });

  it("retire les éléments et attributs des logiciels de dessin, les instructions et les commentaires", () => {
    const result = sanitizeSvg(
      `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet href="https://evil.example/a.css"?>` +
        `<!-- commentaire -->` +
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 10 10" inkscape:version="1.3">` +
        `<sodipodi:namedview pagecolor="#fff"/><metadata><title>x</title></metadata>` +
        `<g inkscape:label="Calque 1" inkscape:groupmode="layer"><path d="M0 0h10v10z" fill="#000"/></g></svg>`
    );
    expect(result.markup).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10" viewBox="0 0 10 10"><g><path d="M0 0h10v10z" fill="#000"/></g></svg>'
    );
    expect(result.removed).toEqual(expect.arrayContaining(["?xml-stylesheet", "sodipodi:namedview", "metadata", "@inkscape:label"]));
    // Le résultat est lui-même un SVG sûr, que le nettoyage laisse identique.
    expect(sanitizeSvg(result.markup).markup).toBe(result.markup);
  });

  it("refuse un DOCTYPE (entités en cascade), un XML invalide ou ce qui n'est pas un SVG", () => {
    const laughs = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "lol"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>&b;</text></svg>`;
    expect(() => sanitizeSvg(laughs)).toThrow(SvgRefusedError);
    expect(() => sanitizeSvg(laughs)).toThrow(/DOCTYPE/);
    expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect></svg>')).toThrow(/illisible/);
    expect(() => sanitizeSvg('<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>')).toThrow(/pas un SVG/);
    expect(() => sanitizeSvg("pas du XML")).toThrow(SvgRefusedError);
  });

  it("refuse les références qui se multiplient ou bouclent", () => {
    // Dix use par niveau, cinq niveaux : 100 000 éléments dessinés pour 50 écrits.
    let defs = `<path id="l0" d="M0 0h1v1z"/>`;
    for (let level = 1; level <= 5; level++) {
      defs += `<g id="l${level}">${Array.from({ length: 10 }, () => `<use xlink:href="#l${level - 1}"/>`).join("")}</g>`;
    }
    expect(() => sanitizeSvg(svg(`<defs>${defs}</defs><use xlink:href="#l5"/>`))).toThrow(/trop complexe/);
    expect(() => sanitizeSvg(svg(`<g id="a"><use xlink:href="#b"/></g><g id="b"><use xlink:href="#a"/></g>`))).toThrow(/boucle/);
    // Un motif appliqué par une feuille de style à beaucoup d'éléments compte pour chacun.
    const pattern = `<pattern id="m" width="1" height="1">${"<rect width='1' height='1'/>".repeat(100)}</pattern>`;
    expect(() => sanitizeSvg(svg(`<style>rect{fill:url(#m)}</style>${pattern}${"<rect width='1' height='1'/>".repeat(300)}`))).toThrow(/trop complexe/);
  });

  it("borne le poids, le nombre d'éléments et la profondeur", () => {
    expect(() => sanitizeSvg(svg(`<path d="M0 0${" l1 1".repeat(SVG_LIMITS.maxBytes / 5)}"/>`))).toThrow(/trop lourd/);
    expect(() => sanitizeSvg(svg("<rect/>".repeat(SVG_LIMITS.maxElements + 1)))).toThrow(/trop d'éléments/);
    expect(() => sanitizeSvg(svg("<g>".repeat(SVG_LIMITS.maxDepth + 1) + "</g>".repeat(SVG_LIMITS.maxDepth + 1)))).toThrow(/imbriqué/);
  });

  it("exige une viewBox, ou la déduit d'une largeur et d'une hauteur absolues", () => {
    expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="30"><rect width="1" height="1"/></svg>')).toMatchObject({ width: 120, height: 30 });
    expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="36pt"><rect width="1" height="1"/></svg>')).toMatchObject({ width: 96, height: 48 });
    expect(sanitizeSvg('<svg width="10" height="20"><rect width="1" height="1"/></svg>').markup).toContain('viewBox="0 0 10 20"');
    expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect/></svg>')).toThrow(/sans dimensions/);
    expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 10"><rect/></svg>')).toThrow(/sans dimensions/);
  });

  it("reconnaît un SVG à son type ou à son contenu, jamais un PNG", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: "#000" } }).png().toBuffer();
    expect(looksLikeSvg(Buffer.from(svg("")), "image/png")).toBe(true);
    expect(looksLikeSvg(Buffer.from(`﻿<?xml version="1.0"?>\n<!-- x -->\n<svg viewBox="0 0 1 1"/>`))).toBe(true);
    expect(looksLikeSvg(Buffer.from("x"), "image/svg+xml")).toBe(true);
    expect(looksLikeSvg(png, "image/png")).toBe(false);
  });
});

describe("logos SVG : rastérisation", () => {
  /** Logo d'essai : un carré rouge par classe CSS à gauche, un disque bleu en dégradé à droite, du vide entre les deux. */
  const LOGO = svg(
    `<style>.mark{fill:#ff0000}</style>` +
      `<defs><linearGradient id="g"><stop offset="0" stop-color="#0000ff"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>` +
      `<rect class="mark" x="0" y="0" width="80" height="100"/>` +
      `<circle cx="150" cy="50" r="40" fill="url(#g)"/>`,
    'viewBox="0 0 200 100"'
  );

  it("rend un PNG transparent de 512 px sur le grand côté, feuille de style et dégradé compris", async () => {
    const raster = await rasterizeSvg(Buffer.from(LOGO));
    expect(raster).toMatchObject({ width: 512, height: 256 });
    const metadata = await sharp(raster.buffer).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 512, height: 256, hasAlpha: true });
    expect(await pixel(raster.buffer, 20, 128)).toEqual([255, 0, 0, 255]);
    expect(await pixel(raster.buffer, 384, 128)).toEqual([0, 0, 255, 255]);
    // Entre les deux, et dans les coins du disque : transparent.
    expect((await pixel(raster.buffer, 260, 128))[3]).toBe(0);
    expect((await pixel(raster.buffer, 511, 0))[3]).toBe(0);
    expect(raster.coverage).toBeGreaterThan(0.4);
    expect(raster.coverage).toBeLessThan(0.8);
  });

  it("garde les proportions, et un petit côté d'icône pour un logo allongé", () => {
    expect(rasterSize(200, 100)).toEqual({ width: 512, height: 256 });
    expect(rasterSize(10, 40)).toEqual({ width: 128, height: 512 });
    expect(rasterSize(24, 24)).toEqual({ width: 512, height: 512 });
    // Logo en longueur (6:1) : 128 px de haut plutôt que 85.
    expect(rasterSize(600, 100)).toEqual({ width: 768, height: 128 });
    // Au-delà de 8:1, le grand côté plafonne : le contrôle d'icône écartera ce bandeau.
    expect(rasterSize(1000, 10)).toEqual({ width: 1024, height: 10 });
  });

  it("dessine un SVG malveillant une fois nettoyé, sans rien de ce qu'il contenait", async () => {
    const raster = await rasterizeSvg(
      svg(
        `<script>while(true){}</script><image xlink:href="https://evil.example/x.png" x="0" y="0" width="100" height="100"/>` +
          `<rect width="50" height="50" fill="#00ff00" onload="alert(1)"/>`
      )
    );
    expect(raster).toMatchObject({ width: 512, height: 512 });
    expect(await pixel(raster.buffer, 10, 10)).toEqual([0, 255, 0, 255]);
    expect((await pixel(raster.buffer, 400, 400))[3]).toBe(0);
    expect(raster.removed).toEqual(expect.arrayContaining(["script", "image@href", "@onload"]));
  });

  it("refuse un SVG qui ne dessine rien de visible", async () => {
    await expect(rasterizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"/>')).rejects.toThrow(/rien de visible/);
    await expect(rasterizeSvg(svg('<rect x="500" y="500" width="10" height="10"/>'))).rejects.toThrow(SvgRefusedError);
  });
});
