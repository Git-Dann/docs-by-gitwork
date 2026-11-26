/**
 * Gitwork OS — the Terminal's commands. Pure: a command in, lines and at most one
 * effect out, so the desktop decides what an effect does and this file can be tested
 * without one.
 */

import type { OsApp } from "./window-manager";
import { CASE_STUDIES, CONTACT_EMAIL, FAQ, PLANS, STEPS, TAGLINE } from "./gitwork-content";

export interface TerminalLine {
  kind: "in" | "out" | "err" | "accent";
  text: string;
}

export type TerminalEffect =
  | { type: "open"; app: OsApp; href?: string }
  | { type: "exit" }
  | { type: "egg"; name: "confetti" | "matrix" | "restart" | "sleep" };

export interface TerminalResult {
  lines: TerminalLine[];
  effect?: TerminalEffect;
}

const out = (text: string): TerminalLine => ({ kind: "out", text });
const accent = (text: string): TerminalLine => ({ kind: "accent", text });
const err = (text: string): TerminalLine => ({ kind: "err", text });

export const HELP: [string, string][] = [
  ["help", "this list"],
  ["whoami", "who you are"],
  ["services", "what Gitwork does, and what it costs"],
  ["work", "things we've shipped"],
  ["process", "how an engagement runs"],
  ["faq", "honest answers"],
  ["foundry", "open Foundry, our delivery platform"],
  ["audit", "book the free 30-minute audit"],
  ["ship", "ship it"],
  ["neofetch", "about this machine"],
  ["clear", "clear the screen"],
  ["exit", "close the Terminal"],
];

const NEOFETCH = [
  "    ____         gitwork@os",
  "   / ___|        ──────────",
  "  | |  _         OS: Gitwork OS",
  "  | |_| |  _     Host: Foundry by Gitwork",
  "   \\____| (_)    Shell: from-prompt-to-production",
  "                 Uptime: shipping since day one",
  "                 Packages: Launch Pad, MVP Sprint, Greenfield, Care",
  "                 Quality gate: UK, every release",
];

const OPENABLE: Record<string, OsApp> = {
  finder: "finder",
  work: "finder",
  foundry: "foundry",
  services: "services",
  plans: "services",
  notes: "notes",
  mail: "mail",
  calendar: "calendar",
  settings: "settings",
  trash: "trash",
};

export function runTerminal(input: string, ctx: { userName: string; now: Date }): TerminalResult {
  const raw = input.trim();
  if (!raw) return { lines: [] };
  const [cmd, ...rest] = raw.split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd.toLowerCase()) {
    case "help":
    case "?":
    case "man":
      return { lines: HELP.map(([c, d]) => out(`${c.padEnd(10)} ${d}`)) };
    case "whoami":
      return { lines: [out(`${ctx.userName} · about to ship something`)] };
    case "date":
      return { lines: [out(ctx.now.toString())] };
    case "echo":
      return { lines: [out(arg)] };
    case "pwd":
      return { lines: [out("/Users/you/half-built-app")] };
    case "ls":
      return { lines: [out("app/  prisma/  .env.example  README.md  the-last-20%/")] };
    case "cd":
      return { lines: [out(arg === "the-last-20%" || arg === "the-last-20%/" ? "That's our bit. Type `services`." : "")] };
    case "services":
    case "plans":
      return {
        lines: [
          ...PLANS.map((p) => out(`${p.name.padEnd(17)} from ${p.price.padEnd(8)} ${p.terms}`)),
          accent("Every engagement starts with a free 30-minute audit. Type `audit`."),
        ],
      };
    case "work":
      return {
        lines: [
          ...CASE_STUDIES.map((c) => out(`${c.name.padEnd(18)} ${c.tagline}`)),
          accent("Type `open work` to browse them."),
        ],
      };
    case "process":
      return { lines: STEPS.map((s) => out(`${s.n.padEnd(5)}${s.title.padEnd(10)} ${s.when}`)) };
    case "faq":
      return { lines: FAQ.flatMap((f) => [accent(f.q), out(f.a), out("")]) };
    case "foundry":
      return { lines: [out("Opening Foundry…")], effect: { type: "open", app: "foundry" } };
    case "audit":
    case "book":
      return { lines: [out("Free, 30 minutes, a real engineer. Opening Calendar…")], effect: { type: "open", app: "calendar" } };
    case "contact":
      return { lines: [out(CONTACT_EMAIL)], effect: { type: "open", app: "mail" } };
    case "open": {
      const app = OPENABLE[arg.toLowerCase()];
      if (!app) return { lines: [err(`open: nothing called "${arg}". Try: ${Object.keys(OPENABLE).join(", ")}`)] };
      return { lines: [out(`Opening ${arg}…`)], effect: { type: "open", app } };
    }
    case "ship":
    case "deploy":
      return {
        lines: [
          out("Running the UK quality gate…"),
          out("  ✓ code review"),
          out("  ✓ auth, payments, infra"),
          out("  ✓ security & accessibility"),
          accent(`Shipped. ${TAGLINE}`),
        ],
        effect: { type: "egg", name: "confetti" },
      };
    case "neofetch":
      return { lines: NEOFETCH.map(out) };
    case "sudo":
      if (/rm\s+-rf/.test(arg)) {
        return { lines: [err("Nice try. We don't delete half-built apps. We finish them.")] };
      }
      return { lines: [err(`${ctx.userName} is not in the sudoers file. This incident will be reported to the PM.`)] };
    case "vibe":
    case "vibecode":
      return { lines: [out("Vibes: excellent. Payments: not yet. That's where we come in.")] };
    case "coffee":
      return { lines: [out("☕ brewing… the build is green, take five.")] };
    case "matrix":
      return { lines: [out("Wake up. Your prototype has a production problem.")], effect: { type: "egg", name: "matrix" } };
    case "reboot":
    case "restart":
      return { lines: [out("Restarting…")], effect: { type: "egg", name: "restart" } };
    case "sleep":
      return { lines: [out("Goodnight.")], effect: { type: "egg", name: "sleep" } };
    case "exit":
    case "logout":
      return { lines: [], effect: { type: "exit" } };
    default:
      return { lines: [err(`command not found: ${cmd}. Type \`help\`.`)] };
  }
}
