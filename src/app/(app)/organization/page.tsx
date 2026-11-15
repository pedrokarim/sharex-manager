import { redirect } from "next/navigation";

/**
 * « Organisation » n'a pas de page à elle : le fil d'Ariane y mène, et la
 * barre latérale ouvre le groupe sur les albums.
 */
export default function OrganizationPage() {
  redirect("/albums");
}
