import { describe, expect, it } from "vitest";
import {
  cleanText,
  decodeEntities,
  detectBarrier,
  detectWall,
  findElements,
  findTags,
  hasClass,
  humanizeSlug,
  imageAddress,
  imageAddresses,
  isChallengeResponse,
  isEmptyPage,
  metaContent,
  metaImage,
  pageLanguage,
  pageTitle,
  parseAttributes,
  resolveAddress,
  splitTitle,
  textOf,
} from "@/modules/scan-studio/lib/server/sources/html";

const PAGE = "https://reader.example.org/manga/quiet-harbor/12/";

describe("texte", () => {
  it("décode les entités courantes et laisse les inconnues", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#x27; &eacute;t&eacute;")).toBe("a & b <c> \"d\" 'e' été");
    expect(decodeEntities("&inconnue; &#0; &#xD800; &")).toBe("&inconnue; &#0; &#xD800; &");
    expect(decodeEntities("x&#8211;y&hellip;")).toBe("x–y…");
  });

  it("nettoie un texte : contrôles retirés, espaces réunis, longueur bornée", () => {
    expect(cleanText("  The\tQuiet\n\n Harbor  ")).toBe("The Quiet Harbor");
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(cleanText(" \n ")).toBeUndefined();
    expect(cleanText(undefined)).toBeUndefined();
  });

  it("rend le texte d'un fragment sans ses balises, ses scripts ni ses commentaires", () => {
    expect(textOf('<a href="/x"><i class="icon"></i> Quiet <b>Harbor</b> <!-- note --><script>var a = "<b>";</script></a>')).toBe("Quiet Harbor");
    expect(textOf("<i></i>")).toBeUndefined();
  });

  it("donne une forme lisible à un morceau d'adresse", () => {
    expect(humanizeSlug("the-quiet-harbor")).toBe("The Quiet Harbor");
    expect(humanizeSlug("quiet_harbor--2")).toBe("Quiet Harbor 2");
    expect(humanizeSlug("caf%C3%A9-du-port")).toBe("Café Du Port");
    expect(humanizeSlug("100%")).toBe("100%");
    expect(humanizeSlug("---")).toBeUndefined();
  });

  it("découpe un titre de page", () => {
    expect(splitTitle("Quiet Harbor - Chapter 12 | Example Reader")).toEqual(["Quiet Harbor", "Chapter 12", "Example Reader"]);
    expect(splitTitle("Mot-composé sans séparateur")).toEqual(["Mot-composé sans séparateur"]);
    expect(splitTitle(undefined)).toEqual([]);
  });
});

describe("balises et attributs", () => {
  it("lit des attributs entre guillemets doubles, simples, ou sans guillemets", () => {
    expect(parseAttributes(` class="a b" data-id='3' width=120 hidden`)).toEqual({ class: "a b", "data-id": "3", width: "120", hidden: "" });
  });

  it("lit des attributs répartis sur plusieurs lignes, noms en minuscules, premier gagnant", () => {
    const tag = findTags('<IMG\n  ID="image-0"\n  Data-Src="\n\t\t https://cdn.example.org/p/1.jpg"\n  CLASS="page"\n  class="autre">', "img")[0];
    expect(tag.attributes.id).toBe("image-0");
    expect(tag.attributes.class).toBe("page");
    expect(tag.attributes["data-src"]).toContain("https://cdn.example.org/p/1.jpg");
  });

  it("une apostrophe mal fermée dans un `alt` ne fait pas perdre l'adresse", () => {
    const tags = findTags("<img loading='lazy' src='https://img.example.net/a 1.webp' alt='Harbor's page 1'><img src='https://img.example.net/a 2.webp' alt='Harbor's page 2'>", "img");
    expect(tags.map((tag) => tag.attributes.src)).toEqual(["https://img.example.net/a 1.webp", "https://img.example.net/a 2.webp"]);
  });

  it("décode les entités des valeurs", () => {
    expect(findTags('<img src="/p.php?a=1&amp;b=2">', "img")[0].attributes.src).toBe("/p.php?a=1&b=2");
  });

  it("ignore ce qui est en commentaire, dans un script ou dans un style", () => {
    const html = '<!-- <img src="/commentaire.png"> --><script>document.write(\'<img src="/script.png">\')</script><style>a{}</style><img src="/vraie.png"><imgx src="/autre.png">';
    expect(findTags(html, "img").map((tag) => tag.attributes.src)).toEqual(["/vraie.png"]);
  });

  it("rend les éléments avec leur texte, et reconnaît une classe", () => {
    const html = '<ol><li class="item"><a href="/manga/quiet-harbor/"> Quiet\n Harbor </a></li><li class="item active"> Chapter 12</li></ol>';
    const links = findElements(html, "a");
    expect(links).toHaveLength(1);
    expect(links[0].attributes.href).toBe("/manga/quiet-harbor/");
    expect(links[0].text).toBe("Quiet Harbor");
    const items = findElements(html, "li");
    expect(items.map((item) => hasClass(item, "active"))).toEqual([false, true]);
    expect(hasClass(items[1], "act")).toBe(false);
    expect(() => findTags(html, "a b")).toThrow();
  });
});

