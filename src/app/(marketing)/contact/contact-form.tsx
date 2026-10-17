"use client";

import { useState } from "react";
import { Mail, MessageSquare, Send, User } from "lucide-react";

import { FIELD, FIELD_AREA, PILL_SOLID } from "@/components/front/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus, useFeedback } from "@/components/feedback";
import { cn } from "@/lib/utils";

export function ContactForm() {
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  // Erreur comme confirmation s'affichent dans le formulaire, au-dessus du
  // bouton : c'est là que l'utilisateur regarde quand il vient d'envoyer. La
  // confirmation reste jusqu'à la saisie suivante, le temps d'être lue.
  const feedback = useFeedback({ successDuration: 10 * 60_000 });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setIsSending(true);
    feedback.clear();

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          subject: String(data.get("subject") ?? ""),
          message: String(data.get("message") ?? ""),
          website: String(data.get("website") ?? ""),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Remonter le motif réel plutôt qu'un message générique : une erreur
        // de configuration ou de validation doit rester diagnosticable.
        feedback.error(result?.error ?? `L’envoi a échoué (${response.status}). Réessayez dans un instant.`);
        return;
      }

      form.reset();
      setIsSent(true);
      feedback.success("Message envoyé. Vous recevrez une confirmation par e-mail.");
    } catch {
      feedback.error("Impossible de joindre le serveur. Vérifiez votre réseau, puis réessayez.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit}
      // Reprendre la saisie retire le message précédent.
      onChange={feedback.state ? feedback.clear : undefined}
    >
      <div className="space-y-2">
        <label
          htmlFor="name"
          className="text-sm font-medium flex items-center gap-2"
        >
          <User className="h-4 w-4 text-muted-foreground" />
          Nom
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Votre nom"
          minLength={2}
          maxLength={100}
          required
          disabled={isSending}
          className={FIELD}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-medium flex items-center gap-2"
        >
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="votre@email.com"
          maxLength={254}
          required
          disabled={isSending}
          className={FIELD}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="subject"
          className="text-sm font-medium flex items-center gap-2"
        >
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Sujet
        </label>
        <Input
          id="subject"
          name="subject"
          type="text"
          placeholder="Sujet de votre message"
          minLength={3}
          maxLength={150}
          required
          disabled={isSending}
          className={FIELD}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="message"
          className="text-sm font-medium flex items-center gap-2"
        >
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Message
        </label>
        <Textarea
          id="message"
          name="message"
          placeholder="Votre message…"
          rows={6}
          minLength={10}
          maxLength={5000}
          required
          disabled={isSending}
          className={FIELD_AREA}
        />
      </div>

      {/* Piège à robots : masqué et hors du parcours clavier. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Ne pas remplir</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div>
        <FormStatus state={feedback.state} className="pb-3" />
        <Button type="submit" className={cn(PILL_SOLID, "justify-center")} loading={isSending}>
          <Send className="h-4 w-4" />
          {isSending
            ? "Envoi en cours…"
            : isSent
              ? "Envoyer un autre message"
              : "Envoyer le message"}
        </Button>
      </div>
    </form>
  );
}
