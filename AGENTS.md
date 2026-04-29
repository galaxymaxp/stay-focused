<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Stay Focused — AI Agent Operating Manual

## Mission Lock

Stay Focused is a **schedule-first student productivity app over Canvas**.

Every substantial change should strengthen this question: **“What should I do next with the time I have available?”**

## Required Reading Before Major Work

1. Read `docs/ai/project_context.md`.
2. Read `docs/ai/handoff.md`.
3. If planning implementation, read `docs/ai/implementation_plan.md`.

## Session Start / End Discipline

### Before coding

- Confirm current direction in `docs/ai/project_context.md`.
- Review latest continuity notes in `docs/ai/handoff.md`.

### After every coding session

- Update `docs/ai/handoff.md` with:
  - what changed
  - why it changed
  - current product direction
  - next recommended steps
  - risks/blockers
  - explicit note if session was docs-only

## Quality Gates Before Handoff

Run before final handoff whenever practical:

- `npm run lint`
- `npm run typecheck`
- relevant tests/checks for touched areas

If any check is skipped, explain why in handoff notes.

## Commit Discipline

- Use **checkpoint commits** before major implementation chunks.
- Keep commits scoped and readable.
- Avoid unrelated edits in the same commit.
- Preserve clean Git ownership (no bot/co-author trailers unless explicitly requested by repo owner).

## Product Guardrails (Non-Negotiable)

1. Protect schedule-first hierarchy:
   1. Schedule / Today Plan
   2. Calendar (feeder)
   3. Tasks
   4. Deep Learn / Review / Quiz
   5. Do Draft / Outputs
2. Calendar is a feeder system, **not** the home command surface.
3. Every feature should reduce overwhelm and improve execution clarity.
4. Prefer improving existing architecture over random rewrites.
5. Avoid unnecessary file churn.
6. Preserve responsive, modern, 2026-quality UI standards.

## Implementation Safety

- Do not introduce runtime behavior changes during docs-only tasks.
- Avoid schema/migration changes unless the task explicitly requires them.
- Reuse existing components and flows before proposing net-new structure.
- Keep compatibility routes stable unless explicitly authorized to change.

## Documentation Standards

- Keep guidance concise, practical, and implementation-ready.
- Replace vague roadmap language with concrete operator instructions.
- Ensure `README.md` and `/docs/ai/*` stay aligned after meaningful direction updates.
