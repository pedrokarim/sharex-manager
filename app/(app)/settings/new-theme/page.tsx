import { Metadata } from "next";
import NewThemeEditor from "./new-theme-editor";

export const metadata: Metadata = {
  title: "ShareX Manager - New Theme Generator",
  description: "Create and customize beautiful themes for your ShareX Manager application.",
};

export default function NewThemePage() {
  return <NewThemeEditor />;
}
