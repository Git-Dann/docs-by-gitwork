// The brief hero painting — Dia anchors each day's brief on a classic painting.
// We keep that (approved), warmed to Foundry type. These are public-domain works
// hotlinked from Wikimedia Commons via DIRECT `upload.wikimedia.org` thumbnail URLs
// (verified to resolve — no `Special:FilePath` redirect, which 404s on any name
// mismatch). The pick is DETERMINISTIC per calendar day, matching Dia's "one
// painting per brief".
//
// Robustness: if an image ever fails (offline, a renamed file), the hero falls back
// to a blue→navy gradient (see MorningBrief). To pin exact art or drop the remote
// dependency entirely, put files in `public/brief/` and point `src` at `/brief/…`.

export interface Painting {
  /** Direct, verified upload.wikimedia.org URL (already sized). */
  src: string;
  title: string;
  artist: string;
  year: string;
}

/** Curated landscapes/seascapes — calm, wide, brief-appropriate. Edit freely. */
const PAINTINGS: Painting[] = [
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Albert_Bierstadt_-_Among_the_Sierra_Nevada%2C_California_-_Google_Art_Project.jpg/1920px-Albert_Bierstadt_-_Among_the_Sierra_Nevada%2C_California_-_Google_Art_Project.jpg",
    title: "Among the Sierra Nevada, California",
    artist: "Albert Bierstadt",
    year: "1868",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg/1920px-Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg",
    title: "Wanderer above the Sea of Fog",
    artist: "Caspar David Friedrich",
    year: "1818",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Vincent_van_Gogh_-_Wheatfield_with_crows_-_Google_Art_Project.jpg/1920px-Vincent_van_Gogh_-_Wheatfield_with_crows_-_Google_Art_Project.jpg",
    title: "Wheatfield with Crows",
    artist: "Vincent van Gogh",
    year: "1890",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/5/54/Claude_Monet%2C_Impression%2C_soleil_levant.jpg",
    title: "Impression, Sunrise",
    artist: "Claude Monet",
    year: "1872",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/The_Great_Wave_off_Kanagawa.jpg/1920px-The_Great_Wave_off_Kanagawa.jpg",
    title: "The Great Wave off Kanagawa",
    artist: "Katsushika Hokusai",
    year: "1831",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/The_Fighting_Temeraire%2C_JMW_Turner%2C_National_Gallery.jpg/1920px-The_Fighting_Temeraire%2C_JMW_Turner%2C_National_Gallery.jpg",
    title: "The Fighting Temeraire",
    artist: "J. M. W. Turner",
    year: "1839",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/9/9f/Grand_Canyon_of_the_Yellowstone.jpg",
    title: "Grand Canyon of the Yellowstone",
    artist: "Thomas Moran",
    year: "1872",
  },
];

/** Days since the Unix epoch in the local timezone — a stable per-day index. */
function dayNumber(d: Date): number {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

/** The painting for a given day: deterministic pick + a formatted caption. */
export function paintingForDate(d: Date): { src: string; caption: string } {
  const p = PAINTINGS[((dayNumber(d) % PAINTINGS.length) + PAINTINGS.length) % PAINTINGS.length];
  return { src: p.src, caption: `${p.title}, ${p.artist}, ${p.year}` };
}
