import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps, UploadHistoryItem } from "../types";
import { UploadHistoryService } from "../services/uploadHistory";
import { Icon } from "../components/Icon";
import { BORDER_RADIUS, COLORS, SHADOWS, TYPOGRAPHY } from "../config/design";

export const StatsScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [totalSize, setTotalSize] = useState(0);

  const load = async () => {
    const [items, stats] = await Promise.all([UploadHistoryService.getHistory(), UploadHistoryService.getStats()]);
    setHistory(items);
    setTotalSize(stats.totalSize);
  };

  useEffect(() => {
    load().catch(console.error);
    const unsubscribe = navigation.addListener("focus", () => load().catch(console.error));
    return unsubscribe;
  }, [navigation]);

  const activity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const count = history.filter((item) => {
        const uploaded = new Date(item.uploadedAt);
        return uploaded.toDateString() === date.toDateString();
      }).length;
      return { label: ["D", "L", "M", "M", "J", "V", "S"][date.getDay()], count };
    });
    const maximum = Math.max(...days.map((day) => day.count), 1);
    return days.map((day) => ({ ...day, height: 24 + (day.count / maximum) * 94 }));
  }, [history]);

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 Mo";
    const value = bytes / 1024 / 1024;
    return `${value < 10 ? value.toFixed(1) : value.toFixed(0)} Mo`;
  };

  const todayCount = history.filter((item) => new Date(item.uploadedAt).toDateString() === new Date().toDateString()).length;
  const latest = history[0];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate("Main")}>
          <Icon name="menu" size={22} color={COLORS.textPrimary} type="ionicons" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Votre activité</Text>
        <TouchableOpacity style={styles.headerButton} onPress={() => load()}>
          <Icon name="refresh-outline" size={20} color={COLORS.textPrimary} type="ionicons" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>EN UN COUP D’ŒIL</Text>
        <Text style={styles.title}>Vos uploads prennent de la hauteur.</Text>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Images envoyées</Text>
              <Text style={styles.heroValue}>{history.length}</Text>
            </View>
            <View style={styles.trendBadge}>
              <Icon name="arrow-up" size={13} color={COLORS.primary} type="ionicons" />
              <Text style={styles.trendText}>{todayCount} aujourd’hui</Text>
            </View>
          </View>
          <View style={styles.orbitOne} />
          <View style={styles.orbitTwo} />
          <View style={styles.heroBottom}>
            <View><Text style={styles.heroMiniValue}>{formatSize(totalSize)}</Text><Text style={styles.heroMiniLabel}>stockés</Text></View>
            <View style={styles.heroDivider} />
            <View><Text style={styles.heroMiniValue}>100%</Text><Text style={styles.heroMiniLabel}>disponibles</Text></View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>7 derniers jours</Text>
            <Text style={styles.sectionSubtitle}>Rythme de vos envois</Text>
          </View>
          <View style={styles.calendarIcon}><Icon name="calendar-outline" size={19} color={COLORS.coral} type="ionicons" /></View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chart}>
            {activity.map((day, index) => (
              <View key={`${day.label}-${index}`} style={styles.barColumn}>
                <Text style={styles.barValue}>{day.count || ""}</Text>
                <View style={[styles.bar, { height: day.height, backgroundColor: index === activity.length - 1 ? COLORS.coral : COLORS.lavender }]} />
                <Text style={styles.barLabel}>{day.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Dernière activité</Text>
        <View style={styles.activityCard}>
          <View style={styles.activityIcon}><Icon name="cloud-done-outline" size={23} color={COLORS.primary} type="ionicons" /></View>
          <View style={styles.activityCopy}>
            <Text style={styles.activityTitle} numberOfLines={1}>{latest?.filename || "Aucun upload pour le moment"}</Text>
            <Text style={styles.activityMeta}>{latest ? new Date(latest.uploadedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Votre activité apparaîtra ici"}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={COLORS.textTertiary} type="ionicons" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 62, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 135 },
  kicker: { color: COLORS.coral, fontSize: 12, letterSpacing: 1.5, fontWeight: "800", fontFamily: TYPOGRAPHY.rounded },
  title: { marginTop: 8, marginBottom: 22, maxWidth: 340, color: COLORS.textPrimary, fontSize: 31, lineHeight: 37, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  heroCard: { minHeight: 244, padding: 22, borderRadius: 30, overflow: "hidden", backgroundColor: COLORS.primary, ...SHADOWS.md },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", zIndex: 2 },
  heroLabel: { color: "#E9DBF5", fontSize: 13 },
  heroValue: { color: COLORS.white, fontSize: 56, lineHeight: 66, fontWeight: "800", fontFamily: TYPOGRAPHY.rounded },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.white, paddingHorizontal: 11, paddingVertical: 8, borderRadius: BORDER_RADIUS.round },
  trendText: { color: COLORS.primary, fontSize: 11, fontWeight: "700" },
  orbitOne: { position: "absolute", width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: "rgba(255,255,255,.18)", right: -45, top: 35 },
  orbitTwo: { position: "absolute", width: 110, height: 110, borderRadius: 55, borderWidth: 24, borderColor: "rgba(244,127,91,.25)", right: -12, top: 73 },
  heroBottom: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 28, zIndex: 2 },
  heroMiniValue: { color: COLORS.white, fontSize: 18, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  heroMiniLabel: { color: "#CDB8DE", fontSize: 12, marginTop: 2 },
  heroDivider: { height: 35, width: 1, backgroundColor: "rgba(255,255,255,.22)" },
  sectionHeader: { marginTop: 30, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  sectionSubtitle: { color: COLORS.textTertiary, fontSize: 12, marginTop: 3 },
  calendarIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: COLORS.secondaryBg, alignItems: "center", justifyContent: "center" },
  chartCard: { height: 220, padding: 18, paddingBottom: 14, marginBottom: 30, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface },
  chart: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  barColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  barValue: { height: 20, color: COLORS.textSecondary, fontSize: 11, fontWeight: "700" },
  bar: { width: 22, minHeight: 24, borderRadius: 11 },
  barLabel: { marginTop: 9, color: COLORS.textTertiary, fontSize: 11 },
  activityCard: { marginTop: 14, padding: 14, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface, flexDirection: "row", alignItems: "center" },
  activityIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: COLORS.primaryBg, alignItems: "center", justifyContent: "center" },
  activityCopy: { flex: 1, marginHorizontal: 12 },
  activityTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  activityMeta: { color: COLORS.textTertiary, fontSize: 11, marginTop: 4 },
});
