/** How many course requests are in each status: what the wiki's dashboard card shows. Pure. */
export interface CourseRequestCounts {
  NEW: number;
  SENT: number;
  ADDED: number;
  REJECTED: number;
  total: number;
}

type CountedStatus = Exclude<keyof CourseRequestCounts, "total">;

export function countCourseRequests(rows: ReadonlyArray<{ status: string }>): CourseRequestCounts {
  const out: CourseRequestCounts = { NEW: 0, SENT: 0, ADDED: 0, REJECTED: 0, total: rows.length };
  for (const r of rows) if (r.status in out && r.status !== "total") out[r.status as CountedStatus]++;
  return out;
}
