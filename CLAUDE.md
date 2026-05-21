# Foundry by Gitwork — Claude Code Guide

## Quick context

This repo is `Git-Dann/docs-by-gitwork`. Production: `foundry-by-gitwork.vercel.app`.
Branch `main` = production (Vercel auto-deploys on push).

## Full project context

Visit **`/context`** (i.e. `foundry-by-gitwork.vercel.app/context`) for the full structured
AI context page — module map, file structure, conventions, active work, upcoming tasks.

Or read the source directly: `src/app/context/page.tsx`

## Key paths at a glance

| What | Where |
|---|---|
| Marketing homepage | `src/app/page.tsx` |
| App shell (sidebar) | `src/components/app-shell.tsx` |
| All API routes | `src/app/api/` |
| Server logic | `src/server/` |
| Pulse agents | `src/server/pulse-agents/` |
| Study agents | `src/server/study-agents/` |
| React Query hooks | `src/hooks/` |
| Zod validators | `src/server/validators.ts` |
| Global CSS | `src/app/globals.css` |
| Auth middleware | `src/middleware.ts` |
| Prisma schema | `prisma/schema.prisma` |
