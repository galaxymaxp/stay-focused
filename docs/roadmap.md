# Stay Focused Roadmap

## Product Direction

Stay Focused remains an action-first study workspace. The app should help a student decide what to do next, complete work with less friction, and keep generated outputs available after the moment they were created.

- Main pages: Home, Courses, Study Library, Calendar, Settings
- Keep Study Library as the permanent generated-content hub
- Do not restore Drafts as a primary navigation item
- Drafts are a content type inside Study Library
- Study Library is the bookshelf for all generated outputs, including Learning packs and Task drafts
- `/drafts` routes may redirect into Study Library, but they do not define product IA anymore
- Do not add new primary navigation without explicit product approval

## Non-Negotiable UX Rules

- Action-first, not information-first
- One purpose per page
- Reduce cognitive load before adding density
- No fake density or dashboard clutter
- Persistent generated outputs, not ephemeral AI surfaces
- Soft-glow 2026 responsive UI
- User-configurable accent color across app chrome and overlays
- Custom or minimal nested scrollbars where nested scrolling is necessary
- Study Library filters remain `All`, `Learning`, and `Tasks`

## Current Priorities

1. Keep Study Library coherent as the single saved-output destination.
2. Preserve compatibility for old Drafts links without restoring Drafts navigation.
3. Make notifications visible in active tabs through native in-app toasts.
4. Persist AI-derived course summaries so course pages do not trigger OpenAI on every render.
5. Keep docs, schema, and implementation aligned with the shipped product direction.

## Future Features

- richer Study Library filtering and sorting within the existing IA
- better invalidation and refresh controls for persisted generated metadata
- tighter runtime verification coverage for high-value routes
- more grounded learning-output generation from extracted resource text
- additional quality-of-life polish for multi-course planning and saved-output recovery
