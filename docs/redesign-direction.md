# Stay Focused redesign direction

Updated: 2026-04-10

## Revised design direction

Stay Focused should move away from a soft, cozy, center-column aesthetic and toward a more structured academic workspace. The open-book icon is the clearest brand reference, so the interface should inherit its visual logic instead of treating it as a separate logo.

Core direction:

- Clean geometry: straighter edges, more deliberate alignment, fewer overly soft or floating treatments.
- Bold structure: panels should read as architectural pieces of the workspace, not as loosely placed cards.
- Academic feel: think reading room, desk surface, syllabus margin, and annotated notebook rather than glow-heavy productivity UI.
- Restrained accent use: accent color should mark priority, motion, active state, and loading progress, not wash large surfaces by default.
- Confident page use: major dashboard screens should occupy more of the viewport with stronger horizontal composition, while copy blocks still keep a readable line length.

Design implications for the current UI:

- The shell should feel more like a framed study workspace than a centered stack of small panels.
- Large surfaces should use stronger borders, quieter fills, and clearer hierarchy before adding more color.
- Typography and spacing should create authority through rhythm and scale, not through more decorative effects.
- Loading states should feel branded and intentional, not like temporary placeholders.

## Layout strategy

The app is currently double-constrained: `app-frame` caps the full app, then `page-shell` caps major content again at `1080px`. The redesign should loosen the inner cap first.

Recommended width tiers:

- `reading`: `840px` to `960px`
  Use for auth, settings, and text-heavy single-column flows.
- `workspace`: `1180px` to `1280px`
  Use for module pages and detail views that need room but still benefit from focus.
- `dashboard`: `1320px` to `1440px`
  Use for Today, Courses, Learn, and Do.
- `full-workspace`: `1480px` to `1560px`
  Use for Calendar and other grid-heavy pages.

Recommended shell changes:

- Increase `.app-frame` from `1440px` to roughly `1600px` to `1680px`, with responsive gutters instead of a larger visual blob.
- Replace the single `page-shell` default with route-level width variants such as `page-shell-reading`, `page-shell-workspace`, `page-shell-dashboard`, and `page-shell-full`.
- Keep long copy inside local `max-width` rules even when the page shell is wide.
- Favor 2-column and 3-column dashboard compositions on desktop instead of stacking major panels into one narrow column.
- Let hero sections, dashboard summaries, and calendar canvases stretch wider, but keep cards aligned to a shared grid.

Page-level recommendations:

- Today:
  Use a wider hero region and let the supporting dashboard sections form a stronger two-column field.
- Courses and Learn:
  Promote course cards into a denser but still ordered grid with more breathing room between rows than between inner card elements.
- Do:
  Keep urgency groups full-width, but allow their task grids to expand more aggressively on large screens.
- Calendar:
  Treat this as a full-workspace layout with the month grid and selected-day rail sized as deliberate companion panels, not compressed siblings.

## Loading system rules

Loading needs a small set of reusable primitives instead of one-off `animate-pulse` blocks.

Shared primitives to add:

- `TopLoadingBar`
  A shell-level animated bar for route and page transitions.
- `BrandedBookLoader`
  An animated version of `StayFocusedIcon` for major or spacious loading moments.
- `PageLoadingStage`
  A centered page loading composition that can combine book icon, label, and loading bar.
- `PanelLoadingState`
  A large-card or panel loading block with optional book icon plus bar.
- `SkeletonBlock`
  A neutral shimmer block for content density and final layout preservation.

Rules:

- Prefer a loading bar over a spinner.
- Use the accent color in the moving progress segment, not as a full-surface wash.
- Keep skeletons neutral and structural; they should describe layout, not compete with content.
- Use the animated book only when the space is large enough for it to feel branded rather than decorative.
- Never place the animated book on every inline mutation or tiny control.

## Loading patterns by context

### Route/page transitions

Primary pattern:

- Show a top loading bar immediately on major navigation.
- If the destination keeps shell chrome visible, the bar alone is usually enough at first.
- Escalate to a centered page loading stage when the route is doing a major cold load, hard refresh, or initial page render and the content area would otherwise feel empty.

Visual makeup:

- Thin bar anchored to the top edge of the topbar or main content frame.
- Neutral track, animated accent segment, soft easing.
- Optional page label below only in centered page loading states.

### Dashboard/home loading

Primary pattern:

- Use a composed dashboard loading layout, not a pile of generic pulses.
- Lead with a centered branded book icon plus loading bar during major page loads.
- Keep low-detail structural skeletons for the hero, announcement band, and major section blocks so the final composition is still previewed.

Why:

- Home is the command center and the most identity-defining page, so loading there should establish the redesigned system immediately.

### Section/card loading

Primary pattern:

