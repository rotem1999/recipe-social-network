---
name: spec-change
description: The SPEC-first workflow for any product or architecture request. Use whenever Rotem asks for a feature, a change in behaviour, a new dependency, a new folder, or anything code-shaped that SPEC.md does not already settle. Changes SPEC.md first, asks Rotem about every gap in chat, verifies external facts, then builds from SPEC.md.
argument-hint: [request summary]
---

Rule (CLAUDE.md): no code from chat. A request first changes SPEC.md; code is built from SPEC.md. Nothing is assumed. Nothing "open" or "TBD" is written into SPEC.md.

Request: $ARGUMENTS

## 1. Trace

Run the `spec-guardian` subagent on the request. It returns traced behaviours, unspecified behaviours as questions, and conflicts.

- Everything traced and no questions: skip to step 5.
- Otherwise continue.

## 2. Ask Rotem, once

Put every unspecified point into one `AskUserQuestion` call (or one chat message if there are more than four). Each question is answerable in one line and offers no default. Wait for the answers. Do not start editing SPEC.md while a question is open.

## 3. Verify external facts

For every version, endpoint, limit, licence or price the change relies on, run `fact-verifier` (one call per fact group, in parallel). Use the `§16 line` it returns; the date is today's date.

## 4. Edit SPEC.md

- Add or change requirement rows in the right section, keeping the table shape `| ID | Requirement | Source |`. New IDs continue the section's prefix (`REC-9`, `COOK-10`).
- Source column for a decision from this chat: `Rotem, chat YYYY-MM-DD` with today's date. Never "my call" unless Rotem asked you to choose and the row says so.
- If folders change, update §11.3 and the boundary table. If env keys change, update §14.
- Append verified `§16` lines under their group.
- Update the Status line at the top of the file (draft number and date).
- Do not touch per-folder CLAUDE.md files; Rotem writes those. If a constraint belongs there, tell Rotem the folder and the sentence and let them add it.
- The PreToolUse guard rejects any SPEC.md edit containing TBD, TODO or a line ending in "?". That is intended.

## 5. Approve

Show Rotem `git diff -- SPEC.md` and wait for approval. Only then build.

## 6. Build

Code follows SPEC.md only. Mention the requirement IDs you implemented in the commit message body. Unit tests are never written here: hand the changed files and their SPEC IDs to the `test-writer` subagent (Rotem, 2026-09-08); the guard denies spec files written from the main session. Then run `arch-reviewer` and `test-runner`, fix what they report, and use `/commit`.
