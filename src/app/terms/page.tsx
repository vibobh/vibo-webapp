"use client";

import { useEffect } from "react";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";

const toc = [
  { id: "vibo-service", label: "1. The Vibo Service" },
  { id: "funded", label: "2. How the Service is funded" },
  { id: "commitments", label: "3. Your commitments" },
  { id: "content-permissions", label: "4. Your content and permissions" },
  { id: "distribution-ai-versions", label: "5. Content distribution, AI systems, and Versions" },
  { id: "moderation-enforcement", label: "6. Content moderation and enforcement" },
  { id: "intellectual-property", label: "7. Intellectual property" },
  { id: "suspension-termination", label: "8. Suspension and termination" },
  { id: "limitation-liability", label: "9. Limitation of liability" },
  { id: "governing-law", label: "10. Governing law" },
  { id: "changes", label: "11. Changes to these Terms" },
];

export default function TermsPage() {
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  return (
    <div className="min-h-screen flex flex-col text-neutral-900">
      <GradientBg />
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />

      <main className="relative z-[1] flex-1 pt-[72px] lg:pt-[80px]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 lg:px-10 py-10 sm:py-14">
        <div className="grid grid-cols-12 gap-10 lg:gap-14">
          <aside className="hidden lg:block lg:col-span-4">
            <nav className="sticky top-24">
              <p className="text-[0.7rem] uppercase tracking-[0.14em] text-vibo-primary/70 mb-4">On this page</p>
              <ol className="space-y-2.5 text-sm">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-neutral-600 hover:text-vibo-primary transition-colors duration-200 block"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="col-span-12 lg:col-span-8 max-w-3xl">
            <h1 className="text-[clamp(2rem,5vw,3rem)] font-bold tracking-[-0.03em] mb-4">Terms of Service</h1>
            <p className="text-sm italic text-neutral-500 mb-9">Last Updated: april 21, 2026</p>

            <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
              <p>Welcome to Vibo.</p>
              <p>
                These Terms of Service (&quot;Terms&quot;) govern your access to and use of Vibo, including our
                applications, websites, features, technologies, and related services (the &quot;Service&quot;). By
                accessing or using the Service, you agree to be bound by these Terms. If you do not agree, you
                must not use the Service.
              </p>
            </div>

            <section id="vibo-service" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">1. The Vibo Service</h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>
                  Vibo provides a platform that enables users to create, share, discover, and interact with
                  content, including videos, images, and communications with other users.
                </p>
                <p>
                  The Service includes content feeds, recommendation systems, messaging features, and other tools
                  designed to facilitate social interaction and content distribution. Content may be displayed
                  across different areas of the Service, including personalized feeds and recommendations.
                </p>
                <p>
                  Vibo uses automated systems, including artificial intelligence and machine learning, to organize,
                  rank, and recommend content based on user activity, preferences, and interactions. The Service
                  may include sponsored content, advertisements, and commercial features.
                </p>
              </div>
            </section>

            <section id="funded" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">2. How the Service is funded</h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>
                  You acknowledge that the Service may be supported by advertising and sponsored content. By using
                  Vibo, you agree that we may display advertisements and promotional content within the Service.
                </p>
                <p>
                  We may use information related to your activity and interactions to provide relevant content and
                  advertisements. We do not guarantee the relevance or performance of any advertisements or
                  sponsored content.
                </p>
              </div>
            </section>

            <section id="commitments" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">3. Your commitments</h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>
                  You must be at least 13 years of age to use the Service. If you are under 18, you confirm that
                  you have permission from a parent or legal guardian.
                </p>
                <p>
                  You agree to use the Service in compliance with applicable laws and these Terms. You must not
                  engage in conduct that is unlawful, misleading, abusive, or harmful.
                </p>
                <p>
                  You must not upload or share content that violates the rights of others, including intellectual
                  property rights, privacy rights, or applicable laws.
                </p>
                <p>
                  You must not interfere with the operation of the Service, attempt unauthorized access, use
                  automated systems such as bots, or engage in behavior intended to manipulate content distribution
                  or platform systems.
                </p>
                <p>
                  You are responsible for maintaining the security of your account and for all activities that occur
                  under your account.
                </p>
              </div>
            </section>

            <section id="content-permissions" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">
                4. Your content and permissions
              </h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>You retain ownership of the content you create and share on Vibo.</p>
                <p>
                  By submitting content to the Service, you grant Vibo a worldwide, non-exclusive, royalty-free,
                  transferable, and sublicensable license to host, store, reproduce, distribute, display, and make
                  your content available in connection with operating, providing, improving, and promoting the
                  Service.
                </p>
                <p>
                  This includes the use of your content in feeds, recommendations, and other features of the
                  Service, as well as for the development and improvement of our technologies, including automated
                  systems.
                </p>
                <p>
                  You acknowledge that your content may be viewed, shared, and interacted with by other users in
                  accordance with the functionality of the Service.
                </p>
              </div>
            </section>

            <section id="distribution-ai-versions" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">
                5. Content distribution, AI systems, and Versions
              </h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>
                  Content on Vibo is distributed through automated systems that take into account various factors,
                  including user interactions, engagement signals, and system optimization.
                </p>
                <p>Vibo does not guarantee the visibility, reach, or performance of any content.</p>
                <p>
                  The Service may include features that allow users to upload multiple versions of content. You
                  acknowledge that newer versions may affect the visibility of previous versions, and that
                  engagement across versions may influence how content is ranked, distributed, and resurfaced.
                </p>
              </div>
            </section>

            <section id="moderation-enforcement" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">
                6. Content moderation and enforcement
              </h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>
                  We may monitor, review, remove, restrict, or limit the visibility of any content on the Service
                  at our discretion.
                </p>
                <p>
                  We may also suspend, restrict, or terminate accounts, or limit access to features, where we
                  determine that users have violated these Terms, applicable policies, or applicable laws, or where
                  necessary to protect the Service or its users.
                </p>
                <p>
                  Moderation and enforcement actions may be carried out using automated systems or human review.
                </p>
              </div>
            </section>

            <section id="intellectual-property" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">7. Intellectual property</h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>
                  You represent and warrant that you have all necessary rights to the content you upload or share on
                  the Service.
                </p>
                <p>
                  Vibo respects intellectual property rights and may remove content or take action against accounts
                  that infringe such rights.
                </p>
                <p>
                  All rights in the Service, including its technology, systems, and content provided by Vibo, remain
                  the property of Vibo or its licensors.
                </p>
              </div>
            </section>

            <section id="suspension-termination" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">
                8. Suspension and termination
              </h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>You may stop using the Service at any time.</p>
                <p>
                  We may suspend or terminate your access to the Service, remove content, or restrict functionality
                  at any time and without prior notice, at our discretion.
                </p>
              </div>
            </section>

            <section id="limitation-liability" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">9. Limitation of liability</h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis.</p>
                <p>
                  To the maximum extent permitted by law, Vibo is not liable for any indirect, incidental, or
                  consequential damages, including loss of data, content, revenue, or engagement, arising from your
                  use of the Service.
                </p>
                <p>
                  We are not responsible for content posted by users or for the actions of users on or off the
                  Service.
                </p>
              </div>
            </section>

            <section id="governing-law" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">10. Governing law</h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>
                  These Terms are governed by the laws of the Kingdom of Bahrain. Any disputes arising from these
                  Terms or the Service shall be subject to the jurisdiction of the courts of Bahrain.
                </p>
              </div>
            </section>

            <section id="changes" className="scroll-mt-24 pt-12 pb-12">
              <h2 className="text-[1.45rem] font-bold tracking-[-0.02em] mb-4">11. Changes to these Terms</h2>
              <div className="space-y-5 text-[0.97rem] leading-7 text-neutral-700">
                <p>
                  We may modify these Terms from time to time. Continued use of the Service after such changes
                  constitutes your acceptance of the updated Terms.
                </p>
              </div>
            </section>
          </article>
        </div>
        </div>
      </main>
      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
