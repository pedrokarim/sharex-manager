import { AppState, NativeEventSubscription, Platform, ToastAndroid } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import * as ScreenCapture from "expo-screen-capture";
import { AppSettings } from "../types";
import { getApiService } from "./api";
import { UploadHistoryService } from "./uploadHistory";
import { nativeScreenshotUpload } from "./nativeScreenshotUpload";

const SCREENSHOT_PATTERN = /screenshot|screen[-_ ]?shot|screen[-_ ]?capture|capture[_ -]?d['’e]?cran/i;

export type ScreenshotUploadStatus =
  | { state: "detected"; message: string }
  | { state: "uploading"; message: string; progress: number }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type StatusListener = (status: ScreenshotUploadStatus) => void;

class ScreenshotAutoUploadService {
  private screenshotSubscription: { remove: () => void } | null = null;
  private librarySubscription: { remove: () => void } | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private handledAssetIds = new Set<string>();
  private startedAt = 0;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private forceNextScan = false;
  private scanning = false;
  private settings: AppSettings | null = null;
  private listeners = new Set<StatusListener>();
  private nativeSubscription: { remove: () => void } | null = null;

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(status: ScreenshotUploadStatus): void {
    this.listeners.forEach((listener) => listener(status));
  }

  async configure(settings: AppSettings | null): Promise<void> {
    this.stop();
    this.settings = settings;
    if (!settings?.autoUploadScreenshots || !settings.serverUrl || !settings.apiKey) {
      await nativeScreenshotUpload.stop();
      return;
    }

    const [mediaPermission, capturePermission] = await Promise.all([
      MediaLibrary.getPermissionsAsync(false, ["photo"]),
      ScreenCapture.getPermissionsAsync(),
    ]);
    if (
      mediaPermission.status !== "granted" ||
      mediaPermission.accessPrivileges === "limited" ||
      capturePermission.status !== "granted"
    ) {
      this.emit({
        state: "error",
        message: "Captures auto inactives : autorisation photos manquante",
      });
      return;
    }

    if (Platform.OS === "android" && nativeScreenshotUpload.isAvailable) {
      this.nativeSubscription = nativeScreenshotUpload.subscribe((status) => this.emit(status));
      await nativeScreenshotUpload.configure(
        settings.serverUrl,
        settings.apiKey,
        settings.notifications
      );
      await this.importNativeUploads();
      this.appStateSubscription = AppState.addEventListener("change", (state) => {
        if (state === "active") this.importNativeUploads().catch(console.error);
      });
      return;
    }

    this.startedAt = Date.now();
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("automatic-uploads", {
        name: "Envois automatiques",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const baseline = await MediaLibrary.getAssetsAsync({
      first: 20,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    baseline.assets.forEach((asset) => this.handledAssetIds.add(asset.id));

    this.screenshotSubscription = ScreenCapture.addScreenshotListener(() => {
      this.emit({ state: "detected", message: "Capture détectée…" });
      this.scheduleScan(true);
    });
    this.librarySubscription = MediaLibrary.addListener(() => {
      this.scheduleScan(false);
    });
    this.appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") this.scheduleScan(false);
    });
    // Certains constructeurs Android ne transmettent pas toujours le callback
    // MediaStore. Ce scan léger ne regarde que les nouvelles images et sert de
    // filet de sécurité pendant que l'application est active.
    this.fallbackTimer = setInterval(() => {
      if (AppState.currentState === "active") this.scheduleScan(false);
    }, 4_000);
  }

  stop(): void {
    this.screenshotSubscription?.remove();
    this.librarySubscription?.remove();
    this.appStateSubscription?.remove();
    this.nativeSubscription?.remove();
    this.screenshotSubscription = null;
    this.librarySubscription = null;
    this.appStateSubscription = null;
    this.nativeSubscription = null;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.scanTimer = null;
    this.fallbackTimer = null;
    this.forceNextScan = false;
    this.scanning = false;
  }

  private async importNativeUploads(): Promise<void> {
    const uploads = await nativeScreenshotUpload.drainCompletedUploads();
    for (const upload of uploads) {
      await UploadHistoryService.addUpload(upload);
    }
  }

  private scheduleScan(forceLatest: boolean): void {
    this.forceNextScan ||= forceLatest;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => {
      const force = this.forceNextScan;
      this.forceNextScan = false;
      this.scanTimer = null;
      this.scan(force).catch((error) =>
        console.error("Détection de capture impossible:", error)
      );
    }, 700);
  }

  private async scan(forceLatest: boolean): Promise<void> {
    if (this.scanning) {
      this.forceNextScan ||= forceLatest;
      return;
    }
    if (!this.settings) return;
    this.scanning = true;
    try {
      let candidates: MediaLibrary.Asset[] = [];
      // MIUI peut publier le fichier plusieurs secondes après l'événement de
      // capture. Attendre suffisamment longtemps avant de déclarer un échec.
      const maxAttempts = forceLatest ? 8 : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const page = await MediaLibrary.getAssetsAsync({
          first: 12,
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
          createdAfter: this.startedAt - 1500,
        });
        candidates = page.assets.filter(
          (asset) => !this.handledAssetIds.has(asset.id) && asset.creationTime >= this.startedAt - 1500
        );
        if (candidates.length || !forceLatest) break;
        await new Promise((resolve) => setTimeout(resolve, 650));
      }

      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const asset = candidates[index];
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        const isNamedScreenshot = SCREENSHOT_PATTERN.test(
          `${asset.filename} ${asset.uri} ${info.localUri || ""}`
        );
        const isIosScreenshot = asset.mediaSubtypes?.includes("screenshot") === true;
        const isFreshForcedAsset =
          forceLatest && index === 0 && Date.now() - asset.creationTime < 10_000;

        if (!isNamedScreenshot && !isIosScreenshot && !isFreshForcedAsset) continue;
        this.handledAssetIds.add(asset.id);
        await this.upload(asset, info.localUri || asset.uri);
      }

      if (forceLatest && candidates.length === 0) {
        this.emit({
          state: "error",
          message: "Capture détectée, mais son fichier reste introuvable",
        });
      }
    } finally {
      this.scanning = false;
      if (this.forceNextScan) {
        const force = this.forceNextScan;
        this.forceNextScan = false;
        this.scheduleScan(force);
      }
    }
  }

  private async upload(asset: MediaLibrary.Asset, uri: string): Promise<void> {
    if (!this.settings) return;
    const config = {
      url: this.settings.serverUrl,
      apiKey: this.settings.apiKey,
      isConnected: true,
    };
    const extension = asset.filename.split(".").pop()?.toLowerCase();
    const mimeType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    this.emit({ state: "uploading", message: "Envoi automatique…", progress: 0 });
    const result = await getApiService(config).uploadFile(
      uri,
      asset.filename,
      mimeType,
      (progress) => this.emit({
        state: "uploading",
        message: `Envoi automatique… ${Math.round(progress * 100)} %`,
        progress,
      })
    );

    if (!result.success) {
      this.emit({
        state: "error",
        message: result.error || "La capture n’a pas pu être envoyée",
      });
      await this.notify("Échec de l’envoi", "La capture n’a pas pu être envoyée", true);
      return;
    }

    await UploadHistoryService.addUpload({
      filename: result.filename || asset.filename,
      url: result.url || "",
      thumbnailUrl: result.thumbnailUrl,
      localUri: uri,
      size: 0,
      type: mimeType,
      width: asset.width,
      height: asset.height,
    });
    this.emit({ state: "success", message: "Capture envoyée automatiquement ✓" });
    await this.notify("Capture envoyée", asset.filename, false);
  }

  private async notify(title: string, body: string, isError: boolean): Promise<void> {
    if (!this.settings?.notifications) return;
    try {
      const permission = await Notifications.getPermissionsAsync();
      if (permission.status === "granted") {
        await Notifications.scheduleNotificationAsync({
          content: { title, body, sound: false },
          trigger: null,
        });
        return;
      }
    } catch (error) {
      console.warn("Notification d’envoi impossible:", error);
    }
    if (Platform.OS === "android") {
      ToastAndroid.show(`${title} — ${body}`, isError ? ToastAndroid.LONG : ToastAndroid.SHORT);
    }
  }
}

export const screenshotAutoUploadService = new ScreenshotAutoUploadService();
