import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getSQL() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    sql = postgres(url, { ssl: "require", max: 1 });
  }
  return sql;
}
