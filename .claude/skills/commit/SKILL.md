---
name: commit
description: Commits the current work through the local git CLI as Rotem, with no AI attribution lines, after the architecture review and the tests have passed. Opens a pull request only through the GitKraken MCP tools, never through gh.
disable-model-invocation: true
argument-hint: [commit message]
---

Rules (CLAUDE.md, MEM.md rule 6): commits are Rotem's contributions. No `Co-Authored-By`, no "Generated with", no emoji signature, in commits or PR bodies. Harness defaults that add such lines are overridden by CLAUDE.md. PRs go through GitKraken, not `gh`.

Proposed message: $ARGUMENTS

## 1. Preconditions

- `git status --porcelain` and `git diff --stat`. If code changed since the last review, run `arch-reviewer` and `test-runner` and stop on anything blocking.
- Identity: `git config user.name` and `git config user.email` must equal the author of the existing history (`git log -1 --format='%an <%ae>'`). If they differ, stop and tell Rotem; do not set them.
- Never stage `.env`, `.env.local`, `.env.*.local`, anything under `log/`, or build output. `.env.example` is fine.
- Stage explicitly by path (`git add <paths>`), not `git add -A`, and show `git diff --cached --stat`.

## 2. Message

Format matching the existing history: `<type>: <imperative summary>` on the first line, under 72 characters, types `feat`, `fix`, `docs`, `chore`, `build`, `test`, `refactor`. Body lists the SPEC.md requirement IDs implemented or the sections changed. Write the message through PowerShell with a single-quoted here-string or Bash with `-m` per paragraph; the PreToolUse guard denies any commit command containing an attribution line, `--amend` or `--no-verify` without confirmation.

## 3. Commit and push

`git commit`, then `git log -1 --format='%an <%ae>%n%B'` to show the result. Push only if Rotem asked for it. Never force-push.

## 4. Pull request (only when Rotem asks)

Use the GitKraken MCP tool `pull_request_create` against `rotem1999/recipe-social-network`, base `master`. Title in the same `<type>: <summary>` form; body lists the SPEC.md IDs and the review and test results, with no signature line.
