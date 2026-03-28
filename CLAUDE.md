# Normandy - AI Orchestrator

## What this is

An AI-powered code generation CLI built in TypeScript using the Claude API (`@anthropic-ai/sdk`). Uses a supervisor-specialist agent architecture themed after Mass Effect.

## Architecture

**Commander Shepard** (supervisor agent) receives user requests, decomposes them into tasks, and delegates to specialist squad members via the `delegate_task` tool. Each specialist runs its own agentic loop with streaming (`client.messages.stream()` + `finalMessage()`).

### Squad (specialist agents)

| Agent | ID | File | Model | Role |
|---|---|---|---|---|
| Commander Shepard | `shepard` | `src/agents/supervisor.ts` | opus-4-6 | Orchestrates, delegates |
| Tali'Zorah | `tali` | `src/agents/specialists/web-app.ts` | opus-4-6 | Web apps (React, Next.js, Vue) |
| Garrus Vakarian | `garrus` | `src/agents/specialists/video-game.ts` | opus-4-6 | Games (Phaser, Unity, Godot) |
| Liara T'Soni | `liara` | `src/agents/specialists/mobile-app.ts` | opus-4-6 | Mobile (React Native, Flutter, Swift) |
| Miranda Lawson | `miranda` | `src/agents/specialists/code-review.ts` | sonnet-4-6 | Code review & QA |
| Mordin Solus | `mordin` | `src/agents/specialists/architect.ts` | opus-4-6 | Architecture & design |

### Key modules

- `src/core/agent.ts` — `BaseAgent` with the agentic loop (streaming, tool dispatch, retry)
- `src/core/task-manager.ts` — Mission lifecycle, connects Shepard's delegation to specialist execution
- `src/tools/` — Tool system (file ops, shell commands, code search, agent delegation, git/GitHub)
- `src/tools/git-tools.ts` — Git and GitHub tools (git_init, git_commit, create_github_repo, create_pull_request, create_issue, list_issues)
- `src/orchestrator.ts` — `Normandy` class: wires agents, tools, and task manager together
- `src/index.ts` — CLI entry point with interactive CIC (REPL) and one-shot modes

## Running

```bash
normandy                           # interactive CIC REPL (default output: ./output)
normandy -p my-app                 # REPL, outputs to ~/Workspace/my-app/
normandy -p my-app "Build a thing" # one-shot mode
normandy -s tali "Build a site"    # deploy a squad member directly
```

Requires `ANTHROPIC_API_KEY` in environment or `.env` file.

## Development

```bash
npm run dev          # run via tsx (no build needed)
npm run build        # compile to dist/
npm link             # install `normandy` command globally
```

## Conventions

- npm registry: use `--registry https://registry.npmjs.org/` (system .npmrc points to CodeArtifact)
- Mass Effect theming: supervisor = Shepard, specialists = crew members, tasks = missions, REPL = CIC
- Specialists are added by: creating a file in `src/agents/specialists/`, adding config, and registering in `src/agents/index.ts`
- Git/GitHub tools: Shepard gets repo creation, all builders get git_init/git_commit, Miranda gets create_issue/create_pull_request
- GitHub CLI (`gh`) must be authenticated for GitHub tools to work
