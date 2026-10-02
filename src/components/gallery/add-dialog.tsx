"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Check, HardDrive, ImageOff, Link2, Play, Search, Upload, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { moduleIcon } from "@/lib/modules/file-actions";
import { formatDuration } from "@/lib/media-kind";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { GallerySourceImport, GallerySourceItem, GallerySourcePage } from "@/types/modules";

/** Source déclarée par un module activé (`gallerySources` de son `module.json`). */
interface ModuleSource {
  module: string;
  id: string;
  label: string;
  description?: string;
  icon?: string;
  /** Logo du module qui fournit la source. */
  logo?: string;
  list: string;
  import: string;
}

interface AddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fichiers choisis sur l'ordinateur : ils rejoignent la file d'envoi de la galerie. */
  onFiles: (files: File[]) => void;
  /** Ouvre le sélecteur de fichiers du système. */
  onBrowse: () => void;
  /** Des fichiers viennent d'entrer dans la galerie par une autre source. */
  onAdded: () => void;
}

const PAGE_SIZE = 48;
const MAX_LINKS = 10;

async function callModule<T>(moduleName: string, functionName: string, ...args: unknown[]): Promise<T> {
  const response = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleName, functionName, args }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload?.data as T;
}

/**
 * Fenêtre « Ajouter » de la galerie : un seul endroit pour faire entrer des
 * fichiers, d'où qu'ils viennent. L'ordinateur et le lien sont toujours là ;
 * les autres sources sont celles que déclarent les modules activés, sans que
 * la galerie ait à les connaître.
 */
