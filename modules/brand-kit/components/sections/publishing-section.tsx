"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Globe, Link2, Lock } from "lucide-react";
import { BrandLogo, isBrand } from "@/components/brand-logo";
import { ConnectAccountButton } from "@/components/connections/connect-account-sheet";
import { useSession } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type PublishAccount } from "../../lib/client";
import type { Privacy } from "../../lib/types";
import { ConfirmDialog, Field, FieldGroup, SectionHeading } from "../fields";
import { HashtagsLinksGroup, PostTemplatesGroup } from "./publishing-texts";
import type { SectionProps } from "./types";

const CATEGORIES = [
  { value: "1", label: "Film et animation" },
  { value: "10", label: "Musique" },
  { value: "20", label: "Jeux vidéo" },
  { value: "22", label: "Gens et blogs" },
  { value: "23", label: "Humour" },
  { value: "24", label: "Divertissement" },
  { value: "27", label: "Éducation" },
  { value: "28", label: "Science et technologie" },
];

const PRIVACIES: { value: Privacy; label: string; icon: typeof Lock }[] = [
  { value: "private", label: "Privée", icon: Lock },
  { value: "unlisted", label: "Non répertoriée", icon: Link2 },
  { value: "public", label: "Publique", icon: Globe },
];

/** Avatar du compte, avec le logo du service en pastille : on reconnaît d'un coup d'œil où l'on publie. */
export function AccountAvatar({ account, size = "default" }: { account: PublishAccount; size?: "sm" | "default" }) {
  const name = account.label ?? account.name;
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar size={size} className="border">
        {account.avatarUrl && <AvatarImage src={account.avatarUrl} alt="" />}
        <AvatarFallback className="text-xs font-semibold text-foreground uppercase">{name.charAt(0)}</AvatarFallback>
      </Avatar>
      {isBrand(account.logo) && (
        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <BrandLogo brand={account.logo} className="size-2.5" />
        </span>
      )}
    </span>
  );
}

