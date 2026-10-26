/**
 * Two repo checks that judged by a root file name alone, now judged by what the repo
 * declares and contains.
 *
 * - has_orm_config looked for a `prisma/` folder at the root, so a repo depending on
 *   @prisma/client with its schema in src/ "had no ORM" while the tech stack listed
 *   Prisma (gothinkster/node-express-realworld-example-app).
 * - vibe_env_not_committed FAILed, and told the user to rotate secrets, on the file name
 *   alone. Next.js documents committing .env and .env.production as non-secret defaults,
 *   so the file has to be read before anything is said about secrets in it.
 *
 * Pure, no I/O.
 */
import { findSecrets } from "./secret-formats";

/** Data-access libraries, by package name, per ecosystem. */
const NODE_DATA_LAYERS: Array<[RegExp, string]> = [
  [/^(?:prisma|@prisma\/client)$/, "Prisma"],
  [/^drizzle-orm$/, "Drizzle"],
  [/^typeorm$/, "TypeORM"],
  [/^sequelize$/, "Sequelize"],
  [/^mongoose$/, "Mongoose"],
  [/^@mikro-orm\/core$/, "MikroORM"],
  [/^knex$/, "Knex"],
  [/^kysely$/, "Kysely"],
  [/^objection$/, "Objection"],
  [/^@supabase\/supabase-js$/, "Supabase client"],
];
const MANIFEST_DATA_LAYERS: Array<[RegExp, RegExp, string]> = [
  [/(^|\/)(?:requirements[\w.-]*\.txt|pyproject\.toml|Pipfile)$/i, /^\s*["']?(?:sqlalchemy|SQLAlchemy|sqlmodel|peewee|tortoise-orm|django)\b/im, "Python ORM"],
  [/(^|\/)Gemfile$/i, /^\s*gem\s+["'](?:rails|activerecord|sequel)["']/im, "Active Record / Sequel"],
  [/(^|\/)go\.mod$/i, /\b(?:gorm\.io\/gorm|entgo\.io\/ent|github\.com\/jmoiron\/sqlx|github\.com\/sqlc-dev)\b/, "Go data layer"],
  [/(^|\/)composer\.json$/i, /"(?:laravel\/framework|doctrine\/orm|illuminate\/database)"/, "Eloquent / Doctrine"],
];
/** Files whose presence is itself an ORM configuration. */
const DATA_LAYER_FILES: Array<[RegExp, string]> = [
  [/(^|\/)schema\.prisma$/i, "Prisma schema"],
  [/(^|\/)drizzle\.config\.(?:ts|js|mjs|cjs)$/i, "Drizzle config"],
  [/(^|\/)ormconfig\.(?:json|js|ts|ya?ml)$/i, "TypeORM config"],
  [/(^|\/)alembic\.ini$/i, "Alembic (SQLAlchemy) migrations"],
  [/(^|\/)config\/database\.yml$/i, "Rails database config"],
];

export function detectDataLayer(input: { paths: string[]; files: ReadonlyMap<string, string> }): string | null {
  for (const [path, text] of input.files) {
    if (/(^|\/)package\.json$/i.test(path)) {
      let deps: Record<string, unknown> = {};
      try { const pkg = JSON.parse(text); deps = { ...pkg.dependencies, ...pkg.devDependencies }; } catch { continue; }
      const hit = NODE_DATA_LAYERS.find(([re]) => Object.keys(deps).some((d) => re.test(d)));
      if (hit) return `${hit[1]} (${path})`;
    }
    const manifest = MANIFEST_DATA_LAYERS.find(([file, dep]) => file.test(path) && dep.test(text));
    if (manifest) return `${manifest[2]} (${path})`;
  }
  for (const p of input.paths) {
    const hit = DATA_LAYER_FILES.find(([re]) => re.test(p));
    if (hit) return `${hit[1]} (${p})`;
  }
  return null;
}

/** Root .env files that are templates, not settings. */
const ENV_TEMPLATE = /\.(?:example|sample|template|dist|defaults?)$/i;

/** Keys whose value is a secret when it is set to a real value. */
const SECRET_KEY = /(?:SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY|AUTH_TOKEN|_TOKEN$|CLIENT_SECRET|DATABASE_URL|_DSN$|CONNECTION_STRING)/i;
/** Values that are obviously not real: empty, placeholders, local development defaults. */
const PLACEHOLDER_VALUE = /^(?:|changeme|change[-_]?me|replace[-_]?me|xxx+|todo|your[-_].*|<.*>|\$\{.*\}|example|test|dummy|secret|password|null|none|false|true)$/i;

export interface EnvFileFinding {
  status: "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE";
  detail: string;
  evidence?: string;
}

/**
 * Judge committed root .env files by their contents. `files` maps each committed env
 * file's path to its text, or null when the file was found in the tree but not read.
 */
export function envFilesVerdict(files: Array<{ path: string; text: string | null }>): EnvFileFinding {
  const real = files.filter((f) => !ENV_TEMPLATE.test(f.path));
  if (real.length === 0) return { status: "PASS", detail: "No .env file is committed at the repository root (example and template files excluded)." };
  const credential = real.flatMap((f) => (f.text ? findSecrets(f.text).filter((m) => !m.publicByDesign).map((m) => ({ path: f.path, kind: m.kind })) : []));
  if (credential.length > 0) {
    const c = credential[0];
    return { status: "FAIL", detail: `${c.path} is committed and contains a ${c.kind} credential. Anyone with read access to the repository has it: rotate it, remove the file from the repository and add it to .gitignore.`, evidence: `${c.path}: ${c.kind}` };
  }
  const secretNamed = real.flatMap((f) => (f.text ?? "").split(/\r?\n/).flatMap((line) => {
    const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || !SECRET_KEY.test(m[1])) return [];
    const value = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
    if (PLACEHOLDER_VALUE.test(value) || /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^@]*@?(?:localhost|127\.0\.0\.1|db|postgres|mysql|redis)[:/]/i.test(value)) return [];
    return [`${f.path}: ${m[1]}`];
  }));
  if (secretNamed.length > 0) {
    return { status: "WARN", detail: `A committed .env file sets a value for a secret-named variable (${secretNamed.slice(0, 3).join("; ")}). The value is not in a recognised credential format, so it may be a development default; if it is a real secret, rotate it and stop committing the file.`, evidence: secretNamed.slice(0, 3).join("; ") };
  }
  const unread = real.filter((f) => f.text === null);
  if (unread.length > 0) {
    return { status: "INCONCLUSIVE", detail: `${unread.map((f) => f.path).join(", ")} ${unread.length === 1 ? "is" : "are"} committed but could not be read, so whether ${unread.length === 1 ? "it holds" : "they hold"} secrets could not be established.` };
  }
  return { status: "PASS", detail: `${real.map((f) => f.path).join(", ")} ${real.length === 1 ? "is" : "are"} committed but hold${real.length === 1 ? "s" : ""} no credentials and no values for secret-named variables (frameworks such as Next.js commit non-secret defaults this way).` };
}
