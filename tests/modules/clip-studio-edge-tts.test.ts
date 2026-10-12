import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDGE_BROKEN_MESSAGE,
  parseBinaryMessage,
  parseTextMessage,
  parseWordBoundaries,
  secMsGec,
  splitForEdge,
  synthesizeEdge,
  wordsFromBoundaries,
  type SocketLike,
} from "@/modules/clip-studio/lib/edge-tts";

/** Message binaire comme ceux du service : longueur d'en-tête sur deux octets, en-tête, son. */
function binaryFrame(audio: number[]): Uint8Array {
  const header = Buffer.from("X-RequestId:abc\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n", "utf-8");
  const frame = new Uint8Array(2 + header.length + audio.length);
  frame[0] = header.length >> 8;
  frame[1] = header.length & 0xff;
  frame.set(header, 2);
  frame.set(audio, 2 + header.length);
  return frame;
}

function metadata(text: string, offsetMs: number, durationMs: number): string {
  const body = JSON.stringify({
    Metadata: [{ Type: "WordBoundary", Data: { Offset: offsetMs * 10_000, Duration: durationMs * 10_000, text: { Text: text, Length: text.length, BoundaryType: "WordBoundary" } } }],
  });
  return `X-RequestId:abc\r\nContent-Type:application/json; charset=utf-8\r\nPath:audio.metadata\r\n\r\n${body}`;
}

/** Faux WebSocket : rejoue une réponse du service dès que le SSML arrive. */
function fakeService(words: [string, number, number][], audioChunks: number[][]) {
  const opened: { url: string; headers: Record<string, string>; sent: string[] }[] = [];
  const factory = (url: string, headers: Record<string, string>): SocketLike => {
    const record = { url, headers, sent: [] as string[] };
    opened.push(record);
    const socket: SocketLike = {
      binaryType: "blob",
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: () => undefined,
      send(data: string) {
        record.sent.push(data);
        if (!data.includes("Path:ssml")) return;
        queueMicrotask(() => {
          socket.onmessage?.({ data: "X-RequestId:abc\r\nPath:turn.start\r\n\r\n{}" });
          for (const [text, offset, duration] of words) socket.onmessage?.({ data: metadata(text, offset, duration) });
          for (const chunk of audioChunks) socket.onmessage?.({ data: binaryFrame(chunk).buffer });
          socket.onmessage?.({ data: "X-RequestId:abc\r\nPath:turn.end\r\n\r\n{}" });
        });
      },
    };
    queueMicrotask(() => socket.onopen?.({}));
    return socket;
  };
  return { factory, opened };
}

