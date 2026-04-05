"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Lang } from "@/i18n";

type ChatMsg = { role: "user" | "assistant"; content: string };

interface HelpChatWidgetProps {
  lang: Lang;
  labels: {
    title: string;
    greeting: string;
    placeholder: string;
    errorRetry: string;
  };
}

export default function HelpChatWidget({ lang, labels }: HelpChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: labels.greeting },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askHelp = useAction(api.helpChat.askHelpQuestion);

  const isAr = lang === "ar";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || loading) return;
      const userMsg: ChatMsg = { role: "user", content: text };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setLoading(true);
      try {
        const res = await askHelp({ messages: next });
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.reply },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: labels.errorRetry },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, askHelp, labels.errorRetry],
  );

  return (
    <>
      {/* Floating toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Help chat"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-vibo-primary text-white shadow-lg hover:bg-vibo-primary-light transition-colors"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-8rem)] rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden"
          dir={isAr ? "rtl" : "ltr"}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-vibo-primary text-white shrink-0">
            <img
              src="/vibo-app-icon.png"
              alt="Vibo"
              className="h-8 w-8 rounded-full bg-white/20"
            />
            <span className="font-semibold text-sm">{labels.title}</span>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-vibo-primary text-white rounded-br-md"
                      : "bg-neutral-100 text-neutral-800 rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-neutral-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 border-t border-neutral-100 px-3 py-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={labels.placeholder}
              dir={isAr ? "rtl" : "ltr"}
              className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-vibo-primary/30 transition"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-vibo-primary text-white disabled:opacity-40 hover:bg-vibo-primary-light transition"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
