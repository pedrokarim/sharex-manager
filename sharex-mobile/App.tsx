import React, { useEffect, useState, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import * as Linking from "expo-linking";
import { Platform, TouchableOpacity, View, Text } from "react-native";
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
import { SimpleShareIntentService } from "./src/services/simpleShareIntent";
import { StorageService } from "./src/services/storage";
import { ImageInfo } from "./src/types";

// Types de navigation
export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: undefined;
  Upload: { image: ImageInfo };
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

// Composant Custom Bottom Bar pour React Navigation
function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: COLORS.white,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingVertical: 8,
        paddingHorizontal: 12,
        paddingBottom: Math.max(insets.bottom, 8),
        height: 60 + Math.max(insets.bottom, 8),
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        shadowColor: "#000",
        shadowOffset: {
          width: 0,
          height: -2,
        },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 6,
      }}
    >
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel || route.name;
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
          iconName = "home";
        } else if (route.name === "Stats") {
          iconName = "stats-chart";
        } else if (route.name === "Settings") {
          iconName = "settings";
        } else if (route.name === "About") {
          iconName = "information-circle";
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
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 10,
              backgroundColor: isFocused ? COLORS.primary : "transparent",
            }}
          >
            <Icon
              name={iconName}
              size={20}
              color={isFocused ? COLORS.white : COLORS.textTertiary}
              type="ionicons"
            />
            {isFocused && (
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "500",
                  marginTop: 2,
                  color: COLORS.white,
                }}
              >
                {label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
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

export default function App() {
  const [initialRoute, setInitialRoute] =
    useState<keyof RootStackParamList>("Onboarding");
  const [sharedImage, setSharedImage] = useState<ImageInfo | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Vérifier si l'onboarding a été complété
    checkOnboardingStatus();
  }, []);

  useEffect(() => {
    // Vérifier si l'app a été lancée via Share Intent
    checkForSharedContent();
  }, []);

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

  const checkForSharedContent = async () => {
    try {
      console.log("Vérification des contenus partagés...");

      // Vérifier si l'app a été lancée via un Share Intent
      const sharedContent =
        await SimpleShareIntentService.checkForSharedContent();
      if (sharedContent) {
        console.log("Contenu partagé détecté:", sharedContent);
        await handleSharedContent(sharedContent);
      }

      // Vérifier aussi les URLs (pour les liens profonds)
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        console.log("URL initiale détectée:", initialUrl);
        await handleSharedContent(initialUrl);
      }

      // Écouter les nouveaux liens/Share Intents
      const subscription = Linking.addEventListener("url", (event) => {
        handleSharedContent(event.url);
      });

      return () => subscription?.remove();
    } catch (error) {
      console.error(
        "Erreur lors de la vérification des contenus partagés:",
        error
      );
    }
  };

  const handleSharedContent = async (data: string | any) => {
    try {
      console.log("Traitement du contenu partagé:", data);

      let sharedData = null;

      // Si c'est une URL, on la parse
      if (typeof data === "string") {
        const parsedUrl = Linking.parse(data);
        console.log("URL parsée:", parsedUrl);

        if (parsedUrl.queryParams) {
          const { uri, type, name } = parsedUrl.queryParams;
          if (uri && type && type.toString().startsWith("image/")) {
            sharedData = {
              uri: uri.toString(),
              type: type.toString(),
              name: name?.toString() || "shared_image.jpg",
            };
          }
        }
      } else {
        // Si c'est déjà un objet de données partagées
        sharedData = data;
      }

      // Traiter les données partagées
      if (sharedData) {
        const imageInfo = await SimpleShareIntentService.processSharedData(
          sharedData
        );
        if (imageInfo) {
          setSharedImage(imageInfo);
          setInitialRoute("Upload");
          console.log("Image partagée traitée avec succès:", imageInfo);
        }
      }
    } catch (error) {
      console.error("Erreur lors du traitement du contenu partagé:", error);
    }
  };

  if (!isReady) {
    return null; // Attendre que l'état soit prêt
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <NavigationContainer>
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
              <Stack.Screen name="ShareTest" component={ShareTestScreen} />
              <Stack.Screen name="Test" component={TestScreen} />
            </Stack.Navigator>
          </NavigationContainer>
          <StatusBar style="dark" />
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
