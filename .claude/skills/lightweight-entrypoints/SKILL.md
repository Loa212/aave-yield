---
name: lightweight-entrypoints
description: Set up a minimal, self-maintaining CLAUDE.md entry-points system so agents navigate a repo via a short curated list of "start here" pointers instead of grepping broadly or reading bloated auto-generated codebase docs. Use this skill whenever the user asks to bootstrap or install CLAUDE.md entry points, slim down an oversized or AI-generated CLAUDE.md, make agents stop grepping so much, or reduce per-turn token waste from always-loaded codebase docs. Applies to monorepos, single-package repos with logical subtrees (e.g. `app/`, `server/`, `lib/`), and flat repos — the skill decides the right granularity per repo.
---

# Lightweight Entry Points

Replace dense, auto-generated `CLAUDE.md` files with a short curated list of **entry point files** — the "start reading here" pointers an agent uses to orient itself. The list stays current via a `UserPromptSubmit` hook that reminds the agent to add entries when it creates a new domain or had to grep for one that should have been listed.

The bet: LLMs already deduce structure well from a handful of accurate pointers. A large pre-computed map of the codebase wastes tokens every turn, rots, and crowds out task-relevant context.

## When to apply

- Repo has no `CLAUDE.md`, or has a bloated/auto-generated one.
- User says agents grep too broadly, are slow to find things, or that `CLAUDE.md` is burning tokens.

If an existing `CLAUDE.md` is already short (roughly under 60 lines) and clearly hand-curated, consider only installing the hook rather than rewriting.

## Core concept: zones

The skill's central decision is **how to carve the repo into zones**. A zone is any subtree big or distinct enough that its own `CLAUDE.md` would help an agent. Each zone gets one `CLAUDE.md` at its root.

Zones can be:

- **Packages** in a monorepo (`packages/api/`, `apps/web/`, a Cargo/Go workspace member).
- **Logical subtrees** in a single-package repo — e.g. a Next.js app with clearly separated `app/` (routes), `components/`, `lib/` (shared logic), `server/` (server-only code); or a backend split into `routes/`, `services/`, `jobs/`.
- **The whole repo**, as a single zone, for a flat codebase with no meaningful internal split.

There is always exactly one **root** `CLAUDE.md` at the repo root. If there is more than one zone, the root lists them; each zone also has its own `CLAUDE.md`. If there's only one zone, the root *is* the zone's CLAUDE.md (use the single-zone template).

Rule of thumb: create a zone when a developer would reasonably describe it in one short phrase ("the API layer", "the worker pool", "the shared UI kit"). Don't create a zone per folder — a zone is a *domain boundary*, not a directory.

## Assets bundled with this skill

Templates live in `assets/` next to this file. Read them when you reach the step that needs them.

- `assets/CLAUDE.root.multi-zone.md` — root template when the repo has 2+ zones
- `assets/CLAUDE.root.single-zone.md` — merged root-plus-zone template for flat repos
- `assets/CLAUDE.zone.md` — per-zone template (used for packages or logical subtrees)
- `assets/hook.sh` — the reminder hook, copy verbatim
- `assets/settings.json.fragment` — hook registration, merge into `.claude/settings.json`
- `assets/example-filled-root.md` — a real filled-in multi-zone root, useful for calibrating tone and density

Paths in examples throughout this skill use JS/TS conventions (`src/index.ts`, `package.json`) for readability. The skill is stack-agnostic — substitute the equivalents for the repo at hand (e.g. `cmd/<n>/main.go`, `src/main.rs`, `app/controllers/`).

## Steps

### 1. Inspect the repo — don't guess

Figure out the shape before writing anything. Look at:

- Top-level layout and any workspace config (`pnpm-workspace.yaml`, `turbo.json`, `package.json` workspaces, `Cargo.toml` workspaces, `go.work`, etc.).
- The top-level folder structure inside `src/` or equivalent.
- Existing `CLAUDE.md` or `AGENTS.md` if any, plus `README.md` for the author's own mental model.

From that, answer two questions:

1. **What are the zones?** Apply the zone rule from the previous section. Prefer fewer zones — if two candidate zones are tightly coupled and always edited together, merge them.
2. **For each zone, what is its role in one sentence?** E.g. "HTTP API layer, consumes services from `core/`" or "background workers, subscribes to the same queues as `api/`". This sentence goes at the top of the zone's `CLAUDE.md`.

### 2. For each zone, identify the entry points

Two kinds of entry point:

