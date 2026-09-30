# .claude/ — Claude Code tooling for recipe-social-network

Added 2026-09-08, the step before the first code. Everything here enforces or automates the rules in `CLAUDE.md` and `MEM.md`; none of it is a product decision, so nothing here changes `SPEC.md`.

## Subagents (`agents/`)

All six are pinned to Claude Opus 5.5 (`model: claude-opus-5-5`; was Opus 4.8 until Rotem's change on 2026-09-29). Subagents cannot ask Rotem questions directly; they return questions to the main session, which asks in chat.

| Agent | Job | Writes files |
|---|---|---|
| `spec-guardian` | Maps a request or diff to SPEC.md IDs; lists unspecified behaviour as questions for Rotem | no |
| `fact-verifier` | Verifies one group of third-party facts online today; returns §16 citation lines | no |
| `arch-reviewer` | 14-point check: placement, tags, boundaries, aliases, secrets, TypeORM 1.x, Nest 11, AI logging, tests | no |
| `test-runner` | Runs `pnpm nx` lint/typecheck/test/e2e targets; returns a short failure digest | no |
| `app-critic` | Harsh QA pass on the running app (API + renderer in the browser) against every SPEC.md ID; writes `docs/reviews/QA-REVIEW-<date>.md` and screenshots (gitignored, local only) for a separate fixer session; at most 15 AI calls per run (added 2026-09-29) | review and screenshots only |
| `test-writer` | The only writer of `*.spec.ts(x)` files (Rotem, 2026-09-08); tests named by SPEC ID; runs them; reports production defects instead of fixing them | spec files only |

## Skills (`skills/`)

| Skill | Invoke | Purpose |
|---|---|---|
| `spec-change` | automatic or `/spec-change <request>` | The SPEC-first loop: trace, ask Rotem, verify facts, edit SPEC.md, approve, build |
| `reverify-sources` | `/reverify-sources [groups]` | Re-check SPEC §16 and §11.1 online before scaffolding; apply only approved changes |
| `nx-project` | automatic or `/nx-project api/feature-recipes` | Generate one project exactly as SPEC §11.3 lists it; CLAUDE.md files stay untouched |
| `commit` | `/commit <message>` | Commit as Rotem through the local git CLI, no attribution lines; PRs through GitKraken MCP |
| `handoff` | `/handoff` | Update MEM.md at the end of a session |

## Hooks and permissions (`settings.json`, `hooks/guard.js`)

`guard.js` runs on every Bash, Edit, Write and MultiEdit call (Node, via Git Bash on Windows, or PowerShell where Git Bash is not installed, source C3). It:

- denies any command or edit touching `.env`, `.env.local`, `.env.*.local`;
- denies `git commit` messages with `Co-Authored-By`, "Generated with" or an emoji signature; asks on `--amend`, `--no-verify` and force push; denies `gh pr create`;
- denies SPEC.md edits that add TBD, TODO or a line ending in "?";
- asks before any edit to a `CLAUDE.md`;
- denies any write to a `*.spec.*` or `*.test.*` file from the main session (Edit, Write, MultiEdit, and Bash redirects, `sed -i`, `tee`, `cp`, `mv`); allows it from `test-writer`; asks for any other subagent. The hook input's `agent_id` and `agent_type` fields tell the two apart (source C3b);
- denies provider keys, SDKs, URLs or `navigator.geolocation` in `apps/web`, `apps/desktop`, `libs/web`, `libs/shared`.

Permissions deny reading the env files and pre-allow read-only git commands and the `pnpm nx` lint, test, build, graph, show and affected targets.

Known gaps: an edit made with `sed` through Bash is not inspected for SPEC.md or client-secret content; only the env-file and test-file token checks apply to Bash. The Bash test-file check is a token heuristic, so a main-session command that both redirects output and mentions a spec file name anywhere (for example a heredoc containing one) is denied too. Prefer the Edit and Write tools.

The `env` block in `settings.json` (`CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-5-5`, `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`) pins every subagent, including the built-in Explore, Plan and general-purpose agents, to Opus 5.5 (Rotem, 2026-09-08; model changed from Opus 4.8 by Rotem, 2026-09-29). The per-agent `model:` lines document the same intent.

## Sources (fetched 2026-09-08, re-verified 2026-09-08 in the fourth session)

- C1 https://code.claude.com/docs/en/sub-agents.md — frontmatter fields; `model` accepts a full model ID; AskUserQuestion removed from subagents; project agents override built-ins by name; `CLAUDE_CODE_SUBAGENT_MODEL` and `_FORCE` (`_FORCE` needs Claude Code ≥ v2.1.257).
- C2 https://code.claude.com/docs/en/skills.md — SKILL.md fields, `$ARGUMENTS`, `disable-model-invocation`, `context: fork`; `.claude/commands` still works but skills take precedence.
- C3 https://code.claude.com/docs/en/hooks-guide.md — hook JSON schema, stdin fields, exit codes, `permissionDecision` allow/deny/ask, Git Bash on Windows (PowerShell when Git Bash is absent), `$CLAUDE_PROJECT_DIR`.
- C3b https://code.claude.com/docs/en/hooks.md — `agent_id` and `agent_type` on the hook stdin, present only inside a subagent call.
- C4 https://code.claude.com/docs/en/permissions.md — `Read(./.env)` rules also block Edit/Write (v2.1.208+ / v2.1.228+); Read deny rules apply to `cat`/`head`/`tail`/`sed`; NotebookEdit is not covered; `Bash(cmd *)` patterns.
- C5 https://code.claude.com/docs/en/settings-reference.md and https://code.claude.com/docs/en/model-config.md (with C1) — `env` key applies to every session and its subprocesses; a per-agent `model:` wins unless `_FORCE` is set.
- C6 https://platform.claude.com/docs/en/models/opus-4-8/overview — Claude Opus 4.8 model ID `claude-opus-4-8`, legacy but active, retirement not before 2027-05-28.
- C7 https://platform.claude.com/docs/en/about-claude/models/overview (fetched 2026-09-29) — Claude Opus 5.5 model ID `claude-opus-5-5`, current, retirement not before 2027-09-22.
