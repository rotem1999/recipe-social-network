# recipe-social-network

Read first: INTENT.txt, then SPEC.md (the only build source), then MEM.md.

Rules from Rotem:
- No code from chat: change SPEC.md first, build from it.
- Never assume. If SPEC.md is silent, ask Rotem in chat. No "open"/"TBD" in SPEC.md.
- Verify third-party facts online the same day; cite them in SPEC §16.
- Never sign commits or PRs (no Co-Authored-By, no "Generated with").
- Deleted files in git history are not a source.

Nx 23 + pnpm, TypeScript. Alias `@rsn/<scope>/<type>-<name>`; boundaries in SPEC §11.3. Secrets only in `.env.local`; none reach apps/web or apps/desktop.

Long Bash heredocs fail here (ENAMETOOLONG); use the Write tool for big files.
