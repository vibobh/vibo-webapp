import { action } from "./_generated/server";
import { v } from "convex/values";

const VIBO_SYSTEM_PROMPT = `You are Vibo's friendly help assistant. You help users with questions about the Vibo social media app. Answer in the same language the user writes in.

Here is everything you know about Vibo:

Vibo lets you create, connect, and interact in a more dynamic way.

FEATURES:
- Stories with interactive tools: Share moments using polls, questions, quizzes, countdowns, and "Add Yours" to get real responses.
- Live reactions: React instantly to stories with emojis that appear in real time.
- Smart story replies: Send quick messages or reactions directly from stories.
- Creative story editing: Add text, draw, apply filters, and customize stories.
- Interactive trends: Join shared prompts like "Add Yours" and be part of growing story chains.
- Multi-account support: Switch between accounts easily without losing your flow.
- Personalized feed: Discover content tailored to you.
- Full-screen "Vibes" experience: Watch and explore content in an immersive, scrollable view.
- Seamless sharing: Send posts to friends instantly through messages.
- Real-time messaging: Chat with others in a simple and responsive messaging system.
- Post interactions: Like, comment, and engage with content naturally.
- Smooth navigation: Move between feed, profiles, messages, and stories with fast transitions.
- Profile customization: Showcase your identity with profile photos, banners, and personal details.
- Story viewer experience: View stories in a clean, focused layout.
- Clean and modern design: Simple, polished interface designed for clarity, speed, and ease of use.

HELP CATEGORIES (use these to direct users):
1. Stories and Vibes: interactive tools, story editing, Add Yours, reactions, Vibes experience
2. Feed and Discovery: personalized feed, post interactions, navigation
3. Messaging: real-time messaging, sharing posts, story replies
4. Account and Profile: multi-account, profile customization, viewing stories
5. Privacy and Safety: reporting, blocking, content controls, private account
6. Getting Started: creating account, app basics, design overview

RULES:
- Be concise and helpful. Use short paragraphs.
- When relevant, suggest which help category or article the user should visit.
- If you don't know the answer, say so honestly and suggest contacting businesses@joinvibo.com.
- Never make up features that are not listed above.
- Do not discuss competitors or other apps.`;

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
/** OpenRouter model id, e.g. openai/gpt-4o-mini, google/gemini-2.0-flash-001 — see https://openrouter.ai/models */
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

/** Drop UI greeting so the thread starts with a user turn (better for some providers). */
function stripLeadingAssistant(
  messages: { role: "user" | "assistant"; content: string }[],
): { role: "user" | "assistant"; content: string }[] {
  let slice = messages;
  while (slice.length > 0 && slice[0].role === "assistant") {
    slice = slice.slice(1);
  }
  return slice;
}

export const askHelpQuestion = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      return {
        reply:
          "The AI assistant is not configured yet. Please check the help articles or contact us at businesses@joinvibo.com.",
      };
    }

    const recent = stripLeadingAssistant(args.messages.slice(-6));
    if (recent.length === 0 || recent[0].role !== "user") {
      return {
        reply:
          "Please type your question in the box below, then send it so I can help.",
      };
    }

    const model =
      process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
    const referer =
      process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://joinvibo.com";
    const title =
      process.env.OPENROUTER_APP_TITLE?.trim() || "Vibo Help Center";

    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": title,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: VIBO_SYSTEM_PROMPT },
          ...recent.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        ],
        max_tokens: 500,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("OpenRouter error:", res.status, text.slice(0, 400));
      return {
        reply:
          "Sorry, I could not process your question right now. Please try again or browse the help articles.",
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      error?: { message?: string };
    };

    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      console.error(
        "OpenRouter empty response:",
        JSON.stringify(data).slice(0, 500),
      );
      return {
        reply:
          "Sorry, I could not generate an answer for that. Please try rephrasing or browse the help articles.",
      };
    }

    return { reply: raw };
  },
});