describe("lecture à voix haute d’Edge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calcule le jeton Sec-MS-GEC de façon déterministe, par tranche de cinq minutes", () => {
    const token = secMsGec(Date.parse("2026-10-12T21:48:00Z"));
    expect(token).toBe("213C134638D91CAD593AEDE249793638B951F0B2D2A63FC3CDF6E25DA413332F");
    expect(secMsGec(Date.parse("2026-10-12T21:45:00Z"))).toBe(token);
    expect(secMsGec(Date.parse("2026-10-12T21:49:59Z"))).toBe(token);
    expect(secMsGec(Date.parse("2026-10-12T21:50:00Z"))).not.toBe(token);
    expect(token).toMatch(/^[0-9A-F]{64}$/);
  });

  it("lit les messages texte, binaires et les instants des mots", () => {
    expect(parseTextMessage("X-RequestId:1\r\nPath:turn.end\r\n\r\n{}")).toEqual({ path: "turn.end", body: "{}" });
    const binary = parseBinaryMessage(binaryFrame([1, 2, 3]));
    expect(binary.path).toBe("audio");
    expect(binary.contentType).toBe("audio/mpeg");
    expect(Array.from(binary.audio)).toEqual([1, 2, 3]);
    expect(() => parseBinaryMessage(new Uint8Array([0, 200, 1]))).toThrow();

    const body = metadata("Bonjour &amp; salut", 50, 525).split("\r\n\r\n")[1];
    expect(parseWordBoundaries(body, 1000)).toEqual([{ text: "Bonjour & salut", offsetMs: 1050, durationMs: 525 }]);
    expect(parseWordBoundaries('{"Metadata":[{"Type":"SessionEnd","Data":{}}]}')).toEqual([]);
  });

  it("garde la ponctuation du texte et cale les mots non signalés entre leurs voisins", () => {
    const words = wordsFromBoundaries("Bonjour à tous, voici un essai !", [
      { text: "Bonjour", offsetMs: 50, durationMs: 500 },
      { text: "à", offsetMs: 600, durationMs: 100 },
      { text: "tous", offsetMs: 700, durationMs: 300 },
      { text: "un", offsetMs: 1500, durationMs: 100 },
      { text: "essai", offsetMs: 1600, durationMs: 400 },
    ]);
    expect(words.map((word) => word.text)).toEqual(["Bonjour", "à", "tous,", "voici", "un", "essai !"]);
    expect(words[3]).toEqual({ text: "voici", startMs: 1000, endMs: 1500 });
    expect(words[5]).toEqual({ text: "essai !", startMs: 1600, endMs: 2000 });
  });

  it("découpe un long texte sous la limite d’octets du service", () => {
    const chunks = splitForEdge(Array.from({ length: 300 }, () => "élément").join(" "), 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(Buffer.byteLength(chunk)).toBeLessThanOrEqual(500);
  });

  it("synthétise par WebSocket : en-têtes d’Edge, SSML, son assemblé et mots horodatés", async () => {
    const service = fakeService(
      [
        ["Bonjour", 50, 500],
        ["à", 600, 100],
        ["tous", 700, 300],
      ],
      [
        [0xff, 0xf3, 1],
        [2, 3],
      ]
    );
    const result = await synthesizeEdge("fr-FR-DeniseNeural", "Bonjour à tous.", 1.1, { socketFactory: service.factory });

    expect(service.opened).toHaveLength(1);
    const [{ url, headers, sent }] = service.opened;
    expect(url).toContain("wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=");
    expect(url).toMatch(/&Sec-MS-GEC=[0-9A-F]{64}&Sec-MS-GEC-Version=1-/);
    expect(url).toMatch(/&ConnectionId=[0-9a-f]{32}/);
    expect(headers.Origin).toBe("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
    expect(sent[0]).toContain("Path:speech.config");
    expect(sent[0]).toContain('"wordBoundaryEnabled":"true"');
    expect(sent[0]).toContain("audio-24khz-48kbitrate-mono-mp3");
    expect(sent[1]).toContain("Path:ssml");
    expect(sent[1]).toContain("<voice name='fr-FR-DeniseNeural'>");
    expect(sent[1]).toContain("rate='+10%'");
    expect(sent[1]).toContain("Bonjour à tous.");

    expect(Array.from(result.audio)).toEqual([0xff, 0xf3, 1, 2, 3]);
    expect(result.words).toEqual([
      { text: "Bonjour", startMs: 50, endMs: 550 },
      { text: "à", startMs: 600, endMs: 700 },
      { text: "tous.", startMs: 700, endMs: 1000 },
    ]);
  });

  it("échoue avec un message clair, sans boucle, quand Microsoft refuse la connexion", async () => {
    let attempts = 0;
    const factory = (): SocketLike => {
      attempts++;
      const socket: SocketLike = {
        binaryType: "blob",
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send: () => undefined,
        close: () => undefined,
      };
      queueMicrotask(() => socket.onerror?.({}));
      return socket;
    };
    // L'heure du serveur égale la nôtre : pas de nouvel essai.
    const fetchMock = vi.fn(async () => new Response(null, { status: 200, headers: { date: new Date().toUTCString() } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(synthesizeEdge("fr-FR-DeniseNeural", "Salut", 1, { socketFactory: factory })).rejects.toThrow(EDGE_BROKEN_MESSAGE);
    // Un essai par hôte (nouveau, puis ancien), une seule vérification d'horloge.
    expect(attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
