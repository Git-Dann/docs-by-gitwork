// The brief hero painting — Dia anchors each day's brief on a classic painting.
// We keep that (approved), warmed to Foundry type. These are public-domain works
// served from Wikimedia Commons via the stable `Special:FilePath` redirect (it
// resolves a filename → the current file, and `?width=` returns a sized JPEG).
//
// The pick is DETERMINISTIC per calendar day (so a given day always shows the same
// painting, and it rotates as the days do) — matching Dia's "one painting per brief".
//
// Robustness: if the remote image fails (offline, CSP, a renamed file), the hero
// falls back to a blue→navy gradient (see MorningBrief). To pin specific art, drop
// files into `public/brief/` and point `src` at `/brief/<name>.jpg` instead.

export interface Painting {
  /** Exact Wikimedia Commons file name (underscores or spaces both resolve). */
  file: string;
  title: string;
  artist: string;
  year: string;
}

/** Curated landscapes/seascapes — calm, wide, brief-appropriate. Edit freely. */
const PAINTINGS: Painting[] = [
  {
    file: "Albert_Bierstadt_-_Among_the_Sierra_Nevada,_California_-_Google_Art_Project.jpg",
    title: "Among the Sierra Nevada, California",
    artist: "Albert Bierstadt",
    year: "1868",
  },
  {
    file: "Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg",
    title: "Wanderer above the Sea of Fog",
    artist: "Caspar David Friedrich",
    year: "1818",
  },
  {
    file: "Vincent_van_Gogh_-_Wheatfield_with_crows_-_Google_Art_Project.jpg",
    title: "Wheatfield with Crows",
    artist: "Vincent van Gogh",
    year: "1890",
  },
  {
    file: "Claude_Monet_-_Impression,_Sunrise.jpg",
    title: "Impression, Sunrise",
    artist: "Claude Monet",
    year: "1872",
  },
  {
    file: "Tsunami_by_hokusai_19th_century.jpg",
    title: "The Great Wave off Kanagawa",
    artist: "Katsushika Hokusai",
    year: "1831",
  },
  {
    file: "JMW_Turner_-_The_Fighting_Temeraire.jpg",
    title: "The Fighting Temeraire",
    artist: "J. M. W. Turner",
    year: "1839",
  },
  {
    file: "Ivan_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg",
    title: "The Ninth Wave",
    artist: "Ivan Aivazovsky",
    year: "1850",
  },
];

/** Days since the Unix epoch in the local timezone — a stable per-day index. */
function dayNumber(d: Date): number {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

/** Wikimedia file → a sized, stable image URL. */
function fileUrl(file: string, width = 1400): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

/** The painting for a given day: deterministic pick + a formatted caption. */
export function paintingForDate(d: Date, width = 1400): { src: string; caption: string } {
  const p = PAINTINGS[((dayNumber(d) % PAINTINGS.length) + PAINTINGS.length) % PAINTINGS.length];
  return {
    src: fileUrl(p.file, width),
    caption: `${p.title}, ${p.artist}, ${p.year}`,
  };
}
