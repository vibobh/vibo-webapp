"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import type { Translations } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface OnboardingFormProps {
  t: Translations;
}

export function OnboardingForm({ t }: OnboardingFormProps) {
  const O = t.onboarding;
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);

  const interestLabels: string[] = O.interestOptions as unknown as string[];
  const EN_INTERESTS = [
    "Art", "Music", "Sports", "Technology", "Travel", "Food", "Fashion",
    "Gaming", "Photography", "Fitness", "Comedy", "Education", "Business",
    "Nature", "Science",
  ];

  function toggleInterest(idx: number) {
    const key = EN_INTERESTS[idx];
    setInterests((prev) =>
      prev.includes(key) ? prev.filter((i) => i !== key) : [...prev, key],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: bio || undefined,
          interests: interests.length > 0 ? interests : undefined,
          isPrivate,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        return;
      }
      router.push("/");
    } catch {
      setError("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSkip() {
    router.push("/");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          {O.title}
        </h1>
        <p className="text-neutral-500">{O.subtitle}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-3">
          <Label>{O.interests}</Label>
          <p className="text-xs text-neutral-500">{O.interestsHint}</p>
          <div className="flex flex-wrap gap-2">
            {interestLabels.map((label, idx) => {
              const active = interests.includes(EN_INTERESTS[idx]);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isLoading}
                  onClick={() => toggleInterest(idx)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-vibo-primary bg-vibo-primary text-white"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
                  } disabled:opacity-50`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ob-bio">{O.bio}</Label>
          <textarea
            id="ob-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={O.bioPlaceholder}
            disabled={isLoading}
            rows={3}
            maxLength={300}
            className="flex w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vibo-primary focus-visible:ring-offset-2 disabled:opacity-50"
          />
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="ob-private"
            checked={isPrivate}
            onCheckedChange={(v) => setIsPrivate(v === true)}
            disabled={isLoading}
            className="mt-0.5"
          />
          <div className="grid gap-1 leading-none">
            <label htmlFor="ob-private" className="text-sm font-medium text-neutral-800">
              {O.privateAccount}
            </label>
            <p className="text-xs text-neutral-500">{O.privateAccountHint}</p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" className="h-12 flex-1 gap-2" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                {O.saving}
              </>
            ) : (
              O.continue
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-12 text-neutral-500"
            onClick={handleSkip}
            disabled={isLoading}
          >
            {O.skip}
          </Button>
        </div>
      </form>
    </div>
  );
}
