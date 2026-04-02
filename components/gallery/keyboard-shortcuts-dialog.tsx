"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutCategory[];
}

export function KeyboardShortcutsDialog({
  open,
  onClose,
  shortcuts,
}: KeyboardShortcutsDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[480px] overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
          <DialogTitle className="text-lg sm:text-xl">
            {t("multiselect.help.title")}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {t("multiselect.help.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {shortcuts.map((category) => (
            <div key={category.category}>
              <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category.category}
              </h4>
              <div className="space-y-2">
                {category.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-foreground/80">
                      {item.description}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && (
                            <span className="mx-0.5 text-xs text-muted-foreground">
                              +
                            </span>
                          )}
                          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/70 bg-muted/50 px-1.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
