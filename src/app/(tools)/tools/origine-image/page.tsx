import { publicPageMetadata } from "@/lib/seo";
import { ImageOriginTool } from "./page.client";

export const metadata = publicPageMetadata({
  title: "Origine d'une image",
  description:
    "Déposez une image pour lire ce qu'elle déclare de son origine : manifeste C2PA, générateur, signature, EXIF, XMP et paramètres de génération.",
  path: "/tools/origine-image",
});

export default function ImageOriginPage() {
  return <ImageOriginTool />;
}
