"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";

import type { Lang, Translations } from "@/i18n";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export interface SignUpFormProps {
  t: Translations;
  lang?: Lang;
  signInHref: string;
}

const COUNTRY_PHONE_CODES = [
  { code: "BH", dial: "+973", name: "Bahrain" },
  { code: "SA", dial: "+966", name: "Saudi Arabia" },
  { code: "AE", dial: "+971", name: "UAE" },
  { code: "KW", dial: "+965", name: "Kuwait" },
  { code: "QA", dial: "+974", name: "Qatar" },
  { code: "OM", dial: "+968", name: "Oman" },
  { code: "EG", dial: "+20", name: "Egypt" },
  { code: "JO", dial: "+962", name: "Jordan" },
  { code: "LB", dial: "+961", name: "Lebanon" },
  { code: "IQ", dial: "+964", name: "Iraq" },
  { code: "US", dial: "+1", name: "United States" },
  { code: "GB", dial: "+44", name: "United Kingdom" },
  { code: "CA", dial: "+1", name: "Canada" },
  { code: "DE", dial: "+49", name: "Germany" },
  { code: "FR", dial: "+33", name: "France" },
  { code: "IN", dial: "+91", name: "India" },
  { code: "PK", dial: "+92", name: "Pakistan" },
  { code: "TR", dial: "+90", name: "Turkey" },
  { code: "MY", dial: "+60", name: "Malaysia" },
  { code: "ID", dial: "+62", name: "Indonesia" },
] as const;

