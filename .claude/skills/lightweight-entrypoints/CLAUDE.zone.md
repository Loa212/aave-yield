# <Zone name>

<One sentence on this zone's role and how it integrates with the rest of the repo. If it depends on another zone, say how. Example: "HTTP API layer. Consumes services from `core/` and does not hold business logic itself.">

## Entry points

<!-- Structural: the bootstrap file and any registries that aggregate things. Include counts if large, e.g. "21 workers". -->

- `<path>/index.<ext>` — <what this bootstraps>
- `<path>/<registry>.<ext>` — <what's aggregated>
- `<path>/<another-registry>.<ext>` — <...>

## Features

<!-- One line per business domain. Path points to the domain's plugin root or index file. If a domain spans multiple entry points, list them comma-separated on the same line. -->

- **<Domain>** — `<path>/<entry>.<ext>`
- **<Domain>** — `<path>/<entry>.<ext>`, `<path>/<related>.<ext>`
- **<Domain>** — `<path>/<entry>.<ext>`
