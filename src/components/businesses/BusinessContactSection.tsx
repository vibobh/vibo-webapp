"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useAction } from "convex/react";
import { api } from "@convex_app/_generated/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isCompanyEmail } from "@/lib/companyEmail";

const sectionView = { once: true, margin: "-70px" as const };

export type BusinessContactCopy = {
  title: string;
  description: string;
  detailsTitle: string;
  teamLabel: string;
  teamEmail: string;
  teamBlurb: string;
  firstName: string;
  lastName: string;
  company: string;
  companyEmail: string;
  companyEmailHelp: string;
  message: string;
  submit: string;
  sending: string;
  successTitle: string;
  successBody: string;
  /** Shown when Resend test mode only delivered to admin inbox (no confirmation email). */
  successBodySandbox: string;
  errorGeneric: string;
  errorCompanyEmail: string;
  sendAnother: string;
};

type Props = {
  copy: BusinessContactCopy;
  siteOrigin: string;
};

export default function BusinessContactSection({ copy, siteOrigin }: Props) {
  const reducesMotion = useReducedMotion();
  const submitInquiry = useAction(api.contact.submitBusinessInquiry);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBodyText, setSuccessBodyText] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFirstName("");
    setLastName("");
    setCompanyName("");
    setCompanyEmail("");
    setMessage("");
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isCompanyEmail(companyEmail)) {
      setStatus("error");
      setErrorMessage(copy.errorCompanyEmail);
      return;
    }

    setStatus("loading");
    try {
      const result = await submitInquiry({
        firstName,
        lastName,
        companyName,
        companyEmail: companyEmail.trim().toLowerCase(),
        message,
      });
      setSuccessBodyText(
        result.resendSandboxFallback ? copy.successBodySandbox : copy.successBody,
      );
      setStatus("success");
    } catch (err) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : copy.errorGeneric;
      setErrorMessage(msg);
    }
  };

  return (
    <section
      id="contact"
      className="max-w-[1400px] mx-auto section-padding py-16 sm:py-24 scroll-mt-28"
    >
      <div className="mx-auto max-w-screen-xl">
        <motion.div
          initial={reducesMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={sectionView}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center lg:text-start"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-vibo-primary">{copy.teamLabel}</p>
          <h2 className="mt-2 text-[clamp(1.75rem,3.4vw,2.75rem)] font-bold tracking-[-0.03em] text-neutral-900">
            {copy.title}
          </h2>
          <p className="mt-3 max-w-2xl text-neutral-600 leading-relaxed lg:mx-0 mx-auto">{copy.description}</p>
        </motion.div>

        <div className="mt-10 flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-14">
          <motion.div
            className="mx-auto w-full max-w-md flex-shrink-0 space-y-8 lg:mx-0"
            initial={reducesMotion ? false : { opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={sectionView}
            transition={{ duration: 0.55, delay: 0.05 }}
          >
            <div className="rounded-2xl border border-vibo-primary/12 bg-white/80 p-6 shadow-[0_16px_40px_rgba(75,4,21,0.06)] backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-neutral-900">{copy.detailsTitle}</h3>
              <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{copy.teamBlurb}</p>
              <a
                href={`mailto:${copy.teamEmail}`}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-vibo-primary hover:text-vibo-primary-light"
              >
                {copy.teamEmail}
              </a>
              <p className="mt-4 text-xs text-neutral-500 leading-relaxed">
                <span className="font-medium text-neutral-700">{copy.teamLabel}</span> ·{" "}
                <a href={siteOrigin} className="underline decoration-vibo-primary/30 underline-offset-2">
                  joinvibo.com
                </a>
              </p>
            </div>
          </motion.div>

          <motion.div
            className="relative flex-1 w-full"
            initial={reducesMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={sectionView}
            transition={{ duration: 0.55, delay: 0.08 }}
          >
            {status === "success" ? (
              <div className="rounded-3xl border border-vibo-primary/15 bg-gradient-to-br from-vibo-rose/40 via-white to-white p-8 sm:p-10 text-center shadow-[0_20px_50px_rgba(75,4,21,0.08)]">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-vibo-primary/10">
                  <Image
                    src="/vibo-app-icon.png"
                    alt="Vibo"
                    width={56}
                    height={56}
                    className="rounded-xl"
                  />
                </div>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-neutral-900">{copy.successTitle}</h3>
                <p className="mt-2 text-sm text-neutral-600 leading-relaxed max-w-md mx-auto">
                  {successBodyText ?? copy.successBody}
                </p>
                <Button type="button" variant="outline" className="mt-8" onClick={reset}>
                  {copy.sendAnother}
                </Button>
              </div>
            ) : (
              <form
                onSubmit={onSubmit}
                className="rounded-3xl border border-vibo-primary/12 bg-white/90 p-6 sm:p-10 shadow-[0_20px_50px_rgba(75,4,21,0.07)] backdrop-blur-md"
              >
                <div className="mb-6 flex items-center gap-3 border-b border-neutral-200/80 pb-6">
                  <Image
                    src="/vibo-app-icon.png"
                    alt="Vibo"
                    width={44}
                    height={44}
                    className="rounded-xl shrink-0"
                  />
                  <div className="min-w-0 text-start">
                    <p className="text-sm font-semibold text-neutral-900">{copy.title}</p>
                    <p className="text-xs text-neutral-500">{copy.description}</p>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="bc-first">{copy.firstName}</Label>
                    <Input
                      id="bc-first"
                      name="firstName"
                      autoComplete="given-name"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={copy.firstName}
                      disabled={status === "loading"}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="bc-last">{copy.lastName}</Label>
                    <Input
                      id="bc-last"
                      name="lastName"
                      autoComplete="family-name"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={copy.lastName}
                      disabled={status === "loading"}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-1.5">
                  <Label htmlFor="bc-company">{copy.company}</Label>
                  <Input
                    id="bc-company"
                    name="company"
                    autoComplete="organization"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder={copy.company}
                    disabled={status === "loading"}
                  />
                </div>

                <div className="mt-5 grid gap-1.5">
                  <Label htmlFor="bc-email">{copy.companyEmail}</Label>
                  <Input
                    id="bc-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="name@yourcompany.com"
                    disabled={status === "loading"}
                    className={errorMessage && !isCompanyEmail(companyEmail) ? "border-red-400" : ""}
                  />
                  <p className="text-xs text-neutral-500">{copy.companyEmailHelp}</p>
                </div>

                <div className="mt-5 grid gap-1.5">
                  <Label htmlFor="bc-msg">{copy.message}</Label>
                  <Textarea
                    id="bc-msg"
                    name="message"
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={copy.message}
                    disabled={status === "loading"}
                  />
                </div>

                {status === "error" && errorMessage && (
                  <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {errorMessage}
                  </p>
                )}

                <Button type="submit" className="mt-6 w-full rounded-full sm:rounded-md" disabled={status === "loading"}>
                  {status === "loading" ? copy.sending : copy.submit}
                </Button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
