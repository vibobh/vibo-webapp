"use client";

import { AnimatePresence, motion } from "framer-motion";

export type BusinessesPhoneUi = {
  boostHeader: string;
  selectPost: string;
  goalHeader: string;
  goalPrompt: string;
  goals: string[];
  audienceHeader: string;
  audiencePrompt: string;
  audienceRows: string[];
  estReach: string;
  budgetHeader: string;
  dailyBudget: string;
  totalCap: string;
  duration: string;
  days: string;
  budgetFootnote: string;
  reviewHeader: string;
  reviewRows: string[];
  previewTag: string;
  launch: string;
};

type Props = {
  activeStep: number;
  reducesMotion: boolean;
  phoneUi: BusinessesPhoneUi;
};

export default function BoostFlowPhone({ activeStep, reducesMotion, phoneUi }: Props) {
  const d = reducesMotion ? 0 : 0.32;
  const ui = phoneUi;
  return (
    <div className="relative mx-auto w-full max-w-[min(100%,304px)] select-none" dir="ltr">
      <div className="relative rounded-[2.35rem] border border-neutral-800/90 bg-gradient-to-b from-neutral-800 via-neutral-900 to-neutral-950 p-[11px] shadow-[0_28px_70px_rgba(75,4,21,0.28)]">
        <div
          className="absolute left-1/2 top-[13px] z-20 h-[25px] w-[92px] -translate-x-1/2 rounded-full bg-black shadow-inner"
          aria-hidden
        />
        <div className="relative overflow-hidden rounded-[1.85rem] bg-neutral-100 aspect-[9/18.5] min-h-[400px] sm:min-h-[440px]">
          <div className="absolute inset-x-0 top-0 z-10 flex h-9 items-end justify-center pb-1 text-[10px] font-semibold text-neutral-500">
            9:41
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              className="absolute inset-0 top-9 flex flex-col px-3.5 pb-4 pt-1"
              initial={reducesMotion ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducesMotion ? undefined : { opacity: 0, x: -18 }}
              transition={{ duration: d, ease: [0.22, 1, 0.36, 1] }}
            >
              {activeStep === 0 && <ScreenPick ui={ui} />}
              {activeStep === 1 && <ScreenGoal ui={ui} />}
              {activeStep === 2 && <ScreenAudience ui={ui} />}
              {activeStep === 3 && <ScreenBudget ui={ui} />}
              {activeStep === 4 && <ScreenReview ui={ui} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="mx-auto mt-2.5 h-[5px] w-[92px] rounded-full bg-neutral-900/25" aria-hidden />
    </div>
  );
}

function ScreenPick({ ui }: { ui: BusinessesPhoneUi }) {
  return (
    <>
      <p className="text-center text-[11px] font-bold uppercase tracking-wide text-vibo-primary">{ui.boostHeader}</p>
      <p className="mt-3 text-center text-[13px] font-semibold text-neutral-900">{ui.selectPost}</p>
      <div className="mt-4 flex flex-1 flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-2.5 rounded-xl border-2 p-2 transition-colors ${
              i === 1
                ? "border-vibo-primary bg-vibo-rose/50 shadow-sm"
                : "border-neutral-200/90 bg-white"
            }`}
          >
            <div
              className={`h-14 w-14 shrink-0 rounded-lg ${i === 1 ? "bg-gradient-to-br from-vibo-primary to-vibo-gold" : "bg-neutral-200"}`}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="h-2 w-[70%] rounded bg-neutral-200" />
              <div className="h-2 w-[45%] rounded bg-neutral-100" />
            </div>
            {i === 1 ? (
              <motion.span
                className="flex h-6 w-6 items-center justify-center rounded-full bg-vibo-primary text-[10px] font-bold text-white"
                initial={{ scale: 0.65 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
              >
                ✓
              </motion.span>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

function ScreenGoal({ ui }: { ui: BusinessesPhoneUi }) {
  const g = ui.goals;
  return (
    <>
      <p className="text-center text-[11px] font-bold uppercase tracking-wide text-vibo-primary">{ui.goalHeader}</p>
      <p className="mt-3 text-center text-[13px] font-semibold text-neutral-900">{ui.goalPrompt}</p>
      <div className="mt-5 space-y-2.5">
        {g.map((label, i) => (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 ${
              i === 1 ? "border-vibo-primary bg-white shadow-sm" : "border-neutral-200 bg-white/80"
            }`}
          >
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                i === 1 ? "border-vibo-primary bg-vibo-primary" : "border-neutral-300"
              }`}
            >
              {i === 1 ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
            </div>
            <span className="text-[13px] font-medium text-neutral-800">{label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ScreenAudience({ ui }: { ui: BusinessesPhoneUi }) {
  const rows = ui.audienceRows;
  return (
    <>
      <p className="text-center text-[11px] font-bold uppercase tracking-wide text-vibo-primary">{ui.audienceHeader}</p>
      <p className="mt-3 text-center text-[13px] font-semibold text-neutral-900">{ui.audiencePrompt}</p>
      <div className="mt-5 space-y-2">
        {rows.map((row, i) => (
          <div
            key={row}
            className={`rounded-lg border px-3 py-2 text-[12px] font-medium ${
              i === 0
                ? "border-vibo-primary/40 bg-vibo-rose/40 text-vibo-primary-dark"
                : "border-neutral-200 bg-white text-neutral-700"
            }`}
          >
            {row}
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-xl bg-white p-2 shadow-sm ring-1 ring-neutral-200/80">
        <div className="flex justify-between text-[10px] text-neutral-500">
          <span>{ui.estReach}</span>
          <span className="font-semibold text-vibo-primary">12k – 48k</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-vibo-primary to-vibo-gold"
            initial={{ width: "0%" }}
            animate={{ width: "72%" }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>
    </>
  );
}

function ScreenBudget({ ui }: { ui: BusinessesPhoneUi }) {
  return (
    <>
      <p className="text-center text-[11px] font-bold uppercase tracking-wide text-vibo-primary">{ui.budgetHeader}</p>
      <p className="mt-3 text-center text-[13px] font-semibold text-neutral-900">
        {ui.duration} · 7 {ui.days}
      </p>
      <div className="mt-6 space-y-5">
        <div>
          <div className="mb-1.5 flex justify-between text-[11px] text-neutral-500">
            <span>{ui.dailyBudget}</span>
            <span className="font-semibold text-neutral-800">$25</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-200/90">
            <motion.div
              className="h-full w-[55%] rounded-full bg-vibo-primary"
              initial={false}
              animate={{ width: "55%" }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-[11px] text-neutral-500">
            <span>{ui.totalCap}</span>
            <span className="font-semibold text-neutral-800">$175</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-200/90">
            <motion.div
              className="h-full rounded-full bg-vibo-gold"
              initial={{ width: 0 }}
              animate={{ width: "40%" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
            />
          </div>
        </div>
      </div>
      <p className="mt-auto text-center text-[10px] leading-snug text-neutral-400">{ui.budgetFootnote}</p>
    </>
  );
}

function ScreenReview({ ui }: { ui: BusinessesPhoneUi }) {
  const rows = ui.reviewRows;
  return (
    <>
      <p className="text-center text-[11px] font-bold uppercase tracking-wide text-vibo-primary">{ui.reviewHeader}</p>
      <div className="mt-4 flex-1 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
        {rows.map((line, i) => (
          <div key={line} className="flex items-center gap-2 border-b border-neutral-100 py-2 last:border-0">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] text-emerald-700">
              ✓
            </span>
            <span className="text-[12px] text-neutral-700">{line}</span>
            {i === 2 ? (
              <motion.span
                className="ms-auto text-[10px] font-semibold text-vibo-primary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.18 }}
              >
                {ui.previewTag}
              </motion.span>
            ) : null}
          </div>
        ))}
      </div>
      <motion.button
        type="button"
        className="mt-4 w-full rounded-xl bg-vibo-primary py-3 text-center text-[13px] font-bold text-white shadow-md shadow-vibo-primary/30"
        whileTap={{ scale: 0.98 }}
      >
        {ui.launch}
      </motion.button>
    </>
  );
}
