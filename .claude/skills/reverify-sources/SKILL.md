---
name: reverify-sources
description: Re-verifies the sources in SPEC.md §16 and the version table in §11.1 online today, in parallel, and reports drift with the SPEC decisions each change touches. Run before scaffolding and whenever the verification date in SPEC.md is older than today.
disable-model-invocation: true
argument-hint: [group letters, e.g. "V N E T", or "all"]
---

SPEC.md §0 rule 2: third-party facts were verified on the date in the file and must be re-verified before scaffolding. Groups: $ARGUMENTS (empty means all).

Groups in §16: F Firebase, O OpenRouter, M TheMealDB, U USDA, W weather and location, V versions, N Nx, E Electron tooling, T testing.

## 1. Collect

Read SPEC.md §16 and §11.1. For each selected group, list every ID with its URL and the claim SPEC.md attaches to it (the sentence in the section that cites it). Also include the four items in MEM.md "Things to re-check before scaffolding": TypeScript 7 compatibility of `@nx/nest`, NestJS 11 and electron-vite; Nx 23 support for Node 26; `minimax/minimax-m3` providers and pricing; TheMealDB v2 key status.

## 2. Verify in parallel

Spawn one `fact-verifier` subagent per group, all in one message, each with its list of ID, URL and claim. Do not verify anything yourself from memory.

## 3. Report

One table, sorted CHANGED first:

| ID | Claim in SPEC.md | Seen today | Status | SPEC decisions affected |

Then a short list "Decisions that may need Rotem": every CHANGED or UNVERIFIABLE item whose `Impact` names a requirement or decision (for example the `@nx/nest` peer range behind the NestJS 11 decision, or the Vitest Node minimum behind the runtime choice).

## 4. Apply only what Rotem approves

Ask Rotem which changes to write. Then, for approved items only:
- update the affected sentences and the version column in §11.1,
- replace the §16 line with the verified one,
- change the "verified on" dates (§0 rule 2, §11.1 header, §16 heading) to today's date,
- never write a question or TBD into SPEC.md; an unresolved item stays in this chat until Rotem decides.

Offer `/commit` with the message `docs: re-verify SPEC.md sources on YYYY-MM-DD`.
