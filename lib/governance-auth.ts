import { NextResponse } from "next/server";
import { getSession, getOfficialInfo } from "@/lib/auth";

/**
 * Governance gate — meetings/AGM management is restricted to super-admins and
 * state officials (same tier as resolutions/elections). Returns the caller's
 * userId on success, or a ready-to-return NextResponse on failure.
 */
export async function governanceGate(): Promise<
  { ok: true; userId: string } | { ok: false; res: NextResponse }
> {
  const session = await getSession();
  if (!session) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const info = await getOfficialInfo(session.userId);
  if (info.role !== "super_admin" && info.official_type !== "state") {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: session.userId };
}
