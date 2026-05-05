"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Code2,
  Film,
  Loader2,
  Music2,
  Newspaper,
  PartyPopper,
  Pizza,
  Plane,
  Search,
  Shirt,
  UserRound,
  Video,
  Volleyball,
} from "@/components/ui/icons";
import type { LucideIcon } from "@/components/ui/icons";

import type { Lang, Translations } from "@/i18n";
import { getCountriesForOnboarding, type CountryOption } from "@/lib/onboardingCountries";
import { ONBOARDING_INTEREST_KEYS } from "@/lib/onboardingInterests";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const INTEREST_ICONS: Record<string, LucideIcon> = {
  news: Newspaper,
  food_dining: Pizza,
  events: PartyPopper,
  entertainment: Clapperboard,
  sports: Volleyball,
  lifestyle: Shirt,
  places: Plane,
  nightlife: Music2,
  videos: Video,
  trends: Code2,
};

export interface OnboardingFormProps {
  t: Translations;
  lang: Lang;
  previewMode?: boolean;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getMinAgeDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 13);
  return d.toISOString().split("T")[0];
}

function maxDayForDobPart(yearStr: string, monthStr: string, boundaryISO: string): number {
  if (!yearStr || !monthStr) return 31;
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const [by, bm, bd] = boundaryISO.split("-").map(Number);
  const dim = daysInMonth(y, m);
  if (y < by) return dim;
  if (y > by) return dim;
  if (m < bm) return dim;
  if (m > bm) return dim;
  return Math.min(dim, bd);
}

function flagEmojiFromIso2(iso: string): string {
  const c = iso.toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(base + c.charCodeAt(0) - 65, base + c.charCodeAt(1) - 65);
}

function appleFlagEmojiUrl(iso: string): string {
  const emoji = flagEmojiFromIso2(iso) || "🏳️";
  return `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=apple`;
}

