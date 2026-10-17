"use client";

/**
 * Onglet « Chaîne / Profil » d'un compte connecté : tout ce qui fait
 * l'identité du compte, en deux groupes.
 *
 * - « Modifiable depuis ShareX Manager » : valeur actuelle chez le service
 *   (lue par l'API), valeur proposée (préremplie depuis l'image de marque
 *   choisie, modifiable), ce qui change, puis l'envoi. Bannière et filigrane
 *   sont rendus depuis la marque au moment de l'envoi.
 * - « À changer chez {service} » : ce que l'API ne permet pas, dit
 *   franchement, avec l'image rendue depuis la marque à télécharger, le
 *   texte à copier et le lien vers la bonne page du service.
 *
 * Rien ici ne cite un service : tout vient de `connector.profileFields`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ServiceLogo, formatDateTime } from "@/components/connections/shared";
import type { ConnectorView } from "@/components/connections/types";
import { brandCopyText, brandProfileValue, cleanProfileValue, resolveManualUrl, sameProfileValue, type ProfileBrandInput } from "@/lib/connections/profile";
import type { AccountSummary, ConnectionCapability, ProfileChoice, ProfileField, ProfileImageFormat, ProfileSnapshot, ProfileValue } from "@/lib/connections/types";
import type { BrandFormats } from "../data";
import { profileChoicesAction, pushBrandAction, readProfileAction, updateProfileAction } from "../actions";
import { api as brandKitApi, downloadBlob, editorHref } from "@/modules/brand-kit/lib/client";
import { buildFormat } from "@/modules/brand-kit/lib/formats";
import { profileBrandInput } from "@/modules/brand-kit/lib/profile";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import { renderFormatPng } from "@/modules/brand-kit/components/format-render";
import { ChannelLayout } from "./channel-layout";
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

interface LoadedBrand {
  kit: BrandKit;
  input: ProfileBrandInput;
  /** Derniers exports de la marque, par format. */
  exports: Record<string, string>;
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

  const send = async (keys: string[]) => {
    if (keys.length === 0) return;
    const changes = Object.fromEntries(keys.map((key) => [key, proposedOf(fields.find((field) => field.key === key)!)]));
    setSending(keys);
    const result = await updateProfileAction(account.id, changes);
    setSending([]);
    if (!result.ok) return void toast.error(result.error);
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
    const label = keys.length === 1 ? fields.find((field) => field.key === keys[0])?.label : null;
    toast.success(label ? `${label} : envoyé à ${connector.label}` : `${keys.length} éléments envoyés à ${connector.label}`);
    onPushed();
  };

  const pushImage = async (field: ProfileField) => {
    const format = field.imageFormat;
    if (brand?.status !== "ready" || (format !== "banner" && format !== "watermark")) return;
    setBusyImage(field.key);
    try {
      await renderBrandFormat(brand.data.kit, format);
    } catch (error) {
      setBusyImage(null);
      return void toast.error(error instanceof Error ? error.message : "Le format n’a pas pu être rendu depuis la marque.");
    }
    const result = await pushBrandAction(account.id, brand.data.kit.id, format);
    setBusyImage(null);
    onPushed();
    if (!result.ok) return void toast.error(result.error);
    toast.success(`${field.label} : mise à jour chez ${connector.label}`);
  };

  // Ce que l'API ne permet pas : l'image est rendue depuis la marque au clic, puis téléchargée.
  const downloadImage = async (field: ProfileField) => {
    if (brand?.status !== "ready" || !field.imageFormat) return;
    setBusyImage(field.key);
    try {
      const png = await renderBrandFormat(brand.data.kit, field.imageFormat);
      downloadBlob(`${field.key}.png`, png);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’image n’a pas pu être rendue depuis la marque.");
    } finally {
      setBusyImage(null);
    }
  };

  const hasKits = kits !== null && kits.length > 0;

  return (
    <div className="grid min-w-0 gap-10">
      <div className="grid min-w-0 gap-3">
        {/* Marque de référence et état de la lecture. */}
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Identité du compte</h2>
            <p className="text-xs text-pretty text-muted-foreground">
              {profile?.status === "ready"
                ? `Lu chez ${connector.label} le ${formatDateTime(profile.data.fetchedAt)}. Les propositions viennent de l’image de marque choisie.`
                : "Les propositions viennent de l’image de marque choisie."}
            </p>
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
            {connector.profileRead && connected ? (
              <Button size="sm" variant="ghost" className="gap-1.5" loading={profile?.status === "loading"} onClick={() => void loadProfile()}>
                <RefreshCw />
                Relire
              </Button>
            ) : null}
            {hasKits ? (
              <Select value={kitId} onValueChange={setKitId}>
                <SelectTrigger className="w-full min-w-0 sm:w-64" aria-label="Image de marque">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kits.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      <span className="truncate">
                        {entry.name}
                        {entry.isDefault ? " (par défaut)" : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>

        {kits === null ? (
          <p className="text-sm text-muted-foreground">Le module « Image de marque » n’est pas chargé : rien à proposer, les valeurs actuelles restent modifiables.</p>
        ) : kits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune image de marque pour préremplir le profil.{" "}
            <Link href="/m/brand-kit" className="underline underline-offset-2">
              En créer une
            </Link>
            .
          </p>
        ) : brand?.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {brand.error}
          </p>
        ) : null}
        {profile?.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {profile.error}
          </p>
        ) : null}
        {!connected ? <p className="text-sm text-amber-700 dark:text-amber-400">Compte à reconnecter : rien ne peut être lu ni envoyé d’ici là.</p> : null}
      </div>

      {/* Groupe 1 : ce que l'application envoie. */}
      <section className="grid min-w-0 gap-5" aria-labelledby="profile-editable">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 id="profile-editable" className="text-base font-semibold">
              Modifiable depuis ShareX Manager
            </h3>
            <p className="text-xs text-pretty text-muted-foreground">Envoyé par l’API de {connector.label}. Chaque proposition se modifie avant l’envoi.</p>
          </div>
          {ready.length > 1 ? (
            <Button size="sm" className="gap-1.5" loading={sending.length > 1} disabled={sending.length > 0} onClick={() => void send(ready.map((row) => row.field.key))}>
              <Send />
              Tout envoyer ({ready.length})
            </Button>
          ) : null}
        </div>

        {editableFields.length === 0 && imageFields.length === 0 ? (
          <p className="text-sm text-pretty text-muted-foreground">{connector.label} ne permet de modifier aucun élément du profil par son API : tout se fait chez {connector.label}, ci-dessous.</p>
        ) : null}

        {rows.length > 0 ? (
          <div className="grid min-w-0 gap-4">
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
          </div>
        ) : null}

        {imageFields.length > 0 ? (
          <div className="grid min-w-0 gap-8 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {imageFields.map((field) => {
              const access = accessFor(field.capability);
              const image = brand?.status === "ready" && field.imageFormat ? brand.data.exports[field.imageFormat] : undefined;
              return (
                <div key={field.key} className="grid min-w-0 content-start gap-2">
                  <h4 className="text-sm font-medium">{field.label}</h4>
                  {brand?.status === "loading" ? (
                    <Skeleton className={field.imageFormat === "watermark" ? "size-24" : "aspect-video w-full max-w-md"} aria-hidden />
                  ) : image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- format exporté par la marque
                    <img
                      src={image}
                      alt=""
                      className={cn(
                        "max-w-full rounded-md bg-muted",
                        field.imageFormat === "watermark"
                          ? "size-24 object-contain [background:repeating-conic-gradient(#8882_0_25%,transparent_0_50%)_0_0/12px_12px]"
                          : "aspect-video w-full max-w-md object-cover"
                      )}
                    />
                  ) : brand?.status === "ready" ? (
                    <p className="text-xs text-muted-foreground">
                      Rendu depuis la marque à l’envoi.{" "}
                      <Link href={editorHref(brand.data.kit.id)} className="underline underline-offset-2">
                        Voir la marque
                      </Link>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Aucune marque choisie.</p>
                  )}
                  {field.help ? <p className="text-xs text-pretty text-muted-foreground">{field.help}</p> : null}
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {access.state === "ok" ? (
                      <Button size="sm" className="gap-1.5" loading={busyImage === field.key} disabled={brand?.status !== "ready" || busyImage !== null} onClick={() => void pushImage(field)}>
                        <Send />
                        Envoyer depuis la marque
                      </Button>
                    ) : access.state === "authorize" ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={access.href}>Autoriser…</a>
                      </Button>
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        {access.state === "reconnect" ? "Compte à reconnecter." : `Le rôle de ce compte chez ${connector.label} ne le permet pas.`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* Groupe 2 : ce que l'API ne permet pas. */}
      {manualFields.length > 0 ? (
        <section className="grid min-w-0 gap-5" aria-labelledby="profile-manual">
          <div className="min-w-0">
            <h3 id="profile-manual" className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <ServiceLogo logo={connector.logo} />
              <span className="min-w-0">À changer chez {connector.label}</span>
            </h3>
            <p className="text-xs text-pretty text-muted-foreground">
              {connector.label} ne permet pas de les changer par son API. La marque fournit de quoi le faire à la main : image à télécharger, texte à copier, lien vers la bonne page.
            </p>
          </div>
          <div className="grid min-w-0 gap-4">
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
                  onDownload={brand?.status === "ready" && field.imageFormat ? () => void downloadImage(field) : undefined}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <ChannelLayout account={account} connector={connector} accessFor={accessFor} />
    </div>
  );
}
