import React from "react";
import { Image, Linking, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps } from "../types";
import { Icon } from "../components/Icon";
import { TEAM_INFO } from "../config/constants";
import { BORDER_RADIUS, COLORS, SHADOWS, TYPOGRAPHY } from "../config/design";

export const AboutScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const open = (url: string) => Linking.openURL(url).catch(console.error);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate("Main")}>
          <Icon name="menu" size={22} color={COLORS.textPrimary} type="ionicons" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>L’application</Text>
        <TouchableOpacity style={styles.headerButton} onPress={() => open(TEAM_INFO.CONTACT.GITHUB)}>
          <Icon name="logo-github" size={21} color={COLORS.textPrimary} type="ionicons" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.leafOne}><Icon name="leaf-outline" size={76} color="rgba(74,29,120,.12)" type="ionicons" /></View>
          <View style={styles.logoShell}>
            <Image source={require("../../assets/logo-sxm-simple.png")} style={styles.logo} />
          </View>
          <Text style={styles.appName}>{TEAM_INFO.APP_INFO.NAME}</Text>
          <Text style={styles.version}>VERSION {TEAM_INFO.APP_INFO.VERSION}</Text>
          <Text style={styles.description}>{TEAM_INFO.APP_INFO.DESCRIPTION}</Text>
          <View style={styles.badges}>
            <View style={styles.badge}><Icon name="phone-portrait-outline" size={14} color={COLORS.primary} type="ionicons" /><Text style={styles.badgeText}>Mobile</Text></View>
            <View style={styles.badge}><Icon name="shield-checkmark-outline" size={14} color={COLORS.primary} type="ionicons" /><Text style={styles.badgeText}>Sécurisé</Text></View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Pensée pour aller vite</Text>
        <View style={styles.featuresGrid}>
          <Feature icon="images-outline" title="Galerie" text="Sélection instantanée" color={COLORS.secondaryBg} />
          <Feature icon="camera-outline" title="Caméra" text="Capture et envoi" color={COLORS.primaryBg} />
          <Feature icon="share-social-outline" title="Partage" text="Depuis toutes vos apps" color={COLORS.infoLight} />
          <Feature icon="stats-chart-outline" title="Activité" text="Suivi de vos uploads" color={COLORS.accentLight} />
        </View>

        <Text style={styles.sectionTitle}>À propos du projet</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Développé par" value={`${TEAM_INFO.DEVELOPER.NAME} · ${TEAM_INFO.DEVELOPER.ALIAS}`} />
          <InfoRow label="Équipe" value={TEAM_INFO.COMPANY.NAME} />
          <InfoRow label="Technologie" value="Expo · React Native" />
          <InfoRow label="Licence" value="GPL-3.0" last />
        </View>

        <View style={styles.linksCard}>
          <LinkRow icon="globe-outline" title="Découvrir Ascencia" onPress={() => open(TEAM_INFO.CONTACT.WEBSITE)} />
          <LinkRow icon="logo-github" title="Voir le code source" onPress={() => open(TEAM_INFO.CONTACT.GITHUB)} last />
        </View>

        <Text style={styles.copyright}>{TEAM_INFO.APP_INFO.COPYRIGHT}{"\n"}Une application Ascencia.</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const Feature = ({ icon, title, text, color }: { icon: string; title: string; text: string; color: string }) => (
  <View style={styles.feature}>
    <View style={[styles.featureIcon, { backgroundColor: color }]}><Icon name={icon} size={24} color={COLORS.textPrimary} type="ionicons" /></View>
    <Text style={styles.featureTitle}>{title}</Text>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const InfoRow = ({ label, value, last = false }: { label: string; value: string; last?: boolean }) => (
  <View style={[styles.infoRow, last && styles.infoRowLast]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>
);

const LinkRow = ({ icon, title, onPress, last = false }: { icon: string; title: string; onPress: () => void; last?: boolean }) => (
  <TouchableOpacity style={[styles.linkRow, last && styles.infoRowLast]} onPress={onPress}>
    <View style={styles.linkIcon}><Icon name={icon} size={20} color={COLORS.primary} type="ionicons" /></View>
    <Text style={styles.linkTitle}>{title}</Text>
    <Icon name="arrow-forward" size={18} color={COLORS.coral} type="ionicons" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 62, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 135 },
  profileCard: { padding: 24, alignItems: "center", overflow: "hidden", borderRadius: 30, backgroundColor: COLORS.secondaryBg, ...SHADOWS.sm },
  leafOne: { position: "absolute", right: -12, top: -3, transform: [{ rotate: "-25deg" }] },
  logoShell: { width: 88, height: 88, borderRadius: 30, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", ...SHADOWS.md },
  logo: { width: 58, height: 58, resizeMode: "contain" },
  appName: { color: COLORS.textPrimary, fontSize: 26, fontWeight: "800", fontFamily: TYPOGRAPHY.rounded, marginTop: 17 },
  version: { color: COLORS.coral, fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 5 },
  description: { maxWidth: 300, color: COLORS.textSecondary, textAlign: "center", fontSize: 13, lineHeight: 19, marginTop: 11 },
  badges: { flexDirection: "row", gap: 8, marginTop: 15 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: BORDER_RADIUS.round, backgroundColor: COLORS.surface },
  badgeText: { color: COLORS.primary, fontSize: 10, fontWeight: "700" },
  sectionTitle: { marginTop: 30, marginBottom: 13, color: COLORS.textPrimary, fontSize: 20, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  feature: { width: "48.5%", padding: 14, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface },
  featureIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  featureTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded, marginTop: 12 },
  featureText: { color: COLORS.textTertiary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  infoCard: { paddingHorizontal: 16, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface },
  infoRow: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: COLORS.textSecondary, fontSize: 12 },
  infoValue: { maxWidth: "60%", color: COLORS.textPrimary, fontSize: 12, fontWeight: "700", textAlign: "right" },
  linksCard: { marginTop: 18, paddingHorizontal: 14, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface },
  linkRow: { minHeight: 64, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  linkIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.primaryBg, alignItems: "center", justifyContent: "center" },
  linkTitle: { flex: 1, color: COLORS.textPrimary, fontSize: 13, fontWeight: "700", marginLeft: 11 },
  copyright: { color: COLORS.textTertiary, fontSize: 11, lineHeight: 18, textAlign: "center", marginTop: 25 },
});
