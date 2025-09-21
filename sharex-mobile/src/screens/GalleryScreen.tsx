// Écran de galerie des images uploadées

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  FlatList,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps, UploadHistoryItem } from "../types";
import { UploadHistoryService } from "../services/uploadHistory";
import { ClipboardService } from "../services/clipboard";
import { ViewSelector, ViewMode } from "../components/ViewSelector";
import { ImageCard } from "../components/ImageCard";

export const GalleryScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [stats, setStats] = useState({
    totalUploads: 0,
    totalSize: 0,
  });

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const [historyData, statsData] = await Promise.all([
        UploadHistoryService.getHistory(),
        UploadHistoryService.getStats(),
      ]);
      setHistory(historyData);
      setStats(statsData);
    } catch (error) {
      console.error("Erreur lors du chargement de l'historique:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleItemPress = (item: UploadHistoryItem) => {
    Alert.alert(
      "Informations",
      `Fichier: ${item.filename}\nTaille: ${formatFileSize(
        item.size
      )}\nUploadé: ${formatDate(item.uploadedAt)}`,
      [
        {
          text: "Copier l'URL",
          onPress: () => {
            ClipboardService.copyUrl(item.url);
          },
        },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Supprimer",
              "Êtes-vous sûr de vouloir supprimer cet élément de l'historique ?",
              [
                { text: "Annuler", style: "cancel" },
                {
                  text: "Supprimer",
                  style: "destructive",
                  onPress: async () => {
                    await UploadHistoryService.removeUpload(item.id);
                    loadHistory();
                  },
                },
              ]
            );
          },
        },
        { text: "Fermer", style: "cancel" },
      ]
    );
  };

  const renderHistoryItem = ({ item }: { item: UploadHistoryItem }) => {
    if (viewMode === "grid") {
      return <ImageCard item={item} onPress={handleItemPress} />;
    }

    return (
      <TouchableOpacity
        style={styles.historyItem}
        onPress={() => handleItemPress(item)}
      >
        <View style={styles.itemIcon}>
          <Text style={styles.itemIconText}>🖼️</Text>
        </View>

        <View style={styles.itemContent}>
          <Text style={styles.itemFilename} numberOfLines={1}>
            {item.filename}
          </Text>
          <Text style={styles.itemDetails}>
            {formatFileSize(item.size)} • {formatDate(item.uploadedAt)}
          </Text>
        </View>

        <View style={styles.itemArrow}>
          <Text style={styles.itemArrowText}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadHistory();
  };

  const handleClearHistory = () => {
    Alert.alert(
      "Vider l'historique",
      "Êtes-vous sûr de vouloir supprimer tout l'historique ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            await UploadHistoryService.clearHistory();
            loadHistory();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Galerie</Text>
        {history.length > 0 && (
          <TouchableOpacity onPress={handleClearHistory}>
            <Text style={styles.clearButton}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Statistiques */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.totalUploads}</Text>
          <Text style={styles.statLabel}>Images</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {formatFileSize(stats.totalSize)}
          </Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {/* Sélecteur de vue */}
      {history.length > 0 && (
        <ViewSelector currentView={viewMode} onViewChange={setViewMode} />
      )}

      {/* Liste des images */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      ) : history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyTitle}>Aucune image</Text>
          <Text style={styles.emptySubtitle}>
            Vos images uploadées apparaîtront ici
          </Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => navigation.navigate("Home")}
          >
            <Text style={styles.uploadButtonText}>Uploader une image</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderHistoryItem}
          keyExtractor={(item) => item.id}
          style={styles.historyList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
          numColumns={viewMode === "grid" ? 2 : 1}
          key={viewMode} // Force re-render when view mode changes
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: "#007AFF",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333333",
    flex: 1,
    textAlign: "center",
  },
  clearButton: {
    fontSize: 20,
    padding: 8,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#f8f9fa",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#007AFF",
  },
  statLabel: {
    fontSize: 14,
    color: "#666666",
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#666666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
    marginBottom: 24,
  },
  uploadButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  uploadButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  historyList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#E3F2FD",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  itemIconText: {
    fontSize: 24,
  },
  itemContent: {
    flex: 1,
  },
  itemFilename: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 4,
  },
  itemDetails: {
    fontSize: 14,
    color: "#666666",
  },
  itemArrow: {
    marginLeft: 12,
  },
  itemArrowText: {
    fontSize: 20,
    color: "#C0C0C0",
  },
});
