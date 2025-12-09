import Editor from "@/components/editor/editor";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "ShareX Manager - Éditeur de thème",
  description:
    "Personnalisez et prévisualisez votre thème ShareX Manager. Modifiez les couleurs, polices et styles en temps réel.",
};

export default function ThemePage() {
  return <Editor themePromise={Promise.resolve(null)} />;
}
