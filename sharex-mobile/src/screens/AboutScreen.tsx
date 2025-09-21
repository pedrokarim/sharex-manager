// Écran À propos de l'application

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Linking,
  Dimensions,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps } from "../types";
import { Icon } from "../components/Icon";
import { ModernCard } from "../components/ModernCard";
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from "../config/design";
import { TEAM_INFO } from "../config/constants";

const { width } = Dimensions.get("window");

export const AboutScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error("Erreur lors de l'ouverture du lien:", error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon
            name="arrow-back"
            size={24}
            color={COLORS.primary}
            type="ionicons"
          />
        </TouchableOpacity>
        <Text style={styles.title}>À propos</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo et nom de l'app */}
        <View style={styles.appInfo}>
          <View style={styles.logoContainer}>
            <Image
              source={require("../../assets/logo-sxm-simple.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appName}>{TEAM_INFO.APP_INFO.NAME}</Text>
          <Text style={styles.appVersion}>
            Version {TEAM_INFO.APP_INFO.VERSION}
          </Text>
          <Text style={styles.appDescription}>
            {TEAM_INFO.APP_INFO.DESCRIPTION}
          </Text>
        </View>

        {/* Fonctionnalités principales */}
        <ModernCard title="Fonctionnalités" variant="elevated">
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Icon
                name="images"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.featureText}>
                Upload d'images depuis la galerie
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon
                name="camera"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.featureText}>
                Prise de photos avec la caméra
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon
                name="share"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.featureText}>
                Partage depuis d'autres applications
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon
                name="cut"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.featureText}>
                Édition et recadrage d'images
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon
                name="stats-chart"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.featureText}>Statistiques détaillées</Text>
            </View>
            <View style={styles.featureItem}>
              <Icon
                name="grid"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.featureText}>
                Galerie avec vues grille et liste
              </Text>
            </View>
          </View>
        </ModernCard>

        {/* Informations techniques */}
        <ModernCard title="Informations techniques" variant="elevated">
          <View style={styles.techInfo}>
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>Plateforme:</Text>
              <Text style={styles.techValue}>React Native + Expo</Text>
            </View>
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>Langage:</Text>
              <Text style={styles.techValue}>TypeScript</Text>
            </View>
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>UI Framework:</Text>
              <Text style={styles.techValue}>React Native + Tailwind CSS</Text>
            </View>
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>Navigation:</Text>
              <Text style={styles.techValue}>React Navigation</Text>
            </View>
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>Stockage:</Text>
              <Text style={styles.techValue}>Expo SecureStore</Text>
            </View>
          </View>
        </ModernCard>

        {/* Liens utiles */}
        <ModernCard title="Liens utiles" variant="elevated">
          <View style={styles.linksList}>
            <TouchableOpacity
              style={styles.linkItem}
              onPress={() => openLink(TEAM_INFO.CONTACT.GITHUB)}
            >
              <Icon
                name="logo-github"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.linkText}>Code source sur GitHub</Text>
              <Icon
                name="chevron-forward"
                size={16}
                color={COLORS.textTertiary}
                type="ionicons"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkItem}
              onPress={() => openLink(TEAM_INFO.CONTACT.WEBSITE)}
            >
              <Icon
                name="globe"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.linkText}>Site web Ascencia</Text>
              <Icon
                name="chevron-forward"
                size={16}
                color={COLORS.textTertiary}
                type="ionicons"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkItem}
              onPress={() => openLink("https://docs.expo.dev/")}
            >
              <Icon
                name="document-text"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.linkText}>Documentation Expo</Text>
              <Icon
                name="chevron-forward"
                size={16}
                color={COLORS.textTertiary}
                type="ionicons"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkItem}
              onPress={() => openLink("https://reactnative.dev/")}
            >
              <Icon
                name="logo-react"
                size={20}
                color={COLORS.primary}
                type="ionicons"
              />
              <Text style={styles.linkText}>Documentation React Native</Text>
              <Icon
                name="chevron-forward"
                size={16}
                color={COLORS.textTertiary}
                type="ionicons"
              />
            </TouchableOpacity>
          </View>
        </ModernCard>

        {/* Crédits */}
        <ModernCard title="Crédits" variant="elevated">
          <View style={styles.creditsList}>
            <View style={styles.creditItem}>
              <Text style={styles.creditLabel}>Développé par:</Text>
              <Text style={styles.creditValue}>
                {TEAM_INFO.DEVELOPER.NAME} ({TEAM_INFO.DEVELOPER.ALIAS})
              </Text>
            </View>
            <View style={styles.creditItem}>
              <Text style={styles.creditLabel}>Société:</Text>
              <Text style={styles.creditValue}>{TEAM_INFO.COMPANY.NAME}</Text>
            </View>
            <View style={styles.creditItem}>
              <Text style={styles.creditLabel}>Icônes:</Text>
              <Text style={styles.creditValue}>Ionicons</Text>
            </View>
            <View style={styles.creditItem}>
              <Text style={styles.creditLabel}>Framework:</Text>
              <Text style={styles.creditValue}>Expo & React Native</Text>
            </View>
            <View style={styles.creditItem}>
              <Text style={styles.creditLabel}>Licence:</Text>
              <Text style={styles.creditValue}>MIT</Text>
            </View>
          </View>
        </ModernCard>

        {/* Copyright */}
        <View style={styles.copyright}>
          <Text style={styles.copyrightText}>
            {TEAM_INFO.APP_INFO.COPYRIGHT}
          </Text>
          <Text style={styles.copyrightSubtext}>
            Application développée avec ❤️ par {TEAM_INFO.DEVELOPER.NAME} (
            {TEAM_INFO.DEVELOPER.ALIAS})
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  backButton: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryBg,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  scrollContent: {
    paddingBottom: 60, // Espace pour la bottom bar
  },
  appInfo: {
    alignItems: "center",
    paddingVertical: SPACING.xxxl,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  logo: {
    width: 80,
    height: 80,
  },
  appName: {
    fontSize: TYPOGRAPHY.fontSize.xxxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  appVersion: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  appDescription: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: TYPOGRAPHY.lineHeight.relaxed * TYPOGRAPHY.fontSize.lg,
  },
  featuresList: {
    gap: SPACING.md,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  featureText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textPrimary,
    flex: 1,
  },
  techInfo: {
    gap: SPACING.sm,
  },
  techRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  techLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textSecondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  techValue: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textPrimary,
  },
  linksList: {
    gap: SPACING.sm,
  },
  linkItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.backgroundSecondary,
    gap: SPACING.md,
  },
  linkText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textPrimary,
    flex: 1,
  },
  creditsList: {
    gap: SPACING.sm,
  },
  creditItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  creditLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textSecondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  creditValue: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textPrimary,
  },
  copyright: {
    alignItems: "center",
    paddingVertical: SPACING.xxxl,
    marginTop: SPACING.lg,
  },
  copyrightText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textTertiary,
    textAlign: "center",
    marginBottom: SPACING.xs,
  },
  copyrightSubtext: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    textAlign: "center",
  },
});
