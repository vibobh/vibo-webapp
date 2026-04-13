"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";

import type { Translations } from "@/i18n";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SignInFormProps {
  t: Translations;
  signUpHref: string;
}

export function SignInForm({ t, signUpHref }: SignInFormProps) {
  const L = t.login;
  const router = useRouter();
  const { setSession } = useViboAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInSchema = useMemo(
    () =>
      z.object({
        identifier: z.string().min(3, { message: L.errors.email }),
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
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (data: SignInFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: data.identifier,
          password: data.password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? L.genericError);
        return;
      }
      setSession(json.token, json.user);
      router.push("/");
    } catch {
      setError(L.genericError);
    } finally {
      setIsLoading(false);
    }
  };

  const fieldCls = (hasError: boolean) =>
    `h-11 rounded-lg border-neutral-200 bg-white text-[15px] transition-colors placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-1 focus-visible:ring-neutral-300/50 ${hasError ? "border-red-400" : ""}`;

  return (
    <div className="space-y-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900 sm:text-2xl">
        {L.signInTitle}
      </h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Identifier */}
        <div className="space-y-1.5">
          <Label
            htmlFor="login-identifier"
            className="text-[13px] font-medium text-neutral-600"
          >
            {L.identifier}
          </Label>
          <Input
            id="login-identifier"
            type="text"
            autoComplete="username"
            placeholder={L.placeholderIdentifier}
            className={fieldCls(!!errors.identifier)}
            disabled={isLoading}
            aria-invalid={!!errors.identifier}
            {...register("identifier")}
          />
          {errors.identifier && (
            <p className="text-xs text-red-500">{errors.identifier.message}</p>
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
          className="h-11 w-full rounded-lg bg-vibo-primary text-[15px] font-medium shadow-sm transition-colors hover:bg-vibo-primary/90"
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
