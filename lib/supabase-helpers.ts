// Fetch every row of a query, paging past PostgREST's default 1000-row cap.
// Pass a builder that applies .range(from, to) to your select() query.
// Used wherever we count or sum rows client-side and the table can exceed 1000 rows
// (e.g. subscription / task stats) — otherwise totals silently truncate at 1000.
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Hard stop well above any realistic table size for this app.
  for (let guard = 0; guard < 1000; guard++) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
