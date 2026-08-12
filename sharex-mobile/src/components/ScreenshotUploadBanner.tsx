import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SHADOWS, TYPOGRAPHY } from "../config/design";
import {
  ScreenshotUploadStatus,
  screenshotAutoUploadService,
} from "../services/screenshotAutoUpload";
import { Icon } from "./Icon";

export const ScreenshotUploadBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<ScreenshotUploadStatus | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => screenshotAutoUploadService.subscribe((nextStatus) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setStatus(nextStatus);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 190,
    }).start();

    if (nextStatus.state === "success" || nextStatus.state === "error") {
      hideTimer.current = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: -120,
          duration: 220,
          useNativeDriver: true,
        }).start(({ finished }) => finished && setStatus(null));
      }, nextStatus.state === "success" ? 2_800 : 4_500);
    }
  }), [translateY]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  if (!status) return null;

  const isBusy = status.state === "detected" || status.state === "uploading";
  const color = status.state === "error" ? COLORS.error : status.state === "success" ? COLORS.success : COLORS.primary;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.banner, { top: insets.top + 10, transform: [{ translateY }] }]}
    >
      <View style={[styles.iconShell, { backgroundColor: `${color}18` }]}>
        {isBusy ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Icon
            name={status.state === "success" ? "checkmark" : "alert"}
            size={20}
            color={color}
            type="ionicons"
          />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{status.message}</Text>
        {status.state === "uploading" && (
          <View style={styles.track}>
            <View style={[styles.progress, { width: `${Math.max(3, status.progress * 100)}%` }]} />
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 18,
    right: 18,
    zIndex: 1000,
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 21,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    ...SHADOWS.lg,
    elevation: 30,
  },
  iconShell: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, marginLeft: 11, marginRight: 5 },
  title: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  track: { height: 4, marginTop: 8, overflow: "hidden", borderRadius: 4, backgroundColor: COLORS.gray200 },
  progress: { height: "100%", borderRadius: 4, backgroundColor: COLORS.primary },
});
