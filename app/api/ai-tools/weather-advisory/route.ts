import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { logContribution } from "@/lib/contributions";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter(10);

const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

// Approximate coordinates for TN districts
const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  "Ariyalur": { lat: 11.14, lng: 79.08 },
  "Chengalpattu": { lat: 12.69, lng: 79.98 },
  "Chennai": { lat: 13.08, lng: 80.27 },
  "Coimbatore": { lat: 11.01, lng: 76.96 },
  "Cuddalore": { lat: 11.75, lng: 79.77 },
  "Dharmapuri": { lat: 12.13, lng: 78.16 },
  "Dindigul": { lat: 10.37, lng: 77.97 },
  "Erode": { lat: 11.34, lng: 77.73 },
  "Kallakurichi": { lat: 11.74, lng: 78.96 },
  "Kancheepuram": { lat: 12.83, lng: 79.70 },
  "Kanyakumari": { lat: 8.08, lng: 77.54 },
  "Karur": { lat: 10.96, lng: 78.08 },
  "Krishnagiri": { lat: 12.52, lng: 78.21 },
  "Madurai": { lat: 9.92, lng: 78.12 },
  "Mayiladuthurai": { lat: 11.10, lng: 79.65 },
  "Nagapattinam": { lat: 10.77, lng: 79.84 },
  "Namakkal": { lat: 11.22, lng: 78.17 },
  "Nilgiris": { lat: 11.41, lng: 76.69 },
  "Perambalur": { lat: 11.23, lng: 78.88 },
  "Pudukkottai": { lat: 10.38, lng: 78.82 },
  "Ramanathapuram": { lat: 9.37, lng: 78.83 },
  "Ranipet": { lat: 12.93, lng: 79.33 },
  "Salem": { lat: 11.66, lng: 78.15 },
  "Sivaganga": { lat: 10.0, lng: 78.48 },
  "Tenkasi": { lat: 8.96, lng: 77.32 },
  "Thanjavur": { lat: 10.79, lng: 79.14 },
  "Theni": { lat: 10.01, lng: 77.48 },
  "Thoothukudi": { lat: 8.76, lng: 78.13 },
  "Tiruchirappalli": { lat: 10.79, lng: 78.69 },
  "Tirunelveli": { lat: 8.73, lng: 77.70 },
  "Tirupathur": { lat: 12.49, lng: 78.57 },
  "Tiruppur": { lat: 11.11, lng: 77.35 },
  "Tiruvallur": { lat: 13.14, lng: 79.91 },
  "Tiruvannamalai": { lat: 12.23, lng: 79.07 },
  "Tiruvarur": { lat: 10.77, lng: 79.64 },
  "Vellore": { lat: 12.92, lng: 79.13 },
  "Viluppuram": { lat: 11.94, lng: 79.49 },
  "Virudhunagar": { lat: 9.59, lng: 77.96 },
};

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!limiter.check(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }

    const { district, block, place } = await req.json();
    if (!district || typeof district !== "string") {
      return NextResponse.json({ error: "District is required" }, { status: 400 });
    }

    const coords = DISTRICT_COORDS[district];
    if (!coords) {
      return NextResponse.json({ error: "Unknown district" }, { status: 400 });
    }

    // Fetch weather from Open-Meteo (free, no API key needed)
    const weatherUrl = `${WEATHER_API}?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Asia/Kolkata&forecast_days=3`;
    const weatherRes = await fetch(weatherUrl);
    const weatherData = await weatherRes.json();

    const current = weatherData.current || {};
    const daily = weatherData.daily || {};

    const locationLabel = `${district}${block ? `, ${block} block` : ""}${place ? ` (${place})` : ""}`;
    const weatherSummary = `Location: ${locationLabel}
Current Temperature: ${current.temperature_2m || "N/A"}°C
Humidity: ${current.relative_humidity_2m || "N/A"}%
Wind Speed: ${current.wind_speed_10m || "N/A"} km/h
Precipitation: ${current.precipitation || 0} mm

3-Day Forecast:
${(daily.time || []).map((date: string, i: number) => `${date}: ${daily.temperature_2m_min?.[i] || "?"}°C - ${daily.temperature_2m_max?.[i] || "?"}°C, Rain: ${daily.precipitation_sum?.[i] || 0}mm (${daily.precipitation_probability_max?.[i] || 0}% chance)`).join("\n")}`;

    // Get AI advisory based on weather
    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      {
        text: `You are a senior agricultural meteorologist advising horticultural officers in Tamil Nadu, India.

Based on the following weather data for ${locationLabel}, provide practical agriculture advisory:

${weatherSummary}

Today's date: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
${block ? `\nBlock: ${block} — provide block-specific advice considering local terrain and crops grown in this block.` : ""}
${place ? `\nPlace of interest: ${place} — include specific advice relevant to this location (if it's a horticulture farm, include nursery/plantation advice).` : ""}

Provide advice on:
1. **Irrigation** — when and how much to water based on current conditions
2. **Crop Protection** — pest/disease risks due to weather (humidity, rain)
3. **Field Operations** — recommended activities (spraying, harvesting, planting)
4. **Precautions** — weather warnings and protective measures
5. **Seasonal Tips** — what to plant/prepare for in the coming days
${block ? "6. **Block-specific** — crops and horticulture activities specific to this block" : ""}

Keep it practical, specific to ${district}'s agro-climatic zone${block ? ` and ${block} block` : ""}, and useful for ADHs and HOs. Use bullet points. Keep it concise (under 400 words).`,
      },
    ]);

    const advisory = result.response.text().trim();
    logContribution(session.userId, "used_ai_weather_advisory");

    return NextResponse.json({ weather: weatherSummary, advisory });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/ai-tools/weather-advisory", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to get weather advisory" }, { status: 500 });
  }
}
