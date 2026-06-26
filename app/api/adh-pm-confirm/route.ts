/**
 * One-click ADH(PM) self-confirmation from a nudge email — no login required.
 *
 * GET /api/adh-pm-confirm?t=<jwt>&a=yes|no
 *   a=yes -> set occupation to "Assistant Director of Horticulture (PM)"
 *   a=no  -> set social_links.adh_pm_optout = true so future runs skip them
 *
 * Token: HS256 JWT with { userId, purpose: "adh_pm" }, minted by the nudge script.
 * Returns a styled HTML confirmation page (this link opens directly in a browser).
 */
import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-secret";
import { getServiceClient } from "@/lib/supabase";

const ADH_PM = "Assistant Director of Horticulture (PM)";

function page(title: string, message: string, ok = true): Response {
  const accent = ok ? "#2d6a4f" : "#b45309";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>TANHOWA</title></head>
<body style="margin:0;font-family:Poppins,Arial,sans-serif;background:#f5f9f6;color:#1f2937">
<div style="max-width:520px;margin:48px auto;padding:0 16px">
  <div style="background:${accent};color:#fff;padding:20px 24px;border-radius:14px 14px 0 0">
    <h2 style="margin:0;font-size:18px">TANHOWA</h2>
    <p style="margin:4px 0 0;font-size:12px;opacity:.85">Tamil Nadu Horticultural Officers Welfare Association</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px 24px;border-radius:0 0 14px 14px">
    <h3 style="margin:0 0 10px;color:${accent}">${title}</h3>
    <p style="margin:0 0 20px;line-height:1.6">${message}</p>
    <a href="https://www.tanhowa.in/dashboard/profile" style="background:${accent};color:#fff;text-decoration:none;padding:11px 24px;border-radius:10px;font-weight:600;display:inline-block">Go to My Profile</a>
  </div>
</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") || "";
  const action = req.nextUrl.searchParams.get("a") || "";

  if (action !== "yes" && action !== "no") {
    return page("Invalid link", "This confirmation link is malformed. Please use the buttons in the email we sent you.", false);
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    if ((payload as { purpose?: string }).purpose !== "adh_pm") throw new Error("bad purpose");
    if (typeof (payload as { userId?: string }).userId !== "string") throw new Error("no user");
    userId = (payload as { userId: string }).userId;
  } catch {
    return page("Link expired", "This confirmation link is invalid or has expired. If you still need to update your designation, you can do it anytime on your profile page.", false);
  }

  const supabase = getServiceClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, name, occupation, social_links")
    .eq("id", userId)
    .single();

  if (!user) {
    return page("Account not found", "We couldn't find your membership record. Please contact the TANHOWA admin.", false);
  }

  if (action === "yes") {
    await supabase.from("users").update({ occupation: ADH_PM }).eq("id", userId);
    return page(
      "Thank you — updated! / நன்றி!",
      "Your designation has been set to <b>Assistant Director of Horticulture (PM)</b>.<br/><br/>உங்கள் பதவி <b>Assistant Director of Horticulture (PM)</b> எனப் புதுப்பிக்கப்பட்டது.",
    );
  }

  // action === "no" — record opt-out
  const social = (user.social_links && typeof user.social_links === "object") ? user.social_links : {};
  await supabase
    .from("users")
    .update({ social_links: { ...social, adh_pm_optout: true } })
    .eq("id", userId);
  return page(
    "Noted — thank you / நன்றி",
    "Thanks for confirming. We won't ask you about this again.<br/><br/>உறுதிப்படுத்தியதற்கு நன்றி. இது குறித்து மீண்டும் கேட்க மாட்டோம்.",
  );
}
