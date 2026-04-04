# Stay Focused

Stay Focused is a personal productivity web app focused on reducing friction for students by syncing academic course content from Canvas and turning it into a clearer task-based workflow.

## Current Focus

The app is being developed as a Canvas-first workflow tool. Instead of manually creating modules, users sync course content from Canvas and view tasks, deadlines, and course-related work in a simplified dashboard.

## Current Features

- Canvas-only course sync flow
- Duplicate prevention for repeat syncs
- Dashboard rendering for synced tasks
- Error handling for invalid API keys
- Empty-state handling for courses with no active results
- Browser/runtime verification for main sync flows

## Known Limitation

- There is still an edge case where a course with no usable content may fail instead of showing the intended friendly inline error.

## Tech Stack

- Next.js
- React
- TypeScript
- Supabase
- Canvas API
- Playwright

## Local Development

1. Install dependencies

```bash
npm install