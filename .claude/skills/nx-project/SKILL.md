---
name: nx-project
description: Generates one Nx application or library exactly as SPEC.md §11.3 lists it - the right generator, the folder libs/<scope>/<type>-<name> or apps/<name>, the alias @rsn/<scope>/<type>-<name>, and the scope and type tags - and leaves the folder's CLAUDE.md untouched. Use during scaffolding and whenever SPEC.md §11.3 gains a project.
argument-hint: [scope/type-name or app name, e.g. api/feature-recipes, web]
---

Project: $ARGUMENTS

## 1. Check it is specified

The project must appear in SPEC.md §11.3. If it does not, stop and run `/spec-change`; a project is a SPEC decision first.

Read the folder's existing `CLAUDE.md` (Rotem's constraints) before generating. It must be byte-identical after generation; check with `git diff --stat -- '<folder>/CLAUDE.md'` at the end.

## 2. Generator by location (SPEC §11.1, §11.2)

| Location | Generator |
|---|---|
| `apps/api` | `@nx/nest:application` (NestJS 11, CommonJS, Jest) |
| `apps/api-e2e` | created by the Nest application generator |
| `apps/web` | `@nx/react:application` with Vite, Vitest and Playwright e2e (`apps/web-e2e`) |
| `apps/desktop` | no Nx plugin: a plain project with `nx:run-commands` targets wrapping electron-vite 5 (`dev`, `build`, `preview`) and Vitest for main and preload |
| `apps/desktop-e2e` | plain project with `nx:run-commands` targets wrapping `@wdio/electron-service` |
| `libs/api/*` | `@nx/nest:library` |
| `libs/web/*` | `@nx/react:library` (Vite bundler, Vitest) |
| `libs/shared/*` | `@nx/js:library`; no runtime dependencies |

Generator flags SPEC.md does not settle (buildable or publishable libraries, linter, strictness, e2e runner options, compiler) are not chosen here. Before the first project is generated, ask Rotem for them in chat and record the answers in SPEC.md §11.2 so every later project uses the same flags. Run generators with `--dry-run` first and show the file list.

## 3. Naming, alias, tags

- Folder: `libs/<scope>/<type>-<name>` or `apps/<name>`; project name `<scope>-<type>-<name>` for libs.
- Import path: `@rsn/<scope>/<type>-<name>` (`--importPath`), and the matching entry in `tsconfig.base.json` paths.
- `project.json` tags for libraries: `scope:<shared|api|web|desktop>` and `type:<feature|data-access|ui|util>`. Apps carry the `scope:*` tag from the SPEC §11.3 table; SPEC names no `type:*` tag for apps, so none is added until Rotem writes one into SPEC.
- `depConstraints` in the root ESLint config encode the SPEC §11.3 table; add nothing beyond it.

## 4. Verify

- `pnpm nx show project <name> --json` shows the tags and targets.
- `pnpm nx lint <name>` and `pnpm nx test <name>` pass on the generated skeleton.
- `git status` shows no change to any `CLAUDE.md`, `.env.example`, `SPEC.md` or `MEM.md`.
- Run `arch-reviewer` on the new project, then offer `/commit` with `build: add <project> per SPEC §11.3`.
