// Service de gestion du presse-papiers

import { Alert } from "react-native";

export class ClipboardService {
  /**
   * Copie du texte dans le presse-papiers
   * Note: Dans Expo Go, on utilise une alerte pour simuler la copie
   * En production, on pourrait utiliser @react-native-clipboard/clipboard
   */
  static async copyToClipboard(text: string): Promise<boolean> {
    try {
      // Pour l'instant, on affiche une alerte avec le texte à copier
      // En production, on utiliserait:
      // import Clipboard from '@react-native-clipboard/clipboard';
      // Clipboard.setString(text);

      Alert.alert("Texte à copier", text, [
        {
          text: "OK",
          onPress: () => {
            console.log("Texte copié:", text);
          },
        },
      ]);

      return true;
    } catch (error) {
      console.error("Erreur lors de la copie:", error);
      return false;
    }
  }

  /**
   * Copie une URL avec un message de confirmation
   */
  static async copyUrl(url: string): Promise<void> {
    const success = await this.copyToClipboard(url);
    if (success) {
      Alert.alert("URL copiée", "L'URL a été copiée dans le presse-papiers.", [
        { text: "OK" },
      ]);
    } else {
      Alert.alert("Erreur", "Impossible de copier l'URL.", [{ text: "OK" }]);
    }
  }
}

