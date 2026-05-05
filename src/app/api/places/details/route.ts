import { NextRequest, NextResponse } from "next/server";

/**
 * Google Place Details (legacy) — lat/lng + display name for a `place_id`.
 * @see https://developers.google.com/maps/documentation/places/web-service/details
 */
export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const placeId = req.nextUrl.searchParams.get("placeId")?.trim() ?? "";
  if (!placeId || placeId.length > 512) {
    return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key", key);
  url.searchParams.set(
    "fields",
    "place_id,name,formatted_address,geometry/location",
  );

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      status?: string;
      error_message?: string;
      result?: {
        place_id?: string;
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
      };
    };

    if (data.status !== "OK" || !data.result?.geometry?.location) {
      return NextResponse.json(
        { error: data.error_message ?? data.status ?? "NOT_FOUND" },
        { status: 404 },
      );
    }

    const r = data.result;
    const loc = r.geometry!.location!;
    const name = (r.name ?? r.formatted_address ?? "").trim();
    return NextResponse.json({
      placeId: r.place_id ?? placeId,
      name,
      formattedAddress: r.formatted_address?.trim() ?? name,
      lat: loc.lat,
      lng: loc.lng,
    });
  } catch {
    return NextResponse.json({ error: "Details failed" }, { status: 500 });
  }
}
