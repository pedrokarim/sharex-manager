"use client";

import { useState } from "react";
import { Loader2, Mail, MessageSquare, Send, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setIsSending(true);

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
        toast.error(result?.error ?? `Échec de l'envoi (${response.status})`);
        return;
      }

      form.reset();
      setIsSent(true);
      toast.success("Message envoyé. Vous recevrez une confirmation par email.");
    } catch {
      toast.error("Impossible de joindre le serveur. Réessayez plus tard.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
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
          placeholder="Votre message..."
          rows={6}
          minLength={10}
          maxLength={5000}
          required
          disabled={isSending}
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

      <Button type="submit" className="w-full gap-2" disabled={isSending}>
        {isSending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Envoi en cours…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            {isSent ? "Envoyer un autre message" : "Envoyer le message"}
          </>
        )}
      </Button>
    </form>
  );
}
