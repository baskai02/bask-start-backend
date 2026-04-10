---
name: explain-and-test
description: Use when reporting Bask backend changes. Enforces concise explanation of file changes, behavior changes, assumptions, exact manual test steps, and the next best step after each meaningful change.
---

# Explain And Test

Use this skill only for final reporting after meaningful work is done.

Do not use it to choose implementation details.

## Required Output

Always include:

1. files changed
2. what each file change does
3. the behavior change
4. exact manual test steps
5. assumptions
6. the next best step

## Rules

- Name the real backend behavior that changed, not just the code.
- If the frontend payload changed, say so clearly.
- If the server behavior matters, remind that `npm start` uses `dist`.
- Keep it short.

## Manual Test Format

Give exact commands.

```bash
cd /Users/olivergilder/Documents/Bask_start
npm run build
npm test
```

If live verification matters:

```bash
pkill -f "node dist/server.js"
npm start
curl http://localhost:3000/health
```

## Assumptions

State only assumptions that affect interpretation.

## Next Step

Suggest one next best step unless the user asked for options.
