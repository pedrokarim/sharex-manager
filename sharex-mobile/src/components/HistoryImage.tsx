import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  ImageResizeMode,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
} from "react-native";
import { UploadHistoryItem } from "../types";
import { COLORS } from "../config/design";
import { Icon } from "./Icon";

type HistoryImageProps = {
  item: UploadHistoryItem;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  preferThumbnail?: boolean;
};

const imageExtensions = /\.(avif|gif|heic|heif|jpe?g|png|webp)(?:$|[?#])/i;

const isImageItem = (item: UploadHistoryItem) =>
  item.type === "image" ||
  item.type.startsWith("image/") ||
  imageExtensions.test(item.filename) ||
  imageExtensions.test(item.url);

/**
 * Affiche d'abord la ressource persistante du serveur. Les URI du sélecteur
 * Android/iOS ne sont gardées qu'en dernier recours car elles peuvent expirer.
 */
export const HistoryImage: React.FC<HistoryImageProps> = ({
  item,
  style,
  resizeMode = "cover",
  preferThumbnail = true,
}) => {
  const candidates = useMemo(
    () =>
      [preferThumbnail ? item.thumbnailUrl : undefined, item.url, item.localUri]
        .filter((uri): uri is string => Boolean(uri))
        .filter((uri, index, values) => values.indexOf(uri) === index),
    [item.localUri, item.thumbnailUrl, item.url, preferThumbnail]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => setCandidateIndex(0), [candidates.join("|")]);

  if (!isImageItem(item) || candidateIndex >= candidates.length) {
    return (
      <View style={[styles.placeholder, style]}>
        <Icon
          name={isImageItem(item) ? "image-outline" : "document-outline"}
          size={24}
          color={COLORS.textTertiary}
          type="ionicons"
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: candidates[candidateIndex] }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryBg,
  },
});
