import { NextRequest, NextResponse } from "next/server";
import { api, createConvexHttpClient, getConvexDeploymentUrl } from "@/lib/convexServer";

const isDev = process.env.NODE_ENV === "development";

function maskEmail(e: string): string {
  const [a, b] = e.split("@");
  if (!b) return "***";
  const head = a.length <= 2 ? "*" : `${a.slice(0, 2)}…`;
  return `${head}@${b}`;
}

function convexUrlHostForLog(): string | null {
  const url = getConvexDeploymentUrl();
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** ConvexHttpClient throws `Error` or `ConvexError` (has `.data`). */
function extractClientError(err: unknown): {
  message: string;
  data?: unknown;
  name?: string;
} {
  if (err instanceof Error) {
    const withData = err as Error & { data?: unknown; name?: string };
    return {
      message: err.message || "Unknown error",
      data: withData.data,
      name: withData.name,
    };
  }
  return { message: typeof err === "string" ? err : "Convex action failed" };
}

export async function POST(request: NextRequest) {
  const convexHost = convexUrlHostForLog();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const preferredLang =
      typeof body.preferredLang === "string" && body.preferredLang.trim()
        ? body.preferredLang.trim()
        : undefined;

    console.log("[signup/send-code] POST", {
      email: maskEmail(email),
      preferredLang: preferredLang ?? "(default)",
      convexHostname: convexHost ?? "(missing)",
      hasConvexUrl: Boolean(getConvexDeploymentUrl()),
    });

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields",
          details: { field: "email" },
        },
        { status: 400 },
      );
    }

    let client;
    try {
      client = createConvexHttpClient();
    } catch (e) {
      console.error("[signup/send-code] ConvexHttpClient init failed (full):", e);
      if (e instanceof Error) {
        console.error("[signup/send-code] init message:", e.message);
      }
      return NextResponse.json(
        {
          success: false,
          error:
            "Server misconfigured: add NEXT_PUBLIC_CONVEX_URL to .env.local and restart the dev server.",
          details: { step: "convex_client_init" },
        },
        { status: 500 },
      );
    }

    const actionRef = api.auth.sendEmailOtp;
    const actionArgs = { email, lang: preferredLang };

    if (isDev) {
      console.log("[signup/send-code] calling Convex action", {
        path: "auth:sendEmailOtp",
        argsKeys: Object.keys(actionArgs),
      });
    }

    const result = (await client.action(actionRef, actionArgs)) as {
      resendInSeconds: number;
      emailSent: boolean;
    };

    console.log("[signup/send-code] Convex success", {
      email: maskEmail(email),
      resendInSeconds: result.resendInSeconds,
      emailSent: result.emailSent,
    });

    return NextResponse.json({
      success: true,
      emailSent: result.emailSent,
      resendInSeconds: result.resendInSeconds,
    });
  } catch (err: unknown) {
    const extracted = extractClientError(err);

    console.error("[signup/send-code] Convex action failed (full object):", err);
    console.error("[signup/send-code] message:", extracted.message);
    if (extracted.data !== undefined) {
      console.error("[signup/send-code] error.data:", extracted.data);
    }
    if (isDev && err instanceof Error && err.stack) {
      console.error("[signup/send-code] stack:", err.stack);
    }

    const lower = extracted.message.toLowerCase();
    const status =
      lower.includes("already") || lower.includes("taken") || lower.includes("registered")
        ? 409
        : 400;

    const details: Record<string, unknown> = {
      convexHostname: convexHost,
      errorName: extracted.name,
    };
    if (extracted.data !== undefined) {
      details.convexErrorData = extracted.data;
    }

    return NextResponse.json(
      {
        success: false,
        error: extracted.message,
        details,
      },
      { status },
    );
  }
}