describe("adresses", () => {
  it("résout une adresse relative d'après celle de la page", () => {
    expect(resolveAddress("/mangas/quiet-harbor/12/3.png?v=fr1", PAGE)).toBe("https://reader.example.org/mangas/quiet-harbor/12/3.png?v=fr1");
    expect(resolveAddress("3.png", PAGE)).toBe("https://reader.example.org/manga/quiet-harbor/12/3.png");
    expect(resolveAddress("//cdn.example.org/a.png", PAGE)).toBe("https://cdn.example.org/a.png");
  });

  it("retire les espaces et retours à la ligne autour, et encode les espaces internes", () => {
    expect(resolveAddress(" \n\t\t http://cdn.example.org//www/root/chap_1.jpg\n", PAGE)).toBe("http://cdn.example.org//www/root/chap_1.jpg");
    expect(resolveAddress("https://img.example.net/images/Quiet Harbor - Tome 2/p 01.webp", PAGE)).toBe("https://img.example.net/images/Quiet%20Harbor%20-%20Tome%202/p%2001.webp");
  });

  it("refuse ce qui n'est pas une adresse http(s)", () => {
    for (const raw of ["", "   ", "#haut", "data:image/gif;base64,R0lGODlhAQABAAAAACw=", "javascript:void(0)", "blob:https://x/y", "https://user:secret@cdn.example.org/a.png", "http://[", undefined]) {
      expect(resolveAddress(raw, PAGE), String(raw)).toBeUndefined();
    }
  });

  it("préfère l'attribut paresseux à `src`, et saute un bouche-trou en ligne", () => {
    const [lazy, plain, placeholder] = findTags(
      '<img src="/blank.gif" data-src="/p/1.jpg"><img src="/p/2.jpg"><img src="data:image/gif;base64,AAAA" data-lazy-src="/p/3.jpg">',
      "img"
    );
    expect(imageAddress(lazy, PAGE)).toBe("https://reader.example.org/p/1.jpg");
    expect(imageAddress(plain, PAGE)).toBe("https://reader.example.org/p/2.jpg");
    expect(imageAddress(placeholder, PAGE)).toBe("https://reader.example.org/p/3.jpg");
    expect(imageAddress({ attributes: { alt: "sans adresse" } }, PAGE)).toBeUndefined();
  });

  it("liste les images retenues dans l'ordre du document, chacune une fois", () => {
    const html = `
      <img class="logo" src="/logo.png">
      <img class="page" data-src="/p/2.jpg" src="/blank.gif"><noscript><img class="page" src="/p/2.jpg"></noscript>
      <img class="page" src="/p/1.jpg">
      <img class="page">`;
    expect(imageAddresses(html, PAGE, (tag) => hasClass(tag, "page"))).toEqual(["https://reader.example.org/p/2.jpg", "https://reader.example.org/p/1.jpg"]);
    expect(imageAddresses(html, PAGE, (_tag, address) => address.pathname === "/logo.png")).toEqual(["https://reader.example.org/logo.png"]);
  });
});

describe("ce que la page dit d'elle-même", () => {
  const html = `<!doctype html><html lang="fr-FR" dir="ltr"><head>
    <title>
      Quiet Harbor &#8211; Chapitre 12 | Example Reader
    </title>
    <meta property="og:title" content="Quiet Harbor 12 &amp; suite" />
    <meta property='og:image' content='/covers/quiet harbor.jpg'>
    <meta name="Description" content="  Une description d'essai.  ">
    <meta property="og:site_name" content="">
  </head><body></body></html>`;

  it("lit le titre, les balises `og:` et la langue", () => {
    expect(pageTitle(html)).toBe("Quiet Harbor – Chapitre 12 | Example Reader");
    expect(metaContent(html, "og:title")).toBe("Quiet Harbor 12 & suite");
    expect(metaContent(html, "description")).toBe("Une description d'essai.");
    expect(metaContent(html, "og:site_name")).toBeUndefined();
    expect(metaContent(html, "og:url")).toBeUndefined();
    expect(metaImage(html, PAGE)).toBe("https://reader.example.org/covers/quiet%20harbor.jpg");
    expect(pageLanguage(html)).toBe("fr");
  });

  it("se passe de ce que la page ne dit pas", () => {
    const bare = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Rien.</p></body></html>';
    expect(pageTitle(bare)).toBeUndefined();
    expect(metaImage(bare, PAGE)).toBeUndefined();
    expect(pageLanguage(bare)).toBeUndefined();
    expect(pageLanguage('<html lang="pas une langue">')).toBeUndefined();
  });
});

