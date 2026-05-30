import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSQL } from "@/lib/db";

// Temporary endpoint — delete after schema export. Super-admin only.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.email !== "tanhowa19791@gmail.com") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sql = getSQL();

  const [tables, columns, constraints, fks, indexes, policies] = await Promise.all([
    sql`SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    sql`SELECT table_name, column_name, data_type, udt_name, character_maximum_length,
               is_nullable, column_default, is_identity, identity_generation, ordinal_position
        FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    sql`SELECT tc.constraint_name, tc.table_name, tc.constraint_type, kcu.column_name, kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
        ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position`,
    sql`SELECT tc.constraint_name, tc.table_name, kcu.column_name,
               ccu.table_name AS ref_table, ccu.column_name AS ref_column, rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_name`,
    sql`SELECT indexname, tablename, indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname NOT IN (
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public' AND constraint_type IN ('PRIMARY KEY','UNIQUE'))
        ORDER BY tablename, indexname`,
    sql`SELECT tablename, policyname, cmd, qual, with_check, roles, relrowsecurity
        FROM pg_policies p
        JOIN pg_class c ON c.relname = p.tablename AND c.relnamespace = 'public'::regnamespace
        WHERE schemaname = 'public' ORDER BY tablename, policyname`,
  ]);

  return NextResponse.json({ tables, columns, constraints, fks, indexes, policies });
}
