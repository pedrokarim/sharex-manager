"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  MessageCircle,
  Github,
  Send,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useState } from "react";

export function FeedbackPageClient() {
  const { t } = useTranslation();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simuler l'envoi du formulaire
    setIsSubmitted(true);
    setTimeout(() => setIsSubmitted(false), 3000);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-4xl mx-auto">
          {/* Bouton retour */}
          <Button variant="ghost" className="mb-4 sm:mb-6 text-sm" asChild>
            <a href="/">
              <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              {t("common.back")}
            </a>
          </Button>

          {/* Message de remerciement */}
          <Card className="text-center">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-full">
                  <Send className="h-8 w-8 sm:h-12 sm:w-12 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <CardTitle className="text-xl sm:text-2xl">
                {t("feedback.thank_you.title")}
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                {t("feedback.thank_you.description")}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">
        {/* Bouton retour */}
        <Button variant="ghost" className="mb-4 sm:mb-6 text-sm" asChild>
          <a href="/">
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            {t("common.back")}
          </a>
        </Button>

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full">
              <MessageCircle className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
            {t("feedback.title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base lg:text-lg max-w-2xl mx-auto">
            {t("feedback.description")}
          </p>
        </div>

        <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
          {/* Formulaire de feedback */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                  <MessageCircle className="h-5 w-5 sm:h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-lg sm:text-xl">
                  {t("feedback.forms.title")}
                </CardTitle>
              </div>
              <CardDescription className="text-sm">
                {t("feedback.forms.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name" className="text-sm">
                      {t("feedback.forms.name")}
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      className="text-sm"
                      placeholder="Votre nom"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm">
                      {t("feedback.forms.email")}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      className="text-sm"
                      placeholder="votre@email.com"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="subject" className="text-sm">
                    {t("feedback.forms.subject")}
                  </Label>
                  <Input
                    id="subject"
                    type="text"
                    className="text-sm"
                    placeholder="Sujet de votre message"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="message" className="text-sm">
                    {t("feedback.forms.message")}
                  </Label>
                  <Textarea
                    id="message"
                    className="text-sm min-h-[120px]"
                    placeholder="Décrivez votre idée, suggestion ou problème..."
                    required
                  />
                </div>
                <Button type="submit" className="w-full text-sm">
                  <Send className="h-4 w-4 mr-2" />
                  {t("feedback.forms.submit")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Autres canaux */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <Github className="h-5 w-5 sm:h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-lg sm:text-xl">
                  {t("feedback.channels.title")}
                </CardTitle>
              </div>
              <CardDescription className="text-sm">
                {t("feedback.channels.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="space-y-4">
                <Button
                  asChild
                  variant="outline"
                  className="w-full text-sm justify-start"
                >
                  <a
                    href="https://discord.gg/rTd95UpUEb"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {t("feedback.channels.discord")}
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full text-sm justify-start"
                >
                  <a
                    href="https://github.com/AliasPedroKarim/sharex-manager/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="h-4 w-4 mr-2" />
                    {t("feedback.channels.github")}
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
