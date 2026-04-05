import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getGemini } from "@/lib/gemini";
import { logError } from "@/lib/error-logger";
import { createRateLimiter } from "@/lib/rate-limit";

const uploadLimiter = createRateLimiter(10);

async function validatePortraitPhoto(buffer: Buffer, mimeType: string): Promise<{ valid: boolean; reason: string }> {
  try {
    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType,
        },
      },
      {
        text: `Analyze this image and determine if it is a valid passport-style portrait photo of a single person.

Return ONLY a JSON object: {"valid": true/false, "reason": "string"}

Rules:
- VALID: Clear photo of a single person's face/upper body (passport style, ID photo, selfie showing face clearly, formal photo). Must be ONE single photo.
- INVALID: Group photos (multiple people), landscapes, nature, animals, objects, logos, text/documents, blurry/unclear faces, cartoons, memes
- INVALID: Collage or multiple photos stitched together, screenshot containing multiple images, photo grid
- INVALID: Full body photos where face is too small, photos taken from far away
- A photo showing one person clearly (even if not perfect studio quality) is VALID
- If invalid, explain briefly in "reason" (e.g., "This appears to be a group photo", "Multiple photos detected — please upload a single photo")`,
      },
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { valid: true, reason: "" }; // Default to valid if parsing fails

    const parsed = JSON.parse(jsonMatch[0]);
    return { valid: !!parsed.valid, reason: parsed.reason || "" };
  } catch {
    // If AI validation fails, allow the upload (don't block on AI errors)
    return { valid: true, reason: "" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!uploadLimiter.check(ip)) {
      return NextResponse.json({ error: "Too many uploads. Please wait." }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, and WebP images are allowed" }, { status: 400 });
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 2MB" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // AI validation: check if it's a clear portrait photo
    const validation = await validatePortraitPhoto(buffer, file.type);
    if (!validation.valid) {
      return NextResponse.json({
        error: `Please upload a clear photo of yourself. ${validation.reason}`,
        validation_failed: true,
      }, { status: 400 });
    }

    const supabase = getServiceClient();
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const fileName = `${session.userId}.${ext}`;

    // Upload to Supabase Storage
    let { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    // Auto-create bucket if it doesn't exist
    if (uploadError?.message?.includes("Bucket not found")) {
      await supabase.storage.createBucket("avatars", { public: true });
      const retry = await supabase.storage
        .from("avatars")
        .upload(fileName, buffer, {
          contentType: file.type,
          upsert: true,
        });
      uploadError = retry.error;
    }

    if (uploadError) {
      await logError({ type: "api", message: uploadError.message, path: "/api/upload/avatar", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(fileName);

    const photoUrl = urlData.publicUrl;

    // Update user's photo_url
    await supabase
      .from("users")
      .update({ photo_url: photoUrl })
      .eq("id", session.userId);

    return NextResponse.json({ photo_url: photoUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/upload/avatar", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
