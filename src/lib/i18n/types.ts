import { Language } from "../atoms/preferences";

export type TranslationKey = string;

/** Une valeur peut aussi être une liste (puces, étapes d'un guide…). */
export type TranslationValue = string | NestedTranslations | TranslationValue[];

export type NestedTranslations = {
  [key: string]: TranslationValue;
};

export type Translations = {
  [key: string]: TranslationValue;
};

export type LocaleData = {
  [locale in Language]: Translations;
};

export type TranslationParams = {
  [key: string]: string | number | boolean | Date | null | undefined;
};

export interface ModuleTranslations {
  [locale: string]: {
    [key: string]:
      | string
      | number
      | boolean
      | null
      | undefined
      | { [key: string]: any };
  };
}
