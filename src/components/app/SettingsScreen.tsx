"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  LifeBuoy,
  LogOut,
  Mail,
  MessageCircleHeart,
  Moon,
  Sun,
  Trash2,
  UserCog,
  Volume2,
  Users,
  type LucideIcon,
} from "@/components/ui/icons";
import { useMutation, useQuery } from "convex/react";

import { useViboAuth } from "@/lib/auth/AuthProvider";
import { useTheme, type ThemeChoice } from "@/lib/theme/ThemeProvider";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";
import { writeStoredLang } from "@/i18n/useViboLang";

type AppLang = "en" | "ar";
type SettingsDict = {
  settings: string;
  account: string;
  editProfile: string;
  password: string;
  email: string;
  privacy: string;
  privateAccount: string;
  privateHint: string;
  notifications: string;
  pushNotifications: string;
  storyLikesInApp: string;
  storyLikesHint: string;
  postLikesInApp: string;
  postLikesHint: string;
  sound: string;
  onlyFromFollowing: string;
  appearance: string;
  language: string;
  light: string;
  dark: string;
  system: string;
  support: string;
  reportProblem: string;
  accountActions: string;
  signOut: string;
  deleteAccount: string;
  deleteHint: string;
  deleteSoon: string;
  copied: string;
};

const SETTINGS_TEXT: Record<AppLang, SettingsDict> = {
  en: {
    settings: "Settings",
    account: "Account",
    editProfile: "Edit profile",
    password: "Password",
    email: "Email",
    privacy: "Privacy",
    privateAccount: "Private account",
    privateHint: "Only followers can see your content",
    notifications: "Notifications",
    pushNotifications: "Push notifications",
    storyLikesInApp: "Story likes in app",
    storyLikesHint: "Grouped activity when someone likes your story",
    postLikesInApp: "Post likes in app",
    postLikesHint: "When someone likes your posts (coming soon)",
    sound: "Sound",
    onlyFromFollowing: "Only from people you follow",
    appearance: "Appearance",
    language: "Language",
    light: "Light",
    dark: "Dark",
    system: "System",
    support: "Support",
    reportProblem: "Report a problem",
    accountActions: "Account actions",
    signOut: "Sign out",
    deleteAccount: "Delete account",
    deleteHint: "Permanently remove your data",
    deleteSoon: "Account deletion is coming soon. Please contact support.",
    copied: "Copied",
  },
  ar: {
    settings: "الإعدادات",
    account: "الحساب",
    editProfile: "تعديل الملف الشخصي",
    password: "كلمة المرور",
    email: "البريد الإلكتروني",
    privacy: "الخصوصية",
    privateAccount: "حساب خاص",
    privateHint: "فقط المتابعون يمكنهم رؤية محتواك",
    notifications: "الإشعارات",
    pushNotifications: "إشعارات الدفع",
    storyLikesInApp: "إعجابات الستوري داخل التطبيق",
    storyLikesHint: "نشاط مجمّع عندما يعجب أحدهم بستوريك",
    postLikesInApp: "إعجابات المنشورات داخل التطبيق",
    postLikesHint: "عندما يعجب أحدهم بمنشوراتك (قريباً)",
    sound: "الصوت",
    onlyFromFollowing: "فقط من الأشخاص الذين تتابعهم",
    appearance: "المظهر",
    language: "اللغة",
    light: "فاتح",
    dark: "داكن",
    system: "النظام",
    support: "الدعم",
    reportProblem: "الإبلاغ عن مشكلة",
    accountActions: "إجراءات الحساب",
    signOut: "تسجيل الخروج",
    deleteAccount: "حذف الحساب",
    deleteHint: "إزالة بياناتك نهائياً",
    deleteSoon: "حذف الحساب سيتوفر قريباً. يرجى التواصل مع الدعم.",
    copied: "تم النسخ",
  },
};

function visibleSettingsProfile(profile: unknown) {
  if (!profile || typeof profile !== "object") return null;
  if ("restricted" in profile && (profile as { restricted?: boolean }).restricted) return null;
  return profile as {
    username?: string;
    email?: string;
    isPrivate?: boolean;
    preferredLang?: string;
  };
}

