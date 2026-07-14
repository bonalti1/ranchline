import { analyzeLand } from "@/lib/land-analysis";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { latitude?: number; longitude?: number; parcelId?: string };
    const analysis = await analyzeLand({
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      parcelId: body.parcelId,
    });
    return Response.json(analysis, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to analyze land." },
      { status: 400 },
    );
  }
}
