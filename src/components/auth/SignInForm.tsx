"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "@/components/ui/icons";
import Link from "next/link";

import type { Lang, Translations } from "@/i18n";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SignInFormProps {
  t: Translations;
  lang: Lang;
  signUpHref: string;
}

export function SignInForm({ t, lang, signUpHref }: SignInFormProps) {
  const L = t.login;
  const router = useRouter();
  const { setSession } = useViboAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInSchema = useMemo(
    () =>
      z.object({
        email: z.string().email({ message: L.errors.email }),
        password: z.string().min(8, { message: L.errors.passwordMin }),
      }),
    [L.errors.email, L.errors.passwordMin],
  );

  type SignInFormValues = z.infer<typeof signInSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: SignInFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email.trim().toLowerCase(),
          password: data.password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? L.genericError);
        return;
      }
      setSession(json.token, json.user);
      const done = json.user?.onboardingCompleted === true;
      router.push(done ? "/" : `/signup?lang=${lang ?? "en"}&onboarding=1`);
    } catch {
      setError(L.genericError);
    } finally {
      setIsLoading(false);
    }
  };

  const fieldCls = (hasError: boolean) =>
    `auth-form-input-autofill h-16 rounded-2xl border bg-white px-5 text-[17px] text-neutral-700 transition-colors placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-vibo-primary/20 ${hasError ? "border-red-400" : "border-neutral-300"}`;

  return (
    <div className="space-y-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900 sm:text-2xl">
        {L.signInTitle}
      </h1>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email */}
        <div className="space-y-1.5">
          <Label
            htmlFor="login-email"
            className="text-[13px] font-medium text-neutral-600"
          >
            {L.email ?? L.identifier}
          </Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder={L.placeholderEmail ?? L.placeholderIdentifier}
            className={fieldCls(!!errors.email)}
            disabled={isLoading}
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label
            htmlFor="login-password"
            className="text-[13px] font-medium text-neutral-600"
          >
            {L.password}
          </Label>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
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
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        {/* Remember / Forgot */}
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-neutral-600">
            <Checkbox
              defaultChecked
              className="rounded border-neutral-300 data-[state=checked]:border-vibo-primary data-[state=checked]:bg-vibo-primary"
            />
            {L.rememberMe}
          </label>
          <button
            type="button"
            className="text-[13px] text-neutral-500 transition-colors hover:text-neutral-800 hover:underline"
          >
            {L.forgotPassword}
          </button>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          className="h-16 w-full rounded-full bg-vibo-primary/45 text-[17px] font-medium text-white transition-colors hover:bg-vibo-primary/90 disabled:cursor-not-allowed disabled:bg-vibo-primary/35"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {L.signingIn}
            </>
          ) : (
            L.signIn
          )}
        </Button>
      </form>

      {/* Footer link */}
      <p className="text-center text-sm text-neutral-500">
        {L.noAccount}{" "}
        <Link
          href={signUpHref}
          className="font-semibold text-neutral-900 hover:underline"
          prefetch
        >
          {L.signUpLink}
        </Link>
      </p>
    </div>
  );
}

