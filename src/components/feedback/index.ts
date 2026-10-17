/**
 * Retours d'action de l'application. Un message se lit là où l'utilisateur
 * regarde, jamais au coin de l'écran quand il vient d'agir sur un élément
 * précis :
 *
 * - erreur d'envoi d'un formulaire, d'une fenêtre, d'un panneau : `FormStatus`
 *   au-dessus du bouton d'envoi ; erreur d'un champ : `FieldError` sous le champ ;
 * - réussite ou échec d'un bouton isolé (Enregistrer, Tester, Relancer) :
 *   `ActionStatus` à côté du bouton ;
 * - action sur une ligne ou une carte : le changement visible suffit (la
 *   ligne disparaît, le badge change) ; une erreur s'affiche sur la ligne ;
 * - copie : l'icône du bouton devient une coche, sans autre message.
 *
 * Le toast reste juste quand il notifie quelque chose qui n'est pas sous les
 * yeux : un travail de fond qui se termine, un événement reçu, une action dont
 * l'écran d'origine a disparu (suppression puis retour à la liste), une
 * annulation proposée (« Supprimé · Annuler »).
 *
 * `useFeedback()` porte l'état ; `errorMessage()` extrait un texte d'erreur.
 */
export { useFeedback, errorMessage, type Feedback, type FeedbackState, type FeedbackTone } from "./use-feedback";
export { FormStatus } from "./form-status";
export { ActionStatus } from "./action-status";
