"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import type { Lang } from "@/i18n";

export type HeaderAnchorItem = { id: string; href: string; label: string };

interface NavbarProps {
  t: any;
  lang: Lang;
  onSwitchLang: () => void;
  /** When set (e.g. https://joinvibo.com), logo and nav targets use this origin (e.g. businesses subdomain). */
  siteOrigin?: string;
  /** When set, replaces About/Blog/Newsroom/Careers with these links (e.g. businesses landing). */
  headerAnchorNav?: HeaderAnchorItem[];
}

export default function Navbar({
  t,
  lang,
  onSwitchLang,
  siteOrigin,
  headerAnchorNav,
}: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isRTL = lang === "ar";
  const pathname = usePathname();
  const origin = siteOrigin?.replace(/\/$/, "") ?? "";

  const q = `?lang=${lang}`;
  const defaultNavItems: HeaderAnchorItem[] = [
    { href: `${origin}/#about`, label: t.nav.about, id: "about" },
    { href: `${origin}/blogs${q}`, label: t.nav.blog, id: "blog" },
    { href: `${origin}/newsroom${q}`, label: t.nav.newsroom, id: "newsroom" },
    { href: `${origin}/#careers`, label: t.nav.careers, id: "careers" },
  ];

  const navItems = headerAnchorNav ?? defaultNavItems;

  const linkActive = (id: string) => {
    if (headerAnchorNav) return false;
    if (id === "newsroom") return pathname === "/newsroom" || pathname?.startsWith("/newsroom/");
    if (id === "blog") return pathname === "/blogs" || pathname?.startsWith("/blogs/");
    return false;
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navSolid =
    scrolled ||
    pathname === "/newsroom" ||
    pathname?.startsWith("/newsroom/") ||
    pathname === "/blogs" ||
    pathname?.startsWith("/blogs/") ||
    pathname === "/businesses";

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        navSolid
          ? "bg-white/[0.97] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-[1400px] mx-auto section-padding">
        <div className="flex items-center justify-between h-[60px] lg:h-[68px]">
          <a href={origin ? `${origin}/` : "/"} className="flex items-center">
            <img
              src="/images/vibo-icon-maroon.png"
              alt="Vibo"
              className="h-[30px] sm:h-[34px] w-auto"
            />
          </a>

          <div
            className={`hidden lg:flex items-center ${headerAnchorNav ? "gap-6 xl:gap-8" : "gap-9"}`}
          >
            {navItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={`text-[0.85rem] tracking-[-0.01em] transition-colors duration-200 ${
                  linkActive(item.id)
                    ? "text-vibo-primary font-medium"
                    : "text-neutral-400 hover:text-neutral-800"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onSwitchLang}
              className="text-[0.8rem] text-neutral-400 hover:text-neutral-700 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-neutral-100/80"
            >
              {t.footer.switchLang}
            </button>

            <a
              href="#"
              className="hidden lg:inline-flex items-center gap-1.5 bg-vibo-primary text-white px-5 py-2.5 rounded-full text-[0.8rem] font-medium hover:bg-vibo-primary-light transition-colors"
            >
              {t.nav.download}
              <svg
                className={`w-3.5 h-3.5 ${isRTL ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>

            <button
              type="button"
              className="lg:hidden flex flex-col justify-center gap-[5px] w-8 h-8"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <motion.span
                animate={menuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                className="block w-5 h-[1.5px] bg-neutral-700 origin-center"
              />
              <motion.span
                animate={menuOpen ? { opacity: 0 } : { opacity: 1 }}
                className="block w-5 h-[1.5px] bg-neutral-700"
              />
              <motion.span
                animate={menuOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                className="block w-5 h-[1.5px] bg-neutral-700 origin-center"
              />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden bg-white border-t border-neutral-100"
          >
            <div className="section-padding py-5 space-y-1">
              {navItems.map((item, i) => (
                <motion.a
                  key={item.id}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block py-2.5 text-base transition-colors ${
                    linkActive(item.id)
                      ? "text-vibo-primary font-medium"
                      : "text-neutral-600 hover:text-vibo-primary"
                  }`}
                  initial={{ opacity: 0, x: isRTL ? 16 : -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  {item.label}
                </motion.a>
              ))}
              <div className="pt-3">
                <a
                  href="#"
                  className="inline-flex items-center gap-2 bg-vibo-primary text-white px-5 py-2.5 rounded-full text-sm font-medium"
                >
                  {t.nav.download}
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
