"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation, useModuleTranslations } from "@/lib/i18n";
import moduleTranslations from "./translations";

interface HelloWorldUIProps {
  fileInfo: {
    name: string;
    url: string;
    size: number;
    type: string;
  };
  onComplete: (result: any) => void;
}

export default function HelloWorldUI({
  fileInfo,
  onComplete,
}: HelloWorldUIProps) {
  // Enregistrer les traductions du module
  useModuleTranslations("hello_world", moduleTranslations);
  const { t } = useTranslation();

  const handleClick = () => {
    // Simplement retourner le fichier tel quel
    onComplete(fileInfo);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{t("modules.hello_world.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-center text-lg font-medium">
          {t("modules.hello_world.greeting")}
        </p>
        <p className="text-center text-sm text-muted-foreground mt-2">
          {t("modules.hello_world.description")}
        </p>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={handleClick}>
          {t("modules.hello_world.continue")}
        </Button>
      </CardFooter>
    </Card>
  );
}