export function SettingsScreen({ backHref }: { backHref: string }) {
  const { user, clearSession } = useViboAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const profile = useQuery(
    api.users.getById,
    user ? { id: user.id as Id<"users"> } : "skip",
  );
  const notificationSettings = useQuery(
    api.notifications.getSettings,
    user ? { userId: user.id as Id<"users"> } : "skip",
  ) as
    | {
        pushEnabled?: boolean;
        likeStoryInApp?: boolean;
        likePostInApp?: boolean;
        pushSound?: boolean;
        onlyFromFollowing?: boolean;
      }
    | undefined;
  const updateNotificationSettings = useMutation(api.notifications.updateSettings);
  const updateAccountPreferences = useMutation(
    (api.users as any).updateAccountPreferences,
  );
  const visible = visibleSettingsProfile(profile);

  const [isPrivate, setIsPrivate] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [storyLikes, setStoryLikes] = useState(true);
  const [postLikes, setPostLikes] = useState(true);
  const [sound, setSound] = useState(true);
  const [onlyFromFollows, setOnlyFromFollows] = useState(false);
  const [lang, setLang] = useState<AppLang>("en");
  const [langTouched, setLangTouched] = useState(false);
  const isAr = lang === "ar";
  const t = SETTINGS_TEXT[lang];

  useEffect(() => {
    if (visible) {
      setIsPrivate(visible.isPrivate === true);
      if (!langTouched && (visible.preferredLang === "ar" || visible.preferredLang === "en")) {
        setLang(visible.preferredLang);
      }
    }
  }, [visible, langTouched]);

  useEffect(() => {
    if (!notificationSettings) return;
    setPushNotifications(notificationSettings.pushEnabled !== false);
    setStoryLikes(notificationSettings.likeStoryInApp !== false);
    setPostLikes(notificationSettings.likePostInApp !== false);
    setSound(notificationSettings.pushSound !== false);
    setOnlyFromFollows(notificationSettings.onlyFromFollowing === true);
  }, [notificationSettings]);

  const togglePrivate = (value: boolean) => {
    const prev = isPrivate;
    setIsPrivate(value);
    if (!user?.id) return;
    void updateAccountPreferences({
      userId: user.id as Id<"users">,
      isPrivate: value,
    }).catch(() => setIsPrivate(prev));
  };

  const switchLang = (next: AppLang) => {
    setLangTouched(true);
    const prev = lang;
    setLang(next);
    // Apply immediately for the current app session.
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
      document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    }
    writeStoredLang(next);
    if (!user?.id) return;
    void updateAccountPreferences({
      userId: user.id as Id<"users">,
      preferredLang: next,
    }).catch(() => {
      setLang(prev);
      if (typeof document !== "undefined") {
        document.documentElement.lang = prev;
        document.documentElement.dir = prev === "ar" ? "rtl" : "ltr";
      }
      writeStoredLang(prev);
    });
  };

  const patchNotifications = (patch: {
    pushEnabled?: boolean;
    likeStoryInApp?: boolean;
    likePostInApp?: boolean;
    pushSound?: boolean;
    onlyFromFollowing?: boolean;
  }) => {
    if (!user?.id) return;
    void updateNotificationSettings({
      userId: user.id as Id<"users">,
      ...patch,
    }).catch(() => {
      /* silent rollback handled by reactive query */
    });
  };

  const handleSignOut = () => {
    clearSession();
    router.replace("/login");
  };

  return (
    <AppShell maxWidth="max-w-[960px]">
      <div dir={isAr ? "rtl" : "ltr"} className={isAr ? "font-ar text-right" : ""}>
      <header className="-mx-4 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-900 dark:bg-black/95">
        <Link
          href={backHref}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-[16px] font-semibold tracking-tight text-neutral-900 dark:text-white">
          {t.settings}
        </h1>
        <span className="h-10 w-10" aria-hidden />
      </header>

      <Section title={t.account}>
        <RowLink
          href="/profile/edit-profile"
          icon={UserCog}
          label={t.editProfile}
          subtitle={visible?.username ? `@${visible.username}` : undefined}
        />
        <RowLink href="/change-password" icon={Eye} label={t.password} />
        <RowDisplay icon={Mail} label={t.email} subtitle={visible?.email ?? user?.email ?? ""} />
      </Section>

      <Section title={t.privacy}>
        <RowToggle
          icon={EyeOff}
          label={t.privateAccount}
          subtitle={t.privateHint}
          value={isPrivate}
          onChange={togglePrivate}
        />
      </Section>

      <Section title={t.notifications}>
        <RowToggle
          icon={Bell}
          label={t.pushNotifications}
          value={pushNotifications}
          onChange={(v) => {
            setPushNotifications(v);
            patchNotifications({ pushEnabled: v });
          }}
        />
        <RowToggle
          icon={Heart}
          label={t.storyLikesInApp}
          subtitle={t.storyLikesHint}
          value={storyLikes}
          onChange={(v) => {
            setStoryLikes(v);
            patchNotifications({ likeStoryInApp: v });
          }}
        />
        <RowToggle
          icon={MessageCircleHeart}
          label={t.postLikesInApp}
          subtitle={t.postLikesHint}
          value={postLikes}
          onChange={(v) => {
            setPostLikes(v);
            patchNotifications({ likePostInApp: v });
          }}
        />
        <RowToggle
          icon={Volume2}
          label={t.sound}
          value={sound}
          onChange={(v) => {
            setSound(v);
            patchNotifications({ pushSound: v });
          }}
        />
        <RowToggle
          icon={Users}
          label={t.onlyFromFollowing}
          value={onlyFromFollows}
          onChange={(v) => {
            setOnlyFromFollows(v);
            patchNotifications({ onlyFromFollowing: v });
          }}
        />
      </Section>

      <Section title={t.appearance}>
        <SegmentedRow
          options={[
            { id: "light", label: t.light, icon: Sun },
            { id: "dark", label: t.dark, icon: Moon },
            { id: "system", label: t.system },
          ]}
          value={theme}
          onChange={(v) => setTheme(v as ThemeChoice)}
        />
        <p className="px-1 pt-3 text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">
          {t.language}
        </p>
        <SegmentedRow
          options={[
            { id: "en", label: "English" },
            { id: "ar", label: "العربية" },
          ]}
          value={lang}
          onChange={(v) => switchLang(v as AppLang)}
        />
      </Section>

      <Section title={t.support}>
        <RowLink href="/help" icon={LifeBuoy} label={t.reportProblem} />
      </Section>

      <Section title={t.accountActions}>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-3.5 text-left text-[15px] text-red-600 transition-colors hover:bg-neutral-100 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-neutral-800"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
            <LogOut className="h-4 w-4" />
          </span>
          <span className="flex-1 font-semibold">{t.signOut}</span>
          <ChevronRight className="h-4 w-4 text-red-500/70 dark:text-red-400/70" />
        </button>
        <button
          type="button"
          onClick={() => alert(t.deleteSoon)}
          className="flex w-full items-start gap-3 rounded-2xl bg-neutral-50 px-4 py-3.5 text-left text-[15px] text-red-600 transition-colors hover:bg-neutral-100 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-neutral-800"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
            <Trash2 className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t.deleteAccount}</span>
            <span className="block text-[12.5px] text-red-500/80 dark:text-red-300/70">
              {t.deleteHint}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-red-500/70 dark:text-red-400/70" />
        </button>
      </Section>

      <p className="mt-8 pb-2 text-center text-[11px] uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
        Vibo · v1.0
      </p>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <p className="px-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-500">
        {title}
      </p>
      <div className="mt-2 space-y-2 rounded-2xl bg-white p-2 ring-1 ring-neutral-200 dark:bg-neutral-950 dark:ring-neutral-900">
        {children}
      </div>
    </section>
  );
}

