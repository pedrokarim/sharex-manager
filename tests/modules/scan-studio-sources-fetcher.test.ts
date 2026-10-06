import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbortedError, SourceError } from "@/modules/scan-studio/lib/server/sources/adapter";
import {
  POLITENESS,
  PoliteFetcher,
  TransportRefusal,
  USER_AGENT,
  createSafeLookup,
  hostMatches,
  retryAfterMs,
  type Clock,
  type TransportRequest,
  type TransportResponse,
} from "@/modules/scan-studio/lib/server/sources/fetcher";

const START = 1_800_000_000_000;

/** Horloge de test : attendre avance le temps, sans rien attendre. */
function fakeClock() {
  let time = START;
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => time,
    sleep: async (milliseconds, signal) => {
      if (signal?.aborted) throw new AbortedError();
      sleeps.push(milliseconds);
      time += milliseconds;
    },
  };
  return { clock, sleeps, advance: (milliseconds: number) => (time += milliseconds) };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): TransportResponse => ({
  status,
  headers: { "content-type": "application/json", ...headers },
  body: Buffer.from(JSON.stringify(body)),
});

/** Faux transport : note chaque requête et l'heure à laquelle elle part. */
function setup(respond: (request: TransportRequest, index: number) => TransportResponse | Promise<TransportResponse>, hosts = ["site.example.org", "img.example.org"]) {
  const time = fakeClock();
  const calls: { url: string; method: string; headers: Record<string, string>; at: number; body?: string }[] = [];
  const fetcher = new PoliteFetcher({
    hosts,
    clock: time.clock,
    transport: async (request) => {
      calls.push({ url: request.url.toString(), method: request.method, headers: request.headers, at: time.clock.now(), body: request.body?.toString() });
      return respond(request, calls.length - 1);
    },
  });
  return { fetcher, calls, ...time };
}

async function failure(promise: Promise<unknown>): Promise<SourceError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SourceError) return error;
    throw error;
  }
  throw new Error("La requête aurait dû échouer.");
}

beforeEach(() => {
  // Aucun test ne doit joindre le réseau, par quelque chemin que ce soit.
  vi.stubGlobal("fetch", () => Promise.reject(new Error("fetch réel appelé pendant un test")));
});

describe("ce que le client refuse d'appeler", () => {
  it("un domaine que l'adaptateur n'a pas déclaré", async () => {
    const { fetcher, calls } = setup(() => json({}));
    const error = await failure(fetcher.request("https://ailleurs.example.com/x", { kind: "json" }));
    expect(error.kind).toBe("site-error");
    expect(error.message).toContain("ailleurs.example.com");
    // Un sous-domaine ou un domaine qui se termine pareil n'est pas le domaine déclaré.
    await failure(fetcher.request("https://faux.site.example.org.evil.test/x", { kind: "json" }));
    await failure(fetcher.request("https://sub.site.example.org/x", { kind: "json" }));
    expect(calls).toHaveLength(0);
  });

  it("un domaine confié par l'API du site devient appelable, les autres non", async () => {
    const { fetcher, calls } = setup(() => json({}));
    await failure(fetcher.request("https://cdn7.example.net/a.json", { kind: "json" }));
    fetcher.allowHost("CDN7.example.net");
    await fetcher.request("https://cdn7.example.net/a.json", { kind: "json" });
    expect(calls.map((call) => call.url)).toEqual(["https://cdn7.example.net/a.json"]);
  });

  it("une adresse interne, même déclarée", async () => {
    const hosts = ["127.0.0.1", "10.0.0.5", "192.168.1.20", "169.254.169.254", "[::1]", "::1"];
    const { fetcher, calls } = setup(() => json({}), hosts);
    for (const url of ["http://127.0.0.1/x", "http://10.0.0.5:8080/x", "https://192.168.1.20/x", "http://169.254.169.254/latest/meta-data", "http://[::1]/x"]) {
      expect((await failure(fetcher.request(url, { kind: "any" }))).kind, url).toBe("site-error");
    }
    expect(calls).toHaveLength(0);
  });

  it("un nom de domaine qui mène à une adresse interne (résolution de la connexion)", async () => {
    const resolveTo = (addresses: string[]) =>
      new Promise<{ error: Error | null; address: string }>((done) => {
        const lookup = createSafeLookup((_hostname, _options, callback) => callback(null, addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))));
        lookup("site.example.org", {}, (error, address) => done({ error, address: String(address) }));
      });

    expect((await resolveTo(["93.184.216.34"])).address).toBe("93.184.216.34");
    expect((await resolveTo(["127.0.0.1"])).error).toBeInstanceOf(TransportRefusal);
    // Un nom qui mélange une adresse publique et une adresse interne est refusé en entier.
    expect((await resolveTo(["93.184.216.34", "10.0.0.1"])).error).toBeInstanceOf(TransportRefusal);
    expect((await resolveTo(["fd00::1"])).error).toBeInstanceOf(TransportRefusal);
    expect((await resolveTo([])).error).toBeInstanceOf(TransportRefusal);
  });

  it("un refus du transport n'est pas retenté", async () => {
    const { fetcher, calls, sleeps } = setup(() => {
      throw new TransportRefusal("Ce domaine mène à une adresse interne : refusé.");
    });
    expect((await failure(fetcher.request("https://site.example.org/x", { kind: "json" }))).message).toContain("adresse interne");
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("une redirection vers un domaine non déclaré", async () => {
    const { fetcher, calls } = setup(() => ({ status: 302, headers: { location: "https://ailleurs.example.com/piege" }, body: Buffer.alloc(0) }));
    const error = await failure(fetcher.request("https://site.example.org/x", { kind: "json" }));
    expect(error.message).toContain("ailleurs.example.com");
    // Le site a changé : c'est l'adaptateur qui est à revoir, pas une panne à retenter.
    expect(error.kind).toBe("adapter-outdated");
    expect(calls).toHaveLength(1);
  });

  it("autre chose que http et https, ou une adresse avec identifiants", async () => {
    const { fetcher, calls } = setup(() => json({}));
    await failure(fetcher.request("ftp://site.example.org/x", { kind: "any" }));
    await failure(fetcher.request("https://user:secret@site.example.org/x", { kind: "any" }));
    await failure(fetcher.request("pas une adresse", { kind: "any" }));
    expect(calls).toHaveLength(0);
  });
});

