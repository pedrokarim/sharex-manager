import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import * as ScreenCapture from "expo-screen-capture";
import { NavigationProps, AppSettings } from "../types";
import { StorageService } from "../services/storage";
import { ShareXApiService } from "../services/api";
import { Icon } from "../components/Icon";
import { QRCodeScannerScreen } from "./QRCodeScannerScreen";
import { BORDER_RADIUS, COLORS, SHADOWS, TYPOGRAPHY } from "../config/design";

const defaults: AppSettings = {
  serverUrl: "",
  apiKey: "",
  autoUpload: false,
  autoUploadScreenshots: false,
  notifications: true,
  theme: "auto",
  allowImageEditing: true,
};

export const SettingsScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  const load = async () => setSettings((await StorageService.getSettings()) || defaults);

  useEffect(() => {
    load().catch(console.error);
    const unsubscribe = navigation.addListener("focus", () => load().catch(console.error));
    return unsubscribe;
  }, [navigation]);

  const save = async () => {
    if (!settings.serverUrl.trim() || !settings.apiKey.trim()) {
      Alert.alert("Configuration incomplète", "Renseignez l’URL du serveur et la clé API.");
      return;
    }
    setIsSaving(true);
    try {
      await StorageService.saveSettings(settings);
      Alert.alert("Tout est enregistré", "ShareX Manager est prêt à envoyer vos images.");
    } catch {
      Alert.alert("Erreur", "Les paramètres n’ont pas pu être enregistrés.");
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    if (!settings.serverUrl.trim()) {
      Alert.alert("URL manquante", "Indiquez l’adresse de votre serveur.");
      return;
    }
    setIsTesting(true);
    try {
      const connected = await ShareXApiService.testServerUrl(settings.serverUrl);
      Alert.alert(connected ? "Serveur accessible" : "Connexion impossible", connected ? "L’adresse répond correctement." : "Vérifiez l’adresse et votre connexion réseau.");
    } finally {
      setIsTesting(false);
    }
  };

  const clearData = () => Alert.alert(
    "Effacer les données ?",
    "La configuration et les préférences locales seront supprimées.",
    [
      { text: "Annuler", style: "cancel" },
      {
        text: "Effacer",
        style: "destructive",
        onPress: async () => {
          await StorageService.clearAll();
          setSettings(defaults);
        },
      },
    ],
  );

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const updateScreenshotUpload = async (enabled: boolean) => {
    if (!settings.serverUrl.trim() || !settings.apiKey.trim()) {
      Alert.alert(
        "Configuration requise",
        "Enregistrez d’abord l’URL du serveur et la clé API."
      );
      return;
    }

    if (!enabled) {
      const next = { ...settings, autoUploadScreenshots: false };
      setSettings(next);
      await StorageService.saveSettings(next);
      return;
    }

    const [mediaPermission, capturePermission] = await Promise.all([
      MediaLibrary.requestPermissionsAsync(false, ["photo"]),
      ScreenCapture.requestPermissionsAsync(),
    ]);
    if (
      mediaPermission.status !== "granted" ||
      mediaPermission.accessPrivileges === "limited" ||
      capturePermission.status !== "granted"
    ) {
      Alert.alert(
        "Accès complet requis",
        "Autorisez l’accès à toutes les photos pour que ShareX Manager puisse retrouver automatiquement chaque nouvelle capture d’écran."
      );
      const next = { ...settings, autoUploadScreenshots: false };
      setSettings(next);
      await StorageService.saveSettings(next);
      return;
    }

    let notificationsEnabled = settings.notifications;
    if (notificationsEnabled) {
      const notificationPermission = await Notifications.requestPermissionsAsync();
      if (notificationPermission.status !== "granted") {
        notificationsEnabled = false;
        Alert.alert(
          "Notifications refusées",
          "L’envoi automatique fonctionnera quand même : son état restera visible directement dans l’application."
        );
      }
    }

    const next = {
      ...settings,
      autoUploadScreenshots: true,
      notifications: notificationsEnabled,
    };
    setSettings(next);
    await StorageService.saveSettings(next);
    Alert.alert(
      "Captures automatiques activées",
      "La notification permanente maintient la surveillance en arrière-plan. Faites une capture maintenant : son envoi sera confirmé automatiquement."
    );
  };

  const updateNotifications = async (enabled: boolean) => {
    let granted = enabled;
    if (enabled) {
      const permission = await Notifications.requestPermissionsAsync();
      granted = permission.status === "granted";
      if (!granted) {
        Alert.alert(
          "Notifications non autorisées",
          "Activez-les dans les réglages Android. Le suivi intégré des envois restera disponible."
        );
      }
    }
    const next = { ...settings, notifications: granted };
    setSettings(next);
    if (next.serverUrl.trim() && next.apiKey.trim()) {
      await StorageService.saveSettings(next);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate("Main")}>
          <Icon name="menu" size={22} color={COLORS.textPrimary} type="ionicons" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <TouchableOpacity style={styles.avatarButton} onPress={() => navigation.navigate("About")}>
          <Icon name="person" size={19} color={COLORS.primary} type="ionicons" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>VOTRE ESPACE</Text>
        <Text style={styles.title}>Connectez votre serveur.</Text>
        <Text style={styles.subtitle}>Une fois configuré, chaque image part exactement là où vous le souhaitez.</Text>

        <View style={styles.serverCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}><Icon name="server-outline" size={22} color={COLORS.white} type="ionicons" /></View>
            <View style={styles.cardTitleCopy}>
              <Text style={styles.cardTitle}>Serveur ShareX</Text>
              <Text style={styles.cardSubtitle}>Connexion sécurisée par clé API</Text>
            </View>
            <TouchableOpacity style={styles.qrButton} onPress={() => setShowQRScanner(true)}>
              <Icon name="qr-code-outline" size={22} color={COLORS.primary} type="ionicons" />
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>URL du serveur</Text>
          <View style={styles.inputShell}>
            <Icon name="globe-outline" size={18} color={COLORS.coral} type="ionicons" />
            <TextInput
              style={styles.input}
              value={settings.serverUrl}
              onChangeText={(value) => update("serverUrl", value)}
              placeholder="https://votre-serveur.com"
              placeholderTextColor={COLORS.textTertiary}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.inputLabel}>Clé API</Text>
          <View style={styles.inputShell}>
            <Icon name="key-outline" size={18} color={COLORS.coral} type="ionicons" />
            <TextInput
              style={styles.input}
              value={settings.apiKey}
              onChangeText={(value) => update("apiKey", value)}
              placeholder="••••••••••••••••"
              placeholderTextColor={COLORS.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity style={styles.testButton} onPress={testConnection} disabled={isTesting}>
            <Icon name={isTesting ? "hourglass-outline" : "wifi-outline"} size={18} color={COLORS.primary} type="ionicons" />
            <Text style={styles.testText}>{isTesting ? "Test en cours…" : "Tester la connexion"}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Préférences</Text>
        <View style={styles.optionsCard}>
          <SettingRow icon="flash-outline" title="Upload automatique" description="Envoyer directement après sélection" color={COLORS.accentLight} value={settings.autoUpload} onChange={(value) => update("autoUpload", value)} />
          <SettingRow icon="phone-portrait-outline" title="Captures automatiques" description="Arrière-plan · notification permanente" color={COLORS.accentLight} value={settings.autoUploadScreenshots} onChange={(value) => { updateScreenshotUpload(value).catch(console.error); }} />
          <SettingRow icon="notifications-outline" title="Notifications" description="Confirmer chaque envoi" color={COLORS.secondaryBg} value={settings.notifications} onChange={(value) => { updateNotifications(value).catch(console.error); }} />
          <SettingRow icon="color-wand-outline" title="Édition d’image" description="Recadrer avant l’envoi" color={COLORS.primaryBg} value={settings.allowImageEditing} onChange={(value) => update("allowImageEditing", value)} last />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={save} disabled={isSaving}>
          <Text style={styles.saveText}>{isSaving ? "Enregistrement…" : "Enregistrer les paramètres"}</Text>
          <View style={styles.saveIcon}><Icon name="checkmark" size={20} color={COLORS.primary} type="ionicons" /></View>
        </TouchableOpacity>

        <View style={styles.secondaryActions}>
          {__DEV__ && <ActionRow icon="bug-outline" label="Tests et débogage" onPress={() => navigation.navigate("Test")} />}
          <ActionRow icon="information-circle-outline" label="À propos de l’application" onPress={() => navigation.navigate("About")} />
          <ActionRow icon="trash-outline" label="Effacer les données locales" danger onPress={clearData} />
        </View>
      </ScrollView>

      <QRCodeScannerScreen visible={showQRScanner} onClose={() => { setShowQRScanner(false); load().catch(console.error); }} />
    </SafeAreaView>
  );
};

