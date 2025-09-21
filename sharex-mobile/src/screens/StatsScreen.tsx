// Écran des statistiques détaillées

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { LineChart, BarChart } from "react-native-chart-kit";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProps } from "../types";
import { UploadHistoryService } from "../services/uploadHistory";
import { Icon } from "../components/Icon";
import { ModernCard } from "../components/ModernCard";
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from "../config/design";

const { width } = Dimensions.get("window");

export const StatsScreen: React.FC<NavigationProps> = ({ navigation }) => {
  const [stats, setStats] = useState({
    totalUploads: 0,
    totalSize: 0,
    lastUpload: null as Date | null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [chartData, setChartData] = useState({
    labels: [] as string[],
    datasets: [
      {
        data: [] as number[],
        color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})`, // COLORS.primary
        strokeWidth: 2,
      },
    ],
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const [historyStats, history] = await Promise.all([
        UploadHistoryService.getStats(),
        UploadHistoryService.getHistory(),
      ]);

      setStats({
        ...historyStats,
        lastUpload: historyStats.lastUpload
          ? new Date(historyStats.lastUpload)
          : null,
      });

      // Générer les données du graphique pour les 7 derniers jours
      generateChartData(history);
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateChartData = (history: any[]) => {
    const last7Days = [];
    const today = new Date();

    // Créer les 7 derniers jours
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      last7Days.push(date);
    }

    // Compter les uploads par jour
    const uploadsByDay = last7Days.map((date) => {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      return history.filter((item) => {
        const uploadDate = new Date(item.uploadedAt);
        return uploadDate >= dayStart && uploadDate <= dayEnd;
      }).length;
    });

    // Générer les labels (jours de la semaine)
    const labels = last7Days.map((date) => {
      const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
      return dayNames[date.getDay()];
    });

    setChartData({
      labels,
      datasets: [
        {
          data: uploadsByDay,
          color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})`, // COLORS.primary
          strokeWidth: 2,
        },
      ],
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />
        <View style={styles.loadingContainer}>
          <Icon
            name="stats-chart"
            size={48}
            color={COLORS.primary}
            type="ionicons"
          />
          <Text style={styles.loadingText}>Chargement des statistiques...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.title}>Statistiques</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Statistiques principales */}
        <ModernCard title="Vue d'ensemble" variant="elevated">
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Icon
                  name="images"
                  size={24}
                  color={COLORS.primary}
                  type="ionicons"
                />
              </View>
              <Text style={styles.statNumber}>{stats.totalUploads}</Text>
              <Text style={styles.statLabel}>Images uploadées</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Icon
                  name="folder"
                  size={24}
                  color={COLORS.secondary}
                  type="ionicons"
                />
              </View>
              <Text style={styles.statNumber}>
                {formatFileSize(stats.totalSize)}
              </Text>
              <Text style={styles.statLabel}>Taille totale</Text>
            </View>
          </View>
        </ModernCard>

        {/* Graphique d'activité récente */}
        {chartData.labels.length > 0 && (
          <ModernCard
            title="Activité récente (7 derniers jours)"
            variant="elevated"
            padding="sm"
          >
            <View style={styles.chartContainer}>
              <LineChart
                data={chartData}
                width={width - 40} // Largeur de l'écran moins les marges
                height={300}
                chartConfig={{
                  backgroundColor: COLORS.background,
                  backgroundGradientFrom: COLORS.background,
                  backgroundGradientTo: COLORS.background,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  style: {
                    borderRadius: 16,
                  },
                  propsForDots: {
                    r: "4",
                    strokeWidth: "2",
                    stroke: COLORS.primary,
                  },
                  propsForBackgroundLines: {
                    strokeDasharray: "5,5",
                    stroke: COLORS.borderLight,
                    strokeWidth: 1,
                  },
                }}
                bezier
                style={styles.chart}
              />
            </View>
          </ModernCard>
        )}

        {/* Dernière activité */}
        {stats.lastUpload && (
          <ModernCard title="Dernière activité" variant="elevated">
            <View style={styles.lastActivityContainer}>
              <View style={styles.lastActivityIcon}>
                <Icon
                  name="time"
                  size={20}
                  color={COLORS.accent}
                  type="ionicons"
                />
              </View>
              <View style={styles.lastActivityContent}>
                <Text style={styles.lastActivityTitle}>Dernier upload</Text>
                <Text style={styles.lastActivityDate}>
                  {formatDate(stats.lastUpload)}
                </Text>
              </View>
            </View>
          </ModernCard>
        )}

        {/* Statistiques détaillées */}
        <ModernCard title="Détails" variant="elevated">
          <View style={styles.detailStats}>
            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <Icon
                  name="trending-up"
                  size={16}
                  color={COLORS.success}
                  type="ionicons"
                />
                <Text style={styles.detailLabel}>Taux de réussite</Text>
              </View>
              <Text style={styles.detailValue}>100%</Text>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <Icon
                  name="cloud-upload"
                  size={16}
                  color={COLORS.info}
                  type="ionicons"
                />
                <Text style={styles.detailLabel}>Uploads réussis</Text>
              </View>
              <Text style={styles.detailValue}>{stats.totalUploads}</Text>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <Icon
                  name="server"
                  size={16}
                  color={COLORS.warning}
                  type="ionicons"
                />
                <Text style={styles.detailLabel}>Espace utilisé</Text>
              </View>
              <Text style={styles.detailValue}>
                {formatFileSize(stats.totalSize)}
              </Text>
            </View>
          </View>
        </ModernCard>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: SPACING.lg,
  },
  loadingText: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.textSecondary,
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
    paddingTop: SPACING.lg,
    paddingBottom: 100, // Espace pour la bottom bar
  },
  statsGrid: {
    flexDirection: "row",
    gap: SPACING.lg,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: SPACING.lg,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: BORDER_RADIUS.lg,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  statNumber: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  lastActivityContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  lastActivityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  lastActivityContent: {
    flex: 1,
  },
  lastActivityTitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  lastActivityDate: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  detailStats: {
    gap: SPACING.md,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
  },
  detailLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  detailLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textPrimary,
  },
  detailValue: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textPrimary,
  },
  chartContainer: {
    alignItems: "center",
    marginVertical: SPACING.xs,
    paddingHorizontal: 0,
  },
  chart: {
    marginVertical: 0,
    borderRadius: 16,
  },
});
