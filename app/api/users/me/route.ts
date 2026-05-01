import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, createSession, isFinanceTeamMember } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { logApiPerf } from "@/lib/api-perf";
import { logContribution } from "@/lib/contributions";
import { notifyAdminNewRegistration } from "@/lib/mail";

export async function GET() {
  const _perfStart = Date.now();
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data: user } = await supabase
      .from("users")
      .select("id, name, email, phone, address, office_address, dob, occupation, photo_url, role, status, official_type, posting_details, social_links, created_at, last_active_at, notification_prefs, location_sharing, suspension_details")
      .eq("id", session.userId)
      .single();

    // Silently update last_active_at (fire-and-forget)
    supabase
      .from("users")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", session.userId)
      .then(() => {});

    // Daily greetings run via /api/cron/daily-greetings (07:00 IST). Calling
    // them fire-and-forget here was unsafe: Vercel could terminate the lambda
    // mid-execution after the atomic claim was made, locking out the cron for
    // the rest of the day.

    // Check Finance Team membership (for UI defaults)
    const isFinance = user?.role === "admin" || user?.role === "super_admin"
      ? await isFinanceTeamMember(session.userId)
      : false;

    logApiPerf("/api/users/me", "GET", 200, _perfStart);
    return NextResponse.json({ user, is_finance_team: isFinance });
  } catch (error) {
    logApiPerf("/api/users/me", "GET", 500, _perfStart);
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/users/me", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

function validatePhone(phone: string): boolean {
  const digits = phone.replace(/[\s\-\+\(\)]/g, "");
  return /^(91)?[6-9]\d{9}$/.test(digits);
}

// Common Indian/Tamil female first names for auto-gender detection
const FEMALE_NAMES = new Set([
  "ANITHA", "ANUSHA", "ANURADHA", "ARUNA", "ARUNDHATI", "BHAVANI", "BHUVANA", "BRINDHA",
  "CHITRA", "DEEPA", "DEEPIKA", "DEVI", "DEVIKA", "DHANALAKSHMI", "DHIVYA",
  "DIVYA", "DURGA", "ESWARI", "GANGA", "GAYATHRI", "GEETHA", "GEETHALAKSHMI", "GOMATHI",
  "HEMA", "HEMALATHA", "INDIRA", "INDRANI", "JANAKI", "JAYALAKSHMI", "JAYANTHI", "JEYANTHI",
  "JOTHI", "JOTHILAKSHMI", "KALA", "KALAISELVI", "KAMALA", "KAMATCHI", "KANAGA", "KANCHANA",
  "KANNAGI", "KARPAGAM", "KAVITHA", "KAVERI", "KAVIYA", "KEERTHANA", "KOKILA", "KOMALA",
  "KUPPAMMAL", "LAKSHMI", "LALITHA", "LAVANYA", "LEELAVATHI", "LATHA", "MADHUMITHA",
  "MALATHI", "MALLIGA", "MANIMEGALAI", "MANJULA", "MEENA", "MEENAKSHI", "MENAKA", "MOHANA",
  "MUTHULAKSHMI", "NAGALAKSHMI", "NAGESWARI", "NALINI", "NANDINI", "NARMADA", "NITHYA",
  "PADMA", "PADMAVATHI", "PANKAJAM", "PARVATHI", "PONNI", "POONGODI", "POORANI", "PRABHAVATHI",
  "PRABHA", "PRAMEELA", "PREETHI", "PREMALATHA", "PRIYA", "PRIYADHARSHINI", "PUSHPA",
  "RADHA", "RAJALAKSHMI", "RAJESHWARI", "RAJATHI", "RAJI", "RAMYA", "RANI", "RANGANAYAKI",
  "RATHIKA", "RATHNA", "REVATHI", "ROHINI", "ROJA", "RUBY", "RUKMANI", "RUPA",
  "SANGEETHA", "SARADHA", "SARASWATHI", "SAROJA", "SATHYA", "SAVITHRI",
  "SELVI", "SHANTHI", "SHARMILA", "SHEELA", "SHOBHA", "SHOBANA", "SINDHUJA", "SIVAKAMI",
  "SIVA LAKSHMI", "SIVAGAMI", "SOUNDARYA", "SOWMYA", "SRIDEVI", "SRIVIDYA", "SUBHA",
  "SUBHASHINI", "SUGANYA", "SUGUNA", "SULOCHANA", "SUMATHI", "SUNDARI", "SUPRIYA",
  "SWARNALATHA", "SWATHI", "TAMILSELVI", "THANGAM", "THENMOZHI", "THILAGAVATHI",
  "THAMARAI", "UMAMAHESWARI", "UMA", "USHA", "VAANI", "VALARMATHI", "VANAJA", "VANI",
  "VASANTHI", "VASUKI", "VEDAVALLI", "VEERALAKSHMI", "VIJAYA", "VIJAYALAKSHMI", "VIMALA",
  "YAMUNA", "YASODHA",
  // Common suffixes that indicate female names
  "AMMAL", "AMMA",
]);

// Female name suffixes that are strong indicators
const FEMALE_SUFFIXES = ["LAKSHMI", "DEVI", "MATHI", "SELVI", "VALLI", "AMMAL", "RANI", "PRIYA", "NAYAKI"];

/**
 * Auto-detect gender from name and title.
 * Returns "Male", "Female", or null (unknown).
 */
function detectGender(fullName: string, existingGender?: string): string | null {
  // Don't override if already set
  if (existingGender) return null;

  const upper = fullName.toUpperCase().trim();

  // Detect from title prefix
  if (upper.startsWith("MRS.") || upper.startsWith("MISS.")) return "Female";
  if (upper.startsWith("MR.")) return "Male";

  // Extract first name (after title if present)
  const withoutTitle = upper.replace(/^(MR\.|MRS\.|MISS\.|DR\.)\s*/i, "").trim();
  const firstName = withoutTitle.split(/\s+/)[0];

  if (!firstName) return null;

  // Direct match
  if (FEMALE_NAMES.has(firstName)) return "Female";

  // Check female suffixes (e.g., JAYALAKSHMI, TAMILSELVI, PADMAVALLI)
  for (const suffix of FEMALE_SUFFIXES) {
    if (firstName.endsWith(suffix) && firstName.length > suffix.length) return "Female";
  }

  return null;
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const supabase = getServiceClient();

    // Server-side mandatory field validation
    const name = typeof body.name === "string" ? body.name.trim().toUpperCase() : "";
    // Normalize phone: strip +91/91 prefix, spaces, dashes → 10 digits
    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
    const phone = rawPhone.replace(/[\s\-\+\(\)]/g, "").replace(/^91/, "").slice(-10);
    const occupation = typeof body.occupation === "string" ? body.occupation.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }
    if (!validatePhone(phone)) {
      return NextResponse.json({ error: "Enter a valid Indian mobile number (10 digits starting with 6-9)" }, { status: 400 });
    }
    if (!occupation) {
      return NextResponse.json({ error: "Designation is required" }, { status: 400 });
    }

    // Duplicate phone check (exclude current user, and exempt super_admin / sivikoomba)
    const PHONE_CHECK_EXEMPT_EMAILS = ["tanhowaadmin@tanhowa.in", "sivikoomba@gmail.com"];
    if (!PHONE_CHECK_EXEMPT_EMAILS.includes(session.email)) {
      const { data: existingPhone } = await supabase
        .from("users")
        .select("id")
        .eq("phone", phone)
        .neq("id", session.userId)
        .limit(1)
        .maybeSingle();

      if (existingPhone) {
        return NextResponse.json({ error: "This phone number is already registered with another account" }, { status: 400 });
      }
    }

    // DOB validation (if provided)
    const dob = body.dob || null;
    if (dob) {
      const dobDate = new Date(dob);
      const now = new Date();
      const age = now.getFullYear() - dobDate.getFullYear();
      if (dobDate > now || age > 100 || age < 18) {
        return NextResponse.json({ error: "Date of birth must be between 18 and 100 years" }, { status: 400 });
      }
    }

    // Auto-detect gender from name/title if not already set
    const finalSocialLinks = body.social_links || {};
    const detectedGender = detectGender(name, finalSocialLinks.gender);
    if (detectedGender) {
      finalSocialLinks.gender = detectedGender;
      // Also auto-set title if missing
      if (!finalSocialLinks.title) {
        if (detectedGender === "Female") finalSocialLinks.title = "Mrs.";
        if (detectedGender === "Male") finalSocialLinks.title = "Mr.";
      }
    }

    // Check if this is a first-time onboarding (pending user with no name yet)
    const { data: currentUser } = await supabase
      .from("users")
      .select("name, status, role")
      .eq("id", session.userId)
      .single();
    const isFirstOnboarding = currentUser && !currentUser.name && currentUser.status === "pending";

    // Check if mandatory fields are filled for auto-approval
    const hasMandatoryFields = !!(
      name &&
      phone &&
      dob &&
      occupation &&
      (body.office_address || "").trim() &&
      finalSocialLinks.gender &&
      finalSocialLinks.qualification
    );

    // Auto-approve: admins always, pending members when all mandatory fields are filled
    const shouldAutoApprove = currentUser && currentUser.status !== "approved" && (
      currentUser.role === "super_admin" ||
      currentUser.role === "admin" ||
      hasMandatoryFields
    );

    const updateData: Record<string, unknown> = {
      name,
      phone,
      address: body.address || "",
      office_address: body.office_address || "",
      dob,
      occupation,
      photo_url: body.photo_url || "",
      social_links: finalSocialLinks,
      posting_details: body.posting_details || {},
      profile_nudge: null,
    };

    if (shouldAutoApprove) {
      updateData.status = "approved";
    }

    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", session.userId);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/users/me", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
    }

    // Notify admins when a new member completes onboarding
    if (isFirstOnboarding) {
      notifyAdminNewRegistration(name, session.email).catch(() => {});
    }

    logContribution(session.userId, "profile_updated", "Updated profile");

    // Refresh session cookie with approved status so client redirects to dashboard
    if (shouldAutoApprove) {
      await createSession({
        userId: session.userId,
        email: session.email,
        role: currentUser.role,
        status: "approved",
      });
    }

    return NextResponse.json({ message: "Profile updated", autoApproved: !!shouldAutoApprove });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/users/me", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