describe("ce qui n'est pas la page attendue", () => {
  const html = { "content-type": "text/html; charset=UTF-8" };
  const challenge = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body><noscript>Enable JavaScript and cookies to continue</noscript><script>window._cf_chl_opt = {};</script></body></html>';
  /** Une page ordinaire d'un site derrière Cloudflare : script de mesure, captcha des commentaires, fenêtre de connexion. */
  const ordinary = `<html><head><title>Quiet Harbor - Chapter 12</title></head><body>
    <img class="page" src="/p/1.jpg">
    <form id="comment"><div class="cf-turnstile" data-sitekey="x"></div></form>
    <div class="modal"><input type="password" name="pwd"><a href="/wp-login.php?action=lostpassword">Lost your password?</a></div>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
    <script>(function(){var s=document.createElement('script');s.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';})();</script>
  </body></html>`;

  it("reconnaît une vérification du navigateur à son en-tête, à ses marques ou à son titre", () => {
    expect(isChallengeResponse(403, { ...html, "cf-mitigated": "challenge" }, "<html></html>")).toBe(true);
    expect(isChallengeResponse(403, html, challenge)).toBe(true);
    expect(isChallengeResponse(503, html, Buffer.from(challenge))).toBe(true);
    expect(isChallengeResponse(503, html, "<html><head><title>Just a moment...</title></head></html>")).toBe(true);
    expect(isChallengeResponse(403, html, "<html><head><title>Attention Required! | Cloudflare</title></head></html>")).toBe(true);
  });

  it("ne prend pas une page ordinaire, une panne ou une image pour une vérification", () => {
    expect(isChallengeResponse(200, html, ordinary)).toBe(false);
    expect(isChallengeResponse(200, html, "<html><head><title>Just a moment with the harbor</title></head><body><img src='/p/1.jpg'></body></html>")).toBe(false);
    expect(isChallengeResponse(503, html, "<html><head><title>503 Service Unavailable</title></head></html>")).toBe(false);
    expect(isChallengeResponse(502, { "content-type": "application/json" }, '{"error":"_cf_chl_opt"}')).toBe(false);
    expect(isChallengeResponse(403, {}, "")).toBe(false);
  });

  it("dit ce que la réponse a d'une barrière : vérification, connexion, ou rien", () => {
    expect(detectBarrier({ status: 403, headers: html, html: challenge, url: PAGE })).toBe("challenge");
    expect(detectBarrier({ status: 200, headers: html, html: "<html><title>Sign in</title></html>", url: PAGE })).toBe("login");
    expect(detectBarrier({ status: 200, headers: html, html: "<html></html>", url: "https://reader.example.org/wp-login.php?redirect_to=x" })).toBe("login");
    expect(detectBarrier({ status: 200, headers: html, html: "<html></html>", url: "https://reader.example.org/connexion" })).toBe("login");
    expect(detectBarrier({ status: 401, headers: html, html: "<html></html>", url: PAGE })).toBe("login");
    expect(detectBarrier({ status: 200, headers: html, html: ordinary, url: PAGE })).toBeNull();
    expect(detectBarrier({ status: 404, headers: html, html: "<html><title>Page introuvable</title></html>", url: PAGE })).toBeNull();
    // Une série dont l'adresse contient « login » au milieu d'un mot n'est pas une page de connexion.
    expect(detectBarrier({ status: 200, headers: html, html: "<html></html>", url: "https://reader.example.org/manga/the-login-chronicles/3/" })).toBeNull();
  });

  it("explique l'absence d'images : compte demandé, âge à confirmer, captcha", () => {
    expect(detectWall("<div class='reading-content'><p>You must be logged in to read this chapter.</p></div>")).toBe("login");
    expect(detectWall("<p>Connectez-vous pour lire ce chapitre.</p>")).toBe("login");
    expect(detectWall("<h2>Age verification</h2><p>This series is for mature readers.</p>")).toBe("age-gate");
    expect(detectWall('<form><div class="g-recaptcha" data-sitekey="x"></div></form>')).toBe("challenge");
    expect(detectWall('<form><div class="g-recaptcha" data-sitekey="x"></div></form>', { captcha: false })).toBeNull();
    expect(detectWall("<p>Chapitre 12</p>")).toBeNull();
    // La fenêtre de connexion ordinaire d'un thème ne dit pas que la page est réservée.
    expect(detectWall(ordinary, { captcha: false })).toBeNull();
    // Un texte dans un script n'est pas un texte de la page.
    expect(detectWall('<script>var message = "You must be logged in";</script><p>Rien.</p>')).toBeNull();
  });

  it("reconnaît une page vide", () => {
    expect(isEmptyPage("")).toBe(true);
    expect(isEmptyPage("<html><head><title>Un titre assez long pour compter</title><style>body{}</style></head><body>  <div></div> </body></html>")).toBe(true);
    expect(isEmptyPage("<html><body><img src='/p/1.jpg'></body></html>")).toBe(false);
    expect(isEmptyPage("<html><body><p>Ce chapitre a été retiré à la demande de son éditeur.</p></body></html>")).toBe(false);
  });
});
