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
```

## Reprocess Failed PDFs

If older `module_resources` rows failed because PDF extraction was broken, rerun extraction directly from their stored Canvas download URLs:

```bash
npm run reprocess:resources -- --failed-pdfs
```

To target specific files:

```bash
npm run reprocess:resources -- --title "Student Handbook.pdf"
```

This refreshes the stored extraction fields on `module_resources`. If you also want the module-level AI summary to be rebuilt from the newly extracted text, unsync that course in the app and sync it again from `/canvas`.

## Refresh Canvas Pages

Canvas Page extraction is picked up during normal course sync. For courses that were already synced before Page support landed, unsync that course in the app and sync it again from `/canvas` so page-backed study materials can be ingested with their readable body text.
