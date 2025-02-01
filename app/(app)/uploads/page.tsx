import { Metadata } from "next";
import { UploadsPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Uploads | ShareX Manager",
  description: "Gérez vos uploads ShareX",
};

export default function UploadsPage() {
  return <UploadsPageClient />;
} 