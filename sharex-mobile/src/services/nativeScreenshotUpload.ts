import { Platform } from "react-native";
import {
  EventSubscription,
  NativeModule,
  requireOptionalNativeModule,
} from "expo-modules-core";
import type { ScreenshotUploadStatus } from "./screenshotAutoUpload";

export type NativeCompletedUpload = {
  filename: string;
  url: string;
  thumbnailUrl?: string;
  localUri: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
};

type NativeStatusEvent = ScreenshotUploadStatus & { progress?: number };

declare class ScreenshotUploadNativeModule extends NativeModule<{
  onStatus(event: NativeStatusEvent): void;
}> {
  configure(serverUrl: string, apiKey: string, notifications: boolean): Promise<void>;
  stop(): Promise<void>;
  drainCompletedUploads(): Promise<NativeCompletedUpload[]>;
}

const nativeModule = Platform.OS === "android"
  ? requireOptionalNativeModule<ScreenshotUploadNativeModule>("ShareXScreenshotUpload")
  : null;

export const nativeScreenshotUpload = {
  isAvailable: nativeModule != null,
  configure: (serverUrl: string, apiKey: string, notifications: boolean) =>
    nativeModule?.configure(serverUrl, apiKey, notifications) ?? Promise.resolve(),
  stop: () => nativeModule?.stop() ?? Promise.resolve(),
  drainCompletedUploads: () => nativeModule?.drainCompletedUploads() ?? Promise.resolve([]),
  subscribe: (listener: (event: NativeStatusEvent) => void): EventSubscription | null =>
    nativeModule?.addListener("onStatus", listener) ?? null,
};
