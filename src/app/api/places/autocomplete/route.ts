import { NextRequest, NextResponse } from "next/server";

type GooglePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
};

/**
 * Google Places Autocomplete (legacy) — server-side only; key stays off the client.
 * @see https://developers.google.com/maps/documentation/places/web-service/autocomplete
 */
export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { predictions: [], notConfigured: true as const },
      { status: 200 },
    );
  }

  const input = req.nextUrl.searchParams.get("input")?.trim() ?? "";
  if (input.length < 2) {
    return NextResponse.json({ predictions: [] });
  }
  if (input.length > 200) {
    return NextResponse.json({ predictions: [], error: "Input too long" }, { status: 400 });
  }

  const lang = req.nextUrl.searchParams.get("lang")?.trim() || "en";
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("key", key);
  url.searchParams.set("language", lang.slice(0, 5));

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      predictions?: GooglePrediction[];
      status?: string;
      error_message?: string;
    };

    if (data.status === "REQUEST_DENIED" || data.status === "INVALID_REQUEST") {
      return NextResponse.json(
        { predictions: [], error: data.error_message ?? data.status },
        { status: 502 },
      );
    }

    const predictions =
      data.predictions?.map((p) => ({
        placeId: p.place_id,
        primary: p.structured_formatting?.main_text ?? p.description,
        secondary: p.structured_formatting?.secondary_text ?? "",
      })) ?? [];

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ predictions: [], error: "Autocomplete failed" }, { status: 500 });
  }
}
