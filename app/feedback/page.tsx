import { Metadata } from "next";
import { FeedbackPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Feedback - ShareX Manager",
  description: "Partagez vos idées et aidez-nous à améliorer ShareX Manager",
};

export default function FeedbackPage() {
  return <FeedbackPageClient />;
}
