/**
 * Rythme unique des cartes de la page de statistiques.
 *
 * Les surcharges de padding disséminées dans les onglets dataient de shadcn v3,
 * où la `Card` n'avait aucun padding propre. Depuis la v4 elle porte
 * `gap-6 py-6` : les surcharges ne remplaçaient plus rien, elles s'ajoutaient.
 * Chaque carte cumulait 40 px de vide en haut comme en bas (24 de la carte,
 * 16 de l'en-tête) et un écart de 24 px entre l'en-tête et le contenu là où le
 * `pb-2` visait 8 px.
 *
 * Ces trois constantes sont la seule source de vérité. Elles décrivent des
 * cartes denses, adaptées à des chiffres et des graphiques.
 */

/** À poser sur `<Card>`. Annule `gap-6 py-6`. */
export const STAT_CARD = "gap-2 py-4";

/** À poser sur `<CardHeader>`. L'écart sous l'en-tête vient du `gap` de la carte. */
export const STAT_CARD_HEADER = "px-4";

/** À poser sur `<CardContent>`. */
export const STAT_CARD_CONTENT = "px-4";