export function PublishingSection({ kit, update }: SectionProps) {
  const [accounts, setAccounts] = useState<PublishAccount[] | null>(null);
  const [confirmPublic, setConfirmPublic] = useState(false);
  // Connecter un compte est réservé aux administrateurs ; les autres gardent le simple rappel.
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const publishing = kit.publishing;
  const setPublishing = (patch: Partial<typeof publishing>) => update((draft) => ({ ...draft, publishing: { ...draft.publishing, ...patch } }));

  useEffect(() => {
    let cancelled = false;
    // Les comptes connectés peuvent ne pas exister encore : une liste vide, sans message d'erreur.
    api.listPublishAccounts().then(
      (list) => !cancelled && setAccounts(list),
      () => !cancelled && setAccounts([])
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /** Après une connexion faite depuis la marque, la liste se relit et les nouveaux comptes sont liés d'avance. */
  const afterConnect = (connected: { id: string }[]) => {
    api.listPublishAccounts().then(setAccounts, () => undefined);
    const fresh = connected.map((account) => account.id).filter((id) => !publishing.accountIds.includes(id));
    if (fresh.length > 0) setPublishing({ accountIds: [...publishing.accountIds, ...fresh] });
  };

  const toggleAccount = (id: string, on: boolean) =>
    setPublishing({ accountIds: on ? [...publishing.accountIds.filter((entry) => entry !== id), id] : publishing.accountIds.filter((entry) => entry !== id) });

  const missing = accounts ? publishing.accountIds.filter((id) => !accounts.some((account) => account.id === id)) : [];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Publication" text="Où publier les clips de la marque, et ce qui préremplit la fenêtre de publication." />

      <FieldGroup title="Comptes liés" text="Cochés d’avance quand on publie un clip de cette marque.">
        {accounts === null ? (
          <div className="grid gap-2" aria-hidden>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">Aucun compte capable de publier une vidéo n’est connecté.</p>
            {isAdmin ? (
              <ConnectAccountButton capability="publish.video" returnLabel="Revenir à la marque" onConnected={afterConnect}>
                Connecter un compte
              </ConnectAccountButton>
            ) : (
              <Link href="/admin/connections" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Comptes connectés
                <ExternalLink aria-hidden className="size-3.5" />
              </Link>
            )}
          </div>
        ) : (
          <ItemGroup className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            {accounts.map((account) => {
              const checked = publishing.accountIds.includes(account.id);
              const name = account.label ?? account.name;
              return (
                <Item key={account.id} asChild variant={checked ? "muted" : "outline"} size="sm" className="min-w-0 flex-nowrap cursor-pointer">
                  <label>
                    <Checkbox checked={checked} onCheckedChange={(value) => toggleAccount(account.id, value === true)} />
                    <ItemMedia>
                      <AccountAvatar account={account} />
                    </ItemMedia>
                    <ItemContent className="min-w-0 gap-0.5">
                      <ItemTitle className="w-full min-w-0">
                        <span className="truncate" title={name}>
                          {name}
                        </span>
                      </ItemTitle>
                      <ItemDescription className="flex min-w-0 items-center gap-1.5 text-xs">
                        <span className="shrink-0">{account.connectorLabel}</span>
                        {account.label && account.label !== account.name && <span className="truncate" title={account.name}>· {account.name}</span>}
                      </ItemDescription>
                    </ItemContent>
                    {account.status === "needs-reconnect" && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle aria-hidden className="size-3.5" />
                        à reconnecter
                      </span>
                    )}
                  </label>
                </Item>
              );
            })}
          </ItemGroup>
        )}
        {accounts !== null && accounts.length > 0 && isAdmin && (
          <div>
            <ConnectAccountButton capability="publish.video" returnLabel="Revenir à la marque" onConnected={afterConnect} variant="ghost">
              Connecter un autre compte
            </ConnectAccountButton>
          </div>
        )}
        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {missing.length > 1 ? `${missing.length} comptes liés ne sont plus connectés.` : "Un compte lié n’est plus connecté."}{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => setPublishing({ accountIds: publishing.accountIds.filter((id) => !missing.includes(id)) })}>
              Les retirer
            </button>
          </p>
        )}
      </FieldGroup>

      <PostTemplatesGroup kit={kit} setPublishing={setPublishing} />

      <HashtagsLinksGroup kit={kit} setPublishing={setPublishing} />

      <FieldGroup title="Réglages par défaut">
        <div className="grid gap-4">
          <Field label="Catégorie">
            <Select value={publishing.categoryId} onValueChange={(categoryId) => setPublishing({ categoryId })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Visibilité">
            <ToggleGroup
              type="single"
              variant="outline"
              value={publishing.defaultPrivacy}
              onValueChange={(value) => {
                if (!value) return;
                if (value === "public") setConfirmPublic(true);
                else setPublishing({ defaultPrivacy: value as Privacy });
              }}
              className="w-full flex-wrap"
            >
              {PRIVACIES.map((privacy) => (
                <ToggleGroupItem key={privacy.value} value={privacy.value} className="min-w-max flex-1 gap-1.5">
                  <privacy.icon aria-hidden className="hidden size-4 @sm/form:block" />
                  {privacy.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <Switch checked={publishing.containsSyntheticMedia} onCheckedChange={(containsSyntheticMedia) => setPublishing({ containsSyntheticMedia })} className="mt-0.5" />
          <span>
            Contenu synthétique
            <span className="block text-xs text-muted-foreground">Images ou voix générées présentées comme réalistes : la plateforme l’indique aux spectateurs.</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <Switch checked={publishing.madeForKids} onCheckedChange={(madeForKids) => setPublishing({ madeForKids })} className="mt-0.5" />
          <span>
            Conçu pour les enfants
            <span className="block text-xs text-muted-foreground">Désactive les commentaires et la publicité ciblée. À cocher seulement si c’est le cas.</span>
          </span>
        </label>
      </FieldGroup>

      <ConfirmDialog
        open={confirmPublic}
        onOpenChange={setConfirmPublic}
        title="Publier en public par défaut ?"
        description="Chaque clip de cette marque partira visible de tous, sauf si vous changez la visibilité au moment de publier."
        confirmLabel="Passer en public"
        onConfirm={() => {
          setPublishing({ defaultPrivacy: "public" });
          setConfirmPublic(false);
        }}
      />
    </div>
  );
}
