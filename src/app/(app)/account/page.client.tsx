"use client";

import { useState } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  Crown,
  KeyRound,
  LogOut,
  Mail,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useAtomValue } from "jotai";

import { NavCard } from "@/components/nav-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { languageAtom } from "@/lib/atoms/preferences";
import { signOut } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";

interface AccountSummary {
  name: string;
  email: string;
  image: string | null;
  role: "admin" | "user";
  createdAt: string;
  expiresAt: string;
  provider: "builtin" | "ascencia";
}

export function AccountPageClient({ account }: { account: AccountSummary }) {
  const { t } = useTranslation();
  const language = useAtomValue(languageAtom);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isAdmin = account.role === "admin";
  const isAscencia = account.provider === "ascencia";
  const initials = getInitials(account.name);
  const dateLocale = language === "en" ? "en-GB" : "fr-FR";

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(dateLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value));

  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(dateLocale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await signOut();
      window.location.href = "/";
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 pb-4">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_42%),radial-gradient(circle_at_85%_30%,color-mix(in_oklab,var(--muted-foreground)_10%,transparent),transparent_34%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
        />

        <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between lg:p-9">
          <div className="flex min-w-0 flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              <Avatar className="size-20 border-4 border-background shadow-xl ring-1 ring-border/70 sm:size-24">
                <AvatarImage
                  src={account.image || undefined}
                  alt={account.name}
                  className="object-cover"
                />
                <AvatarFallback className="bg-primary text-xl font-semibold tracking-tight text-primary-foreground sm:text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute right-0.5 bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-emerald-500 text-white sm:size-6">
                <Check className="size-3.5" strokeWidth={3} />
                <span className="sr-only">{t("account.status.active")}</span>
              </span>
            </div>

            <div className="min-w-0 space-y-3">
              <div>
                <p className="mb-1 text-sm font-medium text-muted-foreground">
                  {t("account.eyebrow")}
                </p>
                <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-4xl">
                  {account.name}
                </h1>
                <p className="mt-1 truncate text-sm text-muted-foreground sm:text-base">
                  {account.email}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className="gap-1.5 border border-border/70 bg-background/75 px-2.5 py-1 shadow-xs backdrop-blur"
                >
                  {isAdmin ? (
                    <Crown className="text-amber-500" />
                  ) : (
                    <UserRound />
                  )}
                  {t(`account.role.${account.role}`)}
                </Badge>
                <Badge
                  variant="secondary"
                  className="gap-1.5 border border-border/70 bg-background/75 px-2.5 py-1 shadow-xs backdrop-blur"
                >
                  <ShieldCheck className="text-emerald-500" />
                  {t(`account.provider.${account.provider}`)}
                </Badge>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full border-border/70 bg-background/70 shadow-xs backdrop-blur sm:w-auto"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut />
            {isSigningOut ? t("account.signing_out") : t("common.logout")}
          </Button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 gap-0 border-border/70 py-0 shadow-sm">
          <CardHeader className="border-b p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <UserRound className="size-5" />
              </span>
              <div className="space-y-1">
                <CardTitle>{t("account.identity.title")}</CardTitle>
                <CardDescription>
                  {t("account.identity.description")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="divide-y px-5 sm:px-6">
            <DetailRow
              icon={Mail}
              label={t("account.identity.email")}
              value={account.email}
            />
            <DetailRow
              icon={isAdmin ? Crown : UserRound}
              label={t("account.identity.role")}
              value={t(`account.role.${account.role}`)}
            />
            <DetailRow
              icon={CalendarDays}
              label={t("account.identity.member_since")}
              value={formatDate(account.createdAt)}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0 gap-0 border-border/70 py-0 shadow-sm">
          <CardHeader className="border-b p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-5" />
              </span>
              <div className="space-y-1">
                <CardTitle>{t("account.security.title")}</CardTitle>
                <CardDescription>
                  {t("account.security.description")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex min-w-0 flex-col items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Check className="size-4" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{t("account.status.active")}</p>
                  <p className="truncate text-xs text-muted-foreground sm:text-sm">
                    {t("account.security.session_description")}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-500/25 bg-background/60 text-emerald-700 dark:text-emerald-300"
              >
                {t("account.status.secure")}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SecurityMetric
                icon={ShieldCheck}
                label={t("account.security.provider")}
                value={t(`account.provider.${account.provider}`)}
              />
              <SecurityMetric
                icon={Clock3}
                label={t("account.security.expires_at")}
                value={formatDateTime(account.expiresAt)}
              />
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                isAscencia
                  ? "account.security.ascencia_notice"
                  : "account.security.builtin_notice",
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4 pt-2">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <Sparkles className="size-5 text-muted-foreground" />
            {t("account.quick_actions.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("account.quick_actions.description")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <NavCard
            href="/settings/preferences"
            icon={Settings2}
            accent="slate"
            badge={t("account.quick_actions.preferences.badge")}
            title={t("account.quick_actions.preferences.title")}
            description={t("account.quick_actions.preferences.description")}
            action={t("common.open")}
          />
          <NavCard
            href="/settings/api-keys"
            icon={KeyRound}
            accent="amber"
            badge={t("account.quick_actions.api_keys.badge")}
            title={t("account.quick_actions.api_keys.title")}
            description={t("account.quick_actions.api_keys.description")}
            action={t("common.open")}
          />
          {isAdmin ? (
            <NavCard
              href="/admin/users"
              icon={UsersRound}
              accent="violet"
              badge={t("account.quick_actions.users.badge")}
              title={t("account.quick_actions.users.title")}
              description={t("account.quick_actions.users.description")}
              action={t("common.open")}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-4 first:pt-5 last:pb-5 sm:first:pt-6 sm:last:pb-6">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto min-w-0 max-w-[52%] truncate text-right text-sm font-medium">
        {value}
      </span>
    </div>
  );
}

function SecurityMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-muted/20 p-3.5">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "U"
  );
}
