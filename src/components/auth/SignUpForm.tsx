"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Eye, EyeOff, Loader2, X } from "@/components/ui/icons";
import Link from "next/link";
import { getCountries, getCountryCallingCode } from "libphonenumber-js/min";

import type { Lang, Translations } from "@/i18n";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OnboardingForm } from "@/components/auth/OnboardingForm";

export interface SignUpFormProps {
  t: Translations;
  lang?: Lang;
  signInHref: string;
}

type CountryPhoneEntry = { code: string; dial: string; name: string };

/** ISO 3166-1 alpha-2 → regional indicator pair (flag emoji). */
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

function passwordStrengthRefine(password: string) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

function passwordChecks(password: string) {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
}

export function SignUpForm({ t, lang, signInHref }: SignUpFormProps) {
  const L = t.login;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession, user } = useViboAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const onboardingOnly =
    searchParams.get("onboarding") === "1" || searchParams.get("onboarding") === "true";

  const countryPhoneCodes = useMemo<CountryPhoneEntry[]>(() => {
    const locale = lang === "ar" ? "ar" : "en";
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    const codes = getCountries().filter((code) => code !== "IL");
    if (!codes.includes("PS")) {
      codes.push("PS");
    }
    const entries = codes.map((code) => ({
        code,
        dial: `+${getCountryCallingCode(code)}`,
        name: code === "PS" ? (locale === "ar" ? "فلسطين" : "Palestine") : (dn.of(code) ?? code),
      }));
    entries.sort((a, b) => a.name.localeCompare(b.name, locale));
    return entries;
  }, [lang]);

  const signUpSchema = useMemo(
    () =>
      z.object({
        fullName: z.string().min(1, { message: L.errors.fullNameRequired }),
        username: z.string().min(3, { message: L.errors.usernameMin }),
        email: z.string().email({ message: L.errors.email }),
        password: z
          .string()
          .min(8, { message: L.errors.passwordMin })
          .refine(passwordStrengthRefine, { message: L.errors.passwordStrength }),
        phone: z
          .string()
          .min(1, { message: L.errors.phoneRequired })
          .refine((val) => val.replace(/\D/g, "").length >= 6, {
            message: L.errors.phoneInvalid,
          }),
        countryCode: z.string().min(1, { message: L.errors.phoneRequired }),
        terms: z.boolean().refine((val) => val === true, { message: L.errors.terms }),
      }),
    [L.errors],
  );

  type SignUpFormValues = z.infer<typeof signUpSchema>;

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
      phone: "",
      countryCode: "BH",
      terms: false,
    },
  });

  const termsValue = watch("terms");
  const phoneCountryCodeValue = watch("countryCode");
  const usernameValue = watch("username");
  const fullNameValue = watch("fullName");
  const emailValue = watch("email");
  const passwordValue = watch("password");
  const phoneValue = watch("phone");
  const selectedPhoneEntry =
    countryPhoneCodes.find((c) => c.code === phoneCountryCodeValue) ??
    countryPhoneCodes[0] ??
    ({ code: "BH", dial: "+973", name: "Bahrain" } satisfies CountryPhoneEntry);
  const selectedFlagEmoji = flagEmojiFromIso2(selectedPhoneEntry.code) || "🏳️";

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const tmr = window.setInterval(() => {
      setResendSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(tmr);
  }, [resendSeconds]);

  useEffect(() => {
    if (onboardingOnly && user && !user.onboardingCompleted) {
      setStep(3);
      setError(null);
    }
  }, [onboardingOnly, user]);

  const fieldCls = (hasError: boolean) =>
    `auth-form-input-autofill h-16 rounded-2xl border bg-white px-5 text-[17px] text-neutral-700 transition-colors placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-vibo-primary/20 ${hasError ? "border-red-400" : "border-neutral-300"}`;

  const canContinueStep1 =
    fullNameValue.trim().length > 0 &&
    usernameValue.trim().length >= 3 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue.trim()) &&
    passwordStrengthRefine(passwordValue) &&
    phoneValue.replace(/\D/g, "").length >= 6 &&
    Boolean(phoneCountryCodeValue) &&
    termsValue === true;
  const pwd = passwordChecks(passwordValue);

  const sendVerificationEmail = async () => {
    const ok = await trigger([
      "fullName",
      "username",
      "email",
      "password",
      "phone",
      "countryCode",
      "terms",
    ]);
    if (!ok) return;

    setIsLoading(true);
    setError(null);
    try {
      const v = getValues();
      const phoneEntry = countryPhoneCodes.find((c) => c.code === v.countryCode);
      const fullPhone = `${phoneEntry?.dial ?? ""}${v.phone.replace(/\D/g, "")}`;

      const res = await fetch("/api/auth/signup/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: v.email.trim().toLowerCase(),
          username: v.username,
          fullName: v.fullName,
          phone: fullPhone,
          countryCode: v.countryCode,
          preferredLang: lang ?? "en",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        details?: Record<string, unknown>;
        cooldownSeconds?: number;
        resendInSeconds?: number;
        emailSent?: boolean;
      };

      const failed = !res.ok || json.success === false;
      if (failed) {
        let msg =
          typeof json.error === "string" && json.error.length > 0
            ? json.error
            : L.genericError;
        if (process.env.NODE_ENV === "development" && json.details) {
          try {
            msg += ` — ${JSON.stringify(json.details).slice(0, 800)}`;
          } catch {
            /* ignore */
          }
        }
        setError(msg);
        return;
      }

      const waitSeconds =
        typeof json.cooldownSeconds === "number"
          ? json.cooldownSeconds
          : typeof json.resendInSeconds === "number"
            ? json.resendInSeconds
            : 0;
      if (json.emailSent === false && waitSeconds > 0) {
        setResendSeconds(waitSeconds);
        setError(L.resendWait.replace("{s}", String(waitSeconds)));
        return;
      }
      setStep(2);
      setVerificationCode("");
      if (typeof json.resendInSeconds === "number" && json.resendInSeconds > 0) {
        setResendSeconds(json.resendInSeconds);
      } else {
        setResendSeconds(60);
      }
    } catch {
      setError(L.genericError);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitVerify = async () => {
    const code = verificationCode.trim().replace(/\s/g, "");
    if (!/^\d{4}$/.test(code)) {
      setError(L.errors.codeInvalid);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const v = getValues();
      const phoneEntry = countryPhoneCodes.find((c) => c.code === v.countryCode);
      const fullPhone = `${phoneEntry?.dial ?? ""}${v.phone.replace(/\D/g, "")}`;

      const res = await fetch("/api/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: v.email.trim().toLowerCase(),
          code,
          username: v.username,
          password: v.password,
          fullName: v.fullName,
          phone: fullPhone,
          countryCode: v.countryCode,
          preferredLang: lang ?? "en",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        user?: { id: string; email: string; username: string; onboardingCompleted?: boolean };
      };
      if (!res.ok) {
        setError(json.error ?? L.genericError);
        return;
      }
      if (!json.token || !json.user) {
        setError(L.genericError);
        return;
      }
      setSession(json.token, json.user);
      setStep(3);
      setError(null);
    } catch {
      setError(L.genericError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {step < 3 && (
        <div className="text-center">
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900 sm:text-2xl">{L.signUpTitle}</h1>
          <p className="mt-2 text-[16px] text-neutral-400">{L.signUpSubtitle}</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {step < 3 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) void sendVerificationEmail();
            else void onSubmitVerify();
          }}
          className="space-y-5"
        >
          <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="signup-step-1"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="signup-username" className="sr-only">
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
                  <p className="text-xs text-red-500">{errors.username.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-fullname" className="sr-only">
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
                  <p className="text-xs text-red-500">{errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-email" className="sr-only">
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
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-phone" className="sr-only">
                  {L.mobileNumber}
                </Label>
                <div
                  className={`flex h-16 items-center overflow-hidden rounded-2xl border bg-white ${
                    errors.phone ? "border-red-400" : "border-neutral-300"
                  }`}
                >
                  <Select
                    value={phoneCountryCodeValue || undefined}
                    onValueChange={(v) => {
                      setValue("countryCode", v, { shouldValidate: true });
                    }}
                    disabled={isLoading}
                  >
                    <SelectTrigger
                      id="signup-phone-country"
                      className="h-16 min-w-[6.2rem] w-[6.5rem] shrink-0 justify-center rounded-none border-0 border-e border-neutral-300 bg-transparent px-2 text-[14px] shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:hidden"
                      aria-label={L.phonePrefixAria}
                    >
                      <SelectValue>
                        <span className="inline-flex w-full items-center justify-center gap-1.5">
                          <img
                            src={appleFlagEmojiUrl(selectedPhoneEntry.code)}
                            alt={selectedFlagEmoji}
                            className="h-4 w-5 rounded-[2px] object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                          <span className="tabular-nums text-[13px] font-normal text-neutral-700">
                            {selectedPhoneEntry.dial}
                          </span>
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-[17rem] rounded-2xl">
                      {countryPhoneCodes.map((c) => (
                        <SelectItem
                          key={c.code}
                          value={c.code}
                          textValue={`${c.name} ${c.dial}`}
                          className="my-0.5 rounded-xl"
                        >
                          <span className="inline-flex w-full items-center gap-2.5">
                            <img
                              src={appleFlagEmojiUrl(c.code)}
                              alt={flagEmojiFromIso2(c.code) || c.code}
                              className="h-4 w-5 rounded-[2px] object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            <span className="text-[13px] font-medium text-neutral-800">{c.name}</span>
                            <span className="ms-auto tabular-nums text-[13px] font-normal text-neutral-600">
                              {c.dial}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="signup-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder={L.phonePlaceholder}
                    className="auth-form-input-autofill h-16 border-0 bg-transparent px-4 text-[17px] text-neutral-700 placeholder:text-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isLoading}
                    aria-invalid={!!errors.phone}
                    {...register("phone", {
                      setValueAs: (v) => String(v ?? "").replace(/\D/g, ""),
                    })}
                  />
                </div>
                {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-password" className="sr-only">
                  {L.password}
                </Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={L.placeholderPassword}
                    className={`${fieldCls(!!errors.password)} pe-12`}
                    disabled={isLoading}
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-600"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
                <div className="space-y-1.5">
                  <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-[12px]">
                    <li className={`inline-flex items-center gap-1 ${pwd.minLength ? "text-green-600" : "text-neutral-500"}`}>
                      {pwd.minLength ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}
                      8+ characters
                    </li>
                    <li className={`inline-flex items-center gap-1 ${pwd.hasUpper ? "text-green-600" : "text-neutral-500"}`}>
                      {pwd.hasUpper ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}
                      Uppercase
                    </li>
                    <li className={`inline-flex items-center gap-1 ${pwd.hasLower ? "text-green-600" : "text-neutral-500"}`}>
                      {pwd.hasLower ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}
                      Lowercase
                    </li>
                    <li className={`inline-flex items-center gap-1 ${pwd.hasNumber ? "text-green-600" : "text-neutral-500"}`}>
                      {pwd.hasNumber ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}
                      Number
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <Checkbox
                  id="terms"
                  checked={termsValue}
                  onCheckedChange={(checked) => {
                    setValue("terms", checked === true, { shouldValidate: true });
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
                  <p className="text-[11px] leading-snug text-neutral-400">{L.termsHint}</p>
                </div>
              </div>
              {errors.terms && <p className="text-xs text-red-500">{errors.terms.message}</p>}

              <Button
                type="submit"
                className={`h-16 w-full rounded-full text-[17px] font-medium text-white transition-colors ${
                  canContinueStep1
                    ? "bg-vibo-primary hover:bg-vibo-primary/90"
                    : "bg-vibo-primary/45"
                } disabled:cursor-not-allowed disabled:bg-vibo-primary/35`}
                disabled={isLoading || !canContinueStep1}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="me-2 inline h-4 w-4 animate-spin" />
                    {L.sendingCode}
                  </>
                ) : (
                  L.continueToVerify
                )}
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="signup-step-2"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90 px-5 py-4 text-sm text-neutral-600 shadow-sm">
                <p className="font-medium text-neutral-900">{L.verificationTitle}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {L.verificationSubtitle.replace("{email}", getValues("email"))}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-code" className="text-[13px] font-medium text-neutral-600">
                  {L.verificationCode}
                </Label>
                <Input
                  id="signup-code"
                  type="tel"
                  inputMode="numeric"
                  pattern="\d{4}"
                  minLength={4}
                  autoComplete="one-time-code"
                  maxLength={4}
                  placeholder="0000"
                  className={fieldCls(false)}
                  disabled={isLoading}
                  value={verificationCode}
                  onKeyDown={(e) => {
                    const allowed =
                      e.key === "Backspace" ||
                      e.key === "Delete" ||
                      e.key === "ArrowLeft" ||
                      e.key === "ArrowRight" ||
                      e.key === "Tab";
                    if (allowed) return;
                    if (!/^\d$/.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData("text");
                    setVerificationCode(pasted.replace(/\D/g, "").slice(0, 4));
                  }}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-xl px-3 text-vibo-primary hover:bg-vibo-primary/5 hover:text-vibo-primary/90"
                  disabled={isLoading || resendSeconds > 0}
                  onClick={() => void sendVerificationEmail()}
                >
                  {resendSeconds > 0
                    ? L.resendIn.replace("{s}", String(resendSeconds))
                    : L.resendCode}
                </Button>
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 flex-1 rounded-xl border-neutral-200 text-[15px] font-medium text-neutral-700"
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                  disabled={isLoading}
                >
                  {L.stepBack}
                </Button>
                <Button
                  type="submit"
                  className="h-12 flex-1 gap-2 rounded-xl bg-vibo-primary text-[15px] font-medium shadow-sm transition-colors hover:bg-vibo-primary/90"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      {L.creatingAccount}
                    </>
                  ) : (
                    L.verifyAndContinue
                  )}
                </Button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </form>
      ) : (
        <div className="px-1 sm:px-0">
          <OnboardingForm t={t} lang={lang ?? "en"} />
        </div>
      )}

      {step < 3 && (
        <p className="text-center text-sm text-neutral-500">
          {L.hasAccount}{" "}
          <Link href={signInHref} className="font-semibold text-neutral-900 hover:underline" prefetch>
            {L.signInLink}
          </Link>
        </p>
      )}
    </div>
  );
}

