import React, { useEffect, useRef, useState } from "react";
import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import Constants from "expo-constants";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { Alert, Platform, TouchableOpacity, View } from "react-native";
import { Icon } from "./src/components/Icon";
import { COLORS } from "./src/config/design";

// Import des écrans
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { MainScreen } from "./src/screens/MainScreen";
import { StatsScreen } from "./src/screens/StatsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { AboutScreen } from "./src/screens/AboutScreen";
import { UploadScreen } from "./src/screens/UploadScreen";
import { ShareTestScreen } from "./src/screens/ShareTestScreen";
import { TestScreen } from "./src/screens/TestScreen";

// Import des services
import { StorageService } from "./src/services/storage";
import { ImageInfo } from "./src/types";
import { ImageService } from "./src/services/imageService";
import { screenshotAutoUploadService } from "./src/services/screenshotAutoUpload";
import { ImageDetailScreen } from "./src/screens/ImageDetailScreen";
import { ScreenshotUploadBanner } from "./src/components/ScreenshotUploadBanner";

// Types de navigation
export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: undefined;
  Upload: {
    image?: ImageInfo;
    images?: ImageInfo[];
    autoStart?: boolean;
    source?: "picker" | "camera" | "share" | "test";
  };
  ImageDetail: { imageId: string };
  ShareTest: undefined;
  Test: undefined;
};

export type MainTabParamList = {
  Main: undefined;
  Stats: undefined;
  Settings: undefined;
  About: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 450, fade: true });

// Composant Custom Bottom Bar pour React Navigation
function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  const handleQuickUpload = async () => {
    try {
      const allowed = await ImageService.requestPermissions();
      if (!allowed) {
        Alert.alert("Accès requis", "Autorisez l’accès à vos photos pour choisir une image.");
        return;
      }
      const images = await ImageService.pickMultipleImages();
      if (images.length) {
        const settings = await StorageService.getSettings();
        navigation.getParent()?.navigate("Upload", {
          images,
          autoStart: settings?.autoUpload === true,
          source: "picker",
        });
      }
    } catch {
      Alert.alert("Erreur", "Impossible d’ouvrir votre galerie.");
    }
  };

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: COLORS.surface,
        borderRadius: 26,
        paddingTop: 8,
        paddingHorizontal: 10,
        paddingBottom: Math.max(insets.bottom, 10),
        height: 68 + Math.max(insets.bottom, 10),
        position: "absolute",
        bottom: 10,
        left: 18,
        right: 18,
        shadowColor: COLORS.primaryDark,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
        elevation: 10,
      }}
    >
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        let iconName: string;
        if (route.name === "Main") {
          iconName = isFocused ? "home" : "home-outline";
        } else if (route.name === "Stats") {
          iconName = isFocused ? "stats-chart" : "stats-chart-outline";
        } else if (route.name === "Settings") {
          iconName = isFocused ? "options" : "options-outline";
        } else if (route.name === "About") {
          iconName = isFocused ? "person" : "person-outline";
        } else {
          iconName = "home";
        }

        return (
          <TouchableOpacity
            key={index}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 8,
              marginHorizontal: 2,
              borderRadius: 16,
            }}
          >
            <Icon
              name={iconName}
              size={22}
              color={isFocused ? COLORS.coral : COLORS.textTertiary}
              type="ionicons"
            />
            {isFocused && <View style={{ width: 20, height: 2, borderRadius: 2, marginTop: 6, backgroundColor: COLORS.coral }} />}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Ajouter une image"
        onPress={handleQuickUpload}
        style={{
          width: 54,
          height: 54,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.primary,
          marginLeft: 6,
          marginTop: -18,
          shadowColor: COLORS.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 14,
          elevation: 8,
        }}
      >
        <Icon name="add" size={28} color={COLORS.white} type="ionicons" />
      </TouchableOpacity>
    </View>
  );
}

// Composant Tab Navigator pour les écrans principaux
function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Main"
        component={MainScreen}
        options={{ tabBarLabel: "Accueil" }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{ tabBarLabel: "Stats" }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: "Paramètres" }}
      />
      <Tab.Screen
        name="About"
        component={AboutScreen}
        options={{ tabBarLabel: "À propos" }}
      />
    </Tab.Navigator>
  );
}

