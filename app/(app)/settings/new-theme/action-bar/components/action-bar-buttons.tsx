import { Separator } from "@/components/ui/separator";
import { ResetButton } from "./reset-button";
import { ThemeToggle } from "./theme-toggle";
import { UndoRedoButtons } from "./undo-redo-buttons";
import { ImportButton } from "./import-button";
import { ShareButton } from "./share-button";
import { SaveButton } from "./save-button";
import { CodeButton } from "./code-button";
import { MoreOptions } from "./more-options";

interface ActionBarButtonsProps {
  onImportClick: () => void;
  onCodeClick: () => void;
  onSaveClick: () => void;
  onShareClick: (id?: string) => void;
  isSaving: boolean;
}

export function ActionBarButtons({
  onImportClick,
  onCodeClick,
  onSaveClick,
  onShareClick,
  isSaving,
}: ActionBarButtonsProps) {
  const handleReset = () => {
    // TODO: Implement reset functionality
  };

  return (
    <div className="flex items-center gap-1">
      <MoreOptions disabled={false} />
      <Separator orientation="vertical" className="mx-1 h-8" />
      <ThemeToggle />
      <Separator orientation="vertical" className="mx-1 h-8" />
      <UndoRedoButtons disabled={false} />
      <Separator orientation="vertical" className="mx-1 h-8" />
      <ResetButton onClick={handleReset} disabled={false} />
      <div className="hidden items-center gap-1 md:flex">
        <ImportButton onClick={onImportClick} disabled={false} />
      </div>
      <Separator orientation="vertical" className="mx-1 h-8" />
      <ShareButton onClick={() => onShareClick()} disabled={false} />
      <SaveButton onClick={onSaveClick} isSaving={isSaving} disabled={false} />
      <CodeButton onClick={onCodeClick} disabled={false} />
    </div>
  );
}