function RowLink({
  href,
  icon: Icon,
  label,
  subtitle,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-neutral-900 transition-colors hover:bg-neutral-100 dark:text-white dark:hover:bg-neutral-900"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {subtitle ? (
          <span className="block text-[12.5px] text-neutral-500 dark:text-neutral-500">
            {subtitle}
          </span>
        ) : null}
      </span>
      <ChevronRight className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
    </Link>
  );
}

function RowDisplay({
  icon: Icon,
  label,
  subtitle,
}: {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-neutral-900 dark:text-white">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {subtitle ? (
          <span className="block text-[12.5px] text-neutral-500">{subtitle}</span>
        ) : null}
      </span>
    </div>
  );
}

function RowToggle({
  icon: Icon,
  label,
  subtitle,
  value,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-neutral-900 transition-colors hover:bg-neutral-100 dark:text-white dark:hover:bg-neutral-900"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {subtitle ? (
          <span className="block text-[12.5px] text-neutral-500">{subtitle}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          value ? "bg-vibo-primary" : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span
          className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function SegmentedRow({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string; icon?: LucideIcon }>;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-1 py-1">
      {options.map((opt) => {
        const active = value === opt.id;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`inline-flex h-10 flex-1 min-w-[88px] items-center justify-center gap-2 rounded-2xl px-4 text-[14px] font-medium transition-colors ${
              active
                ? "bg-vibo-primary text-white"
                : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            }`}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

