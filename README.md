# Docs by Gitwork

Frontend-first SaaS MVP for structured proposal building.

## Stack
- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS
- Headless UI
- TanStack Query
- Prisma ORM + PostgreSQL
- Next.js API routes (Node.js backend)

## MVP Features Delivered
- Proposal management: create, edit, duplicate, archive, delete
- Proposal list with search, sort, status, last updated
- Structured proposal editor for all required MVP sections
- Drag-and-drop timeline phase ordering
- Cost breakdown table with currency (GBP/USD/EUR), discount, tax/VAT, and totals
- CTA + links editor (primary + secondary destinations)
- Asset/graphics model with placement metadata
- Split editor + live preview layout on desktop
- Print-friendly view and export/share endpoint foundation
- Template-driven architecture with default Gitwork template
- Settings foundation for reusable snippets and company profile defaults

## Routes
- Landing: `/`
- App dashboard: `/app`
- Proposals list: `/app/proposals`
- Proposal editor: `/app/proposals/[id]`
- Proposal preview: `/app/proposals/[id]/preview`
- Print/export-ready view: `/app/proposals/[id]/print`
- Public shared preview: `/preview/[id]`
- Settings: `/app/settings`
- Templates foundation: `/app/templates`

## API Routes
- `GET /api/proposals`
- `POST /api/proposals`
- `GET /api/proposals/[id]`
- `PATCH /api/proposals/[id]`
- `POST /api/proposals/[id]/duplicate`
- `POST /api/proposals/[id]/archive`
- `DELETE /api/proposals/[id]/delete`
- `GET /api/templates`
- `POST /api/proposals/[id]/costing`
- `POST /api/proposals/[id]/timeline`
- `POST /api/proposals/[id]/engagement` (CTA + links)
- `POST /api/proposals/[id]/export` (print/PDF/share-link foundation)

## Data Model (Prisma)
`prisma/schema.prisma` includes:
- `User`
- `Workspace`
- `WorkspaceMember`
- `Document`
- `DocumentTemplate`
- `DocumentSection`
- `CostLineItem`
- `TimelinePhase`
- `Asset`
- `Link`
- `CTA`
- `Export`

## Setup
1. Install dependencies:
```bash
npm install
```
2. Configure environment:
```bash
cp .env.example .env
```
3. Ensure `DATABASE_URL` points to a running PostgreSQL instance.
4. Generate Prisma client:
```bash
npm run db:generate
```
5. Push schema:
```bash
npm run db:push
```
6. Seed default Gitwork template + sample proposal:
```bash
npm run db:seed
```
7. Start the app:
```bash
npm run dev
```

## Scripts
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run db:generate`
- `npm run db:push`
- `npm run db:migrate`
- `npm run db:seed`

## Notes
- PDF export is implemented as a foundation via print-optimized output and export records.
- Asset handling is URL-based for MVP.
- Architecture is document-type ready (Proposals now, SLAs and additional docs next).
