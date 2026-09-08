# .claude/ — Claude Code tooling for recipe-social-network

Added 2026-09-08, the step before the first code. Everything here enforces or automates the rules in `CLAUDE.md` and `MEM.md`; none of it is a product decision, so nothing here changes `SPEC.md`.

## Subagents (`agents/`)

All four are pinned to Claude Opus 4.8 (`model: claude-opus-4-8`). Subagents cannot ask Rotem questions directly; they return questions to the main session, which asks in chat.

| Agent | Job | Writes files |
|---|---|---|
| `spec-guardian` | Maps a request or diff to SPEC.md IDs; lists unspecified behaviour as questions for Rotem | no |
| `fact-verifier` | Verifies one group of third-party facts online today; returns §16 citation lines | no |
| `arch-reviewer` | 14-point check: placement, tags, boundaries, aliases, secrets, TypeORM 1.x, Nest 11, AI logging, tests | no |
| `test-runner` | Runs `pnpm nx` lint/typecheck/test/e2e targets; returns a short failure digest | no |
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

`guard.js` runs on every Bash, Edit, Write and MultiEdit call (Node, via Git Bash on Windows). It:

- denies any command or edit touching `.env`, `.env.local`, `.env.*.local`;
- denies `git commit` messages with `Co-Authored-By`, "Generated with" or an emoji signature; asks on `--amend`, `--no-verify` and force push; denies `gh pr create`;
- denies SPEC.md edits that add TBD, TODO or a line ending in "?";
- asks before any edit to a `CLAUDE.md`;
- denies any write to a `*.spec.*` or `*.test.*` file from the main session (Edit, Write, MultiEdit, and Bash redirects, `sed -i`, `tee`, `cp`, `mv`); allows it from `test-writer`; asks for any other subagent. The hook input's `agent_id` and `agent_type` fields tell the two apart (source C3);
- denies provider keys, SDKs, URLs or `navigator.geolocation` in `apps/web`, `apps/desktop`, `libs/web`, `libs/shared`.

Permissions deny reading the env files and pre-allow read-only git commands and the `pnpm nx` lint, test, build, graph, show and affected targets.

Known gaps: an edit made with `sed` through Bash is not inspected for SPEC.md or client-secret content; only the env-file and test-file token checks apply to Bash. The Bash test-file check is a token heuristic, so a main-session command that both redirects output and mentions a spec file name anywhere (for example a heredoc containing one) is denied too. Prefer the Edit and Write tools.

The `env` block in `settings.json` (`CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-8`, `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`) pins every subagent, including the built-in Explore, Plan and general-purpose agents, to Opus 4.8 (Rotem, 2026-09-08). The per-agent `model:` lines document the same intent.

## Sources (fetched 2026-09-08)

- C1 https://code.claude.com/docs/en/sub-agents.md — frontmatter fields; `model` accepts a full model ID; AskUserQuestion removed from subagents; project agents override built-ins by name; `CLAUDE_CODE_SUBAGENT_MODEL` and `_FORCE`.
- C2 https://code.claude.com/docs/en/skills.md — SKILL.md fields, `$ARGUMENTS`, `disable-model-invocation`, `context: fork`; `.claude/commands` still works but skills take precedence.
- C3 https://code.claude.com/docs/en/hooks-guide.md — hook JSON schema, stdin fields, exit codes, `permissionDecision` allow/deny/ask, Git Bash on Windows, `$CLAUDE_PROJECT_DIR`.
- C4 https://code.claude.com/docs/en/permissions.md — `Read(./.env)` rules also block Edit/Write; Read deny rules apply to `cat`/`head`/`tail`/`sed` in recent versions; `Bash(cmd *)` patterns.
- C5 https://code.claude.com/docs/en/model-config.md and https://code.claude.com/docs/en/settings-reference.md — `env` key in settings; subagent model resolution order.
- C6 https://platform.claude.com/docs/en/models/opus-4-8/overview — Claude Opus 4.8 model ID `claude-opus-4-8`, legacy but active, retirement not before 2027-05-28.
