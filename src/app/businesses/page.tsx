import Link from "next/link";

const goals = [
  {
    title: "Grow awareness.",
    text: "Share content and test different formats so more people discover your brand and products.",
  },
  {
    title: "Get new customers.",
    text: "Encourage people to purchase your product or service by clicking through to your website.",
  },
  {
    title: "Build relationships.",
    text: "Grow your community by encouraging conversations through messages and comments.",
  },
];

const steps = [
  "Step 1: Choose a post to boost.",
  "Step 2: Select your goal.",
  "Step 3: Define your audience.",
  "Step 4: Set a budget and duration.",
  "Step 5: Review and launch your ad.",
];

const faqs = [
  "How can I make the best possible ad?",
  "How do I find my target audience?",
  "What insights can I gain from my ads?",
  "How can I get started advertising on Vibo?",
];

function AdPreviewCard({ className, label }: { className?: string; label: string }) {
  return (
    <div
      className={`rounded-[24px] border border-black/5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] bg-gradient-to-br from-fuchsia-500 via-rose-500 to-indigo-500 ${className ?? ""}`}
    >
      <div className="h-full w-full rounded-[24px] bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.45),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,.24),transparent_40%)] p-4 flex items-end">
        <span className="inline-flex rounded-full bg-white/90 text-neutral-900 text-[11px] px-3 py-1 font-medium">
          {label}
        </span>
      </div>
    </div>
  );
}

export default function BusinessesPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f9] text-neutral-900">
      <header className="sticky top-0 z-40 backdrop-blur bg-[#f8f8f9]/85 border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-[62px] flex items-center justify-between gap-5">
          <div className="flex items-center gap-6 sm:gap-8 min-w-0">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <img
                src="/images/vibo-icon-maroon.png"
                alt="Vibo"
                className="h-5 w-auto"
              />
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-[13px] text-neutral-700">
              <a href="#get-started" className="hover:text-neutral-900">Get started</a>
              <a href="#objectives" className="hover:text-neutral-900">Ads on Vibo</a>
              <a href="#creative" className="hover:text-neutral-900">Creative tools</a>
              <a href="#faq" className="hover:text-neutral-900">Help</a>
            </nav>
          </div>
          <a
            href="#get-started"
            className="inline-flex items-center justify-center rounded-full border border-[#8b1d58]/25 bg-white px-5 h-10 text-[12px] font-semibold tracking-wide hover:bg-[#fff7fb]"
          >
            CREATE AN AD
          </a>
        </div>
      </header>

      <main>
        <section id="get-started" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-[clamp(2.1rem,5vw,4rem)] leading-[1.02] tracking-[-0.03em] font-semibold max-w-[560px]">
                Captivate new <span className="text-[#d62976]">customers</span> with Vibo ads.
              </h1>
              <p className="mt-5 text-neutral-700 max-w-[520px] text-[1.04rem]">
                Grow your business, push creative boundaries, and build lasting
                connections - all in one place.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <a
                  href="#objectives"
                  className="inline-flex h-11 px-6 items-center justify-center rounded-full border border-[#8b1d58]/35 font-semibold text-[13px] hover:bg-white"
                >
                  GET STARTED
                </a>
                <a
                  href="#creative"
                  className="inline-flex h-11 px-6 items-center justify-center rounded-full text-[13px] font-semibold text-neutral-800 hover:bg-black/5"
                >
                  LEARN MORE
                </a>
              </div>
            </div>
            <div className="relative min-h-[420px]">
              <AdPreviewCard label="Boost Post" className="absolute start-10 top-8 h-[300px] w-[220px]" />
              <AdPreviewCard label="New Product" className="absolute end-6 top-0 h-[220px] w-[150px]" />
              <AdPreviewCard label="Learn More" className="absolute end-12 bottom-2 h-[210px] w-[165px]" />
            </div>
          </div>
        </section>

        <section id="objectives" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#d62976] font-semibold">
            What do you want to achieve?
          </p>
          <h2 className="mt-2 text-[clamp(1.7rem,3.3vw,2.8rem)] font-semibold tracking-[-0.02em] max-w-[860px]">
            Get results that matter throughout the customer journey.
          </h2>

          <div className="mt-12 grid md:grid-cols-3 gap-8">
            {goals.map((goal) => (
              <article key={goal.title} className="border-s md:border-s border-[#d4be74] ps-6">
                <h3 className="text-[1.9rem] tracking-[-0.02em] font-medium">{goal.title}</h3>
                <p className="mt-3 text-neutral-700 leading-relaxed">{goal.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="creative" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <h2 className="text-[clamp(1.7rem,3vw,2.5rem)] font-semibold tracking-[-0.02em] max-w-[960px]">
            Experiment with Vibo&apos;s creative tools to find what resonates with your community.
          </h2>
          <div className="mt-10 grid lg:grid-cols-[0.95fr_1.05fr] gap-10 items-center">
            <div className="rounded-[28px] bg-gradient-to-br from-blue-100 via-violet-100 to-pink-100 p-4">
              <div className="rounded-[22px] bg-gradient-to-br from-[#f72585] via-[#7209b7] to-[#4361ee] aspect-[3/4] shadow-[0_20px_50px_rgba(0,0,0,0.18)]" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#d62976] font-semibold">Reels</p>
              <p className="mt-2 text-[1.45rem] leading-tight font-medium">
                Use features like short-form video camera, Remix, and product tags to put your spin on trends.
              </p>
              <p className="mt-4 text-neutral-700 leading-relaxed">
                Start your own momentum and reach people who are most likely to be interested in your business.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-[1200px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
            <div className="rounded-[28px] bg-gradient-to-br from-[#ff006e] via-[#fb5607] to-[#ffbe0b] p-3">
              <div className="rounded-[20px] bg-white aspect-[9/16] max-w-[360px] mx-auto border border-neutral-200" />
            </div>
            <div className="space-y-5">
              {steps.map((step, i) => (
                <div key={step} className="border-b border-neutral-200 pb-4">
                  <h3 className="text-[1.7rem] tracking-[-0.02em] font-medium">{step}</h3>
                  {i === 2 && (
                    <p className="mt-2 text-neutral-700">
                      Choose to target people similar to customers who already love your brand, or customize your audience.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-[1200px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#d62976] font-semibold">
                Measure your impact
              </p>
              <h2 className="mt-2 text-[clamp(1.9rem,3.4vw,3rem)] font-semibold tracking-[-0.02em]">
                Go deeper to understand your <span className="text-[#d62976]">ad performance.</span>
              </h2>
              <p className="mt-4 text-neutral-700 leading-relaxed max-w-[520px]">
                Performance insights can help you unlock your ad&apos;s success. Then use what you learn to make more effective ads.
              </p>
            </div>
            <div className="rounded-[30px] border border-[#8b1d58]/30 bg-white aspect-[9/16] max-w-[360px] mx-auto" />
          </div>
        </section>

        <section id="faq" className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <h2 className="text-[clamp(1.8rem,3vw,2.6rem)] tracking-[-0.02em] font-semibold">
            Frequently asked <span className="text-[#d62976]">questions</span>
          </h2>
          <p className="mt-2 text-neutral-700">
            Got questions about Vibo ads? We&apos;ve got answers.
          </p>

          <div className="mt-8 grid md:grid-cols-2 gap-x-12 gap-y-2">
            {faqs.map((q) => (
              <button
                type="button"
                key={q}
                className="w-full text-left py-4 border-b border-neutral-200 flex items-center justify-between gap-4 hover:text-[#8b1d58]"
              >
                <span className="text-[1.25rem] leading-tight">{q}</span>
                <span className="text-xl">→</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

