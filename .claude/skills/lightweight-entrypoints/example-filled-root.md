# Acme Backend

Monorepo with three packages. All business logic lives in `core/`, consumed by `api/` (HTTP layer) and `workers/` (background jobs).

## How to navigate this codebase

Do NOT grep or search broadly. Instead, always follow this process:

1. Read the CLAUDE.md of the relevant package(s) to find the entry point file for the feature.
2. Read that entry point file.
3. Follow its imports, method calls, and type references to trace into the specific code you need.
4. Only grep as a last resort if the entry points don't lead you to the answer.

Each package's CLAUDE.md has two sections: structural entry points (how the package is organized) and feature entry points (where each business domain starts). Use the feature entry points to jump directly to the right area.

## Packages

- `core/` — Business logic, services, DB schema, queues, error classes. Start here for "how does X work" questions.
- `api/` — HTTP routes and API layer. Start here for "how is X exposed" questions.
- `workers/` — Background workers, cron jobs, webhook handlers. Start here for "how is X processed in background" questions.

## MANDATORY: Maintaining entry points

This is a REQUIRED step. You MUST do this as the LAST action before responding to the user:

1. **If you created a new service, route, worker, or cron job** that is NOT reachable from existing entry points — add a single line to the Features section of the relevant CLAUDE.md.
2. **If you had to fall back to a broad grep to find a feature** that should have had an entry point — add the entry point so the next agent doesn't need to grep.

Do NOT add entry points for: methods on existing services, internal helpers, utils, or refactors.

If neither condition applies, no update is needed. But you MUST explicitly check before finishing.
