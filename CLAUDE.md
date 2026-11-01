# CLAUDE.md

Ivory Tower (מגדל השן): a branching argument map. SvelteKit 2 + Svelte 5, Node 22,
Postgres via PGlite (dev/tests) or `pg` (DATABASE_URL). Sister site of 1lev1.

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm test` | vitest (pure model + repo against in-memory PGlite) |
| `npm run check` | svelte-check: the typecheck gate |
| `npm run build` | adapter-node build |

## Principles: do not erode these

- **Nothing is decided by a vote.** Stances are personal and private by default;
  never add a tally that marks a claim true/false or hides a branch.
- **Nothing is deleted or overwritten.** Edits are new `node_rev` rows; inserting a
  step supersedes an edge (`superseded_by`); a synthesis points at what it unites.
- **Only the author revises a node.** Everyone else responds with a node of their own.
- **Edges point child → parent** (the responder → what it responds to). Allowed
  (kind, rel, kind) triples live only in `src/lib/model/rules.ts`.
- **Structural status** (`src/lib/model/status.ts`) is grounded labelling over
  `opposes`; supports never cancel an objection; cycles stay undecided (standing).
- **Documents** are `document` nodes whose blocks are ordinary nodes linked by
  ordered `partOf` edges; only the document's author adds/moves blocks. Anyone
  answers a passage: the edge carries `anchor` = `{exact,prefix,suffix}`
  (`src/lib/anchor/quote.ts`), located against the block's DOM `textContent`.
  A lost passage makes the response *orphaned* — shown, never deleted.
- Bodies are Markdown rendered by `src/lib/text/markdown.ts` only (escapes all
  user text); never `{@html}` anything else.
- This is the *opposite* of 1lev1's "silence is consent": never auto-resolve anything here.

## Conventions

- All UI text through `useI18n().t('ns.key', { count })` with `{{count}}` in
  `src/lib/i18n/{he,en}.json`; keep both files key-identical.
- All DB access through `src/lib/server/repo.ts`; refusals throw `DomainError(code)`
  where `code` is a key under `error.` in the dictionaries.
- Auth: with `STRAPI_URL` set, the session is 1lev1's shared `.1lev1.com` `jwt`
  cookie (see `src/lib/server/levAuth.ts`); otherwise dev display-name login.
- Rikma bridge (`src/lib/server/levBridge.ts`): calls 1lev1 ONLY as the member,
  with their own jwt, through ordinary 1lev1 endpoints — never add a shared
  secret or a service principal. Every space read/write goes through
  `readableSpace()` (`src/lib/server/access.ts`); a members space is a 404 to
  anyone 1lev1 does not list as a member. Every WRITE goes through
  `writableSpace()` (members-write spaces: `space.write_policy`); a personal
  stance is not a write. Record a `rikma_link` only after 1lev1
  accepted the request; nothing here decides anything in a rikma.
- Data model and roadmap: `docs/MODEL.md`.
