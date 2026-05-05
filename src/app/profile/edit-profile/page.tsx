"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronLeft, ImagePlus, Link as LinkIcon, Loader2 } from "@/components/ui/icons";
import { useMutation, useQuery } from "convex/react";

import { useViboAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/app/AppShell";
import { ImageCropper, fileToDataUrl, type CropShape } from "@/components/app/ImageCropper";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";

const BIO_LIMIT = 150;

type CropTarget = { kind: "avatar" | "banner"; src: string };

function visibleUserSettings(profile: unknown) {
  if (!profile || typeof profile !== "object") return null;
  if ("restricted" in profile && (profile as { restricted?: boolean }).restricted) return null;
  return profile as {
    fullName?: string;
    username?: string;
    bio?: string;
    bioLink?: string;
    profilePictureUrl?: string;
    bannerUrl?: string;
  };
}

export default function EditProfilePage() {
  const { user } = useViboAuth();
  const router = useRouter();

  const profile = useQuery(
    api.users.getById,
    user ? { id: user.id as Id<"users"> } : "skip",
  );
  const updateProfile = useMutation(api.users.updateProfile);

  const visible = useMemo(() => visibleUserSettings(profile), [profile]);

  const initial = useMemo(
    () => ({
      fullName: visible?.fullName ?? "",
      username: visible?.username ?? "",
      bio: visible?.bio ?? "",
      bioLink: visible?.bioLink ?? "",
      profilePictureUrl: visible?.profilePictureUrl ?? "",
      bannerUrl: visible?.bannerUrl ?? "",
    }),
    [visible],
  );

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [bioLink, setBioLink] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [crop, setCrop] = useState<CropTarget | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (visible) {
      setFullName(initial.fullName);
      setUsername(initial.username);
      setBio(initial.bio);
      setBioLink(initial.bioLink);
      setProfilePictureUrl(initial.profilePictureUrl);
      setBannerUrl(initial.bannerUrl);
    }
  }, [visible, initial]);

  const usernameValid = /^[a-z0-9_.]{3,20}$/i.test(username.trim());

  const handlePick = async (file: File | null, kind: CropTarget["kind"]) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setCrop({ kind, src: url });
    } catch {
      setError("Could not read the selected file.");
    }
  };

  const cropShape: CropShape = crop?.kind === "banner" ? "wide" : "circle";

  const handleSave = async () => {
    if (!user || profile === undefined || !visible) return;
    if (!usernameValid) {
      setError("Username must be 3–20 letters, numbers, dots, or underscores.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updateProfile({
        userId: user.id as Id<"users">,
        fullName: fullName.trim() || undefined,
        username: username.trim() || undefined,
        bio: bio.trim() || undefined,
        bioLink: bioLink.trim() || undefined,
        profilePictureUrl: profilePictureUrl.trim() || undefined,
        bannerUrl: bannerUrl.trim() || undefined,
      });
      router.push(username.trim() ? `/${username.trim()}` : "/profile");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save profile.";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell maxWidth="max-w-[720px]">
      <header className="-mx-4 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-900 dark:bg-black/95">
        <Link
          href={user?.username ? `/${user.username}` : "/profile"}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-[16px] font-semibold tracking-tight text-neutral-900 dark:text-white">
          Edit profile
        </h1>
        <button
          type="button"
          disabled={isSaving || !usernameValid}
          onClick={() => void handleSave()}
          className={`inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-colors ${
            isSaving || !usernameValid
              ? "bg-vibo-primary/40 text-white/70"
              : "bg-vibo-primary text-white hover:bg-vibo-primary/90"
          }`}
        >
          {isSaving ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
          Save
        </button>
      </header>

      {/* Hidden file inputs reused by all the change buttons */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          void handlePick(f, "avatar");
        }}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          void handlePick(f, "banner");
        }}
      />

      {/* Banner with overlayed avatar */}
      <section className="mt-5">
        <div className="relative -mx-4 h-[200px] overflow-hidden bg-vibo-primary md:rounded-3xl">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="Banner" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-vibo-primary via-[#3a0211] to-black">
              <span className="text-[44px] font-bold tracking-tight text-white/85 drop-shadow">
                Vibo
              </span>
            </div>
          )}

          {/* Banner edit pill */}
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm hover:bg-black/75"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {bannerUrl ? "Change banner" : "Add banner"}
          </button>
        </div>

        {/* Avatar */}
        <div className="-mt-12 flex flex-col items-center gap-2">
          <div className="relative">
            <div className="grid h-28 w-28 place-items-center rounded-full bg-vibo-primary ring-4 ring-white dark:ring-black">
              {profilePictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profilePictureUrl}
                  alt="Profile"
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <span className="text-[32px] font-bold uppercase text-white">
                  {(username || fullName || "V").charAt(0)}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label="Change profile photo"
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 right-0 grid h-9 w-9 place-items-center rounded-full bg-vibo-primary text-white ring-4 ring-white hover:bg-vibo-primary/90 dark:ring-black"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="text-[13px] font-semibold text-vibo-primary hover:underline"
          >
            Change profile photo
          </button>
          {(profilePictureUrl || bannerUrl) && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-[12px]">
              {profilePictureUrl ? (
                <button
                  type="button"
                  onClick={() => setProfilePictureUrl("")}
                  className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Remove avatar
                </button>
              ) : null}
              {bannerUrl ? (
                <button
                  type="button"
                  onClick={() => setBannerUrl("")}
                  className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Remove banner
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <Section title="Account">
        <Field label="Name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            className="h-12 w-full rounded-2xl bg-neutral-100 px-4 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-vibo-primary/40 dark:bg-neutral-900 dark:text-white"
          />
        </Field>
        <Field
          label="Username"
          right={
            usernameValid && username.length > 0 ? (
              <Check className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
            ) : null
          }
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="h-12 w-full rounded-2xl bg-neutral-100 px-4 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-vibo-primary/40 dark:bg-neutral-900 dark:text-white"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
      </Section>

      <Section title="About you">
        <div className="rounded-2xl bg-neutral-100 p-3 dark:bg-neutral-900">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_LIMIT))}
            placeholder="Bio"
            rows={4}
            className="w-full resize-none bg-transparent px-1 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none dark:text-white"
          />
          <div className="text-end text-[12px] text-neutral-500">
            {bio.length}/{BIO_LIMIT}
          </div>
        </div>
      </Section>

      <Section title="Links on your profile">
        <Field label="Link" icon={LinkIcon}>
          <input
            value={bioLink}
            onChange={(e) => setBioLink(e.target.value)}
            placeholder="example.com"
            className="h-12 w-full rounded-2xl bg-neutral-100 px-4 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-vibo-primary/40 dark:bg-neutral-900 dark:text-white"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Field>
      </Section>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <ImageCropper
        open={!!crop}
        src={crop?.src ?? null}
        shape={cropShape}
        title={crop?.kind === "banner" ? "Crop banner" : "Crop profile photo"}
        onCancel={() => setCrop(null)}
        onSave={(dataUrl) => {
          if (crop?.kind === "banner") setBannerUrl(dataUrl);
          else setProfilePictureUrl(dataUrl);
          setCrop(null);
        }}
      />
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <p className="px-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {title}
      </p>
      <div className="mt-2 space-y-3 rounded-2xl bg-white p-3 ring-1 ring-neutral-200 dark:bg-neutral-950 dark:ring-neutral-900">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  right,
  icon: Icon,
}: {
  label: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 inline-flex items-center gap-2 text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </span>
      <span className="relative block">
        {children}
        {right ? (
          <span className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center">
            {right}
          </span>
        ) : null}
      </span>
    </label>
  );
}

