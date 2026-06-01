import HolidaysClass from "date-holidays";
import type { Holiday } from "@/types/backstage";

// `date-holidays` ships ~110 countries with public, religious, and observance
// holidays. No API calls, all bundled. We initialise a Holidays instance per
// country code on demand and cache them for the process lifetime since they
// hold compiled rules.
const cache = new Map<string, InstanceType<typeof HolidaysClass>>();

function getHolidaysInstance(countryCode: string): InstanceType<typeof HolidaysClass> {
  const cc = countryCode.toUpperCase();
  let inst = cache.get(cc);
  if (!inst) {
    inst = new HolidaysClass(cc);
    // Always surface holiday names in English (e.g. Pakistan ships Urdu names by
    // default: "یومِ تکبیر" → "Youm-e-Takbeer"). `date-holidays` falls back to its
    // available languages, so this is a no-op where English isn't translated.
    inst.setLanguages("en");
    cache.set(cc, inst);
  }
  return inst;
}

const RELEVANT_TYPES = new Set(["public", "bank", "school", "religious", "observance"]);

// Returns holidays for the country between fromDate and toDate (inclusive).
// Filters to types we want to surface in the team availability calendar —
// "public" + "bank" always, plus "religious" + "observance" which matter for
// PK/IN/IL/etc.
export function getHolidaysForCountry(
  countryCode: string,
  fromDate: Date,
  toDate: Date,
): Holiday[] {
  const hd = getHolidaysInstance(countryCode);
  const fromYear = fromDate.getUTCFullYear();
  const toYear = toDate.getUTCFullYear();
  const out: Holiday[] = [];

  for (let year = fromYear; year <= toYear; year++) {
    const yearHolidays = hd.getHolidays(year) as Array<{
      date: string;
      name: string;
      type: string;
      start: Date;
      end: Date;
    }>;
    for (const h of yearHolidays) {
      if (!RELEVANT_TYPES.has(h.type)) continue;
      // `h.date` is the holiday's LOCAL calendar date ("YYYY-MM-DD HH:mm:ss" in the
      // country's own timezone). We must take that date string directly — converting
      // `h.start` (a JS Date) through UTC shifts the day backwards for any country
      // ahead of UTC (e.g. Pakistan +5, UK in BST +1), which previously rendered
      // every holiday one day early.
      const isoDate = h.date.slice(0, 10);
      const hDate = new Date(`${isoDate}T00:00:00Z`);
      if (hDate < fromDate || hDate > toDate) continue;
      out.push({
        date: isoDate,
        name: h.name,
        type: h.type,
        country: countryCode.toUpperCase(),
      });
    }
  }

  // Sort by date asc, dedupe (some countries duplicate religious + public on the same day).
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.filter((h, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    return !(prev.date === h.date && prev.name === h.name);
  });
}

// True when the given calendar date is a non-working day in the given country
// (weekend OR a holiday from RELEVANT_TYPES). Used by leave length calculation
// to exclude weekends + holidays from `workingDays`.
export function isNonWorkingDay(date: Date, countryCode: string): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return true; // Sun, Sat
  const iso = date.toISOString().slice(0, 10);
  const yearHolidays = getHolidaysForCountry(
    countryCode,
    new Date(`${iso}T00:00:00Z`),
    new Date(`${iso}T23:59:59Z`),
  );
  return yearHolidays.some((h) => h.date === iso && (h.type === "public" || h.type === "bank"));
}