export function AddDialog({ open, onOpenChange, onFiles, onBrowse, onAdded }: AddDialogProps) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<ModuleSource[]>([]);
  const [active, setActive] = useState("device");

  useEffect(() => {
    if (!open) return;
    setActive("device");
    let cancelled = false;
    fetch("/api/modules/gallery-sources")
      .then((response) => (response.ok ? response.json() : { sources: [] }))
      .then((data) => {
        if (!cancelled) setSources(Array.isArray(data.sources) ? data.sources : []);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const entries = useMemo(() => {
    const list: { key: string; label: string; hint: string; icon: LucideIcon; logo?: string; source?: ModuleSource }[] = [
      { key: "device", label: t("gallery.add.device"), hint: t("gallery.add.device_hint"), icon: HardDrive },
    ];
    for (const source of sources) {
      list.push({
        key: `${source.module}:${source.id}`,
        label: source.label,
        hint: source.description ?? "",
        icon: moduleIcon(source.icon),
        logo: source.logo,
        source,
      });
    }
    list.push({ key: "link", label: t("gallery.add.link"), hint: t("gallery.add.link_hint"), icon: Link2 });
    return list;
  }, [sources, t]);

  const current = entries.find((entry) => entry.key === active) ?? entries[0];

  const finish = useCallback(() => {
    onAdded();
    onOpenChange(false);
  }, [onAdded, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(720px,calc(100svh-2rem))] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={false}
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label={t("gallery.add.sources")}
            className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:border-r md:border-b-0 md:p-3"
          >
            <div className="hidden px-2 pt-1 pb-3 md:block">
              <DialogTitle className="text-base">{t("gallery.add.title")}</DialogTitle>
              <DialogDescription className="text-xs">{t("gallery.add.description")}</DialogDescription>
            </div>
            {entries.map((entry) => {
              const Icon = entry.icon;
              const selected = entry.key === current.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setActive(entry.key)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {entry.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo servi par le module
                    <img src={entry.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
                  ) : (
                    <Icon className={cn("h-4 w-4 shrink-0", selected && "text-primary")} />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{entry.label}</span>
                    {entry.hint && (
                      <span className="hidden truncate text-[11px] text-muted-foreground md:block">{entry.hint}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("gallery.add.close")}
              onClick={() => onOpenChange(false)}
              className="absolute top-2 right-2 z-10 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>

            {current.key === "device" && (
              <DevicePane
                onFiles={(files) => {
                  onFiles(files);
                  onOpenChange(false);
                }}
                onBrowse={() => {
                  onOpenChange(false);
                  onBrowse();
                }}
              />
            )}
            {current.source && <ModulePane key={current.key} source={current.source} onDone={finish} />}
            {current.key === "link" && <LinkPane onDone={finish} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ordinateur ──────────────────────────────────────────────────

function DevicePane({ onFiles, onBrowse }: { onFiles: (files: File[]) => void; onBrowse: () => void }) {
  const { t } = useTranslation();
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (files.length > 0) onFiles(files);
    },
  });

  return (
    <div className="flex flex-1 p-4 md:p-6">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 text-center transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-border"
        )}
      >
        <input {...getInputProps()} />
        <Upload className={cn("h-10 w-10 text-muted-foreground", isDragActive && "text-primary")} />
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("gallery.add.drop_title")}</h3>
          <p className="max-w-sm text-xs text-muted-foreground">{t("gallery.add.drop_description")}</p>
        </div>
        <Button onClick={onBrowse} className="gap-2">
          <HardDrive className="h-4 w-4" />
          {t("gallery.add.browse")}
        </Button>
      </div>
    </div>
  );
}

// ─── Source d'un module ──────────────────────────────────────────

function ModulePane({ source, onDone }: { source: ModuleSource; onDone: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GallerySourceItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const requestRef = useRef(0);
  // `t` change d'identité à chaque rendu : passé en dépendance, il relancerait
  // le chargement sans fin.
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(
    async (search: string, offset: number) => {
      const request = ++requestRef.current;
      setLoading(true);
      setError(null);
      try {
        const page = await callModule<GallerySourcePage>(source.module, source.list, {
          search,
          offset,
          limit: PAGE_SIZE,
        });
        if (requestRef.current !== request) return;
        setItems((current) => (offset === 0 ? page.items : [...current, ...page.items]));
        setTotal(page.total);
        setHasMore(page.hasMore);
      } catch (reason) {
        if (requestRef.current !== request) return;
        setError(reason instanceof Error ? reason.message : tRef.current("gallery.add.source_error"));
      } finally {
        if (requestRef.current === request) setLoading(false);
      }
    },
    [source]
  );

  // La recherche part après une courte pause de frappe.
  useEffect(() => {
    const timer = setTimeout(() => void load(query.trim(), 0), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    setImporting(true);
    try {
      const result = await callModule<GallerySourceImport>(source.module, source.import, Array.from(selected));
      if (result.saved.length > 0) {
        toast.success(
          t(result.saved.length > 1 ? "gallery.add.added_many" : "gallery.add.added_one", { count: result.saved.length })
        );
      }
      for (const failure of result.failed) toast.error(failure.error);
      if (result.saved.length > 0) onDone();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : t("gallery.add.source_error"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b py-2 pr-12 pl-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("gallery.add.search", { source: source.label })}
            className="h-9 pl-8"
          />
        </div>
        {total !== null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{total}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : items.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm">{query ? t("gallery.add.no_match") : t("gallery.add.empty_source")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {items.map((item) => {
              const picked = selected.has(item.id);
              const done = Boolean(item.galleryFile);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={done}
                  onClick={() => toggle(item.id)}
                  aria-pressed={picked}
                  title={item.caption ?? item.name}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left transition-shadow",
                    picked && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    done && "opacity-50"
                  )}
                >
                  {item.kind === "video" ? (
                    <video src={`${item.thumbnail}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                  {item.kind === "video" && (
                    <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                      <Play className="h-2.5 w-2.5 fill-current" />
                      {item.durationMs ? formatDuration(item.durationMs) : null}
                    </span>
                  )}
                  {done ? (
                    <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1.5 py-1 text-center text-[10px] text-white">
                      {t("gallery.add.already")}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background/85 transition-opacity",
                        picked ? "border-primary bg-primary text-primary-foreground" : "opacity-0 group-hover:opacity-100"
                      )}
                    >
                      {picked && <Check className="h-3 w-3" />}
                    </span>
                  )}
                </button>
              );
            })}
            {loading && Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}
          </div>
        )}
        {hasMore && !loading && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={() => void load(query.trim(), items.length)}>
              {t("gallery.add.more")}
            </Button>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3">
        <span className="truncate text-xs text-muted-foreground">
          {selected.size === 0
            ? t("gallery.add.pick_hint")
            : t(selected.size > 1 ? "gallery.add.selected_many" : "gallery.add.selected_one", { count: selected.size })}
        </span>
        <Button size="sm" disabled={selected.size === 0 || importing} onClick={confirm} className="shrink-0 gap-2">
          {importing ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {t("gallery.add.confirm")}
        </Button>
      </footer>
    </>
  );
}

// ─── Lien ────────────────────────────────────────────────────────

function LinkPane({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const links = text
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_LINKS);

  const submit = async () => {
    if (links.length === 0) return;
    setLoading(true);
    const failures: string[] = [];
    const remaining: string[] = [];
    let added = 0;
    for (const url of links) {
      try {
        const response = await fetch("/api/gallery/import-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        added++;
      } catch (reason) {
        remaining.push(url);
        failures.push(`${url} : ${reason instanceof Error ? reason.message : t("gallery.add.link_error")}`);
      }
    }
    setLoading(false);
    setErrors(failures);
    // Les liens refusés restent dans le champ, pour être corrigés.
    setText(remaining.join("\n"));
    if (added > 0) {
      toast.success(t(added > 1 ? "gallery.add.added_many" : "gallery.add.added_one", { count: added }));
      if (failures.length === 0) onDone();
    }
  };

  return (
    <form
      className="flex flex-1 flex-col justify-center gap-4 p-6 md:px-12"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("gallery.add.link_title")}</h3>
        <p className="text-xs text-muted-foreground">{t("gallery.add.link_description", { max: MAX_LINKS })}</p>
      </div>
      <Textarea
        autoFocus
        rows={4}
        inputMode="url"
        placeholder="https://exemple.com/image.png"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="resize-none font-mono text-xs"
      />
      <Button type="submit" className="gap-2 self-end" disabled={links.length === 0 || loading}>
        {loading ? <Spinner className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {t(links.length > 1 ? "gallery.add.link_import_many" : "gallery.add.link_import_one", { count: links.length })}
      </Button>
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errors.map((error) => (
            <li key={error} className="break-words">
              {error}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
