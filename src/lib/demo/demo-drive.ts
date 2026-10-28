/**
 * The demo client's Google Drive folder — what `/api/clients/[slug]/drive` and
 * `/api/wiki/[token]/drive` answer on /demo pages. A small real-looking tree: two subfolders,
 * every kind of file, added and edited at different times so "Added" and "Edited" order
 * differently (a demo where both views look the same would prove nothing about either).
 */
import {
  FOLDER_MIME,
  driveFileKind,
  parseDriveView,
  sortRecent,
  type ClientDriveFile,
  type ClientDriveResponse,
} from "@/lib/client-drive";

const ROOT = { id: "demoNorthwindRoot01", name: "Northwind Studio — Client" };
const H = 3600_000;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();

type Row = ClientDriveFile & { parent: string };

function row(
  id: string,
  name: string,
  mimeType: string,
  parent: string,
  addedHoursAgo: number,
  editedHoursAgo: number,
  by: string | null,
): Row {
  return {
    id,
    name,
    mimeType,
    kind: driveFileKind(mimeType),
    createdTime: ago(addedHoursAgo),
    modifiedTime: ago(editedHoursAgo),
    modifiedBy: by,
    path: null,
    size: null,
    hasThumbnail: false,
    parent,
  };
}

const FOLDERS = [
  row("demoFolderDesigns01", "Designs", FOLDER_MIME, ROOT.id, 900, 2, null),
  row("demoFolderContracts1", "Contracts", FOLDER_MIME, ROOT.id, 1200, 300, null),
];

const FILES: Row[] = [
  row("demoFileHomeV3pdf01", "Homepage v3 — review.pdf", "application/pdf", "demoFolderDesigns01", 3, 3, "Priya Shah"),
  row("demoFileLogoPng0001", "Logo lockup.png", "image/png", "demoFolderDesigns01", 26, 26, "Priya Shah"),
  row("demoFileBriefDoc001", "Project brief", "application/vnd.google-apps.document", ROOT.id, 400, 1, "Dan Lindsay"),
  row("demoFileBudgetSht01", "Budget and invoices", "application/vnd.google-apps.spreadsheet", ROOT.id, 300, 30, "Harry Brown"),
  row("demoFileKickoffSld1", "Kickoff deck", "application/vnd.google-apps.presentation", ROOT.id, 700, 600, "Dan Lindsay"),
  row("demoFileMsaDocx0001", "Master services agreement.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "demoFolderContracts1", 1100, 1000, "Harry Brown"),
  row("demoFileWalkMp40001", "App walkthrough.mp4", "video/mp4", ROOT.id, 50, 50, "Waqar Ali"),
  // Enough to need a second page in Portal (8 a page) and the wiki (12 a page).
  ...["Onboarding screen", "Settings screen", "Paywall", "Profile", "Search results", "Empty states"].map((n, i) =>
    row(`demoFileScreen${String(i).padStart(5, "0")}`, `${n}.png`, "image/png", "demoFolderDesigns01", 60 + i * 30, 60 + i * 30, "Priya Shah"),
  ),
];

const NAMES = new Map([[ROOT.id, ROOT.name], ...FOLDERS.map((f) => [f.id, f.name] as const)]);

function strip(row: Row): ClientDriveFile {
  const file: ClientDriveFile & { parent?: string } = { ...row };
  delete file.parent;
  return file;
}

export function resolveDemoDrive(search?: URLSearchParams): ClientDriveResponse {
  const view = parseDriveView(search?.get("view"));
  const base = { state: "ok" as const, folderUrl: "https://drive.google.com/drive/folders/demo-northwind", folderName: ROOT.name, view, partial: false, message: null };
  if (view === "folder") {
    const folder = search?.get("folder") && NAMES.has(search.get("folder")!) ? search.get("folder")! : ROOT.id;
    const crumbs = folder === ROOT.id ? [ROOT] : [ROOT, { id: folder, name: NAMES.get(folder)! }];
    const files = [...FOLDERS, ...FILES].filter((f) => f.parent === folder).map(strip);
    return { ...base, crumbs, files };
  }
  const files = FILES.map((f) => strip({ ...f, path: f.parent === ROOT.id ? null : NAMES.get(f.parent) ?? null }));
  return { ...base, crumbs: [ROOT], files: sortRecent(files, view) };
}
