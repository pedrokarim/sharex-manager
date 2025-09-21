import { Share } from "react-native";

export class ShareService {
  /**
   * Partage une URL avec un message prédéfini
   */
  static async shareImageUrl(item: {
    url: string;
    filename: string;
  }): Promise<void> {
    try {
      const shareMessage =
        `📸 Image partagée avec ShareX Manager !\n\n` +
        `🔗 ${item.url}\n\n` +
        `✨ Utilise ShareX Manager pour sauvegarder automatiquement tes images sur un serveur !\n` +
        `📱 Télécharge l'app : [Lien vers l'app]\n\n` +
        `#ShareXManager #ImageSharing #MobileApp`;

      await Share.share({
        message: shareMessage,
        url: item.url,
        title: `Partager ${item.filename}`,
      });
    } catch (error) {
      console.error("Erreur lors du partage:", error);
      throw new Error("Impossible de partager l'image");
    }
  }

  /**
   * Partage une URL simple (sans message prédéfini)
   */
  static async shareUrl(url: string): Promise<void> {
    try {
      await Share.share({
        message: url,
        url: url,
      });
    } catch (error) {
      console.error("Erreur lors du partage de l'URL:", error);
      throw new Error("Impossible de partager l'URL");
    }
  }
}
