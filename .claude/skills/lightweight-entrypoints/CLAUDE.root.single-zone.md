# <Repo name>

<One sentence on what this repo is and its overall shape.>

## How to navigate this codebase

Do NOT grep or search broadly. Instead:

1. Use the Features list below to find the entry point for the area you care about.
2. Read that entry point file.
3. Follow its imports, method calls, and type references to trace into the specific code you need.
4. Only grep as a last resort.

## Entry points

<!-- Structural: bootstrap + any registries. -->

- `<path>/index.<ext>` — <what this bootstraps>
- `<path>/<registry>.<ext>` — <what's aggregated>

## Features

<!-- One line per business domain. Path points to the domain's plugin root or index file. -->

- **<Domain>** — `<path>/<entry>.<ext>`
- **<Domain>** — `<path>/<entry>.<ext>`

## MANDATORY: Maintaining entry points

This is a REQUIRED step. You MUST do this as the LAST action before responding to the user:

1. **If you created a new service, route, worker, cron job, or other business domain** that is NOT reachable from existing entry points — add a single line to the Features section above.
2. **If you had to fall back to a broad grep to find a feature** that should have had an entry point — add the entry point so the next agent doesn't need to grep.

Do NOT add entry points for: methods on existing services, internal helpers, utils, or refactors.

If neither condition applies, no update is needed. But you MUST explicitly check before finishing.
