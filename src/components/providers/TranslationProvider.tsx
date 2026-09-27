"use client";

import { ReactNode, useEffect } from "react";
import { useAtom } from "jotai";
import { languageAtom } from "@/lib/atoms/preferences";

interface TranslationProviderProps {
  children: ReactNode;
}

export function TranslationProvider({ children }: TranslationProviderProps) {
  const [language] = useAtom(languageAtom);

  // Effet pour mettre à jour l'attribut lang de la balise html
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <>{children}</>;
}
