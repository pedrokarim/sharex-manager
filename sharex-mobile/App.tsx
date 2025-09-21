import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

// Import des écrans
import { HomeScreen } from "./src/screens/HomeScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { UploadScreen } from "./src/screens/UploadScreen";
import { GalleryScreen } from "./src/screens/GalleryScreen";
import { ShareTestScreen } from "./src/screens/ShareTestScreen";

// Import des services
import { SimpleShareIntentService } from "./src/services/simpleShareIntent";
import { ImageInfo } from "./src/types";

// Types de navigation
export type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
  Upload: { image: ImageInfo };
  Gallery: undefined;
  ShareTest: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] =
    useState<keyof RootStackParamList>("Home");
  const [sharedImage, setSharedImage] = useState<ImageInfo | null>(null);

  useEffect(() => {
    // Vérifier si l'app a été lancée via Share Intent
    checkForSharedContent();
  }, []);

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

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: "#ffffff" },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
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
