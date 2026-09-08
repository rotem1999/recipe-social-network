---
name: handoff
description: Ends a session by updating MEM.md with the state of the repository, the decisions Rotem made in chat today with absolute dates, local machine facts that changed, and the next step, so the next session continues without this chat history.
disable-model-invocation: true
---

MEM.md is the session handoff file read at the start of every session (CLAUDE.md: read INTENT.txt, SPEC.md, MEM.md first). Update it; do not rewrite Rotem's rules.

## 1. Gather

- `git status --porcelain`, `git log -5 --format='%h %s'`, `git remote -v`.
- List every decision Rotem made in this chat. For each, find the SPEC.md row that records it. A decision that is not in SPEC.md is reported to Rotem as missing; it is not added to SPEC.md by this skill.
- List tool or machine facts that changed (installed versions, services, paths), checked with a command, not remembered.
- List what was verified online today and what is still on the "re-check" list.

## 2. Edit MEM.md

Keep the section order: Working rules, State of the repository, Next step, Decisions that live only in chat history, Local machine facts, Things to re-check. Then:
- Replace the header date and the "State" section with today's facts (branch, last commit hash, what exists).
- Rewrite "Next step" as Rotem stated it in this session; if Rotem did not state one, ask in chat.
- Append today's decisions to the decisions list, each ending with `(Rotem, YYYY-MM-DD)`.
- Convert every relative time ("today", "next session", "later") into an absolute date or a named event.
- Add a "Tooling" line pointing at `.claude/README.md` if the tooling changed.
- Remove nothing from "Working rules" unless Rotem said so in this chat.

## 3. Finish

Show `git diff -- MEM.md` and offer `/commit` with `docs: update MEM.md handoff for YYYY-MM-DD`.
