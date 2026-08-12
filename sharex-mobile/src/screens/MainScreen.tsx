import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps, UploadHistoryItem } from "../types";
import { StorageService } from "../services/storage";
import { ImageService } from "../services/imageService";
import { UploadHistoryService } from "../services/uploadHistory";
import { ClipboardService } from "../services/clipboard";
import { ShareService } from "../services/shareService";
import { getApiService } from "../services/api";
import { ViewSelector, ViewMode } from "../components/ViewSelector";
import { ImageCard } from "../components/ImageCard";
import { ImageActionDrawer, ImageActionDrawerRef } from "../components/ImageActionDrawer";
import { Icon } from "../components/Icon";
import { BORDER_RADIUS, COLORS, SHADOWS, SPACING, TYPOGRAPHY } from "../config/design";

const { width } = Dimensions.get("window");

export const MainScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const actionDrawerRef = useRef<ImageActionDrawerRef>(null);

  const loadHistory = async () => setHistory(await UploadHistoryService.getHistory());

  const checkConfiguration = async () => {
    const configured = await StorageService.isConfigured();
    setIsConfigured(configured);
    if (!configured) return;
    const config = await StorageService.getServerConfig();
    if (!config) return;
    getApiService(config)
      .testConnection()
      .then(setIsConnected)
      .catch(() => setIsConnected(false));
  };

  useEffect(() => {
    loadHistory().catch(console.error);
    checkConfiguration().catch(console.error);
    const unsubscribeNavigation = navigation.addListener("focus", () => {
      loadHistory().catch(console.error);
      checkConfiguration().catch(console.error);
    });
    const unsubscribeHistory = UploadHistoryService.subscribe(() => {
      loadHistory().catch(console.error);
    });
    return () => {
      unsubscribeNavigation();
      unsubscribeHistory();
    };
  }, [navigation]);

  const pickImage = async () => {
    const allowed = await ImageService.requestPermissions();
    if (!allowed) {
      Alert.alert("Accès requis", "Autorisez l’accès à vos photos pour continuer.");
      return;
    }
    const images = await ImageService.pickMultipleImages();
    if (images.length) {
      const settings = await StorageService.getSettings();
      navigation.navigate("Upload", {
        images,
        autoStart: settings?.autoUpload === true,
        source: "picker",
      });
    }
  };

  const takePhoto = async () => {
    const allowed = await ImageService.requestPermissions();
    if (!allowed) {
      Alert.alert("Accès requis", "Autorisez l’accès à l’appareil photo pour continuer.");
      return;
    }
    const image = await ImageService.takePhoto(false);
    if (image) {
      const settings = await StorageService.getSettings();
      navigation.navigate("Upload", {
        images: [image],
        autoStart: settings?.autoUpload === true,
        source: "camera",
      });
    }
  };

  const filteredHistory = history
    .filter((item) => item.filename.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  const openPreview = (item: UploadHistoryItem) =>
    navigation.navigate("ImageDetail", { imageId: item.id });

  const copyLink = async (item: UploadHistoryItem) => {
    await ClipboardService.copyUrl(item.url);
    Alert.alert("Lien copié", "Le lien public est prêt à être partagé.");
  };

  const shareImage = async (item: UploadHistoryItem) =>
    ShareService.shareImageUrl({ url: item.url, filename: item.filename });

  const deleteImage = (item: UploadHistoryItem) => {
    Alert.alert("Supprimer cette image ?", "Elle sera retirée de l’historique local.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await UploadHistoryService.removeUpload(item.id);
          await loadHistory();
        },
      },
    ]);
  };

  const greeting = new Date().getHours() < 18 ? "Bonjour" : "Bonsoir";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.roundButton} onPress={() => navigation.navigate("Settings")}>
            <Icon name="menu" size={22} color={COLORS.textPrimary} type="ionicons" />
          </TouchableOpacity>
          <View style={styles.brandMark}>
            <Image source={require("../../assets/logo-sxm-simple.png")} style={styles.logo} />
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>{greeting} 👋</Text>
          <Text style={styles.headline}>Vos images,{"\n"}partout avec vous.</Text>
          <View style={styles.scribble} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <ActionChip icon="images-outline" label="Galerie" color={COLORS.secondaryBg} onPress={pickImage} />
          <ActionChip icon="camera-outline" label="Caméra" color={COLORS.primaryBg} onPress={takePhoto} />
          <ActionChip icon="link-outline" label="Liens publics" color={COLORS.infoLight} onPress={() => navigation.navigate("Stats")} />
        </ScrollView>

        <View style={styles.heroCard}>
          <Image source={require("../../assets/editorial-home.png")} style={styles.heroImage} resizeMode="cover" />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>Envoyez.{"\n"}Partagez.{"\n"}C’est fait.</Text>
            <TouchableOpacity style={styles.heroButton} onPress={pickImage}>
              <Text style={styles.heroButtonText}>Choisir une image</Text>
              <Icon name="arrow-forward" size={17} color={COLORS.primary} type="ionicons" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.connectionRow}>
          <View style={[styles.connectionDot, { backgroundColor: isConnected ? COLORS.success : COLORS.error }]} />
          <Text style={styles.connectionText}>
            {!isConfigured ? "Serveur à configurer" : isConnected ? "Serveur connecté" : "Serveur hors ligne"}
          </Text>
          {!isConfigured && (
            <TouchableOpacity onPress={() => navigation.navigate("Settings")}>
              <Text style={styles.connectionLink}>Configurer</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Uploads récents</Text>
            <Text style={styles.sectionSubtitle}>{history.length} image{history.length !== 1 ? "s" : ""} dans votre historique</Text>
          </View>
          <ViewSelector currentView={viewMode} onViewChange={setViewMode} />
        </View>

        {history.length > 0 && (
          <View style={styles.searchBox}>
            <Icon name="search-outline" size={18} color={COLORS.textTertiary} type="ionicons" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Rechercher un fichier"
              placeholderTextColor={COLORS.textTertiary}
              style={styles.searchInput}
            />
            {!!searchQuery && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Icon name="close-circle" size={18} color={COLORS.textTertiary} type="ionicons" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {filteredHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Icon name="image-outline" size={28} color={COLORS.primary} type="ionicons" />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>{searchQuery ? "Aucun résultat" : "Votre galerie vous attend"}</Text>
              <Text style={styles.emptyText}>{searchQuery ? "Essayez un autre nom de fichier." : "Votre premier upload apparaîtra juste ici."}</Text>
            </View>
          </View>
        ) : (
          <View style={viewMode === "list" ? styles.list : viewMode === "mini-grid" ? styles.miniGrid : styles.grid}>
            {filteredHistory.map((item) => (
              <View key={item.id} style={viewMode === "list" ? undefined : viewMode === "mini-grid" ? styles.miniGridItem : styles.gridItem}>
                <ImageCard item={item} onPress={openPreview} onMenuPress={(value) => actionDrawerRef.current?.present(value)} viewMode={viewMode} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ImageActionDrawer ref={actionDrawerRef} onCopyLink={copyLink} onDelete={deleteImage} onShare={shareImage} />
    </SafeAreaView>
  );
};

const ActionChip = ({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.8}>
    <View style={[styles.chipIcon, { backgroundColor: color }]}>
      <Icon name={icon} size={18} color={COLORS.textPrimary} type="ionicons" />
    </View>
    <Text style={styles.chipText}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 22, paddingBottom: 130 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 },
  roundButton: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  brandMark: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primaryBg },
  logo: { width: 28, height: 28, resizeMode: "contain" },
  intro: { marginTop: 28, marginBottom: 20 },
  eyebrow: { fontSize: TYPOGRAPHY.fontSize.md, color: COLORS.coral, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded, marginBottom: 7 },
  headline: { fontSize: 36, lineHeight: 43, color: COLORS.textPrimary, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded, letterSpacing: -0.8 },
  scribble: { width: 150, height: 4, borderRadius: 4, backgroundColor: COLORS.coral, marginTop: 9, transform: [{ rotate: "-2deg" }] },
  chips: { gap: 10, paddingRight: 22, paddingBottom: 22 },
  chip: { flexDirection: "row", alignItems: "center", gap: 9, padding: 7, paddingRight: 15, borderRadius: BORDER_RADIUS.round, backgroundColor: COLORS.surface },
  chipIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: TYPOGRAPHY.fontSize.sm, color: COLORS.textPrimary, fontWeight: "600", fontFamily: TYPOGRAPHY.rounded },
  heroCard: { height: 285, borderRadius: BORDER_RADIUS.xl, overflow: "hidden", backgroundColor: COLORS.coral, ...SHADOWS.md },
  heroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroOverlay: { flex: 1, padding: 25, justifyContent: "space-between", alignItems: "flex-start" },
  heroTitle: { fontSize: 27, lineHeight: 32, color: COLORS.white, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded, textShadowColor: "rgba(49,16,79,.18)", textShadowRadius: 8 },
  heroButton: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 15, height: 44, borderRadius: 15, backgroundColor: COLORS.white },
  heroButtonText: { color: COLORS.primary, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded, fontSize: 13 },
  connectionRow: { flexDirection: "row", alignItems: "center", marginTop: 16, paddingHorizontal: 4 },
  connectionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  connectionText: { flex: 1, color: COLORS.textSecondary, fontSize: 13 },
  connectionLink: { color: COLORS.primary, fontSize: 13, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 32, marginBottom: 15 },
  sectionTitle: { fontSize: 21, color: COLORS.textPrimary, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  sectionSubtitle: { fontSize: 12, color: COLORS.textTertiary, marginTop: 3 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, paddingHorizontal: 15, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, marginBottom: 16 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridItem: { width: (width - 56) / 2 },
  miniGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  miniGridItem: { width: (width - 68) / 4 },
  list: { gap: 4 },
  emptyState: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, padding: 16, borderRadius: BORDER_RADIUS.xl },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: COLORS.secondaryBg, alignItems: "center", justifyContent: "center", marginRight: 14 },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  emptyText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 3 },
});
