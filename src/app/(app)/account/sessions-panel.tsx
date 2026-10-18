"use client";

/**
 * « Mes sessions » : les appareils connectés au compte, celle de cet écran
 * en tête et marquée ; chaque autre session se ferme sur sa ligne, toutes
 * les autres d'un geste dans l'en-tête.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CircleAlert, LogOut, MonitorSmartphone, RefreshCw } from "lucide-react";
import { ActionStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import { RelativeTime } from "@/components/connections/shared";
import { CurrentSessionPill, DeviceIcon, IpText } from "@/components/security/session-bits";
import type { SessionView } from "@/lib/security/sessions";

/** Sessions montrées avant « Afficher les autres » : la session de cet écran et les plus récentes. */
const VISIBLE_SESSIONS = 6;

type LoadState = { status: "loading" } | { status: "ready"; sessions: SessionView[] } | { status: "error"; error: string };

async function request<T>(url: string, method = "GET"): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store" });
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "La demande a échoué. Réessayez dans un instant.");
  return body as T;
}

/** La session de cet écran d'abord, puis de la plus récemment active à la plus ancienne. */
export function orderSessions(sessions: SessionView[]): SessionView[] {
  return [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
}

export function AccountSessionsPanel({ ascencia = false }: { ascencia?: boolean }) {
  const titleId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const othersFeedback = useFeedback({ successDuration: 5000 });
  const rowFeedback = useFeedback();
  const [rowFeedbackId, setRowFeedbackId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { sessions } = await request<{ sessions: SessionView[] }>("/api/account/sessions");
      setState({ status: "ready", sessions: orderSessions(sessions) });
    } catch (error) {
      setState((current) => (current.status === "ready" ? current : { status: "error", error: errorMessage(error, "Les sessions n’ont pas pu être lues.") }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sessions = state.status === "ready" ? state.sessions : [];
  const others = sessions.filter((session) => !session.current).length;
  const shown = expanded ? sessions : sessions.slice(0, VISIBLE_SESSIONS);
  const hidden = sessions.length - shown.length;

  const close = async (id: string) => {
    setBusy(id);
    setRowFeedbackId(id);
    rowFeedback.clear();
    try {
      await request(`/api/account/sessions?id=${encodeURIComponent(id)}`, "DELETE");
      setState((current) => (current.status === "ready" ? { status: "ready", sessions: current.sessions.filter((session) => session.id !== id) } : current));
    } catch (error) {
      rowFeedback.error(errorMessage(error, "La session n’a pas pu être fermée."));
    } finally {
      setBusy(null);
    }
  };

  const closeOthers = async () => {
    setConfirmOpen(false);
    setBusy("others");
    othersFeedback.clear();
    try {
      const { revoked } = await request<{ revoked: number }>("/api/account/sessions?scope=others", "DELETE");
      setState((current) => (current.status === "ready" ? { status: "ready", sessions: current.sessions.filter((session) => session.current) } : current));
      othersFeedback.success(revoked ? `${revoked} session${revoked > 1 ? "s" : ""} fermée${revoked > 1 ? "s" : ""}` : "Aucune autre session");
    } catch (error) {
      othersFeedback.error(errorMessage(error, "Les sessions n’ont pas pu être fermées."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader
        icon={MonitorSmartphone}
        title="Mes sessions"
        titleId={titleId}
        description={
          state.status === "ready"
            ? `${sessions.length} appareil${sessions.length > 1 ? "s" : ""} connecté${sessions.length > 1 ? "s" : ""} à votre compte.`
            : "Les appareils connectés à votre compte."
        }
        actions={
          <>
            <ActionStatus state={othersFeedback.state} />
            <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" loading={busy === "others"} disabled={others === 0 || (busy !== null && busy !== "others")}>
                  <LogOut aria-hidden className="size-4" />
                  Fermer les autres sessions
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="grid w-64 gap-3 p-3">
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Fermer les autres sessions ?</p>
                  <p className="text-xs text-pretty text-muted-foreground">Vos autres appareils devront se reconnecter. Celui-ci reste connecté.</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmOpen(false)}>
                    Annuler
                  </Button>
                  <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => void closeOthers()}>
                    Fermer
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </>
        }
      />
      {state.status === "loading" ? (
        <div className="divide-y" aria-hidden>
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : state.status === "error" ? (
        <PanelBody>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Lecture impossible</AlertTitle>
            <AlertDescription>
              <p className="break-words">{state.error}</p>
              <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={() => void load()}>
                <RefreshCw />
                Réessayer
              </Button>
            </AlertDescription>
          </Alert>
        </PanelBody>
      ) : (
        <PanelRows>
          <AnimatePresence initial={false}>
            {shown.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                busy={busy === session.id}
                disabled={busy !== null}
                status={rowFeedbackId === session.id ? rowFeedback.state : null}
                onClose={() => void close(session.id)}
              />
            ))}
          </AnimatePresence>
        </PanelRows>
      )}
      <PanelFooter className="justify-between">
        <span className="min-w-0 flex-1 basis-64 text-pretty">
          Un appareil que vous ne reconnaissez pas ? Fermez sa session, puis changez votre mot de passe{ascencia ? " dans Ascencia ID" : ""}.
        </span>
        {hidden > 0 || expanded ? (
          <Button variant="ghost" size="sm" className="-my-1 h-7 gap-1.5" onClick={() => setExpanded((now) => !now)} aria-expanded={expanded}>
            <ChevronDown aria-hidden className={expanded ? "size-3.5 rotate-180 transition-transform" : "size-3.5 transition-transform"} />
            {expanded ? "Ne montrer que les plus récentes" : `Afficher ${hidden === 1 ? "l’autre session" : `les ${hidden} autres sessions`}`}
          </Button>
        ) : null}
      </PanelFooter>
    </Panel>
  );
}

function SessionRow({ session, busy, disabled, status, onClose }: { session: SessionView; busy: boolean; disabled: boolean; status: FeedbackState | null; onClose: () => void }) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="min-w-0 overflow-hidden"
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <DeviceIcon type={session.device.type} />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-sm font-medium" title={session.device.label}>
              {session.device.label}
            </span>
            {session.current ? <CurrentSessionPill /> : null}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <IpText ip={session.ip} className="max-w-48" />
            <span aria-hidden>·</span>
            <RelativeTime value={session.lastActiveAt} prefix="Active " />
          </span>
          {status ? <ActionStatus state={status} /> : null}
        </div>
        {session.current ? null : (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-red-700 dark:hover:text-red-400" loading={busy} disabled={disabled && !busy} onClick={onClose} aria-label={`Fermer la session ${session.device.label}`}>
            <LogOut aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">Fermer</span>
          </Button>
        )}
      </div>
    </motion.div>
  );
}