- **Structural entry points** — files that aggregate or register things. The bootstrap file (`src/index.ts`, main, etc.), route/plugin registries, service registries, DI container setup, queue/worker/cron registration, schema index. These answer "where does the zone start / where is everything wired up?".
- **Feature entry points** — one per business domain. Prefer the domain's plugin root or its `index.ts`. One canonical "start here" per domain, not one per file.

Rules when listing feature entries:

- One line per business domain, not per file.
- Path points to a plugin, `index.ts`, or registry — never a random internal file.
- If a domain legitimately spans multiple entry points, list them comma-separated on the same line.
- Omit helpers, utils, generated code, test fixtures, infra adapters.
- Phrase entries **structurally**, not behaviorally. "Booking service and its routes" is good. "Uses Postgres with pgvector" is bad — behavior rots, structure doesn't.

If you're tempted to list more than ~15 feature entries in one zone, the zone is probably too big — consider splitting.

### 3. Write the files

Read the relevant template(s) from `assets/` and fill them in.

- **Multi-zone repo**: use `assets/CLAUDE.root.multi-zone.md` for the root `CLAUDE.md` and `assets/CLAUDE.zone.md` for each zone's `CLAUDE.md`, placed at the zone's root directory.
- **Single-zone repo**: use `assets/CLAUDE.root.single-zone.md` only; no per-zone files.

Keep each `CLAUDE.md` under ~30 lines where possible. If a zone genuinely needs more room, that's fine, but first re-check whether you're listing individual files instead of domains.

Do not copy the template placeholders verbatim — fill them in. Before moving on, re-read `assets/example-filled-root.md` and check that the tone and density of what you've written matches it.

### 4. Install the self-maintaining hook

Create `.claude/hooks/entrypoint-review.sh` with the contents of `assets/hook.sh` and `chmod +x` it.

Create or merge `.claude/settings.json` using `assets/settings.json.fragment`. If the file already exists and already has a `hooks.UserPromptSubmit` array, append the new hook entry rather than replacing the array.

Windows caveat: the hook uses a bash here-doc. It runs under WSL or Git Bash but not native `cmd.exe`. If the team includes Windows users, mention they should run Claude Code under WSL.

### 5. Handle existing bloated docs (only if needed)

If the repo already had a long auto-generated `CLAUDE.md` (roughly 200+ lines), don't delete the content — it may still be useful on demand. Move it out of the always-loaded path:

- Content scoped to one zone → `<zone>/docs/<topic>/README.md`.
- Cross-cutting conventions → `docs/cross-cutting/<topic>/README.md`.

Use `git mv` where possible so blame follows. Link from `CLAUDE.md` only if a doc encodes a convention that matters for most tasks (e.g. how zones import each other, naming of error classes). Otherwise leave them in `docs/` — agents can open them with `Read` when relevant.

Skip this step entirely for clean or new repos.

### 6. Verify

- Start a fresh session. Ask a "how does X work" question about something real in the repo. The agent should read the right `CLAUDE.md`, open one entry point, and trace imports — no broad grep. If it greps immediately, the entry points are wrong or missing.
- Confirm the reminder text appears in system reminders after a user prompt (proof the hook fires).
- The first time the agent creates a new domain or falls back to grep, check it adds a single line to the right `CLAUDE.md` before finishing. If it doesn't, the root `CLAUDE.md`'s "MANDATORY" section probably needs to be more prominent.

## Anti-patterns

- **Don't regenerate these docs with an LLM on a schedule.** The whole point is avoiding machine-written codebase dumps. Let the hook plus the "add an entry when you grep" rule keep it current organically.
- **Don't list files inside a service or module.** The entry point is enough; the agent reads from there.
- **Don't annotate every entry.** One-line hint max. Longer explanations belong in code or `docs/`.
- **Don't include implementation details that will rot** ("uses PostgreSQL", "called by X"). Keep entries structural.
- **Don't add entries for methods on existing services, helpers, utils, or refactors.** Only new business domains earn a line.
- **Don't over-zone.** If two "zones" are always edited together, they're one zone.

## Why this works

LLMs already work as a usable context engine via deduction — they don't need a pre-computed map of the codebase, only a small reliable set of "start here" pointers so the first read lands near the answer. Removing the always-loaded dense `CLAUDE.md` saves tokens per turn; removing grep-based exploration saves wall-clock time. Gains scale with how bloated the previous setup was — on a real monorepo that migrated from a ~500-line auto-generated `CLAUDE.md`, "how does X work" tasks saw roughly 3× speedup and ~50% token reduction.