const COUNTRIES = [
  "Bahrain",
  "Saudi Arabia",
  "UAE",
  "Kuwait",
  "Qatar",
  "Oman",
  "Egypt",
  "Jordan",
  "Lebanon",
  "Iraq",
  "United States",
  "United Kingdom",
  "Canada",
  "Germany",
  "France",
  "India",
  "Pakistan",
  "Turkey",
  "Malaysia",
  "Indonesia",
  "Other",
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function maxDayForDobPart(
  yearStr: string,
  monthStr: string,
  boundaryISO: string,
): number {
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

function getMinAgeDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 13);
  return d.toISOString().split("T")[0];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SignUpForm({ t, lang, signInHref }: SignUpFormProps) {
  const L = t.login;
  const router = useRouter();
  const { setSession } = useViboAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Schema ── */

  const signUpSchema = useMemo(() => {
    const minAge = getMinAgeDate();
    return z
      .object({
        fullName: z.string().min(1, { message: L.errors.fullNameRequired }),
        username: z.string().min(3, { message: L.errors.usernameMin }),
        email: z.string().email({ message: L.errors.email }),
        password: z.string().min(8, { message: L.errors.passwordMin }),
        confirmPassword: z.string().min(8, { message: L.errors.passwordMin }),
        phone: z
          .string()
          .min(1, { message: L.errors.phoneRequired })
          .refine((val) => val.replace(/\D/g, "").length >= 6, {
            message: L.errors.phoneInvalid,
          }),
        countryCode: z.string().min(1, { message: L.errors.phoneRequired }),
        dob: z
          .string()
          .min(1, { message: L.errors.dobRequired })
          .refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
            message: L.errors.dobInvalid,
          })
          .refine(
            (val) => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return true;
              const [y, m, d] = val.split("-").map(Number);
              const dt = new Date(y, m - 1, d);
              return (
                dt.getFullYear() === y &&
                dt.getMonth() === m - 1 &&
                dt.getDate() === d
              );
            },
            { message: L.errors.dobInvalid },
          )
          .refine(
            (val) => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return true;
              return val <= minAge;
            },
            { message: L.errors.dobTooYoung },
          ),
        gender: z.string().min(1, { message: L.errors.genderRequired }),
        country: z.string().min(1, { message: L.errors.countryRequired }),
        terms: z
          .boolean()
          .refine((val) => val === true, { message: L.errors.terms }),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: L.errors.passwordMismatch,
        path: ["confirmPassword"],
      });
  }, [L.errors]);

  type SignUpFormValues = z.infer<typeof signUpSchema>;

  /* ── Form ── */

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
    setValue,
    watch,
    getValues,
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      countryCode: "BH",
      dob: "",
      gender: "",
      country: "",
      terms: false,
    },
  });

  const termsValue = watch("terms");
  const genderValue = watch("gender");
  const countryValue = watch("country");
  const phoneCountryCodeValue = watch("countryCode");

  /* ── DOB logic ── */

  const minAgeBoundary = getMinAgeDate();
  const maxBirthYear = parseInt(minAgeBoundary.slice(0, 4), 10);
  const maxBirthMonth = parseInt(minAgeBoundary.slice(5, 7), 10);

  const [dobY, setDobY] = useState("");
  const [dobM, setDobM] = useState("");
  const [dobD, setDobD] = useState("");

  const monthOptions = useMemo(() => {
    const locale = lang === "ar" ? "ar" : "en-US";
    return Array.from({ length: 12 }, (_, i) => {
      const value = String(i + 1).padStart(2, "0");
      const label = new Intl.DateTimeFormat(locale, { month: "long" }).format(
        new Date(2024, i, 1),
      );
      return { value, label };
    });
  }, [lang]);

  const visibleMonths = useMemo(() => {
    if (!dobY || parseInt(dobY, 10) < maxBirthYear) return monthOptions;
    return monthOptions.filter(
      (item) => parseInt(item.value, 10) <= maxBirthMonth,
    );
  }, [dobY, maxBirthYear, maxBirthMonth, monthOptions]);

  const birthYears = useMemo(() => {
    const years: number[] = [];
    for (let y = maxBirthYear; y >= maxBirthYear - 100; y--) years.push(y);
    return years;
  }, [maxBirthYear]);

  const maxDayInMonth = dobM
    ? maxDayForDobPart(dobY, dobM, minAgeBoundary)
    : 31;
  const dayOptions = useMemo(
    () =>
      Array.from({ length: maxDayInMonth }, (_, i) =>
        String(i + 1).padStart(2, "0"),
      ),
    [maxDayInMonth],
  );

  useLayoutEffect(() => {
    if (step !== 2) return;
    const v = getValues("dob");
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split("-");
      setDobY(y);
      setDobM(m);
      setDobD(d);
    } else {
      setDobY("");
      setDobM("");
      setDobD("");
    }
  }, [step, getValues]);

  const commitDob = (y: string, m: string, d: string) => {
    if (!y || !m || !d) {
      setDobY(y);
      setDobM(m);
      setDobD(d);
      setValue("dob", "", { shouldValidate: true });
      return;
    }
    const yi = parseInt(y, 10);
    let mi = parseInt(m, 10);
    if (yi === maxBirthYear && mi > maxBirthMonth) mi = maxBirthMonth;
    const ms = String(mi).padStart(2, "0");
    const cap = maxDayForDobPart(String(yi), ms, minAgeBoundary);
    let di = parseInt(d, 10);
    if (di > cap) di = cap;
    const ds = String(di).padStart(2, "0");
    setDobY(String(yi));
    setDobM(ms);
    setDobD(ds);
    setValue("dob", `${yi}-${ms}-${ds}`, { shouldValidate: true });
  };

  const setDobPart = (part: "y" | "m" | "d", value: string) => {
    const y = part === "y" ? value : dobY;
    const m = part === "m" ? value : dobM;
    const d = part === "d" ? value : dobD;
    commitDob(y, m, d);
  };

  const goToStep2 = async () => {
    const ok = await trigger([
      "fullName",
      "username",
      "email",
      "password",
      "confirmPassword",
    ]);
    if (ok) {
      setError(null);
      setStep(2);
    }
  };

  /* ── Submit ── */

  const onSubmit = async (data: SignUpFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const phoneEntry = COUNTRY_PHONE_CODES.find(
        (c) => c.code === data.countryCode,
      );
      const fullPhone = `${phoneEntry?.dial ?? ""}${data.phone.replace(/\D/g, "")}`;

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          username: data.username,
          password: data.password,
          fullName: data.fullName,
          phone: fullPhone,
          countryCode: data.countryCode,
          dob: data.dob,
          gender: data.gender,
          country: data.country,
          preferredLang: lang ?? "en",
        }),
      });
      const text = await res.text();
      type SignupJson = {
        error?: string;
        token?: string;
        user?: { id: string; email: string; username: string };
      };
      let json: SignupJson = {};
      try {
        json = text ? (JSON.parse(text) as SignupJson) : {};
      } catch {
        setError(`${L.genericError} (HTTP ${res.status})`);
        return;
      }
      if (!res.ok) {
        setError(json.error ?? L.genericError);
        return;
      }
      if (!json.token || !json.user) {
        setError(L.genericError);
        return;
      }
      setSession(json.token, json.user);
      router.push(`/login/onboarding?lang=${lang ?? "en"}`);
    } catch {
      setError(L.genericError);
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Styles ── */

  const fieldCls = (hasError: boolean) =>
    `h-11 rounded-lg border-neutral-200 bg-white text-[15px] transition-colors placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-1 focus-visible:ring-neutral-300/50 ${hasError ? "border-red-400" : ""}`;

  const selectTriggerCls = (hasError: boolean) =>
    `h-11 rounded-lg border-neutral-200 bg-white text-[15px] ${hasError ? "border-red-400" : ""}`;

  /* ── Render ── */

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900 sm:text-2xl">
          {L.signUpTitle}
        </h1>
        <p className="mt-1 text-xs font-medium text-neutral-400">
          {step === 1 ? L.step1of2 : L.step2of2}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <AnimatePresence mode="wait">
          {/* ── Step 1: Account Basics ── */}
          {step === 1 && (
            <motion.div
              key="signup-step-1"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="signup-fullname"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.fullName}
                </Label>
                <Input
                  id="signup-fullname"
                  type="text"
                  autoComplete="name"
                  placeholder={L.fullNamePlaceholder}
                  className={fieldCls(!!errors.fullName)}
                  disabled={isLoading}
                  aria-invalid={!!errors.fullName}
                  {...register("fullName")}
                />
                {errors.fullName && (
                  <p className="text-xs text-red-500">
                    {errors.fullName.message}
                  </p>
                )}
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="signup-username"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.username}
                </Label>
                <Input
                  id="signup-username"
                  type="text"
                  autoComplete="username"
                  placeholder={L.placeholderUsername}
                  className={fieldCls(!!errors.username)}
                  disabled={isLoading}
                  aria-invalid={!!errors.username}
                  {...register("username")}
                />
                {errors.username && (
                  <p className="text-xs text-red-500">
                    {errors.username.message}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="signup-email"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.email}
                </Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder={L.placeholderEmail}
                  className={fieldCls(!!errors.email)}
                  disabled={isLoading}
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="signup-password"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.password}
                </Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={L.placeholderPassword}
                    className={`${fieldCls(!!errors.password)} pe-11`}
                    disabled={isLoading}
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-600"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="confirm-password"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.confirmPassword}
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={L.placeholderPassword}
                    className={`${fieldCls(!!errors.confirmPassword)} pe-11`}
                    disabled={isLoading}
                    aria-invalid={!!errors.confirmPassword}
                    {...register("confirmPassword")}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-600"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                    tabIndex={-1}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-red-500">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {/* Next */}
              <Button
                type="button"
                className="h-11 w-full rounded-lg bg-vibo-primary text-[15px] font-medium shadow-sm transition-colors hover:bg-vibo-primary/90"
                onClick={goToStep2}
              >
                {L.stepNext}
              </Button>
            </motion.div>
          )}

          {/* ── Step 2: Personal Details ── */}
          {step === 2 && (
            <motion.div
              key="signup-step-2"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Date of Birth */}
              <div className="space-y-1.5">
                <Label
                  id="signup-dob-label"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.dob}
                </Label>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="group"
                  aria-labelledby="signup-dob-label"
                >
                  <Select
                    value={dobY || undefined}
                    onValueChange={(v) => setDobPart("y", v)}
                    disabled={isLoading}
                  >
                    <SelectTrigger
                      id="signup-dob-year"
                      className={selectTriggerCls(!!errors.dob)}
                      aria-invalid={!!errors.dob}
                    >
                      <SelectValue placeholder={L.dobYear} />
                    </SelectTrigger>
                    <SelectContent>
                      {birthYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={dobM || undefined}
                    onValueChange={(v) => setDobPart("m", v)}
                    disabled={isLoading}
                  >
                    <SelectTrigger
                      id="signup-dob-month"
                      className={selectTriggerCls(!!errors.dob)}
                      aria-invalid={!!errors.dob}
                    >
                      <SelectValue placeholder={L.dobMonth} />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleMonths.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={dobD || undefined}
                    onValueChange={(v) => setDobPart("d", v)}
                    disabled={isLoading}
                  >
                    <SelectTrigger
                      id="signup-dob-day"
                      className={selectTriggerCls(!!errors.dob)}
                      aria-invalid={!!errors.dob}
                    >
                      <SelectValue placeholder={L.dobDay} />
                    </SelectTrigger>
                    <SelectContent>
                      {dayOptions.map((day) => (
                        <SelectItem key={day} value={day}>
                          {parseInt(day, 10)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {errors.dob && (
                  <p className="text-xs text-red-500">{errors.dob.message}</p>
                )}
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="signup-gender"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.gender}
                </Label>
                <Select
                  value={genderValue || undefined}
                  onValueChange={(v) =>
                    setValue("gender", v, { shouldValidate: true })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger
                    id="signup-gender"
                    className={`${selectTriggerCls(!!errors.gender)} w-full`}
                    aria-invalid={!!errors.gender}
                  >
                    <SelectValue placeholder={L.genderPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">
                      {L.genderOptions.male}
                    </SelectItem>
                    <SelectItem value="female">
                      {L.genderOptions.female}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && (
                  <p className="text-xs text-red-500">
                    {errors.gender.message}
                  </p>
                )}
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="signup-country"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.country}
                </Label>
                <Select
                  value={countryValue || undefined}
                  onValueChange={(v) =>
                    setValue("country", v, { shouldValidate: true })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger
                    id="signup-country"
                    className={`${selectTriggerCls(!!errors.country)} w-full`}
                    aria-invalid={!!errors.country}
                  >
                    <SelectValue placeholder={L.countryPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.country && (
                  <p className="text-xs text-red-500">
                    {errors.country.message}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="signup-phone"
                  className="text-[13px] font-medium text-neutral-600"
                >
                  {L.phone}
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={phoneCountryCodeValue || undefined}
                    onValueChange={(v) =>
                      setValue("countryCode", v, { shouldValidate: true })
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger
                      id="signup-phone-country"
                      className="h-11 w-[6.5rem] shrink-0 rounded-lg border-neutral-200 bg-white px-2 text-[15px]"
                      aria-label={L.countryCode}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_PHONE_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code} {c.dial}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="signup-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder={L.phonePlaceholder}
                    className={fieldCls(!!errors.phone)}
                    disabled={isLoading}
                    aria-invalid={!!errors.phone}
                    {...register("phone")}
                  />
                </div>
                {errors.phone && (
                  <p className="text-xs text-red-500">
                    {errors.phone.message}
                  </p>
                )}
              </div>

              {/* Terms */}
              <div className="flex items-start gap-2.5 pt-1">
                <Checkbox
                  id="terms"
                  checked={termsValue}
                  onCheckedChange={(checked) => {
                    setValue("terms", checked === true, {
                      shouldValidate: true,
                    });
                  }}
                  disabled={isLoading}
                  className="mt-0.5 rounded border-neutral-300 data-[state=checked]:border-vibo-primary data-[state=checked]:bg-vibo-primary"
                />
                <div className="grid gap-1 leading-none">
                  <label
                    htmlFor="terms"
                    className="text-[13px] font-medium leading-snug text-neutral-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {L.termsLabel}
                  </label>
                  <p className="text-[11px] leading-snug text-neutral-400">
                    {L.termsHint}
                  </p>
                </div>
              </div>
              {errors.terms && (
                <p className="text-xs text-red-500">{errors.terms.message}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 rounded-lg border-neutral-200 text-[15px] font-medium text-neutral-700"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                >
                  {L.stepBack}
                </Button>
                <Button
                  type="submit"
                  className="h-11 flex-1 gap-2 rounded-lg bg-vibo-primary text-[15px] font-medium shadow-sm transition-colors hover:bg-vibo-primary/90"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      {L.creatingAccount}
                    </>
                  ) : (
                    L.createAccount
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Footer link */}
      <p className="text-center text-sm text-neutral-500">
        {L.hasAccount}{" "}
        <Link
          href={signInHref}
          className="font-semibold text-neutral-900 hover:underline"
          prefetch
        >
          {L.signInLink}
        </Link>
      </p>
    </div>
  );
}
