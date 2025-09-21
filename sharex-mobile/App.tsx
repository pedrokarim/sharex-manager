import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { Platform, TouchableOpacity } from "react-native";
import { Icon } from "./src/components/Icon";
import { COLORS } from "./src/config/design";

// Import des écrans
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { MainScreen } from "./src/screens/MainScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { UploadScreen } from "./src/screens/UploadScreen";
import { GalleryScreen } from "./src/screens/GalleryScreen";
import { ShareTestScreen } from "./src/screens/ShareTestScreen";

// Import des services
import { SimpleShareIntentService } from "./src/services/simpleShareIntent";
import { StorageService } from "./src/services/storage";
import { ImageInfo } from "./src/types";

// Types de navigation
export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  Settings: undefined;
  Upload: { image: ImageInfo };
  Gallery: undefined;
  ShareTest: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] =
    useState<keyof RootStackParamList>("Onboarding");
  const [sharedImage, setSharedImage] = useState<ImageInfo | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Vérifier si l'onboarding a été complété
    checkOnboardingStatus();
    // Vérifier si l'app a été lancée via Share Intent
    checkForSharedContent();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const completed = await StorageService.getOnboardingCompleted();
      if (completed) {
        setHasCompletedOnboarding(true);
        setInitialRoute("Main");
      }
      setIsReady(true);
    } catch (error) {
      console.error("Erreur lors de la vérification de l'onboarding:", error);
      setIsReady(true);
    }
  };

  const handleOnboardingComplete = async () => {
    try {
      await StorageService.setOnboardingCompleted(true);
      setHasCompletedOnboarding(true);
      setInitialRoute("Main");
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'onboarding:", error);
    }
  };

  const checkForSharedContent = async () => {
    try {
      console.log("Vérification des contenus partagés...");

      // Vérifier si l'app a été lancée via un lien/Share Intent
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

  const handleSharedContent = async (url: string) => {
    try {
      console.log("Traitement du contenu partagé:", url);

      // Parser l'URL pour extraire les données
      const parsedUrl = Linking.parse(url);
      console.log("URL parsée:", parsedUrl);

      // Vérifier si c'est un Share Intent avec des données d'image
      if (parsedUrl.queryParams) {
        const { uri, type, name } = parsedUrl.queryParams;

        if (uri && type && type.toString().startsWith("image/")) {
          const sharedData = {
            uri: uri.toString(),
            type: type.toString(),
            name: name?.toString() || "shared_image.jpg",
          };

          const imageInfo = await SimpleShareIntentService.processSharedData();
          if (imageInfo) {
            setSharedImage(imageInfo);
            setInitialRoute("Upload");
            console.log("Image partagée traitée avec succès:", imageInfo);
          }
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
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Main" component={MainScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Upload" component={UploadScreen} />
          <Stack.Screen name="Gallery" component={GalleryScreen} />
          <Stack.Screen name="ShareTest" component={ShareTestScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
