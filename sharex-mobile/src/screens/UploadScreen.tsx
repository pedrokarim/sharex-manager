import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import {
  ImageInfo,
  NavigationProps,
  ServerConfig,
  UploadResponse,
} from "../types";
import { StorageService } from "../services/storage";
import { getApiService } from "../services/api";
import { ImageService } from "../services/imageService";
import { UploadHistoryService } from "../services/uploadHistory";
import { ClipboardService } from "../services/clipboard";
import { Icon } from "../components/Icon";
import {
  BORDER_RADIUS,
  COLORS,
  SHADOWS,
  TYPOGRAPHY,
} from "../config/design";

type UploadParams = {
  image?: ImageInfo;
  images?: ImageInfo[];
  autoStart?: boolean;
  source?: "picker" | "camera" | "share" | "test";
};

const isImage = (file: ImageInfo) => file.type.startsWith("image/");

export const UploadScreen: React.FC<NavigationProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const params = (route.params ?? {}) as UploadParams;
  const [files, setFiles] = useState<ImageInfo[]>(() =>
    params.images?.length ? params.images : params.image ? [params.image] : []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<Record<number, UploadResponse>>({});
  const [currentUpload, setCurrentUpload] = useState(0);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);

  useEffect(() => {
    StorageService.getServerConfig()
      .then(setServerConfig)
      .catch(console.error)
      .finally(() => setConfigLoaded(true));
  }, []);

  const totalSize = useMemo(
    () => files.reduce((total, file) => total + (file.size || 0), 0),
    [files]
  );
  const resultValues = Object.values(results);
  const successCount = resultValues.filter((result) => result.success).length;
  const failedCount = resultValues.filter((result) => !result.success).length;
  const allSucceeded = files.length > 0 && successCount === files.length;

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "Taille inconnue";
    const units = ["o", "Ko", "Mo", "Go"];
    const rank = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );
    return `${(bytes / 1024 ** rank).toFixed(rank ? 1 : 0)} ${units[rank]}`;
  };

  const upload = async () => {
    if (!serverConfig) {
      Alert.alert(
        "Serveur non configuré",
        "Ajoutez l’URL du serveur et votre clé API dans les paramètres.",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Configurer",
            onPress: () =>
              navigation.navigate("MainTabs", { screen: "Settings" }),
          },
        ]
      );
      return;
    }

    setIsUploading(true);
    const api = getApiService(serverConfig);

    try {
      for (let index = 0; index < files.length; index += 1) {
        if (results[index]?.success) continue;

        const file = files[index];
        setCurrentUpload(index + 1);
        setActiveUploadIndex(index);
        setUploadProgress((current) => ({ ...current, [index]: 0 }));

        let result: UploadResponse;
        try {
          result = await api.uploadFile(file.uri, file.name, file.type, (progress) => {
            setUploadProgress((current) => ({ ...current, [index]: progress }));
          });
        } catch {
          result = {
            success: false,
            error: "Le serveur n’a pas pu recevoir ce fichier.",
          };
        }

        setResults((current) => ({ ...current, [index]: result }));

        if (result.success) {
          await UploadHistoryService.addUpload({
            filename: result.filename || file.name,
            url: result.url || "",
            thumbnailUrl: result.thumbnailUrl,
            size: file.size,
            type: file.type,
            localUri: file.uri,
            width: file.width,
            height: file.height,
          });
        }
      }
    } finally {
      setIsUploading(false);
      setCurrentUpload(0);
      setActiveUploadIndex(null);
    }
  };

  useEffect(() => {
    if (
      configLoaded &&
      params.autoStart &&
      files.length > 0 &&
      !autoStarted
    ) {
      setAutoStarted(true);
      upload().catch(console.error);
    }
  }, [configLoaded, params.autoStart, autoStarted, files.length]);

  const addFiles = async () => {
    const selected = await ImageService.pickMultipleImages();
    if (selected.length) {
      setFiles((current) => [...current, ...selected]);
    }
  };

  const removeFile = (index: number) => {
    if (isUploading || resultValues.length) return;
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  };

  const copyAndClose = async () => {
    const urls = resultValues
      .filter((result) => result.success && result.url)
      .map((result) => result.url as string);
    if (urls.length) await ClipboardService.copyUrl(urls.join("\n"));
    navigation.navigate("MainTabs");
  };

  if (!files.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Icon name="documents-outline" size={42} color={COLORS.primary} type="ionicons" />
          <Text style={styles.emptyTitle}>Aucun fichier reçu</Text>
          <Text style={styles.emptyText}>Revenez en arrière et sélectionnez au moins un fichier.</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.goBack()}>
            <Text style={styles.emptyButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const buttonLabel = isUploading
    ? `Envoi ${currentUpload}/${files.length}…`
    : allSucceeded
      ? successCount > 1
        ? `Copier les ${successCount} liens et terminer`
        : "Copier le lien et terminer"
      : failedCount
        ? `Réessayer ${failedCount} fichier${failedCount > 1 ? "s" : ""}`
        : `Envoyer ${files.length} fichier${files.length > 1 ? "s" : ""}`;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={21} color={COLORS.textPrimary} type="ionicons" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Nouvel upload</Text>
          <Text style={styles.headerSubtitle}>
            {params.source === "share" ? "Reçu depuis le partage" : `${files.length} sélectionné${files.length > 1 ? "s" : ""}`}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={addFiles} disabled={isUploading}>
          <Icon name="add" size={23} color={COLORS.textPrimary} type="ionicons" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 + Math.max(insets.bottom, 20) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewCard}>
          {isImage(files[0]) ? (
            <Image source={{ uri: files[0].uri }} style={styles.preview} resizeMode="cover" />
          ) : (
            <View style={styles.filePreview}>
              <Icon name="document-text-outline" size={58} color={COLORS.primary} type="ionicons" />
              <Text style={styles.filePreviewName} numberOfLines={2}>{files[0].name}</Text>
            </View>
          )}
          <View style={styles.previewTag}>
            <Icon name="checkmark" size={14} color={COLORS.white} type="ionicons" />
            <Text style={styles.previewTagText}>
              {files.length > 1 ? `${files.length} fichiers prêts` : "Prêt à envoyer"}
            </Text>
          </View>
        </View>

        <View style={styles.fileList}>
          {files.map((file, index) => {
            const result = results[index];
            return (
              <View style={styles.fileRow} key={`${file.uri}-${index}`}>
                <View style={styles.fileThumbnail}>
                  {isImage(file) ? (
                    <Image source={{ uri: file.uri }} style={styles.thumbnailImage} />
                  ) : (
                    <Icon name="document-outline" size={21} color={COLORS.primary} type="ionicons" />
                  )}
                </View>
                <View style={styles.fileCopy}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={styles.fileMeta}>
                    {formatFileSize(file.size)} · {file.type.split("/").pop()?.toUpperCase() || "FICHIER"}
                  </Text>
                </View>
                {isUploading && !result?.success ? (
                  <UploadProgressCircle
                    progress={activeUploadIndex === index ? uploadProgress[index] || 0 : 0}
                    active={activeUploadIndex === index}
                  />
                ) : result ? (
                  <View style={[styles.statusIcon, { backgroundColor: result.success ? COLORS.successLight : COLORS.errorLight }]}>
                    <Icon
                      name={result.success ? "checkmark" : "close"}
                      size={17}
                      color={result.success ? COLORS.success : COLORS.error}
                      type="ionicons"
                    />
                  </View>
                ) : (
                  <TouchableOpacity style={styles.removeButton} onPress={() => removeFile(index)} disabled={isUploading}>
                    <Icon name="close" size={17} color={COLORS.textTertiary} type="ionicons" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Détails de l’envoi</Text>
          <Detail icon="documents-outline" label="Fichiers" value={`${files.length}`} />
          <Detail icon="archive-outline" label="Taille totale" value={formatFileSize(totalSize)} />
          <Detail icon="server-outline" label="Destination" value={serverConfig?.url || "Serveur non configuré"} last />
        </View>

        {resultValues.length > 0 && !isUploading && (
          <View style={[styles.resultCard, allSucceeded ? styles.resultSuccess : styles.resultError]}>
            <View style={[styles.resultIcon, { backgroundColor: allSucceeded ? COLORS.success : COLORS.error }]}>
              <Icon name={allSucceeded ? "checkmark" : "alert"} size={20} color={COLORS.white} type="ionicons" />
            </View>
            <View style={styles.resultCopy}>
              <Text style={styles.resultTitle}>
                {allSucceeded ? "Envoi terminé !" : "Envoi partiellement terminé"}
              </Text>
              <Text style={styles.resultText}>
                {successCount} réussi{successCount > 1 ? "s" : ""}{failedCount ? ` · ${failedCount} échoué${failedCount > 1 ? "s" : ""}` : ""}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 10, 20) }]}>
        <TouchableOpacity
          style={[styles.primaryButton, isUploading && styles.primaryButtonDisabled]}
          onPress={allSucceeded ? copyAndClose : upload}
          disabled={isUploading}
        >
          <Text style={styles.primaryText}>{buttonLabel}</Text>
          <View style={styles.buttonIcon}>
            {isUploading ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Icon name={allSucceeded ? "copy-outline" : "arrow-up"} size={19} color={COLORS.primary} type="ionicons" />
            )}
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const Detail = ({ icon, label, value, last = false }: { icon: string; label: string; value: string; last?: boolean }) => (
  <View style={[styles.detailRow, last && styles.detailRowLast]}>
    <View style={styles.detailLeft}>
      <Icon name={icon} size={18} color={COLORS.coral} type="ionicons" />
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
    <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
  </View>
);

const UploadProgressCircle = ({ progress, active }: { progress: number; active: boolean }) => {
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const displayedProgress = Math.max(0.03, Math.min(progress, 1));

  return (
    <View style={[styles.progressIcon, active && styles.progressIconActive]}>
      <Svg width={32} height={32} viewBox="0 0 32 32">
        <Circle cx="16" cy="16" r={radius} fill="none" stroke={COLORS.border} strokeWidth="3" />
        <Circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke={COLORS.primary}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - displayedProgress)}
          rotation="-90"
          origin="16, 16"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  headerButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  headerCopy: { flex: 1, alignItems: "center", paddingHorizontal: 10 },
  headerTitle: { fontSize: 18, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded, color: COLORS.textPrimary },
  headerSubtitle: { color: COLORS.textTertiary, fontSize: 11, marginTop: 2 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 120 },
  previewCard: { height: 260, overflow: "hidden", borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.primaryBg, ...SHADOWS.md },
  preview: { width: "100%", height: "100%" },
  filePreview: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
  filePreviewName: { color: COLORS.textPrimary, fontFamily: TYPOGRAPHY.rounded, fontSize: 16, fontWeight: "700", textAlign: "center", marginTop: 14 },
  previewTag: { position: "absolute", top: 14, left: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 11, paddingVertical: 7, borderRadius: BORDER_RADIUS.round },
  previewTagText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
  fileList: { marginVertical: 16, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, paddingHorizontal: 14 },
  fileRow: { minHeight: 68, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  fileThumbnail: { width: 44, height: 44, borderRadius: 14, overflow: "hidden", backgroundColor: COLORS.secondaryBg, alignItems: "center", justifyContent: "center" },
  thumbnailImage: { width: "100%", height: "100%" },
  fileCopy: { flex: 1, marginHorizontal: 11 },
  fileName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  fileMeta: { color: COLORS.textTertiary, fontSize: 11, marginTop: 3 },
  removeButton: { width: 32, height: 32, borderRadius: 12, backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" },
  statusIcon: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  progressIcon: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center", opacity: 0.5 },
  progressIconActive: { backgroundColor: COLORS.primaryBg, opacity: 1 },
  detailsCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: 18 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: COLORS.textPrimary, fontFamily: TYPOGRAPHY.rounded, marginBottom: 8 },
  detailRow: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  detailRowLast: { borderBottomWidth: 0 },
  detailLeft: { flexDirection: "row", alignItems: "center", gap: 9 },
  detailLabel: { color: COLORS.textSecondary, fontSize: 13 },
  detailValue: { maxWidth: "54%", color: COLORS.textPrimary, fontSize: 13, fontWeight: "600", textAlign: "right" },
  resultCard: { flexDirection: "row", alignItems: "center", marginTop: 16, padding: 15, borderRadius: BORDER_RADIUS.lg },
  resultSuccess: { backgroundColor: COLORS.successLight },
  resultError: { backgroundColor: COLORS.errorLight },
  resultIcon: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 12 },
  resultCopy: { flex: 1 },
  resultTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "700" },
  resultText: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 14, backgroundColor: COLORS.background },
  primaryButton: { minHeight: 60, borderRadius: 22, paddingLeft: 22, paddingRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.primary, ...SHADOWS.md },
  primaryButtonDisabled: { opacity: 0.82 },
  primaryText: { flex: 1, color: COLORS.white, fontSize: 15, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded, paddingRight: 10 },
  buttonIcon: { width: 46, height: 46, borderRadius: 17, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyTitle: { color: COLORS.textPrimary, fontFamily: TYPOGRAPHY.rounded, fontSize: 22, fontWeight: "700", marginTop: 18 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", lineHeight: 21, marginTop: 8 },
  emptyButton: { marginTop: 22, backgroundColor: COLORS.primary, borderRadius: 18, paddingHorizontal: 24, paddingVertical: 14 },
  emptyButtonText: { color: COLORS.white, fontWeight: "700" },
});
