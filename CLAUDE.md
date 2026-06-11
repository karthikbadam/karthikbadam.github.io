# Project Guidelines

## Commits

- Commit regularly as work progresses; don't batch many changes into one commit.
- Commit message format: `<type>: <description>`
  - `type` is one of: `add`, `remove`, `fix`
  - `description` is at most 5 words
- Examples:
  - `add: job retry endpoint`
  - `fix: token refresh race condition`
  - `remove: unused websocket handler`

## Styling

- Gaps, margins, padding, and other spacing must be multiples of 4px.
- In Chakra, use integer spacing tokens (1 token = 4px); never fractional values like `1.5`.
- The same rule applies to raw px constants in SVG/chart layout code.
