import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

export async function POST() {
  try {
    await deleteSession();
    return NextResponse.json({ message: "Logged out" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/auth/logout", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }
}