- Use skeletons or shimmer blocks sized to the final content.
- Add a compact loading bar in the card header or top edge for larger panels.
- Use the book icon only inside large panels where a bar alone feels visually weak, such as hero cards, large dashboard tiles, or calendar companion panels.

Avoid:

- Book icon on every small card.
- Independent loading animations fighting each other in the same section.

### Modal loading

Primary pattern:

- Keep modal chrome visible.
- Use a short loading bar near the status banner or header.
- Use skeleton content blocks in the body.
- Add a small or medium animated book icon only when the modal body is otherwise visually empty and the modal is large enough to support it.

For Auto Prompt:

- Replace the current pulse-only stack with a status header, branded loading bar, and structured skeleton sections.

## Where each loading treatment should appear

### Top loading bar

Use for:

- Primary route transitions.
- Large shell-level refresh moments.
- Multi-step sync or generation flows when the user remains in context.

Do not use as the only indicator when:

- The page body is otherwise empty and a full-page loading moment is clearer.

### Centered loading screen

Use for:

- Initial page loads of Today and other high-importance routes.
- Hard reloads where the main canvas is fully unavailable.
- Major transitions into large dashboard screens when the shell persists but the content void would feel abrupt.

### Animated book icon

Use for:

- Center of the page during major page loads.
- Inside large cards or panels when a loading bar alone feels too slight.
- Larger modal bodies when the user is waiting on a meaningful generation or fetch.

Do not use for:

- Small button submits.
- Tiny inline updates.
- Chips, toggles, or compact list rows.
- Every card in a list.

### Skeletons and shimmer

Use for:

- Section and card loading.
- Dense content placeholders.
- Modal body placeholders after the status/loading header is already visible.

Do not use alone for:

- The main branded loading moments on Home or other high-importance full-page transitions.

## First implementation pass

The first pass should aim for the biggest visual improvement with the smallest structural change set. It should not attempt a whole-site rewrite.

### Pass 1 goals

- Establish the new width system and loading primitives.
- Make the shell and main dashboard routes feel materially more confident.
- Replace the most visible generic loading states with branded, reusable patterns.

### First files and components to change

Foundation:

- `app/globals.css`
  Add width-tier classes, loading tokens, shimmer styles, loading-bar styles, and book-loader keyframes.
- `components/StayFocusedIcon.tsx`
  Keep the base mark, but make it reusable for animation states or wrap it with a new loading-specific component.
- New components:
  - `components/loading/TopLoadingBar.tsx`
  - `components/loading/BrandedBookLoader.tsx`
  - `components/loading/PageLoadingStage.tsx`
  - `components/loading/PanelLoadingState.tsx`
  - `components/loading/SkeletonBlock.tsx`

Shell and page width:

- `components/AppShell.tsx`
  Adjust shell framing, prepare a slot for the top loading bar, and align shell language with the new academic direction.
- `app/layout.tsx`
  Wire global loading primitives if needed at the shell level.

Highest-impact route loading:

- `app/loading.tsx`
  Convert Home loading into the flagship branded loading composition.
- `app/calendar/loading.tsx`
  Convert Calendar loading into a full-workspace panel composition with stronger structure.
- `app/do/loading.tsx`
  Replace generic pulses with the shared system.

Largest visible content layouts:

- `app/page.tsx`
- `components/TodayDashboard.tsx`
- `app/calendar/page.tsx`
- `components/CalendarDashboard.tsx`

Modal loading:

- `components/DoNowPanel.tsx`
  Replace pulse-only modal loading with loading bar plus structured skeletons and optional book mark.

Secondary rollout after the first pass:

- `app/courses/page.tsx`
- `app/learn/page.tsx`
- `components/ModuleLensShell.tsx`
- `components/SyncFirstEmptyState.tsx`

## Implementation priority order

1. Update `app/globals.css` with width tiers, loading tokens, loading bar styles, shimmer, and book-loader motion.
2. Add shared loading primitives under `components/loading/` and make them design-system level building blocks.
3. Widen the shell and major page containers in `components/AppShell.tsx` and the page shell classes so the app uses the viewport better without breaking every route at once.
4. Replace `app/loading.tsx`, `app/calendar/loading.tsx`, and `app/do/loading.tsx` with the new branded loading patterns.
5. Update `components/TodayDashboard.tsx` and `components/CalendarDashboard.tsx` to take advantage of the wider layout and stronger panel structure.
6. Retrofit `components/DoNowPanel.tsx` so modal loading follows the same system.
7. Extend the layout and loading updates to Courses, Learn, and module-level shells after the shared primitives have proven out.

## Incremental guardrails

- Do not rewrite every card component in pass 1.
- Do not introduce the animated book on every async interaction.
- Do not remove skeletons; combine them with the loading bar and branded moments instead.
- Keep mobile behavior conservative: wider desktop layouts should collapse cleanly back to the current single-column rhythm.
- Preserve existing data flow and loading boundaries; the first pass is visual system work, not new data architecture.
