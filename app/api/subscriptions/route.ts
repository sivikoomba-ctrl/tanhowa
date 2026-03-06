import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin, getDbRole } from "@/lib/auth";
import { logError } from "@/lib/error-logger";
import { getSQL } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = getSQL();
    const url = new URL(req.url);
    const period = url.searchParams.get("period");
    const status = url.searchParams.get("status");

    const dbRole = await getDbRole(session.userId);
    if (dbRole === "admin") {
      // Admin: get all subscriptions with user info
      const subscriptions = period && status && status !== "all"
        ? await sql`
            SELECT s.*, json_build_object('name', u.name, 'email', u.email, 'phone', u.phone) as users
            FROM subscriptions s LEFT JOIN users u ON s.user_id = u.id
            WHERE s.period = ${period} AND s.status = ${status}
            ORDER BY s.created_at DESC`
        : period
        ? await sql`
            SELECT s.*, json_build_object('name', u.name, 'email', u.email, 'phone', u.phone) as users
            FROM subscriptions s LEFT JOIN users u ON s.user_id = u.id
            WHERE s.period = ${period}
            ORDER BY s.created_at DESC`
        : status && status !== "all"
        ? await sql`
            SELECT s.*, json_build_object('name', u.name, 'email', u.email, 'phone', u.phone) as users
            FROM subscriptions s LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = ${status}
            ORDER BY s.created_at DESC`
        : await sql`
            SELECT s.*, json_build_object('name', u.name, 'email', u.email, 'phone', u.phone) as users
            FROM subscriptions s LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC`;

      // Summary stats
      const [statsRows, totalRows] = await Promise.all([
        sql`SELECT status, COUNT(*)::int as count FROM subscriptions GROUP BY status`,
        sql`SELECT COALESCE(SUM(amount), 0)::float as total FROM subscriptions WHERE status = 'paid'`,
      ]);

      const statsMap: Record<string, number> = {};
      for (const row of statsRows) statsMap[row.status] = row.count;

      return NextResponse.json({
        subscriptions,
        stats: {
          paid: statsMap.paid || 0,
          pending: statsMap.pending || 0,
          overdue: statsMap.overdue || 0,
          totalCollected: totalRows[0]?.total || 0,
        },
      });
    } else {
      // Member: get own subscriptions
      const subscriptions = await sql`
        SELECT * FROM subscriptions WHERE user_id = ${session.userId} ORDER BY created_at DESC`;

      return NextResponse.json({ subscriptions });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    const sql = getSQL();
    const body = await req.json();

    if (body.action === "bulk-create") {
      const amount = parseFloat(body.amount) || 0;
      const period = body.period;
      const dueDate = body.due_date || null;

      // Insert subscriptions for all approved members who don't already have one for this period
      const result = await sql`
        INSERT INTO subscriptions (user_id, period, amount, due_date, status)
        SELECT u.id, ${period}, ${amount}, ${dueDate}::timestamptz, 'pending'
        FROM users u
        WHERE u.status = 'approved'
          AND NOT EXISTS (
            SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.period = ${period}
          )`;

      const count = result.count;

      if (count === 0) {
        return NextResponse.json({ error: "All members already have subscriptions for this period (or no approved members found)" }, { status: 400 });
      }

      return NextResponse.json({ message: `Created ${count} subscriptions`, count });
    } else {
      // Create single subscription
      const rows = await sql`
        INSERT INTO subscriptions (user_id, period, amount, due_date, status)
        VALUES (${body.user_id}, ${body.period}, ${body.amount || 0}, ${body.due_date || null}::timestamptz, 'pending')
        RETURNING *`;

      return NextResponse.json({ subscription: rows[0] });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = getSQL();
    const body = await req.json();
    const now = new Date().toISOString();

    // Members can only update their own subscription's payment details
    const putRole = await getDbRole(session.userId);
    if (putRole !== "admin") {
      const subRows = await sql`SELECT user_id FROM subscriptions WHERE id = ${body.id}`;
      if (!subRows.length || subRows[0].user_id !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await sql`
        UPDATE subscriptions SET
          payment_method = COALESCE(${body.payment_method ?? null}, payment_method),
          transaction_id = COALESCE(${body.transaction_id ?? null}, transaction_id),
          remarks = COALESCE(${body.remarks ?? null}, remarks),
          payment_proof_url = COALESCE(${body.payment_proof_url ?? null}, payment_proof_url),
          updated_at = ${now}
        WHERE id = ${body.id}`;

      return NextResponse.json({ message: "Updated" });
    }

    // Admin can update everything
    const paidAt = body.status === "paid" ? now : null;

    await sql`
      UPDATE subscriptions SET
        status = COALESCE(${body.status ?? null}, status),
        amount = COALESCE(${body.amount !== undefined ? body.amount : null}, amount),
        payment_method = COALESCE(${body.payment_method ?? null}, payment_method),
        transaction_id = COALESCE(${body.transaction_id ?? null}, transaction_id),
        remarks = COALESCE(${body.remarks ?? null}, remarks),
        payment_proof_url = COALESCE(${body.payment_proof_url ?? null}, payment_proof_url),
        paid_at = COALESCE(${paidAt}, paid_at),
        updated_at = ${now}
      WHERE id = ${body.id}`;

    return NextResponse.json({ message: "Updated" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !(await isAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const sql = getSQL();
    await sql`DELETE FROM subscriptions WHERE id = ${id}`;

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, stack: error instanceof Error ? error.stack : "", path: "/api/subscriptions", method: "DELETE", status_code: 500 });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
