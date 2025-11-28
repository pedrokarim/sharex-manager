"use client";

import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { ActionBarButtons } from "./components/action-bar-buttons";

export function ActionBar() {
  // Pour le moment, on utilise des fonctions vides qui seront implémentées plus tard
  const handleImportClick = () => {};
  const handleCodeClick = () => {};
  const handleSaveClick = () => {};
  const handleShareClick = () => {};

  return (
    <div className="border-b">
      <HorizontalScrollArea className="flex h-14 w-full items-center justify-end gap-4 px-4">
        <ActionBarButtons
          onImportClick={handleImportClick}
          onCodeClick={handleCodeClick}
          onSaveClick={handleSaveClick}
          isSaving={false}
          onShareClick={handleShareClick}
        />
      </HorizontalScrollArea>
    </div>
  );
}