export function OnboardingForm({ t, lang, previewMode = false }: OnboardingFormProps) {
  const O = t.onboarding;
  const router = useRouter();
  const { user, setSession, token } = useViboAuth();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [dobDate, setDobDate] = useState<Date | undefined>(undefined);
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [dobPickerView, setDobPickerView] = useState<"days" | "years">("days");
  const [dobMonthView, setDobMonthView] = useState<Date>(new Date());
  const [yearPageStart, setYearPageStart] = useState<number>(1990);
  const YEARS_PAGE_SIZE = 24;
  const [countryCode, setCountryCode] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);

  const countries = useMemo(() => getCountriesForOnboarding(lang === "ar" ? "ar" : "en"), [lang]);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.flag.includes(q),
    );
  }, [countries, countryQuery]);

  const minAgeBoundary = getMinAgeDate();
  const maxDate = useMemo(() => {
    const d = new Date(minAgeBoundary);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [minAgeBoundary]);
  const minYear = 1920;
  const maxYear = maxDate.getFullYear();
  const monthLabels = useMemo(() => {
    const locale = lang === "ar" ? "ar" : "en-US";
    return Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2024, i, 1)),
    );
  }, [lang]);
  const visibleYears = useMemo(
    () =>
      Array.from({ length: YEARS_PAGE_SIZE }, (_, i) => yearPageStart + i).filter(
        (year) => year >= minYear && year <= maxYear,
      ),
    [yearPageStart, minYear, maxYear, YEARS_PAGE_SIZE],
  );

  const dobIso = useMemo(() => {
    if (!dobDate) return "";
    const y = dobDate.getFullYear();
    const m = dobDate.getMonth() + 1;
    const d = dobDate.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }, [dobDate]);

  const dobValid = dobIso !== "" && dobIso <= minAgeBoundary;

  const interestLabels = O.interestOptions as unknown as string[];

  const canNext = () => {
    if (step === 1) return gender === "male" || gender === "female";
    if (step === 2) return dobValid;
    if (step === 3) return countryCode.length === 2;
    if (step === 4) return interests.length >= 3 && interests.length <= 5;
    return false;
  };

  const selectedCountry = countries.find((c) => c.code === countryCode);

  const toggleInterest = (key: string) => {
    setError(null);
    setInterests((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 5) {
        setError(O.interestsMaxHint);
        return prev;
      }
      return [...prev, key];
    });
  };

  const goNext = () => {
    setError(null);
    if (!canNext()) {
      if (step === 1) setError(O.genderStepHint);
      else if (step === 2) setError(O.dobStepHint);
      else if (step === 3) setError(O.countryStepHint);
      else if (step === 4) setError(O.interestsRangeHint);
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleFinish = async () => {
    if (!canNext()) {
      setError(O.interestsRangeHint);
      return;
    }
    if (previewMode) {
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const countryName = selectedCountry?.name ?? countryCode;
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender,
          dob: dobIso,
          country: countryName,
          interests,
          isPrivate: false,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        return;
      }
      if (json.token && user) {
        setSession(json.token, {
          ...user,
          onboardingCompleted: true,
        });
      } else if (json.token && token) {
        setSession(json.token, {
          id: user?.id ?? "",
          email: user?.email ?? "",
          username: user?.username,
          onboardingCompleted: true,
        });
      }
      router.push("/");
    } catch {
      setError("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const ease = [0.22, 1, 0.36, 1] as const;
  const fieldBoxCls =
    "h-16 rounded-2xl border border-neutral-300 px-4 text-[17px] text-neutral-800 transition-colors focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-vibo-primary/20";
  const stepTitleCls = "text-[22px] font-semibold tracking-tight text-neutral-900 sm:text-2xl";
  const stepHintCls = "text-[16px] text-neutral-500";

  const renderCountryRow = (c: CountryOption) => (
    <button
      key={c.code}
      type="button"
      onClick={() => {
        setCountryCode(c.code);
        setCountryQuery(c.name);
        setCountryPickerOpen(false);
      }}
      className={`flex h-12 w-full items-center gap-3 rounded-xl border px-3 text-start text-[14px] transition-colors ${
        countryCode === c.code
          ? "border-vibo-primary bg-vibo-primary text-white"
          : "border-neutral-200 bg-white hover:border-neutral-300"
      }`}
    >
      <img
        src={appleFlagEmojiUrl(c.code)}
        alt={c.name}
        className="h-4 w-5 rounded-[2px] object-cover"
        loading="lazy"
        decoding="async"
      />
      <span className={`font-medium ${countryCode === c.code ? "text-white" : "text-neutral-900"}`}>{c.name}</span>
      {countryCode === c.code ? (
        <span className="ms-auto flex h-7 w-7 items-center justify-center rounded-full bg-white text-vibo-primary">
          <Check className="h-4 w-4" />
        </span>
      ) : null}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease }}
      className={`mx-auto w-full max-w-[380px] space-y-8 ${lang === "ar" ? "font-ar" : "font-en"}`}
      style={{
        fontFamily:
          lang === "ar"
            ? "var(--font-arabic), Tahoma, sans-serif"
            : "var(--font-en), system-ui, -apple-system, sans-serif",
      }}
    >
      <div className="mx-auto flex w-full items-center justify-center">
        <p className="text-xs font-medium text-neutral-400">
          {O.stepOf.replace("{n}", String(step))}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="ob-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease }}
            className="space-y-5"
          >
            <div className="space-y-2 text-center">
              <h2 className={stepTitleCls}>{O.genderStepTitle}</h2>
              <p className={stepHintCls}>{O.genderStepHint}</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`flex ${fieldBoxCls} items-center gap-3 bg-white text-start text-[17px] font-medium ${
                    gender === g
                      ? "!border-vibo-primary !bg-vibo-primary !text-white"
                      : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300"
                  }`}
                >
                  <UserRound className="h-5 w-5 shrink-0" />
                  {O.genderOptions[g]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="ob-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease }}
            className="space-y-5"
          >
            <div className="space-y-2 text-center">
              <h2 className={stepTitleCls}>{O.dobStepTitle}</h2>
              <p className={stepHintCls}>{O.dobStepHint}</p>
            </div>
            <Popover open={dobPickerOpen} onOpenChange={(open) => {
                setDobPickerOpen(open);
                if (open) {
                  setDobPickerView("days");
                  const base = dobDate ?? maxDate;
                  setDobMonthView(base);
                  const start = Math.max(
                    minYear,
                    Math.min(maxYear - (YEARS_PAGE_SIZE - 1), base.getFullYear() - Math.floor(YEARS_PAGE_SIZE / 2)),
                  );
                  setYearPageStart(start);
                }
              }}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-16 w-full items-center justify-between rounded-2xl border border-neutral-300 bg-white px-4 text-[15px] text-neutral-800 transition-colors hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vibo-primary/20"
                >
                  <span className={dobDate ? "text-neutral-900" : "text-neutral-400"}>
                    {dobDate
                      ? dobDate.toLocaleDateString(lang === "ar" ? "ar" : "en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : O.dobPlaceholder}
                  </span>
                  <CalendarDays className="h-4 w-4 text-neutral-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0">
                <div className="h-[360px] rounded-2xl border border-neutral-200 bg-white p-2.5">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-neutral-100"
                      onClick={() => {
                        if (dobPickerView === "years") {
                          setYearPageStart((prev) => Math.max(minYear, prev - YEARS_PAGE_SIZE));
                          return;
                        }
                        setDobMonthView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-1">
                      <div className="inline-flex h-8 items-center justify-center px-1.5 py-1 text-sm font-medium text-neutral-900">
                        <span>{monthLabels[dobMonthView.getMonth()]}</span>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 min-w-[4.8rem] items-center justify-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium hover:bg-neutral-100"
                        onClick={() => setDobPickerView("years")}
                      >
                        <span className="tabular-nums">{dobMonthView.getFullYear()}</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-neutral-100"
                      onClick={() => {
                        if (dobPickerView === "years") {
                          setYearPageStart((prev) =>
                            Math.min(maxYear - (YEARS_PAGE_SIZE - 1), prev + YEARS_PAGE_SIZE),
                          );
                          return;
                        }
                        setDobMonthView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {dobPickerView === "years" ? (
                    <div className="grid h-[300px] w-full grid-cols-4 content-start gap-2 p-2">
                      {visibleYears.map((year) => (
                        <button
                          key={year}
                          type="button"
                          className={`h-9 rounded-md px-2 py-2 text-sm ${
                            year === dobMonthView.getFullYear()
                              ? "bg-vibo-primary text-white"
                              : "hover:bg-neutral-100"
                          }`}
                          onClick={() => {
                            setDobMonthView((prev) => new Date(year, prev.getMonth(), 1));
                            setDobPickerView("days");
                          }}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Calendar
                      mode="single"
                      selected={dobDate}
                      onSelect={(date) => {
                        setDobDate(date);
                        if (date) setDobMonthView(new Date(date.getFullYear(), date.getMonth(), 1));
                      }}
                      month={dobMonthView}
                      onMonthChange={setDobMonthView}
                      disabled={(date) => date > maxDate || date < new Date("1920-01-01")}
                      className="p-0"
                      classNames={{
                        month_caption: "hidden",
                        nav: "hidden",
                        month: "space-y-3",
                      }}
                      initialFocus
                    />
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="ob-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease }}
            className="space-y-5"
          >
            <div className="space-y-2 text-center">
              <h2 className={stepTitleCls}>{O.countryStepTitle}</h2>
              <p className={stepHintCls}>{O.countryStepHint}</p>
            </div>
            <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-16 w-full items-center justify-between rounded-2xl border border-neutral-300 bg-white px-4 text-[15px] text-neutral-900 transition-colors hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vibo-primary/20"
                >
                  <span className={`inline-flex min-w-0 items-center gap-2 truncate ${selectedCountry ? "text-neutral-900" : "text-neutral-400"}`}>
                    {selectedCountry ? (
                      <img
                        src={appleFlagEmojiUrl(selectedCountry.code)}
                        alt={selectedCountry.name}
                        className="h-4 w-5 rounded-[2px] object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                    <span className="truncate">{selectedCountry ? selectedCountry.name : O.searchCountry}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-neutral-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2">
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="search"
                    value={countryQuery}
                    onChange={(e) => setCountryQuery(e.target.value)}
                    placeholder={O.searchCountry}
                    className="h-10 w-full rounded-xl border border-neutral-200 bg-white ps-8 pe-3 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vibo-primary/20"
                    aria-label={O.searchCountry}
                  />
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {filteredCountries.length === 0 ? (
                    <p className="py-4 text-center text-sm text-neutral-500">{O.noCountries}</p>
                  ) : (
                    filteredCountries.slice(0, 120).map(renderCountryRow)
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="ob-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease }}
            className="space-y-5"
          >
            <div className="space-y-2 text-center">
              <h2 className={stepTitleCls}>{O.interestsStepTitle}</h2>
              <p className={stepHintCls}>{O.interestsStepHint}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ONBOARDING_INTEREST_KEYS.map((key, idx) => {
                const label = interestLabels[idx] ?? key;
                const active = interests.includes(key);
                const Icon = INTEREST_ICONS[key] ?? Film;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isLoading}
                    onClick={() => toggleInterest(key)}
                    className={`flex h-14 items-center gap-2 rounded-2xl border px-3.5 text-left text-[15px] font-medium transition-colors ${
                      active
                        ? "border-vibo-primary bg-vibo-primary/5 text-neutral-900"
                        : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50"
                    } disabled:opacity-50`}
                  >
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 stroke-[1.75] ${
                        active ? "text-vibo-primary" : "text-neutral-900"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">{label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-sm text-neutral-400">
              {O.interestsPickFooter.replace("{count}", String(interests.length))}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3 pt-2">
        {step < 4 ? (
          <Button
            type="button"
            className={`h-16 w-full gap-2 rounded-full text-[17px] font-medium text-white transition-colors ${
              canNext() ? "bg-vibo-primary hover:bg-vibo-primary/90" : "bg-vibo-primary/45"
            } disabled:bg-vibo-primary/35`}
            disabled={!canNext() || isLoading}
            onClick={goNext}
          >
            {O.continue}
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            className={`h-16 w-full gap-2 rounded-full text-[17px] font-medium text-white transition-colors ${
              canNext() ? "bg-vibo-primary hover:bg-vibo-primary/90" : "bg-vibo-primary/45"
            } disabled:bg-vibo-primary/35`}
            disabled={!canNext() || isLoading}
            onClick={() => void handleFinish()}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {O.saving}
              </>
            ) : (
              <>
                {O.finish}
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
        {step > 1 && (
          <button
            type="button"
            onClick={goBack}
            disabled={isLoading}
            className="mx-auto flex items-center gap-1.5 text-[15px] text-neutral-500 transition-colors hover:text-neutral-800 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            {O.back}
          </button>
        )}
      </div>
    </motion.div>
  );
}

