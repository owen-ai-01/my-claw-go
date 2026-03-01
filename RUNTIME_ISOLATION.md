# MyClawGo Runtime Isolation Policy (MUST)

This project enforces strict per-user runtime isolation.

## Core Rule

All user-entered messages/commands MUST execute only inside that user's own Docker container:

- container name: `myclawgo-{sessionId}`
- data root: `/home/openclaw/project/my-claw-go/.runtime-data/users/{sessionId}`

No user request may execute OpenClaw commands on the host machine.

## Allowed Execution Path

1. Frontend input includes `sessionId`
2. API resolves `sessionId -> containerName`
3. Backend executes via `docker exec <containerName> ...`
4. Return output to that same user session

## Forbidden

- Running `openclaw ...` directly on host for user requests
- Installing skills/agents/auth on host to satisfy user runtime operations
- Cross-session container operations

## Product Intent

After registration/payment, each user gets an isolated OpenClaw Docker runtime.
The UX should feel like each user has their own private OpenClaw machine.