describe("ce que le client envoie", () => {
  it("s'identifie clairement et n'envoie ni cookie ni jeton", async () => {
    const { fetcher, calls } = setup(() => json({ ok: true }));
    const { data } = await fetcher.json("https://site.example.org/api");
    expect(data).toEqual({ ok: true });
    expect(Object.keys(calls[0].headers).sort()).toEqual(["accept", "user-agent"]);
    expect(calls[0].headers["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^ShareX-Manager\/ScanStudio /);
    expect(USER_AGENT).not.toMatch(/Mozilla|Chrome|Safari/);
    expect(calls[0].method).toBe("GET");
  });

  it("un corps JSON part en POST, avec son type", async () => {
    const { fetcher, calls } = setup(() => ({ status: 200, headers: {}, body: Buffer.alloc(0) }));
    await fetcher.request("https://site.example.org/report", { kind: "any", json: { success: true } });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toBe('{"success":true}');
    expect(Object.keys(calls[0].headers).sort()).toEqual(["accept", "content-type", "user-agent"]);
  });

  it("suit une redirection vers un domaine déclaré", async () => {
    const { fetcher, calls } = setup((request) =>
      request.url.hostname === "site.example.org" ? { status: 301, headers: { location: "https://img.example.org/final.json" }, body: Buffer.alloc(0) } : json({ ok: 1 })
    );
    const response = await fetcher.request("https://site.example.org/x", { kind: "json" });
    expect(response.url).toBe("https://img.example.org/final.json");
    expect(calls).toHaveLength(2);
  });

  it("s'arrête après trop de redirections", async () => {
    const { fetcher, calls } = setup((_request, index) => ({ status: 302, headers: { location: `https://site.example.org/tour-${index}` }, body: Buffer.alloc(0) }));
    expect((await failure(fetcher.request("https://site.example.org/x", { kind: "json" }))).message).toContain("redirections");
    expect(calls).toHaveLength(POLITENESS.maxRedirects + 1);
  });
});

describe("rythme", () => {
  it("attend le délai minimal entre deux requêtes vers le même domaine", async () => {
    const { fetcher, calls, sleeps, advance } = setup(() => json({}));
    await fetcher.request("https://site.example.org/1", { kind: "json" });
    await fetcher.request("https://site.example.org/2", { kind: "json" });
    expect(sleeps).toEqual([POLITENESS.minDelayMs]);
    expect(calls[1].at - calls[0].at).toBe(POLITENESS.minDelayMs);

    // Un autre domaine n'a pas à attendre le premier ; et le temps déjà écoulé compte.
    await fetcher.request("https://img.example.org/1", { kind: "json" });
    advance(400);
    await fetcher.request("https://site.example.org/3", { kind: "json" });
    expect(sleeps).toEqual([POLITENESS.minDelayMs, POLITENESS.minDelayMs - 400]);
  });

  it("un adaptateur peut demander plus lent, jamais plus rapide", async () => {
    for (const [asked, expected] of [
      [5000, 5000],
      [10, POLITENESS.minDelayMs],
    ]) {
      const time = fakeClock();
      const fetcher = new PoliteFetcher({ hosts: ["site.example.org"], minDelayMs: asked, clock: time.clock, transport: async () => json({}) });
      await fetcher.request("https://site.example.org/1", { kind: "json" });
      await fetcher.request("https://site.example.org/2", { kind: "json" });
      expect(time.sleeps).toEqual([expected]);
    }
  });

  it("ne fait jamais deux requêtes en même temps, même lancées ensemble", async () => {
    let running = 0;
    let peak = 0;
    const { fetcher, calls } = setup(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return json({});
    });
    await Promise.all(["a", "b", "c", "d"].map((name, index) => fetcher.request(`https://${index % 2 ? "img" : "site"}.example.org/${name}`, { kind: "json" })));
    expect(peak).toBe(1);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/a", "/b", "/c", "/d"]);
  });
});

describe("quand le site demande d'attendre ou tombe", () => {
  it("respecte Retry-After avant de réessayer", async () => {
    const { fetcher, calls, sleeps } = setup((_request, index) => (index === 0 ? json({}, 429, { "retry-after": "7" }) : json({ ok: true })));
    const response = await fetcher.request("https://site.example.org/x", { kind: "json" });
    expect(response.status).toBe(200);
    expect(sleeps).toEqual([7000]);
    expect(calls[1].at - calls[0].at).toBe(7000);
  });

  it("lit Retry-After en secondes, en date, et l'en-tête de limite en secondes UNIX", () => {
    expect(retryAfterMs({ "retry-after": "12" }, START)).toBe(12_000);
    expect(retryAfterMs({ "retry-after": new Date(START + 30_000).toUTCString() }, START)).toBe(30_000);
    expect(retryAfterMs({ "x-ratelimit-retry-after": String(START / 1000 + 45) }, START)).toBe(45_000);
    expect(retryAfterMs({ "retry-after": "bientôt" }, START)).toBeUndefined();
    expect(retryAfterMs({}, START)).toBeUndefined();
  });

  it("sans délai indiqué, attend de plus en plus longtemps, puis s'arrête", async () => {
    const { fetcher, calls, sleeps } = setup(() => json({}, 429));
    const error = await failure(fetcher.request("https://site.example.org/x", { kind: "json" }));
    expect(error.kind).toBe("rate-limited");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
    expect(sleeps).toEqual([POLITENESS.backoffMs, POLITENESS.backoffMs * 2]);
  });

  it("n'attend pas un délai trop long : il s'arrête, et laisse le domaine tranquille jusque-là", async () => {
    const { fetcher, calls, sleeps, advance } = setup((_request, index) => (index === 0 ? json({}, 429, { "retry-after": "600" }) : json({ ok: true })));
    const error = await failure(fetcher.request("https://site.example.org/x", { kind: "json" }));
    expect(error.kind).toBe("rate-limited");
    expect(error.retryAfterMs).toBe(600_000);
    expect(sleeps).toEqual([]);

    // Tant que le délai court, plus rien ne part vers ce domaine.
    advance(300_000);
    expect((await failure(fetcher.request("https://site.example.org/y", { kind: "json" }))).kind).toBe("rate-limited");
    expect(calls).toHaveLength(1);

    advance(300_001);
    expect((await fetcher.request("https://site.example.org/z", { kind: "json" })).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("une panne est retentée un nombre compté de fois, pas plus", async () => {
    const { fetcher, calls } = setup(() => json({}, 502));
    const error = await failure(fetcher.request("https://site.example.org/x", { kind: "json" }));
    expect(error.kind).toBe("site-error");
    expect(error.message).toContain("502");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
  });

  it("une connexion qui échoue est retentée, puis rendue comme une erreur du site", async () => {
    const { fetcher, calls } = setup((_request, index) => {
      if (index < 1) throw new Error("ECONNRESET");
      return json({ ok: true });
    });
    expect((await fetcher.request("https://site.example.org/x", { kind: "json" })).status).toBe(200);
    expect(calls).toHaveLength(2);

    const down = setup(() => {
      throw new Error("ETIMEDOUT");
    });
    expect((await failure(down.fetcher.request("https://site.example.org/x", { kind: "json" }))).message).toContain("ETIMEDOUT");
    expect(down.calls).toHaveLength(POLITENESS.retries + 1);
  });

  it("`retries: 0` ne retente rien, et ne peut pas dépasser le plafond", async () => {
    const once = setup(() => json({}, 500));
    await failure(once.fetcher.request("https://site.example.org/x", { kind: "json", retries: 0 }));
    expect(once.calls).toHaveLength(1);

    const many = setup(() => json({}, 500));
    await failure(many.fetcher.request("https://site.example.org/x", { kind: "json", retries: 50 }));
    expect(many.calls).toHaveLength(POLITENESS.retries + 1);
  });

  it("après trois requêtes perdues de suite, le domaine est mis de côté : plus aucun appel", async () => {
    let broken = true;
    const { fetcher, calls, advance } = setup(() => (broken ? json({}, 503) : json({ ok: true })));
    for (let attempt = 0; attempt < POLITENESS.breakerThreshold; attempt++) {
      await failure(fetcher.request(`https://site.example.org/${attempt}`, { kind: "json" }));
    }
    const before = calls.length;
    expect(before).toBe(POLITENESS.breakerThreshold * (POLITENESS.retries + 1));

    const paused = await failure(fetcher.request("https://site.example.org/encore", { kind: "json" }));
    expect(paused.kind).toBe("site-error");
    expect(paused.message).toContain("laissé tranquille");
    expect(calls).toHaveLength(before);
    // Un autre domaine n'est pas concerné.
    expect((await failure(fetcher.request("https://img.example.org/x", { kind: "json", retries: 0 }))).message).toContain("503");

    advance(POLITENESS.breakerPauseMs + 1);
    broken = false;
    expect((await fetcher.request("https://site.example.org/apres", { kind: "json" })).status).toBe(200);
  });

  it("une réponse correcte remet le compteur d'échecs à zéro", async () => {
    let broken = true;
    const { fetcher } = setup(() => (broken ? json({}, 500) : json({})));
    for (let round = 0; round < 4; round++) {
      broken = true;
      await failure(fetcher.request("https://site.example.org/a", { kind: "json", retries: 0 }));
      await failure(fetcher.request("https://site.example.org/b", { kind: "json", retries: 0 }));
      broken = false;
      expect((await fetcher.request("https://site.example.org/c", { kind: "json" })).status).toBe(200);
    }
  });
});

describe("ce que le client rend", () => {
  it("rend 404 et 403 à l'adaptateur sans les retenter", async () => {
    for (const status of [403, 404]) {
      const { fetcher, calls } = setup(() => json({ result: "error" }, status));
      const { response, data } = await fetcher.json("https://site.example.org/x");
      expect(response.status).toBe(status);
      expect(data).toEqual({ result: "error" });
      expect(calls).toHaveLength(1);
    }
  });

  it("refuse une réponse d'un autre type que celui attendu", async () => {
    const page = { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: Buffer.from("<html>Vérification du navigateur…</html>") };
    const html = setup(() => page);
    expect((await failure(html.fetcher.request("https://site.example.org/x", { kind: "json" }))).kind).toBe("site-error");
    expect((await failure(html.fetcher.request("https://site.example.org/y", { kind: "image" }))).message).toContain("image");
    // Une page de vérification n'est ni contournée ni retentée.
    expect(html.calls).toHaveLength(2);

    const svg = setup(() => ({ status: 200, headers: { "content-type": "image/svg+xml" }, body: Buffer.from("<svg/>") }));
    await failure(svg.fetcher.request("https://site.example.org/x.svg", { kind: "image" }));

    const garbled = setup(() => ({ status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("{pas du json") }));
    expect((await failure(garbled.fetcher.json("https://site.example.org/x"))).message).toContain("illisible");
  });

  it("donne au transport un poids maximal et un délai bornés", async () => {
    const limits: number[] = [];
    const { fetcher } = setup((request) => {
      limits.push(request.maxBytes);
      expect(request.timeoutMs).toBe(POLITENESS.requestTimeoutMs);
      return request.url.pathname.endsWith(".png") ? { status: 200, headers: { "content-type": "image/png" }, body: Buffer.alloc(4) } : json({});
    });
    await fetcher.request("https://site.example.org/a", { kind: "json" });
    await fetcher.request("https://site.example.org/a.png", { kind: "image" });
    await fetcher.request("https://site.example.org/b", { kind: "json", maxBytes: 1000 });
    expect(limits).toEqual([2 * 1024 * 1024, 40 * 1024 * 1024, 1000]);
  });

  it("s'interrompt quand l'import est annulé, y compris pendant une attente", async () => {
    const controller = new AbortController();
    const { fetcher, calls } = setup(() => {
      controller.abort();
      return json({}, 500);
    });
    await expect(fetcher.request("https://site.example.org/x", { kind: "json", signal: controller.signal })).rejects.toBeInstanceOf(AbortedError);
    expect(calls).toHaveLength(1);
    await expect(fetcher.request("https://site.example.org/y", { kind: "json", signal: controller.signal })).rejects.toBeInstanceOf(AbortedError);
    expect(calls).toHaveLength(1);
  });
});

describe("domaines déclarés par famille", () => {
  it("`*.exemple.org` couvre tout sous-domaine, jamais le domaine nu ni un domaine qui finit pareil", () => {
    expect(hostMatches("*.site.example.org", "w7.site.example.org")).toBe(true);
    expect(hostMatches("*.site.example.org", "A.B.Site.Example.org.")).toBe(true);
    expect(hostMatches("*.site.example.org", "site.example.org")).toBe(false);
    expect(hostMatches("*.site.example.org", "fauxsite.example.org")).toBe(false);
    expect(hostMatches("*.site.example.org", "w7.site.example.org.evil.test")).toBe(false);
    expect(hostMatches("site.example.org", "site.example.org")).toBe(true);
    expect(hostMatches("site.example.org", "w7.site.example.org")).toBe(false);
    expect(hostMatches("*.", "example.org")).toBe(false);
    expect(hostMatches("*.org", "*.org")).toBe(false);
  });

  it("appelle un sous-domaine d'une famille déclarée, et suit une redirection de l'un à l'autre", async () => {
    const { fetcher, calls } = setup(
      (request) => (request.url.hostname === "w7.site.example.org" ? { status: 301, headers: { location: "https://w8.site.example.org/x" }, body: Buffer.alloc(0) } : json({ ok: 1 })),
      ["*.site.example.org"]
    );
    expect(fetcher.isAllowed("w7.site.example.org")).toBe(true);
    expect(fetcher.isAllowed("site.example.org")).toBe(false);
    expect((await fetcher.request("https://w7.site.example.org/x", { kind: "json" })).url).toBe("https://w8.site.example.org/x");
    await failure(fetcher.request("https://site.example.org/x", { kind: "json" }));
    await failure(fetcher.request("https://w7.site.example.org.evil.test/x", { kind: "json" }));
    expect(calls).toHaveLength(2);
  });

  it("un domaine confié en route est un nom précis, jamais une famille", async () => {
    const { fetcher, calls } = setup(() => json({}));
    fetcher.allowHost("*.example.net");
    expect(fetcher.isAllowed("cdn.example.net")).toBe(false);
    await failure(fetcher.request("https://cdn.example.net/a.json", { kind: "json" }));
    expect(calls).toHaveLength(0);
  });
});

describe("vérification du navigateur", () => {
  const page = (body: string, status: number, headers: Record<string, string> = {}): TransportResponse => ({ status, headers: { "content-type": "text/html", ...headers }, body: Buffer.from(body) });

  it("une vérification servie en 503 est rendue à l'adaptateur, sans nouvelle tentative", async () => {
    const { fetcher, calls, sleeps } = setup(() => page("<html><head><title>Just a moment...</title></head></html>", 503, { "cf-mitigated": "challenge", "retry-after": "5" }));
    const response = await fetcher.request("https://site.example.org/x", { kind: "html" });
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("une panne ordinaire en 503 reste une panne, retentée un nombre compté de fois", async () => {
    const { fetcher, calls } = setup(() => page("<html><head><title>503 Service Unavailable</title></head></html>", 503));
    expect((await failure(fetcher.request("https://site.example.org/x", { kind: "html" }))).kind).toBe("site-error");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
  });
});