function ShareXApplication() {
  const [initialRoute, setInitialRoute] =
    useState<keyof RootStackParamList>("Onboarding");
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const isHandlingShare = useRef(false);
  const {
    hasShareIntent,
    shareIntent,
    resetShareIntent,
    error: shareIntentError,
  } = useShareIntentContext();

  useEffect(() => {
    // Vérifier si l'onboarding a été complété
    checkOnboardingStatus();
  }, []);

  useEffect(() => {
    const applySettings = (settings: Awaited<ReturnType<typeof StorageService.getSettings>>) => {
      screenshotAutoUploadService.configure(settings).catch((error) =>
        console.error("Surveillance des captures impossible:", error)
      );
    };
    StorageService.getSettings().then(applySettings).catch(console.error);
    const unsubscribe = StorageService.subscribeToSettings(applySettings);
    return () => {
      unsubscribe();
      screenshotAutoUploadService.stop();
    };
  }, []);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isReady]);

  useEffect(() => {
    if (shareIntentError) {
      console.error("Erreur de réception du partage:", shareIntentError);
    }
  }, [shareIntentError]);

  useEffect(() => {
    if (
      !isReady ||
      !isNavigationReady ||
      !hasShareIntent ||
      isHandlingShare.current
    ) {
      return;
    }

    isHandlingShare.current = true;

    const openSharedFiles = async () => {
      const files = (shareIntent.files ?? []).filter((file) => Boolean(file.path));
      const images: ImageInfo[] = files.map((file, index) => ({
        uri: file.path,
        name: file.fileName || `fichier_partage_${Date.now()}_${index + 1}`,
        type: file.mimeType || "application/octet-stream",
        size: file.size ?? 0,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
      }));

      if (!images.length) {
        Alert.alert(
          "Partage non pris en charge",
          "Sélectionnez une ou plusieurs images ou fichiers depuis la galerie ou le gestionnaire de fichiers."
        );
        resetShareIntent();
        return;
      }

      const settings = await StorageService.getSettings();
      navigationRef.navigate("Upload", {
        images,
        autoStart: settings?.autoUpload === true,
        source: "share",
      });
      resetShareIntent();
    };

    openSharedFiles()
      .catch((error) => {
        console.error("Impossible d’ouvrir les fichiers partagés:", error);
        Alert.alert("Partage impossible", "Les fichiers partagés n’ont pas pu être ouverts.");
      })
      .finally(() => {
        isHandlingShare.current = false;
      });
  }, [
    hasShareIntent,
    isNavigationReady,
    isReady,
    resetShareIntent,
    shareIntent.files,
  ]);

  const checkOnboardingStatus = async () => {
    try {
      const completed = await StorageService.getOnboardingCompleted();
      if (completed) {
        setHasCompletedOnboarding(true);
        setInitialRoute("MainTabs");
      }
      setIsReady(true);
    } catch (error) {
      console.error("Erreur lors de la vérification de l'onboarding:", error);
      setIsReady(true);
    }
  };

  const handleOnboardingComplete = async () => {
    try {
      console.log("Onboarding terminé, sauvegarde de l'état...");
      await StorageService.setOnboardingCompleted(true);
      setHasCompletedOnboarding(true);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'onboarding:", error);
    }
  };

  if (!isReady) {
    return null; // Attendre que l'état soit prêt
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <NavigationContainer
            ref={navigationRef}
            onReady={() => setIsNavigationReady(true)}
          >
            <Stack.Navigator
              initialRouteName={initialRoute}
              screenOptions={({ navigation }) => ({
                headerShown: false,
                cardStyle: { backgroundColor: "#ffffff" },
                headerBackTitleVisible: false,
                headerLeft: ({ canGoBack, tintColor }) =>
                  canGoBack ? (
                    <TouchableOpacity
                      onPress={() => navigation.goBack()}
                      style={{
                        marginLeft: 16,
                        width: 40,
                        height: 40,
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: COLORS.primaryBg,
                        borderRadius: 20,
                      }}
                    >
                      <Icon
                        name="arrow-back"
                        size={24}
                        color={tintColor || COLORS.primary}
                        type="ionicons"
                      />
                    </TouchableOpacity>
                  ) : undefined,
              })}
            >
              <Stack.Screen name="Onboarding">
                {(props) => (
                  <OnboardingScreen
                    {...props}
                    onComplete={handleOnboardingComplete}
                    navigation={props.navigation}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="MainTabs" component={MainTabNavigator} />
              <Stack.Screen name="Upload" component={UploadScreen} />
              <Stack.Screen name="ImageDetail" component={ImageDetailScreen} />
              <Stack.Screen name="ShareTest" component={ShareTestScreen} />
              <Stack.Screen name="Test" component={TestScreen} />
            </Stack.Navigator>
          </NavigationContainer>
          <ScreenshotUploadBanner />
          <StatusBar style="dark" backgroundColor={COLORS.background} />
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  const isExpoGo = Constants.appOwnership === "expo";

  return (
    <ShareIntentProvider
      options={{
        disabled: isExpoGo || Platform.OS === "web",
        resetOnBackground: false,
      }}
    >
      <ShareXApplication />
    </ShareIntentProvider>
  );
}
