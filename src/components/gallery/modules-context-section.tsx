"use client";

import { useRouter } from "next/navigation";
import { Loader2, Puzzle, SlidersHorizontal } from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  linkActionHref,
  moduleIcon,
  openModuleSettings,
  processorIcon,
  runProcessorOnFiles,
  useModuleFileActions,
} from "@/lib/modules/file-actions";
import type { FileInfo } from "@/types/files";

interface ModulesContextSectionProps {
  files: FileInfo[];
}

/**
 * Section « Modules » des menus contextuels de la galerie.
 *
 * Elle réunit ce que les modules activés savent faire de la sélection :
 * ouvrir une de leurs pages avec les fichiers (« Retoucher dans le studio »),
 * ou transformer les fichiers sur place. Rien n'apparaît si aucun module
 * activé n'accepte ces fichiers.
 */
export function ModulesContextSection({ files }: ModulesContextSectionProps) {
  const router = useRouter();
  const fileNames = files.map((file) => file.name);
  const { data, loading } = useModuleFileActions(fileNames);
  const count = files.length;

  if (!loading && (!data || (data.links.length === 0 && data.processors.length === 0))) {
    return null;
  }

  // Les actions de lien sont regroupées par module, sous son nom.
  const linkGroups = new Map<string, NonNullable<typeof data>["links"]>();
  for (const link of data?.links ?? []) {
    linkGroups.set(link.moduleTitle, [...(linkGroups.get(link.moduleTitle) ?? []), link]);
  }

  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Puzzle className="mr-2 h-4 w-4" />
          Modules
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-64">
          {loading && (
            <ContextMenuItem disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Chargement…
            </ContextMenuItem>
          )}

          {[...linkGroups.entries()].map(([title, links], groupIndex) => (
            <div key={title}>
              {groupIndex > 0 && <ContextMenuSeparator />}
              <ContextMenuLabel className="text-xs font-normal text-muted-foreground">
                {title}
              </ContextMenuLabel>
              {links.map((link) => {
                const Icon = moduleIcon(link.icon);
                const tooMany = link.maxFiles !== undefined && count > link.maxFiles;
                return (
                  <ContextMenuItem
                    key={`${link.module}:${link.id}`}
                    disabled={tooMany}
                    onClick={() => router.push(linkActionHref(link, fileNames))}
                    title={link.description}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <span className="flex-1">{link.label}</span>
                    {tooMany && (
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {link.maxFiles === 1 ? "1 image" : `${link.maxFiles} max`}
                      </span>
                    )}
                  </ContextMenuItem>
                );
              })}
            </div>
          ))}

          {data && data.processors.length > 0 && (
            <>
              {linkGroups.size > 0 && <ContextMenuSeparator />}
              <ContextMenuLabel className="text-xs font-normal text-muted-foreground">
                Traitements
              </ContextMenuLabel>
              {data.processors.map((processor) => {
                const Icon = processorIcon(processor.category);
                // Une interface de réglage porte sur une image précise.
                const needsSingle = processor.hasUI && count > 1;
                return (
                  <ContextMenuItem
                    key={processor.name}
                    disabled={needsSingle}
                    title={processor.description}
                    onClick={() => {
                      if (processor.hasUI) {
                        openModuleSettings({
                          moduleName: processor.name,
                          description: processor.description,
                          category: processor.category,
                          file: files[0],
                        });
                      } else {
                        void runProcessorOnFiles(processor.name, fileNames);
                      }
                    }}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <span className="flex-1 truncate">{processor.name}</span>
                    {processor.hasUI && !needsSingle && (
                      <SlidersHorizontal className="ml-2 h-3 w-3 text-muted-foreground" />
                    )}
                    {needsSingle && (
                      <span className="ml-2 text-[10px] text-muted-foreground">1 image</span>
                    )}
                    {!processor.hasUI && count > 1 && (
                      <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">
                        ×{count}
                      </span>
                    )}
                  </ContextMenuItem>
                );
              })}
            </>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
    </>
  );
}
