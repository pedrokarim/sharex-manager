import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyYtDlpError, networkFfmpeg, ytDlpErrorMessage } from "@/lib/media/ytdlp";

vi.mock("@/lib/media/ffmpeg", () => ({ ensureFfmpeg: async () => "/app/data/tools/ffmpeg-pinned/ffmpeg" }));

afterEach(() => vi.restoreAllMocks());

describe("ffmpeg de yt-dlp", () => {
  it("reconnaît un plantage de ffmpeg et le dit clairement", () => {
    // Sortie relevée en prod le 19/10/2026 : la vidéo est trouvée, ffmpeg tombe en lisant le passage.
    const stderr = "[info] unERRyuuBPU: Downloading 1 time ranges: 10.0-20.0\nERROR: ffmpeg exited with code -11";
    expect(classifyYtDlpError(stderr)).toBe("ffmpeg-crash");
    expect(ytDlpErrorMessage("ffmpeg-crash")).toMatch(/ffmpeg a planté/);
    expect(classifyYtDlpError("ERROR: ffmpeg exited with code 1")).not.toBe("ffmpeg-crash");
  });

  it.skipIf(process.platform === "win32")("préfère le ffmpeg du système, qui sait résoudre les noms de domaine", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation((file) => file === "/usr/bin/ffmpeg");
    expect(await networkFfmpeg()).toBe("/usr/bin/ffmpeg");
  });

  it("se rabat sur le ffmpeg épinglé quand le système n'en a pas", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(await networkFfmpeg()).toBe("/app/data/tools/ffmpeg-pinned/ffmpeg");
  });
});
