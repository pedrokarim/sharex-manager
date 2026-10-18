"use client";

/**
 * Onglet « Chaîne / Profil » d'un compte connecté : tout ce qui fait
 * l'identité du compte, dessiné comme un écran de réglages.
 *
 * - Colonne latérale (collante en grand écran, au-dessus sur téléphone) :
 *   la source des propositions (image de marque, date de lecture, Relire),
 *   le bilan des changements avec « Tout envoyer », et le sommaire.
 * - Panneaux : « Identité » (valeur actuelle chez le service lue par l'API,
 *   proposition préremplie depuis la marque et modifiable, ce qui change,
 *   l'envoi), « Images » (bannière, filigrane rendus depuis la marque à
 *   l'envoi), « À changer chez {service} » (ce que l'API ne permet pas, dit
 *   franchement, avec l'image à télécharger, le texte à copier et le lien
 *   vers la bonne page), puis page d'accueil et playlists.
 *
 * Rien ici ne cite un service : tout vient de `connector.profileFields`.
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Hand, IdCard, ImageIcon, ImageUp, LayoutList, ListVideo, RefreshCw, Send, type LucideIcon } from "lucide-react";
import { ActionStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader, PanelRows } from "@/components/connections/panel";
import { ServiceLogo, formatDateTime } from "@/components/connections/shared";
import type { ConnectorView } from "@/components/connections/types";
import { brandCopyText, brandProfileValue, cleanProfileValue, resolveManualUrl, sameProfileValue, type ProfileBrandInput } from "@/lib/connections/profile";
import type { AccountSummary, ConnectionCapability, ProfileChoice, ProfileField, ProfileImageFormat, ProfileSnapshot, ProfileValue } from "@/lib/connections/types";
import type { BrandFormats } from "../data";
import { profileChoicesAction, pushBrandAction, readProfileAction, updateProfileAction } from "../actions";
import { api as brandKitApi, downloadBlob, editorHref } from "@/modules/brand-kit/lib/client";
import { FORMATS, buildFormat } from "@/modules/brand-kit/lib/formats";
import { profileBrandInput } from "@/modules/brand-kit/lib/profile";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import { renderFormatPng } from "@/modules/brand-kit/components/format-render";
import { ChannelLayout, PLAYLISTS_PANEL_ID, SECTIONS_PANEL_ID } from "./channel-layout";
import { EditableFieldRow, ManualFieldRow, emptyValue, isEmptyValue, type FieldAccess, type LoadState } from "./profile-fields";

/**
 * Rend un format depuis la marque (ou reprend telle quelle l'image finie que
 * la marque a importée pour ce format) et l'enregistre comme export de la
 * marque, là où l'envoi le lit.
 */
async function renderBrandFormat(kit: BrandKit, format: ProfileImageFormat): Promise<Blob> {
  const png = await renderFormatPng(kit, buildFormat(kit, format));
  await brandKitApi.saveFormatExport(kit.id, format, png);
  return png;
}

/** Adresse de la connexion incrémentale d'un compte (« Autoriser… »), avec retour sur cet onglet. */
function authorizeHref(account: Pick<AccountSummary, "id" | "connector">, capability: ConnectionCapability): string {
  const params = new URLSearchParams({ account: account.id, add: capability, returnTo: `/admin/connections/${account.id}?tab=profile` });
  return `/api/connections/${encodeURIComponent(account.connector)}/connect?${params}`;
}

/** Dimensions et nature du PNG d'un format de la marque, pour la légende de son aperçu. */
function formatMeta(format: ProfileImageFormat | undefined): string | null {
  const spec = format ? FORMATS.find((entry) => entry.id === format) : undefined;
  if (!spec) return null;
  return `${spec.width.toLocaleString("fr-FR")} × ${spec.height.toLocaleString("fr-FR")} px · PNG${spec.transparent ? " transparent" : ""}`;
}

/** Fait défiler jusqu'à un panneau de l'onglet, sans saut brusque (sauf mouvement réduit). */
function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

const IDENTITY_PANEL_ID = "channel-identity";
const IMAGES_PANEL_ID = "channel-images";
const MANUAL_PANEL_ID = "channel-manual";
/** Cible d'un envoi groupé (« Tout envoyer »), à côté des clés d'élément. */
const BATCH = "__batch";

