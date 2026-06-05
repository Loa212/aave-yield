# <Repo name>

<One sentence: what is this? If multi-zone, name the zones and their role in one line. Example: "Backend for <product>. Three zones: `core/` (business logic), `api/` (HTTP layer), `workers/` (background jobs).">

## How to navigate this codebase

Do NOT grep or search broadly. Instead, always follow this process:

1. Read the CLAUDE.md of the relevant zone to find the entry point file for the feature.
2. Read that entry point file.
3. Follow its imports, method calls, and type references to trace into the specific code you need.
4. Only grep as a last resort if the entry points don't lead you to the answer.

Each zone's CLAUDE.md has two sections: structural entry points (how the zone is organized) and feature entry points (where each business domain starts). Use the feature entry points to jump directly to the right area.

## Zones

<!-- One line per zone. Name, path, one-sentence role. Phrase the role so the reader knows when to start here. -->

- `<zone-a>/` — <role, e.g. "Business logic and domain services. Start here for 'how does X work' questions.">
- `<zone-b>/` — <role, e.g. "HTTP routes and API layer. Start here for 'how is X exposed' questions.">
- `<zone-c>/` — <role, e.g. "Background workers and cron jobs. Start here for 'how is X processed asynchronously' questions.">

## MANDATORY: Maintaining entry points

This is a REQUIRED step. You MUST do this as the LAST action before responding to the user:

1. **If you created a new service, route, worker, cron job, or other business domain** that is NOT reachable from existing entry points — add a single line to the Features section of the relevant zone's CLAUDE.md.
2. **If you had to fall back to a broad grep to find a feature** that should have had an entry point — add the entry point so the next agent doesn't need to grep.

Do NOT add entry points for: methods on existing services, internal helpers, utils, or refactors.

If neither condition applies, no update is needed. But you MUST explicitly check before finishing.
