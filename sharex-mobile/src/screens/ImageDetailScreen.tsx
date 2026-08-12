import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { NavigationProps, UploadHistoryItem } from "../types";
import { UploadHistoryService } from "../services/uploadHistory";
import { ClipboardService } from "../services/clipboard";
import { ShareService } from "../services/shareService";
import { HistoryImage } from "../components/HistoryImage";
import { Icon } from "../components/Icon";
import { BORDER_RADIUS, COLORS, TYPOGRAPHY } from "../config/design";

const formatSize = (bytes: number) => {
  if (!bytes) return "Non renseignée";
  const units = ["o", "Ko", "Mo", "Go"];
  const rank = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** rank).toFixed(rank ? 1 : 0)} ${units[rank]}`;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const ImageDetailScreen: React.FC<NavigationProps> = ({ navigation, route }) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<UploadHistoryItem>>(null);
  const infoDrawerRef = useRef<BottomSheetModal>(null);
  const infoSnapPoints = useMemo(() => ["58%", "86%"], []);
  const [items, setItems] = useState<UploadHistoryItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => {
    UploadHistoryService.getHistory()
      .then((history) => {
        const sorted = [...history].sort(
          (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        );
        const requestedIndex = Math.max(0, sorted.findIndex((item) => item.id === route.params?.imageId));
        setItems(sorted);
        setCurrentIndex(requestedIndex);
      })
      .finally(() => setLoaded(true));
  }, [route.params?.imageId]);

  const currentItem = items[currentIndex];

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(Math.max(0, Math.min(nextIndex, items.length - 1)));
    infoDrawerRef.current?.dismiss();
  };

  const copyLink = async (item: UploadHistoryItem) => {
    await ClipboardService.copyUrl(item.url);
    Alert.alert("Lien copié", "L’URL publique est dans le presse-papiers.");
  };

  const shareItem = (item: UploadHistoryItem) =>
    ShareService.shareImageUrl({ url: item.url, filename: item.filename });

  const deleteItem = (item: UploadHistoryItem) => {
    Alert.alert("Supprimer cette image ?", "Elle sera retirée de l’historique local.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          infoDrawerRef.current?.dismiss();
          await UploadHistoryService.removeUpload(item.id);
          const nextItems = items.filter((candidate) => candidate.id !== item.id);
          if (!nextItems.length) {
            navigation.goBack();
            return;
          }
          const nextIndex = Math.min(currentIndex, nextItems.length - 1);
          setItems(nextItems);
          setCurrentIndex(nextIndex);
          requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: nextIndex, animated: false }));
        },
      },
    ]);
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.52}
      />
    ),
    []
  );

  if (!loaded) return <SafeAreaView style={styles.container} />;
  if (!items.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Icon name="images-outline" size={38} color={COLORS.white} type="ionicons" />
          <Text style={styles.emptyText}>Cette image n’est plus dans l’historique.</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.goBack()}>
            <Text style={styles.emptyButtonText}>Retour à la galerie</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        initialScrollIndex={currentIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.viewerPage, { width }]}
            onPress={() => setControlsVisible((visible) => !visible)}
          >
            <HistoryImage
              item={item}
              style={styles.fullImage}
              resizeMode="contain"
              preferThumbnail={false}
            />
          </TouchableOpacity>
        )}
      />

      {controlsVisible && (
        <>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={styles.roundButton} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={23} color={COLORS.white} type="ionicons" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle} numberOfLines={1}>{currentItem?.filename}</Text>
              <Text style={styles.headerSubtitle}>{currentIndex + 1} sur {items.length}</Text>
            </View>
            <TouchableOpacity style={styles.roundButton} onPress={() => currentItem && shareItem(currentItem)}>
              <Icon name="share-outline" size={23} color={COLORS.white} type="ionicons" />
            </TouchableOpacity>
          </View>

          <View style={[styles.toolbar, { bottom: Math.max(insets.bottom + 14, 24) }]}>
            <ViewerAction icon="copy-outline" label="Copier" onPress={() => currentItem && copyLink(currentItem)} />
            <ViewerAction icon="information-circle-outline" label="Infos" onPress={() => infoDrawerRef.current?.present()} />
            <ViewerAction icon="trash-outline" label="Supprimer" onPress={() => currentItem && deleteItem(currentItem)} />
          </View>
        </>
      )}

      <BottomSheetModal
        ref={infoDrawerRef}
        snapPoints={infoSnapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        backgroundStyle={styles.drawerBackground}
        handleIndicatorStyle={styles.drawerHandle}
      >
        {currentItem && (
          <BottomSheetScrollView
            contentContainerStyle={[styles.drawerContent, { paddingBottom: Math.max(insets.bottom + 24, 36) }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.drawerHeader}>
              <View style={styles.drawerThumbnail}>
                <HistoryImage item={currentItem} style={styles.drawerImage} resizeMode="cover" />
              </View>
              <View style={styles.drawerHeaderCopy}>
                <Text style={styles.drawerTitle} numberOfLines={2}>{currentItem.filename}</Text>
                <Text style={styles.drawerDate}>{formatDate(currentItem.uploadedAt)}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Détails</Text>
            <View style={styles.infoCard}>
              <Info icon="archive-outline" label="Taille" value={formatSize(currentItem.size)} />
              <Info icon="document-outline" label="Format" value={currentItem.type || "Non renseigné"} />
              <Info
                icon="resize-outline"
                label="Dimensions"
                value={currentItem.width && currentItem.height ? `${currentItem.width} × ${currentItem.height} px` : "Non renseignées"}
              />
              <Info icon="server-outline" label="Source" value={currentItem.url ? "Serveur ShareX" : "Fichier local"} last />
            </View>

            {!!currentItem.url && (
              <TouchableOpacity style={styles.linkCard} onPress={() => copyLink(currentItem)}>
                <View style={styles.linkIcon}>
                  <Icon name="link-outline" size={19} color={COLORS.coral} type="ionicons" />
                </View>
                <View style={styles.linkCopy}>
                  <Text style={styles.linkLabel}>Lien public</Text>
                  <Text style={styles.linkValue} numberOfLines={2}>{currentItem.url}</Text>
                </View>
                <Icon name="copy-outline" size={18} color={COLORS.primary} type="ionicons" />
              </TouchableOpacity>
            )}
          </BottomSheetScrollView>
        )}
      </BottomSheetModal>
    </View>
  );
};

const ViewerAction = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.viewerAction} onPress={onPress}>
    <Icon name={icon} size={24} color={COLORS.white} type="ionicons" />
    <Text style={styles.viewerActionLabel}>{label}</Text>
  </TouchableOpacity>
);

const Info = ({ icon, label, value, last = false }: { icon: string; label: string; value: string; last?: boolean }) => (
  <View style={[styles.infoRow, last && styles.infoRowLast]}>
    <View style={styles.infoLabelGroup}>
      <Icon name={icon} size={18} color={COLORS.coral} type="ionicons" />
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
    <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  viewerPage: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" },
  fullImage: { width: "100%", height: "100%", backgroundColor: "#000000" },
  header: { position: "absolute", top: 0, left: 0, right: 0, minHeight: 74, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.58)" },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  headerCopy: { flex: 1, alignItems: "center", paddingHorizontal: 10 },
  headerTitle: { maxWidth: "100%", color: COLORS.white, fontSize: 14, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  headerSubtitle: { marginTop: 3, color: "rgba(255,255,255,0.68)", fontSize: 11 },
  toolbar: { position: "absolute", left: 22, right: 22, height: 70, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-around", borderRadius: 24, backgroundColor: "rgba(22,22,22,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  viewerAction: { minWidth: 76, height: 58, alignItems: "center", justifyContent: "center" },
  viewerActionLabel: { marginTop: 4, color: "rgba(255,255,255,0.82)", fontSize: 10, fontWeight: "600" },
  drawerBackground: { backgroundColor: COLORS.background, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  drawerHandle: { width: 42, height: 4, backgroundColor: COLORS.border },
  drawerContent: { paddingHorizontal: 22, paddingTop: 8 },
  drawerHeader: { flexDirection: "row", alignItems: "center", paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  drawerThumbnail: { width: 66, height: 66, overflow: "hidden", borderRadius: 18, backgroundColor: COLORS.surface },
  drawerImage: { width: "100%", height: "100%" },
  drawerHeaderCopy: { flex: 1, marginLeft: 14 },
  drawerTitle: { color: COLORS.textPrimary, fontSize: 17, lineHeight: 22, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  drawerDate: { marginTop: 5, color: COLORS.textTertiary, fontSize: 11 },
  sectionTitle: { marginTop: 22, marginBottom: 11, color: COLORS.textPrimary, fontSize: 19, fontWeight: "700", fontFamily: TYPOGRAPHY.rounded },
  infoCard: { paddingHorizontal: 16, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface },
  infoRow: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabelGroup: { flexDirection: "row", alignItems: "center", gap: 9 },
  infoLabel: { color: COLORS.textSecondary, fontSize: 13 },
  infoValue: { maxWidth: "54%", color: COLORS.textPrimary, fontSize: 13, fontWeight: "600", textAlign: "right" },
  linkCard: { flexDirection: "row", alignItems: "center", marginTop: 14, padding: 15, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface },
  linkIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.accentLight },
  linkCopy: { flex: 1, marginHorizontal: 12 },
  linkLabel: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "700" },
  linkValue: { marginTop: 3, color: COLORS.textTertiary, fontSize: 11, lineHeight: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
  emptyText: { marginTop: 14, color: "rgba(255,255,255,0.72)", textAlign: "center" },
  emptyButton: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 16, backgroundColor: COLORS.primary },
  emptyButtonText: { color: COLORS.white, fontWeight: "700" },
});