const SettingRow = ({ icon, title, description, color, value, onChange, last = false }: { icon: string; title: string; description: string; color: string; value: boolean; onChange: (value: boolean) => void; last?: boolean }) => (
  <View style={[styles.settingRow, last && styles.settingRowLast]}>
    <View style={[styles.settingIcon, { backgroundColor: color }]}><Icon name={icon} size={20} color={COLORS.textPrimary} type="ionicons" /></View>
    <View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingDescription}>{description}</Text></View>
    <Switch value={value} onValueChange={onChange} trackColor={{ false: COLORS.gray300, true: COLORS.primaryLight }} thumbColor={value ? COLORS.primary : COLORS.white} />
  </View>
);

const ActionRow = ({ icon, label, onPress, danger = false }: { icon: string; label: string; onPress: () => void; danger?: boolean }) => (
  <TouchableOpacity style={styles.actionRow} onPress={onPress}>
    <Icon name={icon} size={19} color={danger ? COLORS.error : COLORS.textSecondary} type="ionicons" />
    <Text style={[styles.actionLabel, danger && { color: COLORS.error }]}>{label}</Text>
    <Icon name="chevron-forward" size={17} color={COLORS.textTertiary} type="ionicons" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 62, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  avatarButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.primaryBg, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 135 },
  kicker: { color: COLORS.coral, fontSize: 12, letterSpacing: 1.5, fontWeight: "800", fontFamily: TYPOGRAPHY.rounded },
  title: { marginTop: 8, color: COLORS.textPrimary, fontSize: 31, lineHeight: 37, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  serverCard: { padding: 18, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface, ...SHADOWS.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  cardIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  cardTitleCopy: { flex: 1, marginHorizontal: 11 },
  cardTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  cardSubtitle: { color: COLORS.textTertiary, fontSize: 11, marginTop: 3 },
  qrButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.primaryBg, alignItems: "center", justifyContent: "center" },
  inputLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 7, marginLeft: 2 },
  inputShell: { height: 52, marginBottom: 14, paddingHorizontal: 14, borderRadius: 17, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.background },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 0 },
  testButton: { height: 48, borderRadius: 17, backgroundColor: COLORS.primaryBg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 3 },
  testText: { color: COLORS.primary, fontSize: 13, fontWeight: "700" },
  sectionTitle: { marginTop: 30, marginBottom: 13, color: COLORS.textPrimary, fontSize: 20, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  optionsCard: { paddingHorizontal: 16, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface },
  settingRow: { minHeight: 78, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  settingRowLast: { borderBottomWidth: 0 },
  settingIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  settingCopy: { flex: 1, marginLeft: 11 },
  settingTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  settingDescription: { color: COLORS.textTertiary, fontSize: 11, marginTop: 3 },
  saveButton: { marginTop: 22, height: 60, paddingLeft: 21, paddingRight: 7, borderRadius: 21, backgroundColor: COLORS.primary, flexDirection: "row", alignItems: "center", justifyContent: "space-between", ...SHADOWS.md },
  saveText: { color: COLORS.white, fontSize: 15, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  saveIcon: { width: 46, height: 46, borderRadius: 17, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  secondaryActions: { marginTop: 20, borderRadius: BORDER_RADIUS.xl, paddingHorizontal: 16, backgroundColor: COLORS.surface },
  actionRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  actionLabel: { flex: 1, color: COLORS.textSecondary, fontSize: 13, fontWeight: "600" },
});
