import { Language } from "../atoms/preferences";

export type TranslationKey = string;

export type NestedTranslations = {
  [key: string]: string | NestedTranslations;
};

export type Translations = {
  [key: string]: string | NestedTranslations;
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
