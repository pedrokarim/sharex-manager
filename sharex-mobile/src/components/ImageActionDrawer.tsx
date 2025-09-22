// Composant drawer pour les actions sur les images

import React, {
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Icon } from "./Icon";
import {
  COLORS,
  COMPONENT_COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from "../config/design";
import { UploadHistoryItem } from "../types";

interface ImageActionDrawerProps {
  onCopyLink?: (item: UploadHistoryItem) => void;
  onDelete?: (item: UploadHistoryItem) => void;
  onShare?: (item: UploadHistoryItem) => void;
}

export interface ImageActionDrawerRef {
  present: (item: UploadHistoryItem) => void;
  dismiss: () => void;
}

export const ImageActionDrawer = forwardRef<
  ImageActionDrawerRef,
  ImageActionDrawerProps
>(({ onCopyLink, onDelete, onShare }, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [currentItem, setCurrentItem] =
    React.useState<UploadHistoryItem | null>(null);

  // Points d'ancrage du drawer (en pourcentage de la hauteur d'écran)
  const snapPoints = useMemo(() => ["60%"], []);

  // Exposer les méthodes via ref
  useImperativeHandle(ref, () => ({
    present: (item: UploadHistoryItem) => {
      console.log("ImageActionDrawer present called with item:", item);
      console.log("bottomSheetRef.current:", bottomSheetRef.current);
      setCurrentItem(item);
      bottomSheetRef.current?.present();
      console.log("present() called on BottomSheetModal");
    },
    dismiss: () => {
      console.log("ImageActionDrawer dismiss called");
      bottomSheetRef.current?.dismiss();
    },
  }));

  // Callback pour gérer les changements d'index
  const handleSheetChanges = useCallback((index: number) => {
    console.log("BottomSheet index changed to:", index);
    if (index === -1) {
      setCurrentItem(null);
    }
  }, []);

  // Callback pour gérer la fermeture du modal
  const handleDismiss = useCallback(() => {
    console.log("BottomSheet dismissed");
    bottomSheetRef.current?.dismiss();
    setCurrentItem(null);
  }, []);

  // Backdrop personnalisé
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        onPress={handleDismiss}
      />
    ),
    [handleDismiss]
  );

  const handleCopyLink = () => {
    if (currentItem && onCopyLink) {
      onCopyLink(currentItem);
    }
    bottomSheetRef.current?.dismiss();
  };

  const handleDelete = () => {
    if (currentItem && onDelete) {
      onDelete(currentItem);
    }
    bottomSheetRef.current?.dismiss();
  };

  const handleShare = () => {
    if (currentItem && onShare) {
      onShare(currentItem);
    }
    bottomSheetRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      enablePanDownToClose={true}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.content}>
        {/* Header with image */}
        <View style={styles.header}>
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: currentItem?.localUri }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>
          <View style={styles.imageInfo}>
            <Text style={styles.filename} numberOfLines={2}>
              {currentItem?.filename}
            </Text>
            <Text style={styles.fileSize}>
              {formatFileSize(currentItem?.size || 0)}
            </Text>
            <Text style={styles.uploadDate}>
              Uploadé le {formatDate(currentItem?.uploadedAt || "")}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleDismiss}>
            <Icon
              name="close"
              size={24}
              color={COLORS.textSecondary}
              type="ionicons"
            />
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleCopyLink}
          >
            <View style={styles.actionIconContainer}>
              <Icon
                name="copy"
                size={24}
                color={COLORS.primary}
                type="ionicons"
              />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Copier le lien</Text>
              <Text style={styles.actionDescription}>
                Copier l'URL de l'image dans le presse-papiers
              </Text>
            </View>
            <Icon
              name="chevron-forward"
              size={20}
              color={COLORS.textTertiary}
              type="ionicons"
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <View
              style={[
                styles.actionIconContainer,
                { backgroundColor: COLORS.secondary + "20" },
              ]}
            >
              <Icon
                name="share"
                size={24}
                color={COLORS.secondary}
                type="ionicons"
              />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={[styles.actionTitle, { color: COLORS.secondary }]}>
                Partager
              </Text>
              <Text style={styles.actionDescription}>
                Partager l'URL avec un message prédéfini
              </Text>
            </View>
            <Icon
              name="chevron-forward"
              size={20}
              color={COLORS.textTertiary}
              type="ionicons"
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
            <View
              style={[
                styles.actionIconContainer,
                { backgroundColor: COLORS.error + "20" },
              ]}
            >
              <Icon
                name="trash"
                size={24}
                color={COLORS.error}
                type="ionicons"
              />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={[styles.actionTitle, { color: COLORS.error }]}>
                Supprimer
              </Text>
              <Text style={styles.actionDescription}>
                Supprimer cette image de l'historique
              </Text>
            </View>
            <Icon
              name="chevron-forward"
              size={20}
              color={COLORS.textTertiary}
              type="ionicons"
            />
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const styles = StyleSheet.create({
  background: {
    backgroundColor: COMPONENT_COLORS.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: COLORS.borderLight,
    width: 40,
    height: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  header: {
    flexDirection: "row",
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    marginBottom: SPACING.md,
  },
  imageContainer: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: "hidden",
    marginRight: SPACING.md,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageInfo: {
    flex: 1,
    justifyContent: "center",
  },
  filename: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  fileSize: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  uploadDate: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
  },
  closeButton: {
    padding: 8,
    marginLeft: SPACING.sm,
  },
  actions: {
    paddingVertical: SPACING.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
});