interface LoadedBrand {
  kit: BrandKit;
  input: ProfileBrandInput;
  /** Derniers exports de la marque, par format. */
  exports: Record<string, string>;
}

interface TocEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Changements en attente dans ce panneau. */
  pending?: number;
}

export function ChannelTab({
  account,
  connector,
  kits,
  onPushed,
}: {
  account: AccountSummary;
  connector: ConnectorView;
  kits: BrandFormats[] | null;
  onPushed: () => void;
}) {
  const fields = useMemo(() => connector.profileFields ?? [], [connector.profileFields]);
  const editableFields = fields.filter((field) => field.editable && field.kind !== "image");
  const imageFields = fields.filter((field) => field.editable && field.kind === "image");
  const manualFields = fields.filter((field) => !field.editable);
  const connected = account.status === "connected";

  const [kitId, setKitId] = useState(() => kits?.find((kit) => kit.isDefault)?.id ?? kits?.[0]?.id ?? "");
  const [brand, setBrand] = useState<LoadState<LoadedBrand> | null>(kitId ? { status: "loading" } : null);
  const [profile, setProfile] = useState<LoadState<ProfileSnapshot> | null>(connector.profileRead && connected ? { status: "loading" } : null);
  const [drafts, setDrafts] = useState<Record<string, ProfileValue>>({});
  const [sending, setSending] = useState<string[]>([]);
  const [busyImage, setBusyImage] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, LoadState<ProfileChoice[]>>>({});
  // Résultat d'un envoi : sur la ligne de l'élément envoyé seul, sous « Tout
  // envoyer » pour un envoi groupé. Celui d'une image (envoi ou
  // téléchargement) au bout de ses boutons.
  const sendFeedback = useFeedback();
  const [sendTarget, setSendTarget] = useState<string | null>(null);
  const imageFeedback = useFeedback();
  const [imageFeedbackKey, setImageFeedbackKey] = useState<string | null>(null);
  const imageStatusOf = (key: string) => (imageFeedbackKey === key ? imageFeedback.state : null);

  // Image de marque complète : de quoi préremplir et rendre les formats.
  useEffect(() => {
    if (!kitId) return;
    let cancelled = false;
    setBrand({ status: "loading" });
    brandKitApi.getKit(kitId).then(
      ({ kit, exports }) => {
        if (cancelled) return;
        setBrand({ status: "ready", data: { kit, input: profileBrandInput(kit), exports: Object.fromEntries(exports.map((entry) => [entry.format, entry.url])) } });
        // Une autre marque : ses propositions remplacent les modifications en cours.
        setDrafts({});
      },
      (error: unknown) => !cancelled && setBrand({ status: "error", error: error instanceof Error ? error.message : "Marque illisible." })
    );
    return () => {
      cancelled = true;
    };
  }, [kitId]);

  const loadProfile = useCallback(async () => {
    setProfile({ status: "loading" });
    const result = await readProfileAction(account.id);
    setProfile(result.ok ? { status: "ready", data: result.data } : { status: "error", error: result.error });
  }, [account.id]);

  useEffect(() => {
    if (connector.profileRead && connected) void loadProfile();
  }, [connector.profileRead, connected, loadProfile]);

  const loadChoices = useCallback(
    async (key: string) => {
      setChoices((current) => ({ ...current, [key]: { status: "loading" } }));
      const result = await profileChoicesAction(account.id, key);
      setChoices((current) => ({ ...current, [key]: result.ok ? { status: "ready", data: result.data } : { status: "error", error: result.error } }));
    },
    [account.id]
  );

  // Une vidéo déjà choisie chez le service : sa liste est lue pour afficher son titre plutôt que son identifiant.
  useEffect(() => {
    if (profile?.status !== "ready") return;
    for (const key of connector.profileChoiceKeys ?? []) {
      const value = profile.data.values[key];
      if (typeof value === "string" && value && !choices[key]) void loadChoices(key);
    }
  }, [profile, connector.profileChoiceKeys, choices, loadChoices]);

  const accessFor = useCallback(
    (capability?: ConnectionCapability): FieldAccess => {
      if (!connected) return { state: "reconnect" };
      if (!capability || account.capabilities.includes(capability)) return { state: "ok" };
      if (account.requestableCapabilities?.includes(capability)) return { state: "authorize", href: authorizeHref(account, capability) };
      return { state: "role" };
    },
    [account, connected]
  );

  const brandInput = brand?.status === "ready" ? brand.data.input : null;
  const currentState: "loading" | "ready" | "error" | "none" = !profile ? "none" : profile.status;
  const currentOf = (field: ProfileField) => (profile?.status === "ready" ? profile.data.values[field.key] : undefined);
  const brandValueOf = (field: ProfileField) => {
    const value = brandProfileValue(field, brandInput);
    // Une valeur vide de la marque ne propose rien : elle n'efface pas ce qui existe chez le service.
    return value === undefined || isEmptyValue(value) ? undefined : value;
  };
  const proposedOf = (field: ProfileField): ProfileValue =>
    field.key in drafts ? drafts[field.key] : (brandValueOf(field) ?? currentOf(field) ?? emptyValue(field));

  const rows = editableFields.map((field) => {
    const current = currentOf(field);
    const proposed = proposedOf(field);
    const changed = profile?.status === "ready" && !sameProfileValue(current ?? emptyValue(field), proposed);
    let error: string | null = null;
    try {
      cleanProfileValue(field, proposed);
    } catch (problem) {
      error = problem instanceof Error ? problem.message : "Valeur refusée.";
    }
    return { field, current, proposed, changed, error, access: accessFor(field.capability) };
  });
  const ready = rows.filter((row) => row.changed && !row.error && row.access.state === "ok");
  const pending = rows.filter((row) => row.changed).length;
  const blocked = pending - ready.length;

  const send = async (keys: string[], batch = false) => {
    if (keys.length === 0) return;
    const changes = Object.fromEntries(keys.map((key) => [key, proposedOf(fields.find((field) => field.key === key)!)]));
    setSending(keys);
    setSendTarget(batch ? BATCH : keys[0]);
    sendFeedback.clear();
    const result = await updateProfileAction(account.id, changes);
    setSending([]);
    if (!result.ok) return void sendFeedback.error(result.error);
    setProfile({ status: "ready", data: result.data });
    // Ce qui vient de partir devient la proposition : la ligne revient « À jour ».
    setDrafts((current) => {
      const next = { ...current };
      for (const key of keys) {
        const value = result.data.values[key];
        if (value !== undefined) next[key] = value;
        else delete next[key];
      }
      return next;
    });
    sendFeedback.success(keys.length === 1 ? `Envoyé à ${connector.label}` : `${keys.length} éléments envoyés à ${connector.label}`);
    onPushed();
  };

  const pushImage = async (field: ProfileField) => {
    const format = field.imageFormat;
    if (brand?.status !== "ready" || (format !== "banner" && format !== "watermark")) return;
    setBusyImage(field.key);
    setImageFeedbackKey(field.key);
    imageFeedback.clear();
    try {
      await renderBrandFormat(brand.data.kit, format);
    } catch (error) {
      setBusyImage(null);
      return void imageFeedback.error(errorMessage(error, "Le format n’a pas pu être rendu depuis la marque."));
    }
    const result = await pushBrandAction(account.id, brand.data.kit.id, format);
    setBusyImage(null);
    onPushed();
    if (!result.ok) return void imageFeedback.error(result.error);
    imageFeedback.success(`Mis à jour chez ${connector.label}`);
  };

  // Ce que l'API ne permet pas : l'image est rendue depuis la marque au clic, puis téléchargée.
  const downloadImage = async (field: ProfileField) => {
    if (brand?.status !== "ready" || !field.imageFormat) return;
    setBusyImage(field.key);
    setImageFeedbackKey(field.key);
    imageFeedback.clear();
    try {
      const png = await renderBrandFormat(brand.data.kit, field.imageFormat);
      downloadBlob(`${field.key}.png`, png);
    } catch (error) {
      imageFeedback.error(errorMessage(error, "L’image n’a pas pu être rendue depuis la marque."));
    } finally {
      setBusyImage(null);
    }
  };

  const hasKits = kits !== null && kits.length > 0;
  const noApiFields = editableFields.length === 0 && imageFields.length === 0;
  // L'échec de la lecture se dit dans le premier panneau qui montre les valeurs lues.
  const profileErrorIn = rows.length > 0 ? IDENTITY_PANEL_ID : MANUAL_PANEL_ID;
  const profileError =
    profile?.status === "error" ? (
      <PanelBody className="border-b">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Lecture impossible chez {connector.label}</AlertTitle>
          <AlertDescription>
            <p className="break-words">{profile.error}</p>
            <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={() => void loadProfile()}>
              <RefreshCw />
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      </PanelBody>
    ) : null;

  const toc: TocEntry[] = [
    rows.length > 0 ? { id: IDENTITY_PANEL_ID, label: "Identité", icon: IdCard, pending } : null,
    imageFields.length > 0 ? { id: IMAGES_PANEL_ID, label: "Images", icon: ImageUp } : null,
    manualFields.length > 0 ? { id: MANUAL_PANEL_ID, label: `À changer chez ${connector.label}`, icon: Hand } : null,
    connector.profileSections ? { id: SECTIONS_PANEL_ID, label: "Page d’accueil", icon: LayoutList } : null,
    connector.playlists ? { id: PLAYLISTS_PANEL_ID, label: "Playlists", icon: ListVideo } : null,
  ].filter((entry): entry is TocEntry => entry !== null);

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
      {/* Colonne latérale : au-dessus sur téléphone, collante à droite en grand
          écran, bornée à la hauteur visible et défilant d'elle-même. */}
      <aside
        aria-label="Propositions et changements"
        className="min-w-0 xl:sticky xl:top-4 xl:col-start-2 xl:row-start-1 xl:max-h-[calc(100svh-var(--header-height)-3rem)] xl:overflow-x-hidden xl:overflow-y-auto xl:rounded-xl"
      >
        <Panel>
          <div className="grid min-w-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-1">
            <SourceBlock
              connector={connector}
              connected={connected}
              kits={kits}
              hasKits={hasKits}
              kitId={kitId}
              onKitChange={setKitId}
              brand={brand}
              profile={profile}
              onReload={() => void loadProfile()}
            />
            <div className="grid min-w-0 content-start gap-3 border-t p-4 sm:border-t-0 sm:border-l xl:border-t xl:border-l-0">
              <span className="text-xs font-medium text-muted-foreground">Changements</span>
              {noApiFields ? (
                <p className="text-sm text-pretty text-muted-foreground">
                  {connector.label} ne permet de modifier aucun élément du profil par son API : tout se fait chez {connector.label}, avec ce que la marque fournit.
                </p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-pretty text-muted-foreground">Les images s’envoient une à une depuis leur aperçu.</p>
              ) : currentState === "loading" ? (
                <div className="grid gap-2" aria-hidden>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : currentState !== "ready" ? (
                <p className="text-sm text-pretty text-muted-foreground">Rien à comparer tant que les valeurs actuelles ne sont pas lues chez {connector.label}.</p>
              ) : (
                <ChangesSummary
                  serviceLabel={connector.label}
                  readyCount={ready.length}
                  blocked={blocked}
                  sending={sendTarget === BATCH && sending.length > 0}
                  disabled={sending.length > 0}
                  status={sendTarget === BATCH ? sendFeedback.state : null}
                  onSendAll={() => void send(ready.map((row) => row.field.key), true)}
                />
              )}
            </div>
            {toc.length > 1 ? (
              <nav aria-label="Sommaire de l’onglet" className="hidden min-w-0 border-t p-2 xl:block">
                <ul className="grid min-w-0 gap-0.5">
                  {toc.map((entry) => (
                    <li key={entry.id} className="min-w-0">
                      <a
                        href={`#${entry.id}`}
                        onClick={(event) => jumpTo(event, entry.id)}
                        className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <entry.icon aria-hidden className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate" title={entry.label}>
                          {entry.label}
                        </span>
                        {entry.pending ? (
                          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[11px] text-primary tabular-nums">
                            {entry.pending}
                            <span className="sr-only"> en attente</span>
                          </span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        </Panel>
      </aside>

      <div className="grid min-w-0 gap-6 xl:col-start-1 xl:row-start-1">
        {rows.length > 0 ? (
          <Panel id={IDENTITY_PANEL_ID} aria-labelledby={`${IDENTITY_PANEL_ID}-title`} className="scroll-mt-4">
            <PanelHeader
              icon={IdCard}
              titleId={`${IDENTITY_PANEL_ID}-title`}
              title="Identité"
              description={`Envoyée par l’API de ${connector.label}. Chaque proposition se modifie avant l’envoi.`}
            />
            {profileErrorIn === IDENTITY_PANEL_ID ? profileError : null}
            <PanelRows className="@container">
              {rows.map((row) => (
                <EditableFieldRow
                  key={row.field.key}
                  field={row.field}
                  serviceLabel={connector.label}
                  current={row.current}
                  currentState={currentState}
                  proposed={row.proposed}
                  brandValue={brandValueOf(row.field)}
                  changed={row.changed}
                  error={row.error}
                  access={row.access}
                  sending={sending.includes(row.field.key)}
                  sendStatus={sendTarget === row.field.key ? sendFeedback.state : null}
                  choices={choices[row.field.key]}
                  onLoadChoices={() => void loadChoices(row.field.key)}
                  onChange={(value) => setDrafts((current) => ({ ...current, [row.field.key]: value }))}
                  onUseBrand={() =>
                    setDrafts((current) => {
                      const next = { ...current };
                      delete next[row.field.key];
                      return next;
                    })
                  }
                  onKeepCurrent={() => setDrafts((current) => ({ ...current, [row.field.key]: row.current ?? emptyValue(row.field) }))}
                  onSend={() => void send([row.field.key])}
                />
              ))}
            </PanelRows>
          </Panel>
        ) : null}

        {imageFields.length > 0 ? (
          <Panel id={IMAGES_PANEL_ID} aria-labelledby={`${IMAGES_PANEL_ID}-title`} className="@container scroll-mt-4">
            <PanelHeader
              icon={ImageUp}
              titleId={`${IMAGES_PANEL_ID}-title`}
              title="Images"
              description={`Rendues depuis la marque au moment de l’envoi, puis envoyées par l’API de ${connector.label}.`}
            />
            {/* Bords de cellule à droite et en bas, rognés au bord du panneau : un trait entre deux cartes, jamais contre le cadre. */}
            <div className="-mr-px -mb-px grid min-w-0 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {imageFields.map((field) => (
                <ImageCard
                  key={field.key}
                  field={field}
                  serviceLabel={connector.label}
                  access={accessFor(field.capability)}
                  brand={brand}
                  busy={busyImage === field.key}
                  disabled={brand?.status !== "ready" || busyImage !== null}
                  status={imageStatusOf(field.key)}
                  onPush={() => void pushImage(field)}
                />
              ))}
            </div>
          </Panel>
        ) : null}

        {manualFields.length > 0 ? (
          <Panel id={MANUAL_PANEL_ID} aria-labelledby={`${MANUAL_PANEL_ID}-title`} className="scroll-mt-4">
            <PanelHeader
              icon={Hand}
              titleId={`${MANUAL_PANEL_ID}-title`}
              title={
                <span className="inline-flex max-w-full min-w-0 items-center gap-2">
                  <ServiceLogo logo={connector.logo} />
                  <span className="min-w-0">À changer chez {connector.label}</span>
                </span>
              }
              description={`${connector.label} ne permet pas de les changer par son API. La marque fournit de quoi le faire à la main : image à télécharger, texte à copier, lien vers la bonne page.`}
            />
            {profileErrorIn === MANUAL_PANEL_ID ? profileError : null}
            <PanelRows className="@container">
              {manualFields.map((field) => {
                const url = field.manual ? resolveManualUrl(field.manual.url, account) : "";
                return (
                  <ManualFieldRow
                    key={field.key}
                    field={field}
                    serviceLabel={connector.label}
                    current={currentOf(field)}
                    currentState={currentState}
                    brandText={brandCopyText(field, brandInput)}
                    brandImage={brand?.status === "ready" && field.imageFormat ? brand.data.exports[field.imageFormat] : undefined}
                    link={/^https:\/\//.test(url) ? url : null}
                    downloading={busyImage === field.key}
                    downloadStatus={imageStatusOf(field.key)}
                    onDownload={brand?.status === "ready" && field.imageFormat ? () => void downloadImage(field) : undefined}
                  />
                );
              })}
            </PanelRows>
          </Panel>
        ) : null}

        <ChannelLayout account={account} connector={connector} accessFor={accessFor} />
      </div>
    </div>
  );
}

// ─── Colonne latérale ─────────────────────────────────────────────

/** Source des propositions : l'image de marque choisie et l'état de la lecture chez le service. */
function SourceBlock({
  connector,
  connected,
  kits,
  hasKits,
  kitId,
  onKitChange,
  brand,
  profile,
  onReload,
}: {
  connector: ConnectorView;
  connected: boolean;
  kits: BrandFormats[] | null;
  hasKits: boolean;
  kitId: string;
  onKitChange: (id: string) => void;
  brand: LoadState<LoadedBrand> | null;
  profile: LoadState<ProfileSnapshot> | null;
  onReload: () => void;
}) {
  const canRead = Boolean(connector.profileRead) && connected;
  return (
    <div className="grid min-w-0 content-start gap-4 p-4">
      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <label htmlFor="channel-brand-kit" className="text-xs font-medium text-muted-foreground">
            Image de marque
          </label>
          {brand?.status === "ready" ? (
            <Link href={editorHref(brand.data.kit.id)} className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              Modifier la marque
            </Link>
          ) : null}
        </div>
        {hasKits ? (
          <Select value={kitId} onValueChange={onKitChange}>
            <SelectTrigger id="channel-brand-kit" className="w-full min-w-0" title={kits!.find((entry) => entry.id === kitId)?.name}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kits!.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  <span className="truncate">
                    {entry.name}
                    {entry.isDefault ? " (par défaut)" : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : kits === null ? (
          <p className="text-sm text-pretty text-muted-foreground">Le module « Image de marque » n’est pas chargé : rien à proposer, les valeurs actuelles restent modifiables.</p>
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">
            Aucune image de marque pour préremplir le profil.{" "}
            <Link href="/m/brand-kit" className="text-foreground underline underline-offset-2">
              En créer une
            </Link>
            .
          </p>
        )}
        {brand?.status === "error" ? (
          <Alert variant="destructive" className="mt-1">
            <CircleAlert />
            <AlertTitle>Marque illisible</AlertTitle>
            <AlertDescription>
              <p className="break-words">{brand.error}</p>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {!connected ? (
        <Alert>
          <CircleAlert className="text-amber-600 dark:text-amber-400" />
          <AlertTitle>Compte à reconnecter</AlertTitle>
          <AlertDescription>
            <p>Rien ne peut être lu ni envoyé d’ici là.</p>
          </AlertDescription>
        </Alert>
      ) : canRead ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {profile?.status === "loading" ? (
              <>
                <Spinner className="size-3.5 shrink-0" />
                <span className="min-w-0">Lecture chez {connector.label}…</span>
              </>
            ) : profile?.status === "ready" ? (
              <>
                <CircleCheck aria-hidden className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="min-w-0 text-pretty">
                  Lu chez {connector.label} le {formatDateTime(profile.data.fetchedAt)}
                </span>
              </>
            ) : (
              <>
                <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />
                <span className="min-w-0 text-destructive">Lecture impossible</span>
              </>
            )}
          </p>
          <Button size="xs" variant="ghost" className="shrink-0 gap-1" loading={profile?.status === "loading"} onClick={onReload}>
            <RefreshCw />
            Relire
          </Button>
        </div>
      ) : (
        <p className="text-xs text-pretty text-muted-foreground">{connector.label} ne laisse pas lire le profil : les valeurs actuelles restent inconnues.</p>
      )}
    </div>
  );
}

/** Bilan des changements prêts à partir, et l'envoi groupé. */
function ChangesSummary({
  serviceLabel,
  readyCount,
  blocked,
  sending,
  disabled,
  status,
  onSendAll,
}: {
  serviceLabel: string;
  readyCount: number;
  /** Changements qui ne peuvent pas partir (valeur refusée, accès manquant). */
  blocked: number;
  sending: boolean;
  disabled: boolean;
  status: FeedbackState | null;
  onSendAll: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      {readyCount > 0 ? (
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />
          <span className="min-w-0">{plural(readyCount, "élément à envoyer", "éléments à envoyer")}</span>
        </p>
      ) : blocked === 0 ? (
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <CircleCheck aria-hidden className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0 text-pretty">Tout est à jour chez {serviceLabel}.</span>
        </p>
      ) : null}
      {blocked > 0 ? (
        <p className="flex min-w-0 items-start gap-2 text-xs text-pretty text-amber-700 dark:text-amber-400">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0">
            {blocked > 1 ? `${blocked} changements attendent` : "Un changement attend"} une correction ou une autorisation, sur sa ligne.
          </span>
        </p>
      ) : null}
      {readyCount > 0 ? (
        <Button size="sm" className="w-full gap-1.5" loading={sending} disabled={disabled} onClick={onSendAll}>
          <Send />
          Tout envoyer ({readyCount})
        </Button>
      ) : null}
      {/* Hors de la condition : après un envoi groupé réussi, le bouton
          disparaît mais son bilan reste lisible. */}
      <ActionStatus state={status} />
    </div>
  );
}

// ─── Images envoyées par l'API ────────────────────────────────────

/** Aperçu d'une image rendue depuis la marque, sa légende et son envoi. */
function ImageCard({
  field,
  serviceLabel,
  access,
  brand,
  busy,
  disabled,
  status,
  onPush,
}: {
  field: ProfileField;
  serviceLabel: string;
  access: FieldAccess;
  brand: LoadState<LoadedBrand> | null;
  busy: boolean;
  disabled: boolean;
  status: FeedbackState | null;
  onPush: () => void;
}) {
  const image = brand?.status === "ready" && field.imageFormat ? brand.data.exports[field.imageFormat] : undefined;
  const transparent = field.imageFormat === "watermark";
  const meta = formatMeta(field.imageFormat);
  const titleId = `profile-${field.key}-image-title`;
  return (
    <figure aria-labelledby={titleId} className="grid min-w-0 content-start gap-3 border-r border-b p-4">
      <div
        className={cn(
          "relative flex aspect-video w-full min-w-0 items-center justify-center overflow-hidden rounded-lg border bg-muted",
          transparent && "[background:repeating-conic-gradient(#8882_0_25%,transparent_0_50%)_0_0/12px_12px]"
        )}
      >
        {brand?.status === "loading" ? (
          <Skeleton className="absolute inset-0 rounded-none" aria-hidden />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element -- format exporté par la marque
          <img src={image} alt="" className={cn("max-h-full max-w-full object-contain", transparent ? "size-20" : "size-full")} />
        ) : (
          <div className="grid max-w-full justify-items-center gap-2 p-4 text-center text-xs text-pretty text-muted-foreground">
            <ImageIcon aria-hidden className="size-5" />
            {brand?.status === "ready" ? (
              <span>
                Rendue depuis la marque à l’envoi.{" "}
                <Link href={editorHref(brand.data.kit.id)} className="text-foreground underline underline-offset-2">
                  Voir la marque
                </Link>
              </span>
            ) : (
              <span>Aucune marque choisie.</span>
            )}
          </div>
        )}
      </div>
      <figcaption className="grid min-w-0 gap-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h4 id={titleId} className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
            {field.label}
          </h4>
          {meta ? <span className="text-xs text-muted-foreground tabular-nums">{meta}</span> : null}
        </div>
        {field.help ? <p className="text-xs text-pretty text-muted-foreground">{field.help}</p> : null}
      </figcaption>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {access.state === "ok" ? (
          <Button size="sm" className="gap-1.5" loading={busy} disabled={disabled} onClick={onPush}>
            <Send />
            Envoyer depuis la marque
          </Button>
        ) : access.state === "authorize" ? (
          <Button asChild size="sm" variant="outline">
            <a href={access.href}>Autoriser…</a>
          </Button>
        ) : (
          <span className="text-xs text-pretty text-amber-700 dark:text-amber-400">
            {access.state === "reconnect" ? "Compte à reconnecter." : `Le rôle de ce compte chez ${serviceLabel} ne le permet pas.`}
          </span>
        )}
        <ActionStatus state={status} />
      </div>
    </figure>
  );
}
