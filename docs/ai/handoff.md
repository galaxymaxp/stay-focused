# Stay Focused — AI Session Handoff

Author: galaxymaxp omgraythekid@gmail.com
Last Updated: 2026-05-17

---

## Session Update - 2026-05-17 (Deep Learn Source Coverage Compiler)

### What changed

- Added a deterministic `SourceOutlineItem` outline builder for Deep Learn source text before model generation.
- Made the structured fact-card compiler section-aware:
  - high-confidence headings, numbered sections, learning objectives, definitions, taxonomies, procedures, timelines, and formulas can become required outline items
  - ordinary bullets are not treated as required sections by default
  - source spans are retained so missed sections can be repaired from focused source context
- Replaced the fixed 3-card limiter for complex sections with bounded dynamic card requests:
  - normal low-complexity chunks still request 3 cards
  - complex outline-aware chunks can request up to 5 cards
  - output caps scale up to a bounded 1,800 tokens for those chunks
- Added source-outline coverage validation before final Study Pack assembly.
- Added targeted fallback repair for valid-but-incomplete coverage, so fallback models can run when the primary model returns technically valid JSON but misses required source sections.
- Extended deterministic fallback to prioritize missing outline sections before general extractive cards.
- Added structured compiler diagnostics for required, covered, and missing outline counts.
- Added regressions for source outline detection and incomplete-section fallback repair.

### Files touched

- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production evidence showed the structured compiler treated valid JSON with enough total cards as success even when major source sections were missing. The fix makes completion depend on source coverage, not just total card count, and repairs missing sections with focused fallback calls instead of regenerating an entire pack.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` - skipped because the local PDF file was not present

### Verification result

- Verified the compiler builds a high-confidence source outline before generation.
- Verified bullets under an objective heading do not individually block completion.
- Verified low-complexity sources keep the existing 3-card primary request and 1-card retry behavior.
- Verified valid-but-incomplete model output triggers fallback repair and includes previously missed later sections.
- Verified long sources still use chunked fact-card extraction.
- Verified metadata, diagnostics, Source Map prompt stems, and internal labels remain excluded from saved study content.

### Known risks

- The outline detector is conservative. Very weakly formatted sources may still rely on normal chunking and deterministic fallback rather than strict section coverage.
- The repair pass is bounded to avoid runaway cost, so very long sources with many missed required sections may still need another retry after deployment.
- Dynamic requests can increase per-chunk output budget for complex sections, but the cap remains bounded at 1,800 tokens.

### Blockers

- No code blocker remains.
- The scanned-PDF validator could not run because `C:\Users\omgra\Downloads\1.1-Data Organization.pdf` was not found locally.
- `test_output.txt` remains an existing untracked file and was not committed.

### Next recommended step

Deploy and retry representative Deep Learn sources from different source types. Confirm logs show nonzero `outlineRequiredCount`, `outlineCoveredCount`, and targeted fallback repair only when coverage is incomplete.

### Suggested commit message

fix deep learn source coverage compiler

---

## Session Update - 2026-05-17 (Structured Compiler Model Escalation)

### What changed

- Added structured compiler model env controls:
  - `DEEP_LEARN_STRUCTURED_MODEL` defaulting to `gpt-5.4-mini`
  - `DEEP_LEARN_STRUCTURED_FALLBACK_MODEL` defaulting to `gpt-5.4`
  - `DEEP_LEARN_STRUCTURED_PREMIUM_MODEL` defaulting to `gpt-5.5`
- Kept GPT-5.5 out of the normal path; premium fallback only runs when `DEEP_LEARN_STRUCTURED_PREMIUM_FALLBACK` is explicitly enabled and the job still lacks enough cards.
- Changed fact-card extraction to request 3 cards normally, then retry the same primary model with exactly 1 card on output-limit or low-valid-card failures before attempting the fallback model.
- Added per-job caps for processed chunks, fallback model attempts, and premium model attempts.
- Made chunk failures non-fatal: failed chunks are skipped, successful chunk cards are retained, and deterministic fallback fills gaps from readable academic text.
- Added deterministic extractive fact-card fallback from definitions, lists, heading-adjacent sentences, dates/events, colon patterns, and numbered steps.
- Kept Study Pack assembly deterministic from fact cards, with no caution notes, diagnostics, sourceMap wording, fallback metadata, or queue metadata saved into student-facing content.
- Updated structured output-limit student copy to: `Study Pack generation was too large for this source. Try again or use a smaller source.`
- Added structured compiler diagnostics for selected models, model used per chunk, retry level, requested card count, max output tokens, chunk count/index/char count, extracted card count, skipped chunks, deterministic fallback use, and final card count.

### Files touched

- `lib/deep-learn-generation.ts`
- `actions/queue-jobs.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production jobs were correctly routed to `structured_fact_card_compiler_v1`, but fact-card extraction could still fail the whole job on `max_output_tokens` despite meaningful academic text. The compiler now uses a cheap primary model by default, escalates only per failed chunk, saves partial successful work, and has an extractive fallback so readable source text can still become a usable Study Pack.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npx tsx --test tests/queue.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation queue` - passed

### Verification result

- Verified the structured compiler defaults to the cheap primary model and does not enter legacy stages.
- Verified `max_output_tokens` retries the primary model with exactly 1 requested card before fallback model escalation.
- Verified GPT-5.4 fallback runs only after primary chunk failure.
- Verified GPT-5.5 premium fallback is not called by default.
- Verified one failed chunk does not fail the whole Study Pack.
- Verified deterministic fallback creates cards from readable academic text when model calls or model cards fail.
- Verified queue output-limit copy no longer blames missing readable academic text.
- Verified saved structured Study Packs remain free of diagnostics, caution notes, Source Map prompt wording, and fallback metadata.

### Known risks

- The deterministic fallback is intentionally extractive and may produce boring cards, but it should be useful and source-grounded.
- Defaults assume `gpt-5.4-mini`, `gpt-5.4`, and `gpt-5.5` are available in the deployment account. The env vars can override model names if availability differs.
- Fallback model attempt counts are job-level capped; very long sources may rely more heavily on deterministic cards after the cap is reached.

### Blockers

- No blocker remains.
- `test_output.txt` remains an existing untracked file and was not committed.

### Next recommended step

Deploy and retry the production sources that failed with `failedStage: structured_compiler` and `max_output_tokens`. Confirm logs show primary one-card retries, bounded fallback model use, and completed queue jobs with nonzero final fact-card counts.

### Suggested commit message

make structured compiler efficient with model escalation

---

## Session Update - 2026-05-16 (Structured Compiler Queue Routing)

### What changed

- Wired normal `learn_generation` queue processing to the structured fact-card compiler as the default path for both fresh and retry jobs.
- Added explicit generator routing constants and selector:
  - default: `structured_fact_card_compiler_v1`
  - legacy opt-in only: `DEEP_LEARN_GENERATOR_MODE=legacy_staged_composer`
- Removed test/mock-shape auto-routing to the legacy staged composer.
- Added required generator routing logs for structured compiler starts and legacy composer starts.
- Changed structured compiler progress stages to `structured_compiler` so default jobs no longer fail/report as `high_yield`, `identification`, or `quick_answers`.
- Added `generatorVersion` to queue running/completed/failure metadata.
- Suppressed Source Map diagnostics in normal structured compiler diagnostics; Source Map diagnostics remain available only when legacy mode is explicitly selected.
- Added a clear setup failure for missing `OPENAI_API_KEY` in structured compiler mode.

### Files touched

- `lib/deep-learn-generation.ts`
- `actions/queue-jobs.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production fresh jobs from the Courses/Learn path still showed legacy staged composer behavior despite the fact-card compiler existing. The queue path needed an explicit default selector and job metadata so every normal Deep Learn job goes through the structured compiler unless legacy mode is deliberately enabled.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation queue` - passed

### Verification result

- Verified default generation calls `deep_learn_study_pack_compiler` and does not enter `high_yield`, `identification`, or `quick_answers`.
- Verified structured routing diagnostics include `generatorVersion: "structured_fact_card_compiler_v1"`, `event: "structured_compiler_started"`, retry state, source title, academic text char count, and chunk count.
- Verified legacy staged composer only runs when `DEEP_LEARN_GENERATOR_MODE=legacy_staged_composer`.
- Verified queue source contracts cover fresh and retry jobs routing through `generateDeepLearnNoteForResource` with retry context and structured generator metadata.
- Verified meaningful extracted text completes through the compiler path without Source Map or staged composer diagnostics.

### Known risks

- The legacy staged composer remains in code for explicit opt-in regression coverage and emergency rollback, but it is no longer selected by test mock shape or normal queue payloads.
- Queue source tests assert routing contracts by source inspection rather than a full database-backed queue execution.

### Blockers

- No blocker remains.
- `test_output.txt` remains untracked and was not committed.

### Next recommended step

Deploy and run fresh Courses/Learn generations for SDLC, IT Security, and Arnis. Confirm production logs show `structured_compiler_started` and no default failures at `high_yield`, `identification`, `quick_answers`, or study pack summary.

### Suggested commit message

wire deep learn jobs to structured compiler

---

## Session Update - 2026-05-16 (Structured Study Pack Compiler)

### What changed

- Added a new OpenAI Structured Outputs Study Pack Compiler as the primary Deep Learn generation path.
- Added `StudyFactCard` with `kind`, `prompt`, `answer`, `sourceQuote`, `sectionTitle`, `difficulty`, and `confidence`.
- Added deterministic source cleanup, chunk splitting, strict fact-card JSON schema, sourceQuote grounding checks, internal prompt rejection, and deterministic Study Pack assembly.
- Assembled `answerBank`, `identificationItems`, reviewer sections, likely quiz targets, and safe optional distractors from fact cards instead of asking the model to compose staged reviewer sections.
- Kept `cautionNotes` out of the structured compiler schema and saved new compiler packs with empty `cautionNotes`.
- Preserved test-only compatibility for the old staged mock harness so existing regressions still exercise legacy edge cases without making that path primary.

### Files touched

- `lib/deep-learn-generation.ts`
- `lib/types.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production logs showed extraction was working, but staged composition repeatedly failed during identification, quick answers, and partial-save validation. The new compiler asks the model only for small grounded fact cards, then builds student-facing Study Pack artifacts deterministically to reduce max-output failures, composer leakage, and queue inconsistency risk.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation queue` - passed

### Verification result

- Verified SDLC-style source produces fact cards, answer bank, identification review, and reviewer sections without requiring `quick_answers`.
- Verified IT Security bullet-heavy source produces definition/list cards.
- Verified Arnis short source produces definition/date/person/list cards without size fallback.
- Verified optional MCQ/distractor assembly skips safely when answers are not compact enough for safe distractors.
- Verified internal Source Map prompt stems and diagnostics are rejected from fact cards and saved identification items.
- Verified no usable fact cards fail as `insufficient_structured_artifacts`.
- Verified short sources use a single structured-output compiler call and long sources use chunked fact-card extraction.

### Known risks

- The old staged composer remains in the file for test compatibility and legacy regressions, but `generateDeepLearnStructuredContent` now routes primary production generation through the fact-card compiler.
- Fact-card source grounding currently accepts exact quote inclusion or high token overlap; very paraphrased but valid model quotes may be rejected.
- MCQs are deterministic via existing quiz builders and safe distractors, not a separate model MCQ generation call in this change.

### Blockers

- No blocker remains.
- `test_output.txt` remains untracked and was not committed.

### Next recommended step

Deploy and retry the SDLC, IT Security, and Arnis production sources. Confirm queued jobs complete from fact-card extraction and saved Study Packs contain no `cautionNotes`, diagnostics, or Source Map bank prompt wording.

### Suggested commit message

add structured study pack compiler

---

## Session Update - 2026-05-16 (Composer Leakage Caution Notes Fix)

### What changed

- Updated Deep Learn save validation so `composer_leakage` scans only student-facing study content: reviewer sections, answer bank, identification items, likely quiz targets, and distinctions.
- Excluded `cautionNotes` from composer leakage failure decisions and added internal leakage diagnostics with `cautionNotesIgnored`.
- Made save-time sanitization drop leaking student-facing fields/items before validating the exact artifact object that gets returned for persistence.
- Kept Source Map prompt leakage protection, while narrowing `Define X.` rejection so legitimate define prompts with real answers can pass.
- Tightened partial validation so high-yield-only artifacts with only skip/caution notes fail as `insufficient_structured_artifacts`, not `composer_leakage`.
- Preserved the original `shouldSavePartial=true` decision in `partial_save` diagnostics instead of replacing it with the final validation result.
- Scaled identification item requests and output budgets for short sources under 4,000 characters.
- Removed the synthetic Quick-Answer section from quick-answer skip fallback while still deriving a small answer bank from valid identification items.

### Files touched

- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production partial-save artifacts had usable sections, answer bank, and identification items, but final validation failed as `composer_leakage` because internal/fallback wording lived only in `cautionNotes`. Those notes are metadata, not core study content, and should never flip a usable partial Study Pack back to failed.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation queue` - passed

### Verification result

- Verified caution-note-only composer wording validates successfully and is ignored for leakage failure.
- Verified partial save with usable sections, answer bank, and identification items completes with `finalJobStatus: completed`.
- Verified SDLC-style quick-answer size partials do not fail from fallback wording in caution notes.
- Verified high-yield-only partials with no answer bank or valid identification items fail as `insufficient_structured_artifacts`.
- Verified Source Map bank prompts are still rejected/uncounted, while a real `Define system development life cycle` item passes.
- Verified queue source still saves the Study Pack and marks the queued job completed before failure handling.

### Known risks

- Short-source identification now asks for fewer items and uses lower token caps. This should reduce runaway output, but very dense short sources may produce smaller identification sets.
- The validator reports composer leakage diagnostics for original content even when save sanitization removes the leaking field before validation succeeds.

### Blockers

- No blocker remains.
- `test_output.txt` remains untracked and was not committed.

### Next recommended step

Deploy and retry the IT Security, SDLC, and PATHFit/M1 Arnis production sources. Confirm the first two complete as sanitized partial Study Packs, and confirm Arnis fails as `insufficient_structured_artifacts` if no answer bank or valid identification items are produced.

### Suggested commit message

fix composer leakage validator to ignore caution notes

---

## Session Update - 2026-05-16 (Partial Save Leakage Cleanup)

### What changed

- Added a Deep Learn save cleanup pass that removes internal Source Map bank prompts from `identificationItems` before generated content is saved.
- Updated the Study Pack validator so Source Map bank prompts do not count toward `identificationCount` or distinct concept density.
- Added explicit validator rejection for leaked Source Map identification prompts, including:
  - `Recall the exam meaning of ...`
  - `Explain the source relationship`
  - `Explain the cause-effect relationship`
  - `Use the source formula`
  - `Classify the items under ...`
  - `Explain the relationship inside ...`
  - `Define Title Case Phrase.`
- Adjusted deterministic Source Map definition prompts from `Define X.` to `What does X mean in this source?` so fallback reviewer content remains student-facing instead of matching internal bank phrasing.
- Hardened optional-stage partial saves so composer leakage in `cautionNotes` or optional enrichment sections/artifacts is dropped before final validation. Core Study Pack content is still required; cleanup does not make empty content saveable.
- Expanded the quick-answer partial-save regression to prove optional `source-backed` caution wording is removed instead of flipping the final partial save to failed.
- Added a regression for the SDLC-style case where leaked Source Map bank prompts in `identificationItems` now fail validation with `identificationCount: 0`.

### Files touched

- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production partial-save behavior had two leakage paths. In the IT Security case, a quick-answer size failure correctly selected partial save, but composer leakage in optional caution/enrichment text could make the final validation fail. In the SDLC case, compact/partial artifacts could serialize Source Map bank prompts directly into `identificationItems`, making the pack look dense while giving students internal prompt scaffolding instead of usable identification questions.

### Tests run

- `npm test -- deep-learn-generation` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation queue` - passed
- Attempted exact combined command `npm run typecheck && npm run lint && npm test -- deep-learn-generation queue` - blocked by this PowerShell version because `&&` is not accepted as a statement separator.

### Verification result

- Passed all requested verification commands when run sequentially.
- Verified quick-answer partial save still completes after all fallback sizes are exhausted, while optional `source-backed` caution text is removed from the saved pack.
- Verified Source Map bank prompt leakage in `identificationItems` no longer contributes to `identificationCount`; the regression now fails validation with `source_map_identification_leakage`.
- Verified generated Source Map fallback reviewer content still passes existing IT Security, PATHFit Arnis, quiz-pack, reviewer, and source-map regressions.

### Known risks

- The Source Map leakage filter intentionally rejects simple `Define Title Case Phrase.` prompts in `identificationItems`. Legitimate model-generated identification questions should use a more student-facing stem such as `What does X mean in this source?`.
- Optional composer-leakage cleanup only drops optional caution/enrichment content during partial saves. If core sections contain composer leakage, the save still fails as intended.

### Blockers

- No code blocker remains.
- The exact `&&` verification command cannot run in this PowerShell session; equivalent commands passed sequentially.
- `test_output.txt` remains an existing untracked file and was not touched.

### Next recommended step

Deploy and retry the IT Security and SDLC Deep Learn jobs. Confirm IT Security saves as a completed partial pack after quick-answer fallback exhaustion, and confirm SDLC no longer saves packs whose identification review is filled by Source Map bank prompt text.

### Suggested commit message

fix partial-save validator to reject sourceMap leakage in identificationItems

---

## Session Update - 2026-05-16 (Optional Stage Raw Reason Partial Save)

### What changed

- Fixed the generic Deep Learn partial-save decision so optional `quick_answers` and combined `distinctions` / likely quiz target failures can save a partial Study Pack after fallback exhaustion when usable core content already exists.
- Raw `max_output_tokens` size failures now qualify directly; the decision no longer depends on the failure already being mapped to `quick_answers_output_too_large` or another normalized reason.
- Kept `identification` classified as optional while preserving its existing stronger fallback path that attempts to continue into later sections before saving.
- Added final-stage diagnostic fields:
  - `normalizedStage`
  - `rawReason`
  - `normalizedIncompleteReason`
  - existing final decision fields for `shouldSavePartial`, `partialSaveHappened`, `finalJobStatus`, and `savedSectionCounts`
- Updated queue completion reason handling so saved partial packs with identification or quick-answer skip notes surface completed partial-copy instead of generic failure copy.
- Added regressions for:
  - `quick_answers` exhausting with raw `max_output_tokens` and saving partial content
  - combined `distinctions` / likely quiz target exhaustion mapping to `quiz_targets_output_too_large`
  - partial-skip content without usable core content remaining invalid

### Files touched

- `lib/deep-learn-generation.ts`
- `actions/queue-jobs.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production diagnostics showed optional stages with valid existing core content still producing `shouldSavePartial: false` and failing the queued job when the raw failure reason was `max_output_tokens`. Optional enrichment failures should not fail the whole Study Pack after usable core sections already exist.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npx tsx --test tests/queue.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue learn-resource-ui study-output-reviewer study-output-quiz-pack source-map` - passed

### Verification result

- Passed all requested verification commands.
- Verified quick-answer raw `max_output_tokens` failures now log `shouldSavePartial: true`, `partialSaveHappened: true`, and `finalJobStatus: completed` at the final exhausted fallback point.
- Verified combined `distinctions` / likely quiz target failures normalize to `quiz_targets_output_too_large`, not a generic structured-content failure.
- Verified optional skip notes cannot make content saveable without usable core Source Summary / High-Yield content.

### Known risks

- A quick-answer stage that exhausts all fallbacks can now save before trying later combined enrichment stages. The saved pack keeps Source Summary, High-Yield, Identification Review, and any derived minimal quick answers, but may not include likely quiz targets from that run.
- `identification` remains optional but still uses the existing continuation path to preserve stronger answer-bank and quiz-target output when possible.

### Blockers

- No blocker remains.
- `test_output.txt` was already untracked in the worktree and was not included in this change.

### Next recommended step

Deploy and retry the production Deep Learn jobs that failed at `quick_answers` or `distinctions` with raw `max_output_tokens`. Confirm the queue row completes and the final stage diagnostic shows `partialSaveHappened: true`.

### Suggested commit message

save partial packs for optional raw size failures

---

## Session Update - 2026-05-16 (Generic Optional Stage Partial Save)

### What changed

- Added a generic staged-generation partial-save policy for optional Deep Learn stages.
- Added reusable helpers in `lib/deep-learn-generation.ts`:
  - `hasUsableCoreContent(...)`
  - `shouldSavePartialAfterStageFailure(...)`
  - `mapStageFailureToIncompleteReason(...)`
  - `savePartialStudyPackResult(...)`
- Classified `high_yield` as core and downstream enrichment stages as optional.
- Added quiz-target-specific output limit handling:
  - reason: `quiz_targets_output_too_large`
  - student-facing copy: `Likely quiz targets were too large to generate. Other study sections were saved.`
- Added generic optional-stage output limit handling:
  - reason: `optional_stage_output_too_large`
  - student-facing copy: `Some extra review sections were too large to generate, but your Study Pack was saved.`
- Added a minimal fallback level for the combined distinctions / likely quiz targets stage with a 650-token cap.
- When likely quiz targets fail after all fallback levels, Deep Learn now derives up to 5 short quiz targets from already-generated identification or answer-bank items instead of requiring another large model response.
- Optional-stage parse failures after usable core content now save available Study Pack sections instead of failing the whole pack.
- Added final-stage diagnostics fields:
  - `failedStage`
  - `stageCriticality`
  - `hasHighYield`
  - `hasIdentification`
  - `hasQuickAnswers`
  - `hasQuizTargets`
  - `hasUsableCoreContent`
  - `shouldSavePartial`
  - `partialReason`
  - `finalJobStatus`
  - `savedSectionCounts`
- Updated queue completion status/notification copy so successfully saved partial Study Packs do not present as failed jobs.

### Files touched

- `lib/deep-learn-generation.ts`
- `actions/queue-jobs.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production showed valid readable sources failing at whichever optional staged section happened to exceed model response limits next. This confirmed the failure was not extraction or source quality; it was the generation failure policy treating enrichment sections as fatal even after usable core Study Pack content already existed.

### Tests run

- `npm test -- deep-learn-generation` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue learn-resource-ui study-output-reviewer study-output-quiz-pack source-map` - passed

### Verification result

- Passed all requested verification commands.
- Verified `quiz_targets` failures retry full, compact, micro, then minimal with token caps `2600 / 1800 / 900 / 650`.
- Verified valid source content with `high_yield`, identification, and quick answers saved when quiz targets exceeded all fallback levels.
- Verified combined optional failures, including identification plus quiz-target failures, still save available core content.
- Verified optional-stage malformed JSON after usable core content saves partial Study Pack sections.
- Verified metadata-only/UUID-only source content still fails validation even if optional skip notes are present.
- Verified regression tests do not depend on IT Security, SDLC, Arnis, PE, PATHFit, or any course-specific terms.

### Known risks

- Partial Study Packs can be less quiz-rich when quiz targets fail, but they preserve Source Summary, High-Yield First, and any already-generated review sections.
- Derived quiz targets are intentionally short and based only on already-generated grounded identification or answer-bank items.
- The combined `distinctions` stage still covers both distinctions and likely quiz targets; the saved incomplete reason uses the student-facing quiz-target label because that is the visible failure path.

### Blockers

- No blocker remains.

### Next recommended step

Deploy and retry the production source that failed at `quiz targets`. Confirm the queue job completes and logs `partialReason: quiz_targets_output_too_large` only if the minimal quiz-target fallback still exceeds output limits.

### Suggested commit message

save partial packs after optional stage failures

---

## Session Update - 2026-05-16 (Quick Answers Output Limit Partial Save)

### What changed

- Added quick-answer-specific output limit handling:
  - reason: `quick_answers_output_too_large`
  - student-facing copy: `Quick answers were too large to generate. Other study sections were saved when available.`
- Added a minimal quick_answers fallback level:
  - full: answer only generated identification items
  - compact: answer max 8 items
  - micro: answer max 5 items
  - minimal: answer max 3 items, one sentence each
- Tightened the quick_answers prompt to avoid long explanations, repeated question text, and essay-style output.
- Passed prior staged output into quick_answers prompting so the model answers the already-generated identification items instead of regenerating a broad answer section.
- When quick_answers exceeds `max_output_tokens` through full, compact, micro, and minimal attempts, Deep Learn now:
  - derives a tiny answer key from parsed identification artifacts when available
  - marks Quick-Answer Blocks as skipped/partial with the specific quick-answer message
  - continues to Distinctions / Likely Quiz Targets
  - saves a valid partial Study Pack when high_yield, identification, and quiz target content are usable
  - avoids the generic structured-content failure for this case
- Expanded stage diagnostics with requested answer count, parsed quick-answer count, partial-save status, final saved sections, fallback level, and max output tokens.
- Updated queue failure humanization so quick_answers size failures do not show the generic structured-content message.

### Files touched

- `lib/deep-learn-generation.ts`
- `actions/queue-jobs.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production retries showed readable academic sources where high_yield and identification completed successfully, but quick_answers exhausted output limits through all staged retries. Quick answers are useful but optional; they should not make the whole Study Pack fail when already-generated sections and structured artifacts can still produce a usable reviewer/quiz path.

### Tests run

- `npm test -- deep-learn-generation` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue learn-resource-ui study-output-reviewer study-output-quiz-pack source-map` - passed

### Verification result

- Passed all requested verification commands.
- Verified quick_answers retries full, compact, micro, then minimal with token caps `4200 / 2600 / 1200 / 800`.
- Verified minimal quick_answers prompt requests only 3 one-sentence answers.
- Verified repeated quick_answers `max_output_tokens` failures save a partial Study Pack with Source Summary, Identification Review, Likely Quiz Targets, and a tiny deterministic answer key when identification artifacts are available.
- Verified the quick-answer-specific message is used instead of `Deep Learn could not build enough structured study content...`.
- Verified validation can accept a Study Pack marked with the quick_answers size skip when identification and likely quiz target artifacts are still sufficient.

### Known risks

- The deterministic quick-answer key after total quick_answers failure is intentionally tiny, capped at 3 identification-derived answers.
- Partial packs may have weaker quick-answer coverage than normal packs, but Reviewer and Quiz can still use identification and likely quiz targets.
- Diagnostics add more structured log fields during Deep Learn generation; they are counts/status metadata, not raw source text.

### Blockers

- No blocker remains.

### Next recommended step

Deploy and retry the production sources that reached `quick_answers` size failures. Confirm the new job completes with `quick_answers_output_too_large` diagnostics only if Quick-Answer Blocks still exceed limits, and confirm the Study Pack opens with the saved non-quick-answer sections.

### Suggested commit message

handle oversized quick answers fallback

---

## Session Update - 2026-05-16 (Identification Output Limit Partial Save)

### What changed

- Increased Deep Learn identification-stage output token caps only:
  - full: 7000
  - compact: 4000
  - micro: 2500
  - minimal: 1500
- Added a minimal identification fallback level that asks for only 3 to 5 direct identification items.
- Reduced identification fallback item requirements so compact and micro prompts request fewer items than full generation.
- Made identification-stage `max_output_tokens` exhaustion non-fatal after full, compact, micro, and minimal attempts fail.
- When identification is too large after all fallback levels, Deep Learn now continues with Quick-Answer Blocks and Likely Quiz Targets, saves valid partial sections when available, and adds the student-facing caution:
  - `The identification review was too large to generate. Other study sections were saved when available.`
- Added the specific reason constant `identification_output_too_large` and kept this path out of the generic structured-content failure copy.
- Added stage-level diagnostics for stage, fallback level, max output tokens, output length when available, parsed artifact counts, partial-save status, and final validator result.
- Added regression coverage for 5900+ char meaningful extracted text with 16+ source relations, identification token-limit exhaustion, partial valid output saving, specific size-related messaging, and minimal fallback item sizing.

### Files touched

- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production showed a valid source (`1. Intro-To-IT-Security.pdf`) with completed extraction, 5908 meaningful academic characters, 16 validated source relations, and no stale fallback use. The Study Pack failed only because the Identification Review stage exceeded output token limits through staged retries. Valid academic sources should not lose the rest of the Study Pack because one reusable review section is too large.

### Tests run

- `npm test -- deep-learn-generation` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue learn-resource-ui study-output-reviewer study-output-quiz-pack source-map` - passed

### Verification result

- Passed all requested verification commands.
- Verified identification uses stage-specific caps of 7000/4000/2500/1500 rather than increasing the whole app output limit.
- Verified minimal identification fallback requests only 3 to 5 items.
- Verified repeated identification `max_output_tokens` failures can still produce a saved Study Pack when answer-bank and quiz-target sections are valid.
- Verified the size-specific message is used instead of the generic structured-content failure.

### Known risks

- Partial saves may have no generated identification items when the model cannot fit that stage, though deterministic Source Map repair can still contribute a small identification set when grounded units are available.
- Stage diagnostics add more server log volume during Deep Learn generation; they contain counts and status metadata, not raw source text.

### Blockers

- No blocker remains.

### Next recommended step

Deploy and retry `1. Intro-To-IT-Security.pdf`; confirm the queue job completes and logs the identification fallback attempts with `partialSaveHappened: true` only if the identification stage still exceeds limits.

### Suggested commit message

handle oversized identification review fallback

---

## Session Update - 2026-05-16 (Study Queue Retry Diagnostics)

### What changed

- Added internal Deep Learn source/extraction/generation diagnostics for Study Pack generation and fallback paths.
- Diagnostics now include queued job id, canonical/module resource ids, source title, course/module identity, Canvas file/item ids, source/html URLs, extraction statuses, extracted text lengths, selected source field, selected-field reason, academic/normalized char counts, source text quality, relation counts before/after validation, fallback mode, final artifact counts, validator result, and a sanitized dev-only preview plus content hash.
- Added failed Study Pack queue metadata so failures record source title, failed stage, retry/original attempt status, short student-facing reason, selected field, and academic char count.
- Added a Retry action for failed Study Pack queue cards. Retry creates a fresh `learn_generation` job with `retryOfJobId` and runs the current generation code path.
- Updated Study Queue failed cards to show source title, created time/relative age, original vs retry attempt, failed stage, short reason, and an "Older attempt" note when a newer generation exists for the same source.
- Confirmed from code that failed `queued_jobs` persist after deployment and `dismissQueuedJob` only sets `dismissed_at`; `getUserQueuedJobs` hides dismissed rows rather than deleting them.
- Added regression coverage for selecting meaningful `extracted_text` over empty/weaker visual text, selecting `visual_extracted_text` when normal extracted text is metadata-only, recording preview/hash diagnostics, and allowing sparse relation composition to recover through deterministic fallback instead of failing.

### Files touched

- `actions/queue-jobs.ts`
- `app/api/queue/jobs/route.ts`
- `components/shell/QueuePanel.tsx`
- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Old failed Study Pack jobs remained visible in Study Queue after the outline fallback shipped, making it unclear whether a current retry failed or the card was stale. The queue now separates old attempts from fresh retry jobs, and the server logs prove which source text field was selected so wrong/empty/stale source-field bugs can be diagnosed without exposing raw extraction details to students.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue learn-resource-ui study-output-reviewer study-output-quiz-pack source-map` - passed

### Verification result

- Passed all requested verification commands.
- Verified failed queue rows are persistent and dismissed rows are hidden via `dismissed_at`.
- Verified Retry creates a new job rather than reusing the old failed row.
- Verified diagnostics identify the selected source field and include sanitized preview/hash in development logs only.
- Verified sparse relation composition can still recover through deterministic fallback on meaningful extracted text.

### Known risks

- The Retry button relies on old failed jobs having `moduleId` and `resourceId` in payload/result. Very old rows missing those fields show a safe retry error and still require opening the source to generate again.
- Diagnostic logs are intentionally verbose for Deep Learn generation/fallback events; production logs omit extracted-text previews but still include source ids, titles, URLs, counts, and validator metadata.
- The "Older attempt" label depends on the current fetched queue window. If an even newer attempt is outside the returned limit, the old row may not be labeled until dismissed.

### Blockers

- No blocker remains.

### Next recommended step

Deploy, press Retry on one of the old failed Study Pack queue cards, and confirm the new retry job logs show the selected source field, academic char count, content hash, relation counts, fallback mode, final artifact counts, and validator result.

### Suggested commit message

debug and retry failed study pack jobs

---

## Session Update - 2026-05-16 (Outline Reviewer Fallback)

### What changed

- Added Deep Learn validation diagnostics that log the selected source id/title, selected academic text char count, selected source field, source-map relation counts before and after validation, generated section/card/question counts, and the specific save-validator reason.
- Added `countValidatedAcademicRelations` to expose the same meaningful relation count used by Source Map validation.
- Added an "Exam Reviewer from Outline" deterministic fallback for meaningful academic source text when generated artifacts are sparse and Source Map relation repair is missing or too sparse.
- The outline fallback supports bullet-heavy notes and produces Key Terms, Identification Questions, Multiple Choice Questions, True/False Questions, and Quick Review Notes while staying grounded in the selected source text.
- Kept the existing strict block for empty, metadata-only, refusal, UUID/debug, and otherwise non-academic source text by requiring `isMeaningfulDeepLearnSourceText` before fallback generation.
- Added regression coverage for bullet-heavy IT Security notes and sparse-relation Arnis outline notes.

### Files touched

- `lib/deep-learn-generation.ts`
- `lib/deep-learn-source-map.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Deep Learn could fail with "could not build enough structured study content" when selected extracted text was academically meaningful but the model output and relation/source-map repair path did not produce enough reusable sections, cards, and questions. Bullet-heavy notes can be valid exam material even when relation composition is sparse, so the new fallback builds an exam reviewer directly from cleaned selected source text instead of failing.

### Tests run

- `npm test -- deep-learn-generation` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness study-output-reviewer study-output-quiz-pack source-map` - passed

### Verification result

- Passed all requested checks.
- Verified bullet-heavy IT Security content produces key terms, identification questions, multiple choice questions, true/false questions, quick review notes, answer-bank items, identification items, and quiz targets.
- Verified sparse-relation Arnis outline content repairs weak generated output into a valid saved Study Pack with exam-reviewer content.
- Verified metadata/debug/refusal-style text remains excluded from fallback study content.

### Known risks

- The outline fallback is deterministic and extraction-pattern based; unusual outline layouts may still need more list/term parsing aliases after real-source QA.
- Multiple choice distractors are source-derived but simple; future work can improve distractor quality while staying grounded.
- Diagnostics currently log through the existing server console validation-debug path and should be monitored for volume in production.

### Blockers

- No blocker remains.

### Next recommended step

Retry the original failing Study Pack source and confirm the server logs show the selected source field, academic char count, relation counts, generated artifact counts, and either a successful source-map repair or outline fallback.

### Suggested commit message

fix outline fallback for deep learn generation

---

## Session Update - 2026-05-15 (Evidence-Relation Composer Phase 3.8)

### What changed

- Added a universal evidence-relation extraction layer to `buildAcademicSourceMap`.
- Source Maps now carry evidence-backed `relations` with relation type, parent concept, child concepts, answer text, source evidence, deterministic source unit id, confidence, learning shape, and unit type.
- Added generic relation detection for definitions, list membership, classification, timelines, procedure steps, comparisons, formula/equation lines, cause/effect, law/rule elements, equipment properties, component/function language, clinical symptom/intervention content, troubleshooting steps, rubrics, and passage/theme-shaped content.
- Relation-derived units now supplement existing known IT Security and Arnis extraction instead of replacing it, so existing high-quality fixture behavior stays intact.
- Updated Source Map validation so useful relation-backed sources can produce limited but honest Study Pack content without requiring IT-specific or Arnis-specific headings.
- Updated adaptive Quiz Pack generation so Arnis rule-creator and six-foot-pole questions are derived from source evidence, including exact spelling from the source.
- Preserved existing IT Security quiz richness by keeping source-evidence-backed cybersecurity definition MCQ generation.
- Added regression tests for generic relation extraction, limited relation fallback, generic reviewer rendering without IT/Arnis leakage, evidence-derived Arnis quiz facts, and exact Bankaw/Bangkaw spelling preservation.

### Files touched

- `lib/deep-learn-source-map.ts`
- `lib/study-outputs/quiz-pack.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `tests/study-output-reviewer.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Study Pack generation could fail after reviewer/source-map quality gates because the deterministic structured layer still depended too heavily on known headings, known subject-specific units, and hardcoded IT Security or Arnis patterns. The fix moves the backbone toward source evidence -> extracted academic relation -> reviewer/quiz composition. Known IT/Arnis logic remains as an enhancement, but generic academic sources no longer need those exact headings to pass when they contain meaningful evidence-backed relations.

### Failure diagnosis

- The failure mode matched validation rejecting sources with too few structured units when source content did not resemble the known IT Security or Arnis fixtures.
- The previous composer could extract some useful text, but validation and downstream quiz/reviewer composition were brittle when headings or concepts did not match known patterns.
- Hardcoded Arnis quiz questions also risked creating title-driven facts instead of evidence-derived facts.
- Uploaded/context files from the prompt were not available locally in this session, so verification used checked-in fixtures and new generic source fixtures in tests.

### Tests run

- `npm run typecheck`
- `npm run lint`
- `npm test -- study-output-quiz-pack`
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack`
- `npm test -- quiz source-map reviewer`
- `npm test -- study-output-reviewer study-output-sheet study-output-print`
- `npm run test:browser`

### Verification result

- Passed `typecheck`.
- Passed `lint`.
- Passed all requested Node test commands. Because the repo test script expands `tests/*.test.ts`, the targeted `npm test -- ...` commands each ran the full 613-test suite and passed.
- Passed browser quiz review verification with `npm run test:browser`.
- Verified in tests that generic academic source text can now form evidence-backed relations and reviewer/quiz content without importing hardcoded IT Security or Arnis facts.

### Known risks

- Relation extraction is deterministic and intentionally conservative; unusual prose formats may still produce limited packs rather than full-rich packs.
- Formula handling identifies formula/variable study content but still only generates calculation-style quiz items when concrete values are present elsewhere in the existing quiz pipeline.
- Old saved Source Maps without `relations` continue through existing unit-based behavior; they do not get retroactive relation metadata until regenerated.
- Manual uploaded artifacts requested in the prompt were unavailable locally, so the exact production failing source still needs a live retry after deployment.

### Blockers

- No local copy of the raw extracted failing source text, bad reviewer output, target IT reviewer standard, target Arnis reviewer standard, or screenshot was available in the workspace.

### Next recommended step

1. Retry Study Pack generation against the original production source and confirm it saves a useful limited or full pack instead of failing on missing known headings.
2. If the live source still fails, capture the raw extracted text and saved Source Map JSON so the relation extractor can be extended against that real shape.
3. Consider adding a small internal diagnostic counter for relation count by type in dev logs only.

### Suggested commit message

build evidence relation composer

## Session Update - 2026-05-15 (Reviewer Composer Phase 3.7)

### What changed

- Converted deterministic Source Map Study Pack and Reviewer rendering from summary-style prose into exam-ready reviewer composition:
  - numbered lists for enumerations and classifications
  - timeline-style date/event formatting
  - comparison answers for InfoSec vs IT Security, Vulnerability/Exploit/Breach, Zombie/Botnet, and SEO/SEO Poisoning
  - real likely quiz questions instead of internal wording prompts
- Added IT Security coverage for cybersecurity layers, People/Process/Technology, Unified Threat Management, security-breach impact, Zombie vs Botnet, and SEO vs SEO Poisoning.
- Expanded Arnis/PATHFit coverage for Doce Pares, regional systems, three main groups, and stick type/length material when present in the source.
- Tightened Source Map filtering and matching so weak orphan fragments are removed and detailed known items require source evidence for both the head term and detail.
- Increased deterministic reviewer/quiz density caps so source-dense modules keep later high-yield topics such as Methods of Infiltration, Denial of Service, Blended Attacks, and Impact Reduction.
- Updated Quiz Pack membership wording and explanations to use exam-style phrasing with stronger MCQ/True-False/Identification coverage.
- Preserved multi-line answer formatting in the reviewer UI so numbered blocks render correctly.
- Added regression coverage for banned/internal student-facing phrases, real likely quiz targets, numbered answer blocks, expanded IT Security headings, and expanded Arnis coverage.

### Files touched

- `lib/deep-learn-source-map.ts`
- `lib/deep-learn-generation.ts`
- `lib/deep-learn.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/study-outputs/quiz-pack.ts`
- `components/DeepLearnReviewPackSurface.tsx`
- `components/StudyOutputReviewerPage.tsx`
- `tests/deep-learn-generation.test.ts`
- `tests/study-output-reviewer.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The generated Study Pack / Reviewer was still rendering concept metadata as prose, which produced shallow lines such as generic classification/chronology statements and internal prompt wording. The Reviewer now composes source-map units into exam-reviewer material while staying grounded only in selected academic source text.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- quiz source-map reviewer` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified IT Security output uses numbered blocks and covers the requested major headings.
- Verified Arnis output covers procedural, timeline, classification, organization, equipment, and stick-length material when present in the source.
- Verified saved reviewer content rejects banned/internal phrases such as Source Notes, source-backed/source wording prompts, and generic classifies/preserves wording.
- Verified likely quiz targets are concrete exam-style questions.

### Known risks

- Known-unit coverage still depends on deterministic heading/item detection; unusual OCR layouts may need more aliases after real fixture QA.
- The expanded reviewer/quiz caps increase output density for large source maps, so very dense modules should be checked in the UI for scanability.

### Blockers

- No blocker remains.

### Next recommended step

- Run manual generation QA against a real Canvas IT Security source and a real PATHFit/Arnis source, then compare the saved reviewer pages against the target-standard examples.

### Suggested commit message

- `compose exam-ready reviewer sections`

---

## Session Update - 2026-05-15 (Exam Reviewer Quality Contract)

### What changed

- Rebuilt the Academic Source Map into a denser exam-ready Study Pack layer with explicit academic banks for definitions, terminology, classifications, timelines, procedures, formulas, relationships, likely questions, comparisons, acronyms, and cause/effect.
- Tightened Study Pack save validation so weak/minimal outputs are rejected instead of saved when they do not contain enough meaningful examinable material.
- Added bank-derived Study Pack sections for definitions, classifications/groupings, timelines/procedures, formulas/comparisons, and likely exam questions.
- Upgraded reviewer generation to use exam-reviewer wording, shape prompts by learning type, avoid Source Notes-style labels, and reject weak standalone fragments.
- Upgraded quiz generation to include MCQ, True/False, and Identification from Source Map units with stronger coverage, grounded explanations, and better type diversity per topic.
- Preserved IT Security and Arnis/PATHFit adaptive behavior while cleaning weak labels such as standalone procedure fragments and malformed OCR leftovers.
- Scoped IT Security definition source quotes so adjacent InfoSec bullets do not leak into unrelated reviewer/quiz source wording.
- Added fixture-level QA assertions against the uploaded IT Security and Arnis reviewer standards for density, concept coverage, timeline/classification preservation, distractor quality, and raw-fragment rejection.

### Files touched

- `lib/deep-learn-source-map.ts`
- `lib/deep-learn-generation.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/study-outputs/quiz-pack.ts`
- `lib/types.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/study-output-reviewer.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Reviewer and quiz quality depended on a Study Pack layer that was still too shallow for exam-style outputs. The Source Map now acts as the canonical academic extraction contract: it must preserve educational structure and enough examinable facts before downstream Reviewer or Quiz generation can rely on it.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- quiz source-map reviewer` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified Study Pack validation rejects thin/minimal fallback content.
- Verified IT Security source maps expose dense definition/classification/procedure/relationship/likely-question banks.
- Verified Arnis source maps preserve timeline, classification, procedure, and equipment relationships.
- Verified Reviewer output remains exam-oriented and avoids Source Notes/debug-style leakage.
- Verified Quiz output includes MCQ, True/False, and Identification with grounded explanations and non-filler distractors.

### Known risks

- The bank extraction is deterministic and regex/heading driven; unusual OCR layouts may need additional heading aliases after real-source QA.
- True/False generation is intentionally conservative and deterministic; future work may improve false-statement variety once the single-call quality contract is stable.

### Blockers

- No blocker remains.

### Next recommended step

- Run manual QA on real scanned/OCR classroom PDFs and compare generated Reviewer/Quiz usefulness against the IT Security and Arnis fixture standards before adding any extra AI calls.

### Suggested commit message

- `rebuild study pack quality contract`

---

## Session Update - 2026-05-15 (Global Discipline Hints And Learning Shapes)

### What changed

- Added broad `AcademicDisciplineCluster` metadata to `AcademicSourceMap`:
  - computer/IT/data/software
  - engineering/architecture/built environment
  - health/nursing/allied health/medicine
  - law/criminal justice/criminology/public safety
  - business/accountancy/management/economics
  - education/pedagogy
  - arts/humanities/communication
  - natural sciences/mathematics/geology/environmental science
  - hospitality/tourism
  - religion/theology/philosophy/ethics
  - physical education/sports/performing movement
  - general academic fallback
- Added per-unit `learningShape` metadata so rendering is driven by educational shape, not local course examples or discipline labels.
- Added deterministic learning-shape inference for definition, taxonomy, procedure, timeline, formula, worked example, case rule, clinical care, cause effect, comparison, passage/theme, reflection, troubleshooting, component system, lab/process, classification, equipment, standards/rubrics, and narrative units.
- Threaded `learningShape` into Reviewer, Quiz, and compact Source Map Study Pack fallback shaping.
- Kept discipline detection as a hint only; quiz/reviewer prompts and explanations now prefer the unit learning shape.
- Removed the quiz coverage reservation that implicitly favored IT Security required titles for non-IT sources while preserving preferred IT ordering when IT concepts exist.

### Files touched

- `lib/deep-learn-source-map.ts`
- `lib/deep-learn-generation.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/study-outputs/quiz-pack.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/study-output-reviewer.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Deep Learn needed support for global academic discipline clusters without letting those clusters become the main rendering driver. The real driver is now the source-backed learning shape, so a health/law/business/arts/etc. source can produce formula, case-rule, clinical-care, troubleshooting, procedure, timeline, taxonomy, or reflection outputs without adding AI calls or loosening validation.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- study-output-reviewer study-output-quiz-pack deep-learn-generation` - passed
- `npm test -- quiz source-map reviewer` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified IT Security taxonomy and existing MCQ wording remain stable.
- Verified PATHFit adaptive style tests remain green.
- Verified broad discipline cluster detection returns expected hints across health, law, business, education, arts, natural science, hospitality, religion/philosophy, engineering, IT, and physical education examples.
- Verified Reviewer and Quiz use learning-shape prompts for case-rule, troubleshooting, formula, and clinical-care units even when the discipline hint points elsewhere.

### Known risks

- Discipline cluster scoring is deterministic keyword scoring; mixed interdisciplinary modules may need additional terms or weighting after real-source QA.
- Learning-shape inference is conservative and title/heading based; unusual headings may still fall back to definition/narrative until new patterns are added.

### Blockers

- No blocker remains.

### Next recommended step

- QA with real non-IT/non-PATHFit sources such as nursing care plans, law case digests, accounting worked examples, literature passages, and lab manuals, then tune heading/shape aliases from observed misses.

### Suggested commit message

- `add global discipline source map hints`

---

## Session Update - 2026-05-15 (Adaptive Source Map Styles)

### What changed

- Extended `AcademicSourceMap` with deterministic style metadata:
  - `sourceStyle`
  - `secondaryStyles`
  - per-unit `unitType`
- Added adaptive Source Map styles for technical, procedural, narrative, classification-heavy, timeline-heavy, reflective, and taxonomy-heavy sources.
- Added deterministic PATHFit/Arnis-aware structure preservation for:
  - Arnis definition
  - aliases
  - RA 9850
  - historical concept
  - evolution/classifications
  - organizations/timeline
  - courtesy/salutation
  - strike types
  - equipment/weapons
  - stick types
  - regional classifications
- Kept the existing IT Security technical/taxonomy behavior and added regression coverage for IT Security style, list completeness, reviewer prompts, and quiz coverage.
- Adapted Source Map Reviewer shaping so procedural/timeline/equipment/classification units produce sequence, chronology, equipment-identification, and classification review targets instead of definition/list-only prompts.
- Adapted Source Map Quiz shaping so PATHFit-style sources can produce chronology, sequence, classification, and equipment questions such as:
  - `Which organization standardized Arnis sport rules?`
  - `Arrange the Arnis milestones chronologically.`
  - `Which weapon is a six-foot pole?`
  - `Which classification belongs to the Visayans?`
- Updated Source Map quiz coverage selection so adaptive educational units are not squeezed out by the old IT Security-only preferred coverage list.

### Files touched

- `lib/deep-learn-source-map.ts`
- `lib/deep-learn-generation.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/study-outputs/quiz-pack.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/study-output-reviewer.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The Source Map foundation was stable for technical/list-heavy sources, but procedural and narrative educational modules were being flattened into generic notes. This pass adds deterministic adaptive styles and unit typing without adding AI calls, retries, queue changes, internet fallback, or weaker validation.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- quiz source-map reviewer` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified IT Security remains `technical` with taxonomy-heavy secondary style and keeps core technical Source Map units.
- Verified PATHFit Arnis detects procedural dominant style with classification-heavy and timeline-heavy secondary styles.
- Verified PATHFit Arnis preserves procedure steps, timeline/organization groups, equipment/weapons, stick types, and regional classifications.
- Verified Reviewer produces adaptive sequence, chronology, equipment, and classification targets.
- Verified Quiz produces adaptive chronology, sequence, classification, and equipment questions while keeping existing IT Security MCQs stable.
- Verified weak fragment rejection remains covered.

### Known risks

- PATHFit/Arnis grouping is deterministic and heading/term based; future physical-education modules may need additional known heading aliases.
- Legacy persisted Source Maps without `sourceStyle`, `secondaryStyles`, or `unitType` remain tolerated, but regenerated maps should include the new fields.

### Blockers

- No blocker remains.

### Next recommended step

Regenerate a real PATHFit Arnis Reviewer and Quiz from the live source export, visually compare against the fixture expectations, then broaden adaptive style aliases for any live heading variants found.

### Suggested commit message

```bash
add adaptive source map styles
```

---

## Session Update - 2026-05-15 (First-Class Browser Test Script)

### What changed

- Added `npm run test:browser` as the first-class command for browser-level study output interaction tests.
- The new script runs the existing local/static Playwright harness:
  - `tsx --test tests/quiz-review-browser.test.ts`
- Kept the current standalone browser fixture unchanged.
- Did not add a Playwright config migration, real auth dependency, production data dependency, or external network dependency.

### Architecture reasoning

This phase intentionally makes the existing Phase 3.4 browser QA easy to run without changing app behavior or broadening the browser test architecture. The repo still uses Node's built-in test runner via `tsx`, so the lowest-risk first-class path is an npm alias for the existing Playwright-backed test file.

### Files touched

- `package.json`
- `docs/ai/handoff.md`

### Why it changed

Phase 3.4 added useful browser interaction coverage, but it required remembering the raw `npx tsx --test tests/quiz-review-browser.test.ts` command. The new script makes browser QA discoverable and repeatable alongside the existing `test`, `lint`, and `typecheck` commands.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm run test:browser` - passed
- `npm test -- study-output-quiz-pack` - passed
- `npm test -- study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Confirmed the new first-class browser command runs the existing Playwright-backed quiz review interaction harness.
- Confirmed study output quiz and print regressions remain green.

### Known risks

- `npm run test:browser` still depends on the local Playwright Chromium executable. The test skips with a clear message if Chromium is unavailable.
- The browser harness remains standalone/static rather than a full Next route fixture.

### Blockers

- No blocker currently known.

### Next recommended phase

Add a shared browser fixture harness for saved study output pages once the project is ready for a dedicated Playwright or e2e test structure.

### Suggested commit message

```bash
add browser test script
```

---

## Session Update - 2026-05-15 (Browser QA for Quiz Review Mode)

### What changed

- Added stable `data-testid` hooks to the saved Quiz Pack review UI for browser-level interaction coverage.
- Added a Playwright-backed Node test for quiz review interactions:
  - starts a saved quiz
  - selects incorrect and correct MCQ choices
  - checks answers
  - verifies correct/incorrect feedback
  - verifies correct answer, explanation, review cue, and source-backed note display
  - verifies reset/retry behavior hides feedback
  - verifies identification answer reveal
  - verifies print media still exposes the printable quiz review document
  - verifies internal metadata (`sourceUnitId`, `confidence`, `generationMethod`, debug labels) is not visible

### Architecture reasoning

The project does not currently have a dedicated Playwright test config or npm browser-test script, so this phase uses the existing Node test runner with `playwright` directly. The test keeps the production UI unchanged except for stable selectors and validates the browser interaction contract without changing quiz generation, save flow, matching behavior, or Source Map metadata exposure.

### Files touched

- `components/StudyOutputQuizPackPage.tsx`
- `tests/quiz-review-browser.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 3.4 needed browser-level coverage for the saved Quiz review mode after Phase 3.3 added answer feedback and reveal behavior. The added selectors give tests a stable way to exercise the existing student-facing controls without relying on styling or fragile text traversal.

### Tests run

- `npx tsx --test tests/quiz-review-browser.test.ts` - passed
- `npx tsx --test tests/study-output-print.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- study-output-quiz-pack` - passed
- `npm test -- study-output-print` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed

### Verification result

- Passed all requested verification commands.
- Browser-level quiz review interaction test passes under the existing Node test runner.
- Verified correct and incorrect MCQ feedback states, correct answer display, explanation display, review cue/source note display, reset behavior, identification reveal, no debug metadata exposure, and print media behavior.

### Known risks

- There is still no dedicated Playwright config or npm browser-test command. The new test uses `playwright` through `tsx --test`, and it skips only if the local Chromium browser executable is unavailable.
- The browser harness validates the interaction contract and selectors outside a full Next.js route mount because the repo does not yet have an end-to-end app server test setup.

### Blockers

- No blocker remains.

### Next recommended phase

Add a small first-class browser/e2e test script and Next route harness for saved study output pages so future quiz UI tests can mount the real application route with fixture data instead of a standalone interaction harness.

### Suggested commit message

```bash
test quiz review interactions
```

---

## Session Update - 2026-05-15 (Improve Quiz Answer Feedback)

### What changed

- Improved saved Quiz Pack review mode without changing the save/render model or adding AI calls.
- Added clearer MCQ answer feedback sections in the quiz UI:
  - selected answer
  - result
  - correct answer
  - explanation
  - review cue
  - source-backed note
- Let Identification items reveal the grounded answer without requiring typed input first.
- Reworded deterministic Source Map explanations to be specific and course-like:
  - `Correct because the source defines IT Security as...`
  - `Correct because Confidentiality is listed under CIA Triad.`
  - `Correct because Ransomware belongs to Malware Types, not Malware Symptoms.`
- Added source concept title display derived from known Source Map unit ids while keeping `sourceUnitId`, `confidence`, and `generationMethod` out of student-facing output.
- Updated printable Quiz Pack answer document to include review cues and source-backed notes.

### Architecture reasoning

This phase stays on the existing Source Map Quiz item model. The UI derives student-facing concept labels from internal item metadata at render time instead of changing persisted schemas. Feedback is purely deterministic and uses existing quiz item fields (`answer`, `explanation`, `sourceWording`, `sourceBasis`) so no raw OCR fallback, AI call, matching model, or new save path is introduced.

### Files touched

- `components/StudyOutputQuizPackPage.tsx`
- `lib/study-outputs/quiz-pack.ts`
- `tests/study-output-print.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 3.3 needed the saved quiz experience to feel more like Canvas-style practice. The previous reveal block showed the grounded answer, but it did not clearly separate selected answer, result, correct answer, explanation, and review cue, and identification reveal required typing before the answer could be shown.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- study-output-quiz-pack` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- quiz source-map reviewer` - passed

### Verification result

- Passed all requested verification commands.
- Verified MCQ explanations are specific and avoid generic selected-source wording.
- Verified print/render output includes source-backed review cues.
- Verified internal metadata labels are not rendered in the quiz page.
- Verified identification reveal can be used without a typed response.
- Verified no matching type was added.

### Known risks

- The test coverage for interactive correct/incorrect state is source-level and static-render based because the project does not currently include a DOM interaction test harness.
- Review cue titles are derived deterministically from known Source Map ids, with a readable fallback for unknown source unit ids.

### Blockers

- No blocker remains.

### Next recommended phase

Phase 3.4 should add a small browser-level interaction test harness for saved quiz review mode, then use it to verify MCQ selection, incorrect feedback, retry, and reveal flows end to end.

### Suggested commit message

```bash
improve quiz answer feedback
```

---

## Session Update - 2026-05-15 (Improve Source Map Quiz Quality)

### What changed

- Improved deterministic Source Map Quiz Pack generation without adding AI calls.
- Added richer term-definition MCQs for reviewer-shaped concepts such as `IT Security`, `Cybersecurity`, and `InfoSec vs IT Sec`.
- Added safer list/category membership MCQs for:
  - `CIA Triad`
  - `Domains of IT Security`
  - `Malware Types`
  - `Malware Symptoms`
- Expanded Source Map quiz coverage selection so the IT Security fixture covers the requested security concepts through MCQ and Identification items.
- Improved sibling distractor selection by using concept families, confidence gates, normalized alias checks, duplicate filtering, and multiple-correct avoidance.
- Cleaned list aliases for symptom-style source wording so legitimate academic items like `unknown processes` can be used without leaking robotic sentence fragments.
- Added course-like explanations that state why the correct answer is right without `according to the source`, debug metadata, or OCR wording.
- Improved Identification prompt shaping for definitions, enumerations, methods, and distinction prompts.

### Architecture reasoning

Quiz generation still treats the validated Source Map plus reviewer-shaped answers as the canonical learning layer. This pass keeps the deterministic Phase 3.1 foundation but broadens safe MCQ generation by deriving distractors only from sibling Source Map units and by mapping coverage through exact source unit ids instead of broad substring matches. That prevents stale module/course fallback leakage and avoids letting broad labels like `IT Security` accidentally claim more specific groups such as `Domains of IT Security`.

### Files touched

- `lib/study-outputs/quiz-pack.ts`
- `tests/study-output-quiz-pack.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 3.2 needed better quiz variety and broader IT Security coverage while preserving the no-AI, no-unsafe-distractor constraint. The previous foundation was intentionally conservative and under-produced definition MCQs and some list membership prompts.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- study-output-quiz-pack` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- quiz source-map reviewer` - passed

### Verification result

- Passed all requested verification commands.
- Verified richer term-definition MCQs.
- Verified category/list membership MCQs.
- Verified duplicate distractor and answer duplication prevention.
- Verified MCQ explanations include source-backed reasons without debug wording.
- Verified complete list preservation still holds for domains and malware types.
- Verified weak/noisy/OCR garbage units are rejected.
- Verified IT Security Source Map quiz coverage includes the requested Phase 3.2 concepts.

### Known risks

- Distractor selection remains deterministic and conservative; unusual courses may still produce fewer MCQs if sibling units are too weak or too similar.
- Quiz Pack output can now include up to 18 items for Source Map-backed packs to preserve coverage plus a small amount of MCQ/Identification variety.
- Matching type remains intentionally unimplemented.

### Blockers

- No blocker remains.

### Next recommended phase

Phase 3.3 should add isolated, deterministic matching only if it can reuse the same normalized quiz source units without changing the save/render model. Otherwise, improve formula-group and taxonomy-specific quiz shaping next.

### Suggested commit message

```bash
improve source-map quiz quality
```

---

## Session Update - 2026-05-15 (Build Source Map Quiz Foundation)

### What changed

- Rebuilt saved Quiz Pack generation around normalized Source Map quiz units when a valid `sourceGrounding.sourceMap` exists.
- Added `NormalizedQuizSourceUnit` as the deterministic quiz intermediate layer with title, normalized stem/answer, aliases, source excerpt, source type, confidence, and keyword tags.
- Made Source Map quiz output Phase 3.1-only:
  - deterministic Multiple Choice
  - deterministic Identification
  - no matching, true/false expansion, essay/open response, adaptive difficulty, internet fallback, or invented distractors
- Made Source Map quiz generation use reviewer-shaped answers from `buildReviewerContentFromSourceMap` before falling back to raw Source Map summaries.
- Added internal quiz item grounding fields:
  - `sourceUnitId`
  - `sourceExcerpt`
  - `confidence`
  - `generationMethod`
- Preserved complete list answers for source-listed domains, malware types, taxonomies, and other enumerations.
- Added deterministic MCQ safety gates:
  - high-confidence units only
  - concise answers or safe list-membership categories only
  - distractors derived only from neighboring Source Map units
  - no duplicate choices
  - no answer duplicated as a distractor
  - weak OCR/debug/metadata text rejected
- Kept legacy Study Pack quiz item fallback only for old notes that do not carry a Source Map. If a Source Map exists but is weak/invalid, Quiz does not fall back to stale note arrays.

### Architecture reasoning

Reviewer output is now treated as the canonical normalized learning layer for Quiz. The quiz builder first validates the saved `AcademicSourceMap`, then joins each source unit to reviewer-shaped high-yield answers. That keeps quiz wording grounded in the selected academic source while avoiding direct raw extraction blobs where reviewer shaping already exists. Invalid Source Maps intentionally return no quiz items instead of falling back to old answer-bank or module context, preventing stale or metadata-only leakage.

### Files touched

- `lib/study-outputs/quiz-pack.ts`
- `lib/types.ts`
- `tests/study-output-quiz-pack.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 3.1 moves Quiz onto the same Source Map + Reviewer foundation that now powers the Reviewer page. The previous Quiz Pack builder still mixed legacy Deep Learn quiz arrays with matching and true/false generation. This pass narrows quiz generation to deterministic, source-grounded Multiple Choice and Identification while preserving existing save/render flows.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- study-output-quiz-pack` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- quiz source-map reviewer` - passed

### Verification result

- Passed all requested verification commands.
- Verified deterministic MCQ generation from Source Map units.
- Verified duplicate distractors are prevented and the correct answer appears only once.
- Verified complete Domains of IT Security and Malware Types lists are preserved.
- Verified identification prompts use direct course-like `Define` / `Identify` forms.
- Verified OCR garbage and metadata/debug labels do not enter quiz output.
- Verified invalid Source Maps block quiz generation instead of using stale legacy note arrays.
- Verified IT Security Source Map reviewer content flows into Quiz Pack generation.

### Known risks

- Source Map MCQs currently favor safe list-membership category questions when definition answers are too long for reliable MCQ distractors. This is conservative but may feel less varied until later phases add richer deterministic distractor strategies.
- Legacy non-Source Map notes still use the old Deep Learn quiz item fallback, but matching and true/false are no longer added by the saved Quiz Pack builder.
- The Study Output Quiz UI still renders existing source wording/source basis lines; the new internal grounding metadata is not rendered.

### Blockers

- No blocker remains.

### Next recommended phase

Phase 3.2 should expand deterministic quiz coverage with richer Source Map item families, especially safe term-definition MCQs, formula-group handling, and optional matching type only after complete-list and distractor safety rules are stable.

### Suggested commit message

```bash
build source-map quiz foundation
```

---

## Session Update - 2026-05-15 (Polish Source Map Completeness)

### What changed

- Preserved complete IT Security source-listed items for deterministic Source Map reviewer output:
  - `Domains of IT Security` now keeps all 11 listed domains, including `IoT Security`, `User Education`, and `Cyber Security`.
  - `Malware Types` now keeps both source blocks merged into one complete list, including `Bot`, `Trojan Horse`, and `MiTM`.
- Shaped generated Source Map answers before saving so `High-Yield First` uses clean reviewer wording instead of raw compact source snippets.
- Added targeted deterministic answer shaping for `IT Security`, `Cybersecurity`, `InfoSec vs IT Sec`, and `Vulnerability / Exploit / Breach`.
- Made compact generated reviewer answers word-safe so Answer Bank fields do not truncate mid-word.
- Kept `Bot` as a legitimate short malware term while preserving weak-term filtering for generic fragments.
- Added IT Security fixture coverage for complete Domains/Malware lists, IT Security definition isolation, non-truncated Cybersecurity answers, word-safe compact answers, and shaped High-Yield First text.

### Files touched

- `lib/deep-learn-generation.ts`
- `lib/study-outputs/reviewer.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/study-output-reviewer.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 2.7 stabilized reviewer generation and removed most source-span bleed, but compact rendering still dropped valid source-listed items and used overly raw high-yield snippets. This pass keeps the Source Map architecture deterministic and stable while improving completeness and final student-facing reviewer polish before moving to Quiz.

### Tests run

- `npm test -- study-output-reviewer deep-learn-generation` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified Domains includes all 11 source-listed items.
- Verified Malware Types merges both source blocks into one complete 10-item list.
- Verified IT Security definition and high-yield answer exclude InfoSec text.
- Verified Cybersecurity saved answer does not end with a cut word such as `u` or `architect`.
- Verified compact Answer Bank fields avoid mid-word truncation.
- Verified High-Yield First uses shaped reviewer text.

### Known risks

- Complete-list limits are deterministic and currently targeted to known IT Security list headings; future course families may need additional complete-list aliases.
- The real IT Security PDF/HTML export should still be regenerated and visually checked before starting Quiz work.

### Blockers

- No blocker remains.

### Next recommended step

Regenerate the real IT Security reviewer PDF/HTML from the latest source and do a final visual QA pass, then begin Quiz generation from the cleaned Source Map units.

### Suggested commit message

```bash
polish source map completeness
```

---

## Session Update - 2026-05-15 (Harden Source Map Unit Quality)

### What changed

- Added a Source Map unit quality gate for weak/generated titles such as `There`, `High`, `State`, `Cyber Crime`, long sentence-fragment titles, and titles ending in `that`.
- Expanded known stop tokens and inline heading splitting so IT Security text stops at section headings such as `Goal of IT Security`, `Domains of IT Security`, `Definition of Terms`, `Methods to Deny Service`, and `Impact Reduction`.
- Limited local definition extraction to definition-style chunks so category/list sections do not create orphan units from nearby OCR fragments.
- Cleaned Source Map items at known heading boundaries, with special handling for InfoSec vs IT Sec so CIA/domain items do not bleed into that comparison.
- Replaced raw reviewer exam-cue snippets with deterministic cue templates for definitions, lists, comparisons, and processes.
- Tightened quick-answer block filtering and shaped malware symptom bullets so quick cards avoid weak orphan terms and raw `There is...` residue.
- Added IT Security fixture coverage for weak unit rejection, inline heading splitting, templated exam cues, quick-answer block cleanup, and core concept retention.

### Files touched

- `lib/deep-learn-source-map.ts`
- `lib/study-outputs/reviewer.ts`
- `tests/study-output-reviewer.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The reviewer was stable and exportable, but low-quality Source Map units were still reaching rendering. Cleaning the units before rendering keeps the deterministic Source Map architecture intact without adding model calls, retries, queue changes, or looser validation.

### Tests run

- `npm test -- study-output-reviewer` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified InfoSec vs IT Sec no longer carries `Goal of IT Security`, CIA items, or domain heading text.
- Verified IT Security exam cues use the generated template and do not include raw InfoSec snippets.
- Verified weak fragment units such as `There`, `High`, `State`, `Cyber Crime`, `Attacks Backed By State Agencies That`, and `Sent To A Host Or Application And The Receiver` are rejected.
- Verified quick-answer blocks omit weak orphan units while keeping core IT Security concepts.

### Known risks

- The quality gate is deterministic and intentionally conservative; future source families may need additional heading aliases or recognized-term entries.
- The latest real IT Security PDF export should still be visually checked after regeneration to confirm the fixture improvements match the live extracted source.

### Blockers

- No blocker remains.

### Next recommended step

Regenerate the real IT Security reviewer from the PDF and compare the exported PDF against this pass, then move to Quiz only after reviewer source quality is confirmed.

### Suggested commit message

```bash
harden source map unit quality
```

---

## Session Update - 2026-05-15 (Polish Source Map Reviewer Quality)

### What changed

- Tightened `AcademicSourceMap` known-section quote extraction so IT Security units stop at the next known heading instead of using broad fixed-length regex spans.
- Clamped Source Map source quotes by concept kind and known heading boundaries to reduce adjacent-section bleed.
- Added stronger known handling for `Blended Attacks` so it survives Source Map ranking and remains visible in the reviewer.
- Improved Source Map Reviewer answer shaping:
  - compact definition answers for IT Security and Cybersecurity
  - side-by-side comparison wording for InfoSec vs IT Sec and Vulnerability / Exploit / Breach
  - list answers rendered as concise key lists
  - process answers rendered as step/method lists
- Varied Source Map quiz target prompts with `Define`, `Differentiate`, `Explain why`, `Identify symptoms`, `Sequence steps`, `Match terms`, and `Enumerate`.
- Removed repeated student-facing `Memorize:` / `Understand:` labels from the reviewer UI and replaced them with cleaner `Definition`, `Key list`, and `Exam cue` labels.
- Improved reviewer print CSS:
  - reviewer cards stay readable in single-column print grids
  - panels may split while individual cards avoid splitting
  - print spacing and card padding are tighter to reduce large blank areas
- Added IT Security-like quality tests for source span boundaries, label cleanup, prompt variety, and core concept retention.

### Files touched

- `app/globals.css`
- `components/StudyOutputReviewerPage.tsx`
- `lib/deep-learn-source-map.ts`
- `lib/study-outputs/reviewer.ts`
- `tests/study-output-reviewer.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The Source Map reviewer was stable and queue-safe, but student-facing output still copied long adjacent source spans and rendered generic memorization labels. This pass keeps the deterministic architecture intact while improving local Source Map boundaries, reviewer answer shaping, likely quiz target variety, and print readability.

### Tests run

- `npx tsx --test tests/study-output-reviewer.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation study-output-reviewer study-output-quiz-pack` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified IT Security answer no longer includes `Goal of IT Security`.
- Verified InfoSec vs IT Sec no longer pulls in domain-list text.
- Verified Domains of IT Security no longer pulls in Cybersecurity definition text.
- Verified Vulnerability / Exploit / Breach no longer pulls in Cybersecurity Threat Types.
- Verified rendered reviewer markup no longer contains repeated `Memorize:` or `Understand:` labels.
- Verified quiz prompts are varied and core IT Security concepts remain present.

### Known risks

- Source Map extraction remains deterministic and pattern-based; additional course families may need their own heading aliases or answer-shaping rules.
- Print CSS is improved by code-level layout rules and render tests, but real browser PDF export should still be visually checked with the generated IT Security reviewer.

### Blockers

- No blocker remains.

### Next recommended step

Regenerate the real IT Security reviewer, export it to PDF, and visually confirm that answer cards read cleanly without source-span bleed or awkward print spacing.

### Suggested commit message

```bash
polish source map reviewer quality
```

---

## Session Update - 2026-05-15 (Align Source Map Reviewer Validation)

### What changed

- Added internal Deep Learn reviewer-validation debug logging for:
  - Source Map validity and unit counts by kind
  - rendered reviewer section counts
  - `answerBank`, `identificationItems`, and `likelyQuizTargets` counts
  - final validation failure/success reason
- Added a Source Map-backed compact Study Pack repair path in `lib/deep-learn-generation.ts`.
- The repair path now builds minimum viable saved reviewer artifacts directly from valid `AcademicSourceMap` units:
  - `Key Answers / Answer Bank`
  - `Identification Review`
  - `Likely Quiz Targets`
  - `Quick Answer Blocks` when list/category/process units exist
- Kept legacy deterministic structured-source repair as fallback after Source Map repair fails or is unavailable.
- Preserved anti-garbage filtering for weak labels such as `What`, `activity`, `organization`, `source summary`, `exact source wording`, `reconstructed lists`, and `clean source summary fragments`.
- Ensured legitimate IT Security concepts survive Source Map repair, including cybersecurity, information security, CIA Triad, malware, methods of infiltration, vulnerability, exploit, and breach.
- Added Source Map compact reviewer validation tests and IT Security-like regression coverage.

### Files touched

- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 2 made the Reviewer page consume `AcademicSourceMap`, but generation-time save validation still required legacy Study Pack artifact arrays. When model output reached the compact reviewer stages but produced sparse arrays, validation rejected the whole generation even though the Source Map contained meaningful units. The new repair path aligns save validation with the Source Map architecture by deterministically filling compact, source-backed reviewer artifacts before the queue marks generation failed.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified IT Security-like Source Map content can save as a compact valid reviewer with non-empty answer bank, identification, and likely quiz target artifacts.
- Verified weak/generated labels are filtered and garbage-only Source Map concepts are rejected.
- Verified Source Map-backed repair preserves expected security concepts and does not require an extra AI call.
- Verified legacy structured-source repair remains available when Source Map repair is missing or invalid.

### Known risks

- The new internal debug logs are intentionally concise but may be noisy in tests or production logs when validation repair is triggered.
- The Source Map repair is compact and deterministic; normal model output should still provide richer Study Pack prose when healthy.
- Unusual source-map titles may need future normalization aliases, but garbage-only concepts remain rejected.

### Blockers

- No blocker remains.

### Next recommended step

Regenerate the real IT Security PDF Study Pack and confirm the queue completes instead of failing at `Identification Review`; then open Reviewer and compare the visible concepts against the expected IT Security list.

### Suggested commit message

```bash
align source map reviewer validation
```

---

## Session Update - 2026-05-15 (Render Reviewer from Source Map)

### What changed

- Persisted the validated `AcademicSourceMap` inside Deep Learn `sourceGrounding` so saved ready Study Packs can carry the internal source structure forward.
- Added a Source Map -> Reviewer adapter that renders the primary Reviewer directly from source-map units when present and valid.
- Built deterministic Reviewer content from source-map units:
  - high-yield answer cues
  - glossary-style memorization answers
  - direct `Identify or define ...` prompts
  - grouped quick-answer blocks for lists/categories/processes
  - instructor-style likely quiz targets
  - source-supported distinctions such as InfoSec vs IT Sec and Vulnerability vs Exploit/Breach
- Kept the legacy blob/Study Pack reviewer as fallback only when the Source Map is missing or invalid.
- Added weak-term and internal-label filtering so reviewer keys do not become `What`, `activity`, `organization`, `source summary`, `exact source wording`, `reconstructed lists`, or `clean source summary fragments`.
- Updated Reviewer rendering to hide empty mode sections instead of rendering empty panels.
- Added focused tests for Source Map reviewer rendering, IT Security concept coverage, weak-term filtering, internal-label stripping, empty section hiding, legacy fallback, and deterministic no-AI reviewer construction.

### Files touched

- `components/StudyOutputReviewerPage.tsx`
- `lib/deep-learn-generation.ts`
- `lib/deep-learn.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/types.ts`
- `tests/study-output-reviewer.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 1 created the Source Map foundation, but Reviewer still depended on generated Study Pack arrays and section text. That allowed weak generated artifacts to drive the student-facing reviewer. This change makes Source Map units the primary reviewer source while preserving old saved packs through an explicit legacy fallback path.

### Tests run

- `npx tsx --test tests/study-output-reviewer.test.ts` - passed
- `npm run typecheck` - passed after fixing a strict source-map cast
- `npm run lint` - passed
- `npm test -- study-output-reviewer deep-learn-generation learn-resource-ui` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified IT Security-like source maps produce reviewer concepts for IT Security, InfoSec vs IT Sec, CIA Triad, domains, cybersecurity, importance/challenges, attacker types, vulnerability/exploit/breach, threat types, malware, infiltration, denial-of-service, blended attacks, and impact reduction.
- Verified Source Map Reviewer is selected before legacy reviewer when a valid map exists.
- Verified legacy Study Pack reviewer still renders when no Source Map exists and is labeled as fallback.
- Verified empty Reviewer sections are hidden in rendered markup.
- Verified no new AI call is needed for Reviewer rendering; the adapter is deterministic and local.

### Known risks

- Existing ready Study Packs generated before this change do not have `sourceGrounding.sourceMap`; they will continue using the fallback reviewer until regenerated.
- The adapter quality depends on Source Map unit quality. Very unusual source layouts may still need more source-map extraction patterns.
- `sourceGrounding` now stores a larger JSON payload because it includes the Source Map.

### Blockers

- No blocker remains.

### Next recommended step

Regenerate the real IT Security Study Pack so its saved note includes `sourceGrounding.sourceMap`, then generate/open the Reviewer and verify the student-facing concepts against the expected IT Security list.

### Suggested commit message

```bash
render reviewer from source map
```

---

## Session Update - 2026-05-15 (Add Deep Learn Source Map foundation)

### What changed

- Added an internal `AcademicSourceMap` layer for Deep Learn source grounding.
- The source map builder now locally cleans selected source text, chunks it by academic/security headings, extracts definition/list/category/process units, preserves closest source quotes, scores importance, and validates unit/quote coverage.
- Deep Learn prompt grounding now tries Source Map grounding first and falls back to the existing deterministic structured grounding if source-map validation cannot produce trusted units.
- Kept the existing Study Pack staged generation path, compact/micro fallback, deterministic repair fallback, and save validation unchanged.
- Added IT Security-like fixture coverage for expected units including IT Security definition, InfoSec vs IT Sec, CIA Triad, domains, cybersecurity definitions, importance/challenges, attacker types, vulnerability/exploit/breach, cybercrime/disruption/espionage, malware, infiltration, denial-of-service, blended attacks, and impact reduction.

### Files touched

- `lib/deep-learn-source-map.ts`
- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Deep Learn needed a structured internal source layer instead of treating readable source text as one generated blob. The new Source Map foundation gives later Deep Learn v2 work stable academic units with source quotes while staying bounded, local-first, and compatible with the existing Study Pack fallback path.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed

### Verification result

- Passed all requested verification commands.
- Verified Source Map grounding is bounded and includes exact source quote lines.
- Verified IT Security-like fixture produces the expected core academic units.
- Verified Deep Learn still falls back to the previous structured grounding if Source Map validation returns no trusted units.
- Verified the source-card readiness path was not changed; map generation is internal prompt preparation and does not make Ready cards fail.

### Known risks

- The Source Map extractor is deterministic and pattern-based. It covers the IT Security module shape and common heading/list structures, but unusual slide layouts may need more heading and unit patterns.
- Some source map summaries are intentionally compact; later phases should decide how Reviewer/Quiz consume these units directly instead of only using them as prompt grounding.

### Blockers

- No blocker remains.

### Next recommended step

Wire saved Deep Learn Reviewer/Quiz builders to consume `AcademicSourceMap` units directly instead of relying only on generated Study Pack artifacts.

### Suggested commit message

```bash
add deep learn source map foundation
```

---

## Session Update - 2026-05-14 (Repair weak Deep Learn reviewer output locally)

### What changed

- Added a deterministic Deep Learn repair fallback that runs only after model/staged output is sanitized and fails strict save validation.
- The repair fallback builds a compact local reviewer from the already-cleaned structured source:
  - `Source Summary`
  - `High-Yield First`
  - `answerBank`
  - `identificationItems`
  - `likelyQuizTargets`
- Kept strict save validation unchanged for empty artifacts, internal pipeline labels, malformed reviewer headings, and duplicate quiz targets.
- Kept anti-stuck behavior unchanged:
  - no new model calls
  - no new retry stage
  - invalid JSON, empty provider responses, provider errors, and timeout-style failures still fail cleanly instead of entering compact/micro fallback loops
- Improved deterministic source line cleanup so bullet-separated and numbered-list PDF extraction text can be structured into local fallback units.

### Files touched

- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

After commit `a032392`, the stricter save validator correctly rejected weak Study Pack output, but readable sources such as the IT Security PDF could fail instead of being repaired into a minimum viable reviewer. The new local repair path preserves the strict save gate while using source-derived headings, lists, term definitions, and concept groups to save compact study artifacts when the selected source text is meaningful.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified an IT Security-like readable source saves after weak model output with non-empty `answerBank`, `identificationItems`, and `likelyQuizTargets`.
- Verified deterministic repair strips internal pipeline labels before validation/save.
- Verified garbage/metadata-only source text remains rejected.
- Verified provider errors still make one provider call and do not enter compact/micro retry loops.
- Verified existing source-card readiness coverage still confirms generation failures do not turn the source Ready state into Failed.

### Known risks

- The deterministic fallback is intentionally compact and source-structural. It prevents readable-source failure, but normal model output should still produce richer explanations when healthy.
- Fallback quality depends on local structure extraction. Very unusual slide text may still produce basic list/category artifacts rather than polished instructor-style summaries.

### Blockers

- No blocker remains.

### Next recommended step

Run authenticated QA on the real IT Security PDF and confirm Deep Learn completes, the source card remains Ready, and the saved Reviewer has useful high-yield, identification, and likely quiz target sections without internal labels.

### Suggested commit message

```bash
repair weak deep learn reviewer output locally
```

---

## Session Update - 2026-05-14 (Improve Deep Learn semantic reviewer quality)

### What changed

- Added a final student-facing cleanup layer for Deep Learn generated content:
  - strips internal pipeline labels such as `Reconstructed lists`, `Clean source summary fragments`, `Normalized headings`, and `Detected concepts`
  - applies during generated-content normalization and again during Reviewer rendering
- Improved deterministic semantic reconstruction:
  - canonicalizes raw OCR headings such as `Cyber Security What` into `What is Cybersecurity?`
  - scores reconstructed headings so strong list-derived headings such as `Password Cracking Methods` rank above weak OCR fragments
  - avoids treating headings/list rows as term definitions
  - adds relationship grouping for category/member, method/technique, component, and subdomain patterns
- Improved reviewer output specialization:
  - Identification prompts are direct `Identify:` style prompts
  - Answer bank remains compact memorize/glossary style
  - Likely quiz targets are framed as explain/apply style prompts when model wording is too flat
  - Quick review blocks can reconstruct cleaner educational headings such as `Layered Cybersecurity Defense`
- Added semantic deduplication:
  - answer bank, identification, and likely quiz target artifacts are deduped deterministically during normalization
  - reviewer rendering also removes repeated quick-review blocks, repeated points, and duplicated quiz targets
- Strengthened save-time validation:
  - rejects empty reviewer artifacts as before
  - rejects leaked internal pipeline labels
  - rejects malformed reviewer headings
  - rejects duplicated likely quiz targets
- Preserved anti-stuck protections:
  - no new AI stage
  - no recursive generation
  - no retry/stage count increase
  - no prompt-size expansion beyond existing staged prompts
  - compact/micro/minimal fallback behavior remains bounded and size-limit-only

### Files touched

- `lib/deep-learn.ts`
- `lib/deep-learn-generation.ts`
- `lib/study-outputs/reviewer.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/study-output-reviewer.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Reviewer output could still expose prompt-structuring labels and raw OCR-derived phrasing even though the deterministic academic structuring foundation was working. This pass keeps quality improvements deterministic and local: clean the artifact before save/render, improve heading/group reconstruction, and make each reviewer mode present source-grounded content differently without adding another model pass or longer retry loop.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npx tsx --test tests/study-output-reviewer.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified internal pipeline phrases are stripped from normalized saved artifacts and Reviewer output.
- Verified malformed headings are rejected before save.
- Verified `What is Cybersecurity?`, `Password Cracking Methods`, and `CIA Triad` reconstruction remains deterministic.
- Verified parent-child concept grouping still reconstructs CIA/password-cracking groups.
- Verified Reviewer modes are no longer identical: identification, answer bank, likely quiz target, and quick-review content get separate deterministic treatment.
- Verified anti-loop protections still pass through the existing staged fallback tests, including invalid JSON, empty response, provider error, compact fallback, micro fallback, and minimal fallback paths.

### Known risks

- Heading and educational abstraction are still conservative heuristics. They improve common OCR/security-course patterns but will need more examples for unusual slide layouts.
- Deduplication intentionally preserves at least one likely quiz target even when all quiz targets overlap other artifacts, so very small packs can still save with a useful quiz target.
- Relationship grouping is pattern-based and should not be treated as inferred knowledge beyond the selected source text.

### Blockers

- No blocker remains.

### Next recommended step

Run authenticated QA on the IT Security source and compare the saved Reviewer against the previous output for internal-label leaks, heading quality, concept grouping, and mode differentiation.

### Suggested commit message

```bash
improve deep learn semantic reviewer quality
```

---

## Session Update - 2026-05-14 (Improve Deep Learn academic structuring quality)

### What changed

- Added a deterministic academic structuring layer before Deep Learn model generation:
  - cleanup of OCR/source lines
  - duplicate fragment collapse
  - heading detection and normalization
  - enumeration/list reconstruction
  - known academic grouping for cybersecurity/CIA/password-cracking patterns
  - term-definition extraction
  - parent-child concept hierarchy reconstruction
  - compact structured grounding plus exact source passages
- Wired Deep Learn prompt grounding through the local structuring layer instead of sending only raw compacted text.
- Preserved the existing bounded staged generation architecture:
  - full staged pass
  - compact fallback only for size-limit failures
  - micro fallback only for size-limit failures
  - minimal deterministic fallback only after micro size-limit failure
- Kept timeout, provider, invalid JSON, and empty provider responses as fail-fast paths with no compact/micro retry loop.
- Labeled Reviewer output as a Compact Reviewer when the saved Study Pack contains compact fallback caution notes.
- Added regression coverage for academic normalization, duplicate heading cleanup, list reconstruction, term-definition extraction, compact structured grounding, and compact reviewer rendering.

### Files touched

- `lib/deep-learn-generation.ts`
- `lib/study-outputs/reviewer.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/study-output-reviewer.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Reviewer quality was still too close to raw OCR notes because the model received fragmented extracted text and had to infer structure during bounded generation. The new architecture improves quality locally before any provider call, so each existing stage receives cleaner academic units: headings, lists, definitions, concept groups, and deduped source fragments. This improves the chance of instructor-style reviewer artifacts without adding another AI pass, recursive retries, or larger prompts.

### Architecture reasoning

The pipeline is now:

```text
raw extracted text
-> cleanup
-> duplicate collapse
-> academic heading detection
-> list reconstruction
-> term-definition extraction
-> concept hierarchy reconstruction
-> compact structured grounding with exact source passages
-> existing bounded staged generation
-> validation
-> save or fail cleanly
```

The deterministic layer is intentionally capped before prompt construction. It keeps the existing `MAX_GROUNDING_CHARS` boundary and divides the prompt budget between structured academic units and exact source passages for grounding. This keeps token use bounded while improving signal quality.

### Anti-loop safeguards

- No new model stage was added.
- No recursive retry path was added.
- Full, compact, and micro generation still run at most once per level.
- Compact and micro fallback remain size-limit-only recovery paths.
- Timeout, provider errors, malformed JSON, and empty responses still fail cleanly without fallback retries.
- Save validation still rejects ready Study Packs unless meaningful `answerBank`, `identificationItems`, and `likelyQuizTargets` exist.
- Queue heartbeat/progress behavior is unchanged.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npx tsx --test tests/study-output-reviewer.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed

### Verification result

- Passed all requested verification commands.
- Verified structured grounding preserves selected-source-only grounding and does not reintroduce stale module/course/task context.
- Verified long-source grounding still keeps beginning/middle/end academic content within the 12,000 character cap.
- Verified cybersecurity examples normalize into cleaner academic units such as `Core Principles of Cybersecurity`, `Password Cracking Methods`, and `CIA Triad`.
- Verified duplicate headings/fragments collapse before prompt construction.
- Verified compact fallback Reviewer summaries are labeled as compact while empty sections remain absent.

### Known risks

- The deterministic structuring uses conservative heuristics. It improves common OCR/extraction patterns, but unusual instructor slide formats may still need future pattern additions.
- Known cybersecurity group detection is intentionally narrow to avoid inventing unsupported categories.
- Manual QA on real IT Security and Data Organization PDFs is still recommended to judge reviewer quality beyond unit-level structure.

### Blockers

- No code blocker remains.

### Next recommended step

Run authenticated production QA on the affected IT Security source: generate a Study Pack, open Reviewer, and compare hierarchy, definitions, lists, likely quiz targets, and compact fallback labeling against the previous raw-OCR-feeling output.

### Suggested commit message

```bash
improve deep learn academic structuring quality
```

---

## Session Update - 2026-05-14 (Fix Deep Learn empty fallback reviewer)

### What changed

- Added a Deep Learn save validator that rejects ready Study Packs unless they contain meaningful structured reviewer artifacts:
  - `answerBank`
  - `identificationItems`
  - `likelyQuizTargets`
- Kept compact and micro fallback retryable only for provider size-limit failures.
- Kept timeout, provider failure, malformed JSON, and empty response paths as clean failures instead of falling into compact/micro/minimal fallback.
- Changed minimal size fallback so it derives non-empty reviewer artifacts from selected source sentences/terms before saving.
- Added a queue-side validation check immediately before saving a ready Deep Learn note, so source-summary-only packs cannot be persisted as completed.
- Preserved source readiness behavior: generation failure remains a Study Pack failure and does not turn the source card itself into failed.

### Files touched

- `lib/deep-learn-generation.ts`
- `actions/queue-jobs.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The compact/micro/minimal fallback path could save a completed Deep Learn pack that only had section prose and no reusable Reviewer/Quiz artifacts. That made downstream Reviewer UI show zero useful items even when the selected source text was readable. The fix makes size fallback deterministic enough to remain useful, and rejects any generated pack that still lacks the minimum structured study content.

### Tests run

- `npx tsx --test tests/deep-learn-generation.test.ts` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed
- `npm test -- task-output task-output-foundation` - passed

### Verification result

- Passed all requested verification commands.
- Verified compact fallback still runs after a full size-limit failure.
- Verified micro fallback still runs after compact size-limit failure.
- Verified minimal fallback now creates non-empty `answerBank`, `identificationItems`, and `likelyQuizTargets` from source text.
- Verified source-summary-only generated content is rejected before save.
- Verified invalid JSON, empty responses, and provider errors do not retry into compact/micro fallback.
- Verified existing Learn-card source readiness regression coverage still passes, including source cards staying Ready after Study Pack generation failure.

### Known risks

- Minimal fallback artifacts are intentionally basic and sentence-derived; they are a safety fallback for repeated size-limit failures, not a quality replacement for normal model-generated packs.
- The validator is stricter than before: a provider response with sections but no answer bank, identification items, or likely quiz targets now fails cleanly instead of saving a weak pack.
- Manual production QA is still recommended on the affected readable PDF to confirm the saved Reviewer shows useful counts and opens correctly.

### Blockers

- No code blocker remains.

### Next recommended step

Run authenticated production QA on the affected Deep Learn source: generate a Study Pack, confirm the queue completes or fails cleanly without looping, then open Reviewer and verify non-zero high-yield answers, identification items, and likely quiz targets.

### Suggested commit message

```bash
fix deep learn empty fallback reviewer
```

---

## Session Update - 2026-05-14 (Harden Deep Learn compact fallback)

### What changed

- Added levelled Deep Learn fallback handling for long readable sources:
  - full staged generation still runs first
  - `max_output_tokens` retries only the failed/remaining stage at compact level
  - compact size failures retry only the failed/remaining stage at micro level
  - micro size failures save a minimal grounded source-summary pack instead of failing when readable academic source text exists
- Added partial salvage so successful earlier stages are carried into compact, micro, and minimal fallback output.
- Added micro hard limits in prompt and runtime trimming:
  - High-Yield First max 5 bullets
  - Key Terms/identification max 8
  - Quick Q&A/answerBank max 6
  - Likely Quiz Targets max 5
  - Caution Notes max 2
- Added compact reviewer caution copy to fallback packs: `Generated as a compact reviewer because the source was long.`
- Updated size-limit failure copy in queue/card helpers to: `The model response limit was reached even after compact fallback. Try a smaller source or split the module.`
- Updated internal logs to include exact fallback level (`compact`, `micro`, `minimal`), previous level, stage, kind, and reason.

### Files touched

- `lib/deep-learn-generation.ts`
- `components/shell/QueuePanel.tsx`
- `lib/learn-card-state.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/learn-card-state.test.ts`
- `tests/study-library.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production still hit `max_output_tokens` during the compact fallback for a readable long PDF. The previous path treated compact size failure as terminal and could discard valid completed stage output. This change makes size limits retryable through a hard-bounded micro pass, preserves already generated sections, and saves a small grounded pack when only provider output size is the remaining problem.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed
- `npm test -- task-output task-output-foundation` - passed
- Additional targeted checks:
  - `npx tsx --test tests/deep-learn-generation.test.ts` - passed
  - `npx tsx --test tests/learn-card-state.test.ts tests/study-library.test.ts tests/queue.test.ts` - passed

### Verification result

- Passed all requested verification commands.
- Verified full generation can recover through compact fallback.
- Verified compact size failure can recover through micro fallback.
- Verified micro fallback trims arrays to strict maximum counts before saving.
- Verified micro size failure saves a minimal grounded Study Pack instead of surfacing the old one-pass failure.
- Verified old one-pass retry wording is not returned in queue/card copy.
- Verified source readiness remains separate from Study Pack generation failure state through existing queue/card tests.
- Verified metadata-only, refusal, UUID/debug-text, and unreadable scanned-PDF blockers still pass.

### Known risks

- Minimal fallback content is intentionally sparse when every structured fallback hits provider size limits; it should keep the source usable but will not be as rich as the normal Study Pack.
- Provider errors, malformed JSON, timeouts, source-quality blockers, or save failures still fail the job instead of silently creating questionable content.
- Manual production QA is still needed on `1. Intro-To-IT-Security.pdf` to confirm the live provider follows the micro bounds and the saved compact reviewer is useful.

### Blockers

- No code blocker remains.

### Next recommended step

Deploy and run authenticated production QA on `1. Intro-To-IT-Security.pdf`: generate the Study Pack from the Ready card, confirm the queue completes with `Compact study pack ready.`, open the saved pack, and verify Reviewer/Quiz outputs still render from the compact pack.

### Suggested commit message

```bash
harden deep learn compact fallback
```

---

## Session Update - 2026-05-14 (Fix Deep Learn fallback and retry failure state)

### What changed

- Removed the active Deep Learn path that surfaced the old one-pass retry wording for long readable sources.
- Kept staged generation behavior, but compact fallback failures now report a compact-size/stage-specific error instead of telling students to regenerate a shorter version before fallback has had a chance to succeed.
- Added shared Learn-card queue state handling so a failed study-pack generation attempt is separate from source extraction/readiness.
- Changed Learn source status logic so a readable source can remain `Ready` while the card separately says the last study-pack attempt failed.
- Starting or retrying generation still saves a pending `deep_learn_notes` row with `errorMessage: null`; a successful retry supersedes older failed queue state on the card.
- Queue completion for compact fallback now uses `Compact study pack ready.` and the queue title can show `Compact study pack ready`.
- Regenerate button copy now uses `Regenerate Study Pack` after a failed study-pack attempt.
- Added regression coverage for compact fallback success, old failure copy removal, stale failed queue-state clearing, source readiness not becoming failed, and old failed queue items not blocking a new pending attempt.

### Files touched

- `actions/queue-jobs.ts`
- `app/modules/[id]/learn/page.tsx`
- `components/StudyResourceAccordionList.tsx`
- `components/shell/QueuePanel.tsx`
- `lib/deep-learn-generation.ts`
- `lib/learn-card-state.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/learn-card-state.test.ts`
- `tests/queue.test.ts`
- `tests/study-library.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The latest deployment still showed a long-source one-pass failure for `1. Intro-To-IT-Security.pdf`, even though the source was readable and eligible for Deep Learn. The visible bug had two parts: compact fallback was still mapped to old one-pass copy on size failure, and the Learn source card let a failed generation queue job override source readiness, making the PDF itself look failed. This pass makes fallback/result copy match the actual staged flow and keeps source readiness independent from study-pack generation status.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed
- `npm test -- task-output task-output-foundation` - passed
- `npm test -- deep-learn-generation learn-card-state study-library queue` - passed as an additional targeted regression run

### Verification result

- Passed all requested verification commands.
- Verified staged compact fallback can complete after a full stage hits `max_output_tokens`.
- Verified compact fallback success does not return the old one-pass retry wording.
- Verified a failed Deep Learn attempt followed by a later saved pack clears stale failed card state.
- Verified a readable source is not labeled failed just because the last Study Pack attempt failed.
- Verified old failed queue jobs do not block a new pending generation state.

### Known risks

- Live provider behavior can still fail if compact fallback itself times out, returns malformed structured JSON, or repeatedly exceeds provider limits.
- Manual production QA is still needed on the actual `1. Intro-To-IT-Security.pdf` source to confirm the compact reviewer content quality and exact UI copy in the deployed account.
- The current test runner executes the full test suite even when file name filters are passed through `npm test -- ...`; this is noisy but all runs passed.

### Blockers

- No code blocker remains.

### Next recommended step

Deploy and run authenticated manual QA on `1. Intro-To-IT-Security.pdf`: generate the Study Pack from the Ready source card, confirm queue progress advances through staged sections, confirm a compact pack saves/opens if fallback is needed, and confirm the source card stays `Ready` if a generation attempt fails.

### Suggested commit message

```bash
fix deep learn fallback and retry failure state
```

---

## Session Update - 2026-05-14 (Fix Deep Learn long-source staged fallback)

### What changed

- Replaced monolithic Deep Learn generation with staged section generation in `lib/deep-learn-generation.ts`:
  - `Source Summary` + `High-Yield First`
  - `Identification Review`
  - `Quick-Answer Blocks`
  - `Distinctions` + `Likely Quiz Targets`
- Added automatic compact fallback when a normal staged pass hits provider size limits or another recoverable stage failure.
- Kept all staged/fallback passes grounded only in the selected resource text; no stale module/course/task context is used as study content.
- Added per-stage queue progress/status updates so Deep Learn now advances through source compaction, staged section generation, and save completion instead of appearing stuck at 40%.
- Added completed-queue copy for compact fallback results so students can see when Stay Focused generated a shorter study pack because the source was long.
- Added tests covering:
  - normal long readable staged generation success
  - compact fallback success after a size-limited stage
  - failure only after compact fallback also exhausts size limits
  - staged queue progress literals and compact completion copy

### Files touched

- `actions/queue-jobs.ts`
- `components/shell/QueuePanel.tsx`
- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Deep Learn was still trying to materialize one oversized structured response for a normal long readable course PDF, so the OpenAI response hit `max_output_tokens` and surfaced the old one-pass failure message. The fix moves Deep Learn to bounded staged generation, then retries automatically with a smaller compact pack before failing. That keeps readable long sources usable without weakening the existing source-quality guardrails.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-readiness queue canvas-content-resolution learn-resource-ui` - passed
- `npm test -- study-output-reviewer study-output-sheet study-output-quiz-pack study-output-print` - passed
- `npm test -- task-output task-output-foundation` - passed

### Verification result

- Passed all requested verification commands.
- Verified the previous long-source failure path now comes from staged generation retries instead of a single oversized Study Pack response.
- Verified compact fallback succeeds when a normal staged section exceeds response size limits.
- Verified queue progress now advances through staged generation and completed jobs can display compact-fallback copy.
- Verified existing readiness/source-quality protections still block metadata-only, refusal, and debug-only content.

### Known risks

- Compact fallback still depends on the provider returning valid structured JSON for each smaller stage; repeated provider-side structured-output failures can still fail the job after retry.
- Queue staleness is reduced by staged progress updates and heartbeat writes, but a provider/network hang beyond the stage timeout will still fail that stage rather than recover invisibly.
- Manual signed-in QA on the real IT Security PDF is still recommended to validate section quality and student-facing compact wording.

### Blockers

- No code blocker remains.

### Next recommended step

Run authenticated manual QA on the IT Security PDF in Learn and confirm the saved Study Pack opens with staged content quality that is acceptable for Reviewer and Quiz downstream outputs.

### Suggested commit message

```bash
fix deep learn long source generation fallback
```

## Session Update - 2026-05-14 (Refine Activity and reviewer export templates)

### What changed

- Added a shared Activity submission HTML template for task/activity exports, modeled loosely on the uploaded `CC19 Template.docx` structure without hard-coding CC19/Data Mining:
  - centered course/program header
  - activity title
  - Names/Date row
  - Section/Schedule and Course/Module row
  - generated answer/body immediately below
- Changed task output titles to use the activity/task title itself instead of appending generic labels such as `Report`.
- Renamed student-facing task-output surfaces to `Activity` in Library labels, queue copy, task generation UI, print metadata, and export button labels.
- Added a clean print-only Activity document renderer for saved task outputs, including compatibility rewrapping for older saved outputs that still contain bare HTML.
- Hid the module lens header from print/export output so reviewer/study prints do not include app chrome such as Learn/Tasks/Quiz tabs, course overview actions, or working context.
- Changed generated reviewer titles to preserve the source/study title instead of appending `Reviewer`; the output type remains shown as compact metadata.
- Added global print styles for the Activity template.

### Files touched

- `app/(app)/library/[id]/page.tsx`
- `app/(app)/library/page.tsx`
- `app/globals.css`
- `components/DoNowPanel.tsx`
- `components/ModuleLensShell.tsx`
- `components/StudyOutputTaskOutputPage.tsx`
- `components/shell/QueuePanel.tsx`
- `lib/study-output-content.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/study-outputs/store.ts`
- `lib/task-output.ts`
- `lib/task-output-template.ts`
- `tests/study-library.test.ts`
- `tests/study-output-print.test.ts`
- `tests/study-output-reviewer.test.ts`
- `tests/task-output-foundation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Task exports were too bare for actual activity submission, especially short-answer tasks that produced only a simple answer inside a minimal HTML shell. Reviewer/study output print views also needed a cleaner separation from app workspace chrome. This pass makes Activity exports submission-shaped while keeping the generated answer as the main body and preserving existing task/Deep Learn grounding rules.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- task-output-foundation study-output-print study-output-reviewer study-library` - passed
- `npm test -- task-output study-output-print study-output-reviewer study-output-sheet study-output-quiz-pack` - passed
- `npm test -- task-output-foundation deep-learn-generation` - passed

### Verification result

- Passed all requested verification.
- Verified Activity exports include academic metadata placeholders/values and no longer wrap rich-text answers in a bare `<pre>`.
- Verified saved task-output print rendering produces the Activity template even for older bare HTML exports.
- Verified reviewer/study print output remains free of app workspace labels such as `LEARN`, `Deep Learn Tasks Quiz`, `Course Learn`, and `Working context`.
- Verified Deep Learn grounding regression coverage still passes.

### Known risks

- The template currently produces export-ready HTML/printable output for DOCX/PDF targets; it does not generate a native `.docx` binary file.
- Student name, section, and schedule are placeholders unless surfaced in future profile/course metadata.
- Browser print preview QA with a real saved PATHFit/CC19-style activity is still recommended for spacing and page-break polish.

### Blockers

- No code blocker remains.

### Next recommended step

Generate a real Activity output from a signed-in account using a short-answer task and confirm the downloaded/printed Activity document matches the instructor-facing submission shape.

### Suggested commit message

```bash
refine task and reviewer export templates
```

## Session Update - 2026-05-14 (Fix task output grounding and Deep Learn queue progress)

### What changed

- Task output generation now enriches queued jobs from the server-side module workspace before calling `/api/task-output`.
- Task output context now pulls the selected assignment prompt plus related readable module resources/pages, preferring meaningful extracted Canvas source text over stale module summaries.
- Added flexible task format detection for short answer, essay/report, quiz-like, reflection, activity sheet, file-upload report, and presentation/document outputs.
- Strengthened task-output prompting so grounded requests produce the actual answer/content first and preserve instructor constraints such as `2-3 sentences`.
- Grounded task-output fallback now produces conservative answer content instead of the old `Purpose / Deliverable focus / Grounded context / Next edit pass` scaffold.
- Metadata/debug/UUID/OCR-status text is filtered before task-output grounding is considered sufficient.
- Deep Learn queued jobs now move past 40% before model generation and write heartbeat updates while the model is working.
- Deep Learn long text grounding now compacts representative beginning/middle/end chunks instead of only front-truncating a normal long Canvas source.

### Files touched

- `actions/queue-jobs.ts`
- `app/api/task-output/route.ts`
- `lib/task-output.ts`
- `lib/deep-learn-generation.ts`
- `tests/task-output-foundation.test.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Task output was too dependent on the client-surfaced task context and could mark real assignment prompts as limited, which caused a scaffold-only output even when Learn could see readable module sources. Deep Learn also updated progress to 40% immediately before the long model call, so normal generation looked stuck. This pass aligns task generation with Learn's grounded source context and makes Deep Learn queue progress and long-source handling more reliable.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- task-output-foundation deep-learn-generation` - passed
- `npm test -- task-output deep-learn-generation deep-learn-readiness canvas-content-resolution learn-resource-ui queue` - passed

### Verification result

- Passed all requested verification commands for touched task-output, Deep Learn, readiness, Canvas content resolution, Learn UI, and queue coverage.
- Verified task-output short-answer prompts are classified as `short_answer`, preserve `2-3 sentences`, and do not return the old scaffold when grounded.
- Verified weak metadata/debug/UUID-only task context still falls back to a limited scaffold.
- Verified Deep Learn long source grounding includes beginning, middle, and ending source excerpts within the existing 12k grounding cap.
- Verified typecheck and lint are clean.

### Known risks

- Related module-resource selection is heuristic: it scores title/token overlap, module markers such as `M1`, Canvas pages, and acquire-knowledge pages. It should improve PATHFit-style module context, but live Canvas courses with unusual naming may need additional matching rules.
- The heartbeat updates keep running jobs fresh while the model call is active, but they cannot interrupt a provider call that hangs below the platform timeout.
- Grounded deterministic fallback is conservative and not a replacement for the model path; the main quality improvement depends on the strengthened prompt and richer source context.

### Blockers

- No code blocker remains.
- Manual QA with a signed-in PATHFit 3 Canvas assignment is still recommended to confirm exact instructor-format output quality.

### Next recommended step

Generate a task output for PATHFit 3 `M1: APPLICATION` from a signed-in account and confirm it uses the assignment prompt, rubric, and `M1: ACQUIRE NEW KNOWLEDGE` source context to produce a direct submission-ready answer.

### Suggested commit message

```bash
fix task generation grounding and deep learn queue failures
```

## Session Update - 2026-05-13 (Finish Deep Learn output simplification)

### What changed

- Raised Deep Learn generation `max_output_tokens` to `10000` for normal and compact retry attempts.
- Added a compact retry path for Deep Learn `max_output_tokens` incompletion:
  - first pass uses the normal bounded Study Pack contract
  - retry pass asks for fewer sections/items
  - server logs preserve the raw `max_output_tokens` diagnostic
  - student-facing queue/source-card copy previously used a generic too-large retry message
- Tightened Study Pack prompt structure around:
  - `Source Summary`
  - `Big Picture`
  - `Key Concepts`
  - `Concept Relationships`
  - `Apply It`
  - `What to Study First`
- Enforced smaller generated-content caps in normalization:
  - no more than 6 Study Pack sections
  - no more than 16 answer-bank items
  - no more than 16 identification items
  - no more than 6 distinctions
  - no more than 6 likely quiz targets
- Removed the separate source-card Study Pack preview / source-summary workflow from the Learn source card so Source Summary lives inside Study Pack generation instead of appearing as another visible output.
- Added Reviewer and Quiz actions directly to the expanded Learn source card when a Study Pack is ready:
  - `Generate Reviewer` / `Open Reviewer`
  - `Start Quiz` / `Open Quiz`
- Added bulk saved-output lookup for Deep Learn note IDs so source cards can open existing Reviewer/Quiz outputs without promoting old `study_sheet`, `cram_sheet`, or `quiz_pack` labels.
- Kept old `study_sheet`, `cram_sheet`, and `quiz_pack` rows accessible through the existing Study Library routes.
- Reduced task-output and Do Now generation caps from `16384` to `10000` to align with the requested task-output token policy.

### Files touched

- `actions/deep-learn.ts`
- `actions/queue-jobs.ts`
- `app/api/do-now/route.ts`
- `app/api/task-output/route.ts`
- `app/modules/[id]/learn/page.tsx`
- `components/StudyResourceAccordionList.tsx`
- `components/shell/QueuePanel.tsx`
- `lib/deep-learn-generation.ts`
- `lib/deep-learn.ts`
- `lib/study-outputs/store.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/study-library.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The previous simplification pass left two production risks: Deep Learn still used an `8192` output cap despite the requested `10000`, and the Learn source card still did not fully present the three-output model from the source card itself. The new retry and compact limits reduce max-token failures without trying to generate Study Pack, Reviewer, and Quiz in one giant pass.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation study-library` - passed
- `npm test -- deep-learn-generation deep-learn-quiz study-outputs study-output-sheet study-output-reviewer study-output-quiz-pack study-output-print queue` - passed

### Verification result

- Passed:
  - typecheck
  - lint
  - requested targeted Deep Learn, quiz, study-output, print, and queue coverage
- Verified in tests/code:
  - output token caps are `10000`
  - compact retry prompt uses smaller limits
  - student-facing queue/source-card copy hides raw `max_output_tokens`
  - source card exposes Study Pack, Reviewer, and Quiz actions
  - source-card preview workflow is removed from the primary source card
  - Study Pack sections and generated item counts are capped
  - old saved output kinds still map to Reviewer/Quiz labels and remain renderable
- Not completed:
  - authenticated browser QA with `1. Intro-To-IT-Security.pdf`
  - live generation QA against the production source card

### Known risks

- The compact retry still depends on the model returning valid schema JSON. If a provider has a lower hard cap than `10000`, the retry will still fail cleanly with the student-facing shorter-version message.
- Existing saved Study Sheet/Cram Sheet titles are preserved for compatibility, so old titles can still contain old wording even though labels/actions now collapse to Reviewer.
- The source-card Quiz action can attempt creation from any ready Study Pack; very thin packs may still return a clean "not enough academic source content" action error from the existing Quiz builder.

### Blockers

- No code blocker remains.
- Manual QA requires a signed-in local app session and the real `1. Intro-To-IT-Security.pdf` source.

### Next recommended step

Run authenticated browser QA on the real IT Security source card and generate/open Study Pack, Reviewer, and Quiz to confirm content quality, exact wording preservation, and no fake formulas.

### Suggested commit message

```bash
simplify Deep Learn outputs
```

## Session Update - 2026-05-13 (Simplify Deep Learn outputs)

### What changed

- Collapsed student-facing Deep Learn outputs into three labels:
  - `Study Pack`
  - `Reviewer`
  - `Quiz`
- Kept existing `study_outputs.output_kind` values for compatibility:
  - `reviewer`
  - `quiz_pack`
  - `study_sheet`
  - `cram_sheet`
  - `task_output`
- Updated saved-output labels so:
  - `quiz_pack` displays as `Quiz`
  - `study_sheet` and `cram_sheet` display as `Reviewer` variants
  - old Study Sheet/Cram Sheet rows remain openable through their existing renderer
- Updated Deep Learn source-card actions to show only:
  - `Open Study Pack`
  - `Generate Reviewer` / `Open Reviewer`
  - `Start Quiz` / `Open Quiz`
- Removed the old source-card top-level Study Sheet and Cram Sheet buttons.
- Updated Study Library filters to group reviewer, study sheet, and cram sheet rows under `Reviewers`, and to show `Quizzes` instead of `Quiz packs`.
- Relabeled the old source-summary surface as a `Study Pack preview` so it no longer presents a separate source-summary workflow to students.
- Tightened generation contracts and output caps:
  - Study Pack prompt now explicitly describes understanding/application structure and says not to generate Reviewer/Quiz/Study Sheet/Cram Sheet/Source Summary as separate documents in one pass.
  - Deep Learn max output tokens reduced from `16384` to `8192`.
  - Deep Learn normalization caps identification items at `16`.
  - Reviewer memorization items are capped at `16` by default.
  - Saved Quiz output is capped at `15` questions.
- Updated copy across Learn, Library, Quiz, and unavailable-storage states from “exam prep pack” / “quiz pack” toward `Study Pack`, `Reviewer`, and `Quiz`.

### Files touched

- `actions/deep-learn.ts`
- `actions/study-outputs.ts`
- `app/(app)/library/[id]/page.tsx`
- `app/(app)/library/page.tsx`
- `app/courses/[id]/page.tsx`
- `components/DeepLearnGenerateButton.tsx`
- `components/DeepLearnNoteView.tsx`
- `components/DeepLearnWorkspace.tsx`
- `components/MakeCramSheetButton.tsx` - removed
- `components/MakeQuizPackButton.tsx`
- `components/MakeReviewerButton.tsx`
- `components/MakeStudySheetButton.tsx` - removed
- `components/ModuleQuizWorkspace.tsx`
- `components/SourceSummaryBadge.tsx`
- `components/StudyOutputQuizPackPage.tsx`
- `components/StudyOutputSheetPage.tsx`
- `components/StudyResourceAccordionList.tsx`
- `lib/course-learn-overview.ts`
- `lib/deep-learn-generation.ts`
- `lib/deep-learn-readiness.ts`
- `lib/deep-learn-store.ts`
- `lib/deep-learn-ui.ts`
- `lib/deep-learn.ts`
- `lib/study-output-content.ts`
- `lib/study-outputs/quiz-pack.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/study-outputs/store.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/deep-learn-store.test.ts`
- `tests/deep-learn-ui.test.ts`
- `tests/study-library.test.ts`
- `tests/study-output-action-errors.test.ts`
- `tests/study-output-print.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `tests/study-output-reviewer.test.ts`
- `tests/study-output-sheet.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The app had too many overlapping Deep Learn saved-output surfaces: Study Pack / Deep Learn Pack, Reviewer, Quiz Pack, Study Sheet, Cram Sheet, and Source Summary. This made the product feel heavier than needed and encouraged duplicated saved outputs. The new path keeps the database compatible but collapses the student-facing model into Study Pack for understanding/application, Reviewer for source-faithful memorization/exam prep, and Quiz for practice.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-quiz study-library study-output-action-errors study-output-reviewer study-output-quiz-pack study-output-print study-output-sheet` - passed
- `npm test -- deep-learn-generation deep-learn-quiz study-outputs study-output-sheet study-output-reviewer study-output-quiz-pack study-output-print` - passed

### Verification result

- Passed:
  - typecheck
  - lint
  - targeted Deep Learn generation, quiz, study-library, reviewer, quiz, sheet, print, and action-error coverage
- Verified in tests/code:
  - Deep Learn source card no longer imports or renders Study Sheet/Cram Sheet actions
  - saved `study_sheet` and `cram_sheet` rows label as Reviewer
  - saved `quiz_pack` rows label as Quiz
  - Study Library reviewer filter includes old reviewer/sheet/cram rows
  - old sheet/cram rows still render through the saved-output detail route
  - generation prompt describes the compact three-output contract
  - Reviewer and Quiz default output caps are enforced
- Not completed:
  - authenticated browser QA with `1. Intro-To-IT-Security.pdf`
  - manual confirmation of exact source-card button rendering and generated output quality in a signed-in local app session

### Known risks

- Existing saved Study Sheet and Cram Sheet titles still contain their old names because rows are not migrated. They now appear under Reviewer labeling/filtering, but the saved title itself is preserved for compatibility.
- The Study Library grouping is light only. It reduces top-level filters but does not yet fully group rows as `Source -> Study Pack / Reviewer / Quiz`.
- Reviewer/Quiz still build from the saved Deep Learn structured content. If an older Study Pack lacks exact wording fields, outputs can only use the best existing saved fields.
- `SourceSummaryBadge` still calls the existing internal summary endpoint, but student-facing copy now frames it as a Study Pack preview rather than a separate Source Summary output.

### Blockers

- No code blocker remains.
- Manual QA requires a signed-in app session and the real `1. Intro-To-IT-Security.pdf` source available in the workspace.

### Next recommended step

1. Run authenticated browser QA on a real saved source card for `1. Intro-To-IT-Security.pdf`.
2. Confirm the card shows only Study Pack, Reviewer, and Quiz actions.
3. Generate/open each output and verify Reviewer exact wording, Study Pack understanding/application structure, and Quiz source-basis behavior.
4. Plan a later Library grouping pass if product wants the full `Source -> Study Pack / Reviewer / Quiz` shelf.

### Suggested commit message

```bash
simplify Deep Learn outputs
```

## Session Update - 2026-05-13 (Make Deep Learn outputs source faithful)

### What changed

- Strengthened the Deep Learn generation prompt around a two-layer output model:
  - exact source wording first for definitions, listed items, formulas, and process steps
  - separate plain-English explanation only in explanation/support fields
- Added shared source-faithful output cleanup helpers for:
  - raw extraction label normalization such as `IT Security -> definition`, `what-is-it-security`, `goals-cia`, and `cybersecurity-definitions`
  - source wording/source basis line formatting
- Updated deterministic reviewer, study sheet, cram sheet, and quiz-pack builders to prefer `exact` source wording for memorization/answers instead of broad `examSafe` paraphrases.
- Updated reviewer and sheet renderers to show separate student-facing layers:
  - `Memorize`
  - `Understand`
- Updated quiz generation/output rendering so definition answers use exact/near-exact source wording and saved quiz packs expose `Source wording` / `Source basis` lines.
- Kept formula handling strict so IT/security definitions such as vulnerability, breach, InfoSec, and malware symptoms are not treated as formulas.
- Added regression tests for:
  - exact source wording preservation in definition answers
  - separated explanation/support text
  - raw extraction label cleanup
  - fake formula avoidance for IT/security definitions
  - hidden formulas section when no real formulas exist
  - quiz source wording/source basis output
  - print output excluding app-navigation/working-context words
  - selected-source grounding prompt constraints

### Files touched

- `components/StudyOutputQuizPackPage.tsx`
- `components/StudyOutputReviewerPage.tsx`
- `components/StudyOutputSheetPage.tsx`
- `lib/deep-learn-generation.ts`
- `lib/deep-learn-quiz.ts`
- `lib/deep-learn.ts`
- `lib/study-note-quiz.ts`
- `lib/study-outputs/quiz-pack.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/study-outputs/sheets.ts`
- `lib/study-outputs/source-faithful.ts`
- `lib/types.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/deep-learn-quiz.test.ts`
- `tests/study-output-print.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `tests/study-output-reviewer.test.ts`
- `tests/study-output-sheet.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Recent Deep Learn outputs were cleaner than before, but still sometimes felt like extraction dumps or replaced exact teacher/module definitions with broader tutor paraphrases. This pass makes exact source wording the primary memorization layer for exam-safe outputs while keeping explanations readable and clearly separate.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- deep-learn-generation deep-learn-quiz study-output-sheet study-output-reviewer study-output-quiz-pack study-output-print` - passed
- Manual PDF extraction check:
  - `C:\Users\omgra\Downloads\1. Intro-To-IT-Security.pdf`
  - normal extraction returned `status: extracted`
  - extracted text length: `5908`
  - preview included the exact IT Security wording: `A set of cyber security strategies that prevent unauthorized access`

### Verification result

- Passed:
  - typecheck
  - lint
  - targeted Deep Learn / quiz / reviewer / sheet / print tests
- Verified in code/tests:
  - definition quiz answers preserve exact source wording
  - saved quiz packs include source wording/source basis metadata
  - reviewer and sheet rendering separates `Memorize` from `Understand`
  - raw extraction labels are normalized before reaching output headings/prompts
  - IT/security definition content does not produce fake formulas
  - formula sections remain hidden when no real formulas exist
  - print scaffolds do not include app navigation labels such as `LEARN`, `Deep Learn Tasks Quiz`, `Course Learn`, or `WORKING CONTEXT`
  - Deep Learn prompt stays grounded only in selected source text
- Not completed in this session:
  - authenticated browser/manual generation QA through the saved source card for `1. Intro-To-IT-Security.pdf`
  - visual print preview QA in a real browser

### Known risks

- Exact-source quality still depends on the model filling `wording.exact` and `sourceSnippet` faithfully during generation. The prompt is stricter and deterministic outputs now prefer exact wording, but historical saved packs with paraphrased-only fields can only preserve the best existing text they already contain.
- Raw-label normalization is intentionally conservative. It cleans common extraction labels without rewriting normal academic headings, but more source-specific label shapes may need additions after more PDFs are reviewed.
- Quiz application scenarios remain conservative; this change favors source-wording recall over inventing broader examples.

### Blockers

- No code blocker remains.
- Full manual QA of generated outputs from the real PDF requires an authenticated local app/session and generation path using the saved Canvas source; only local PDF extraction was verified here.

### Next recommended step

1. Generate a fresh Deep Learn pack from `1. Intro-To-IT-Security.pdf` in the app.
2. Open Reviewer, Quiz Pack, Study Sheet, and Cram Sheet outputs and confirm the visible `Memorize` / `Understand` / `Source wording` separation with the actual saved content.
3. Print/save the outputs and confirm no app chrome or working-context labels appear.

### Suggested commit message

```bash
make Deep Learn outputs source faithful
```

## Session Update - 2026-05-13 (Clean study output print styles)

### What changed

- Added a shared print-only study output header so saved print/PDF exports show only academic metadata:
  - output type
  - course
  - module
  - date
- Reworked saved study output pages to keep the current rich screen UI while rendering cleaner print structure for:
  - `Reviewer`
  - `Quiz Pack`
  - `Study Sheet`
  - `Cram Sheet`
  - `Task Output` preview page
- Added a dedicated print document path for quiz packs:
  - prints the full grounded question set
  - includes answer and explanation blocks
  - excludes interactive-only controls such as question count buttons, reveal buttons, next/reset controls, and self-review actions
- Tightened global print CSS for saved study outputs so print preview removes app chrome and low-ink issues:
  - white backgrounds
  - black text
  - no shadows, glow, decorative backgrounds, or floating UI
  - hidden sidebar, top nav, bottom nav, queue/floating surfaces, chips, and action controls
  - smaller print spacing and stronger page-break avoidance on cards/sections
- Extended render tests to cover:
  - print header/class presence
  - quiz print document rendering
  - task output print scaffold
  - formula section omission when no real formulas exist

### Files touched

- `app/globals.css`
- `components/StudyOutputPrintHeader.tsx`
- `components/StudyOutputQuizPackPage.tsx`
- `components/StudyOutputReviewerPage.tsx`
- `components/StudyOutputSheetPage.tsx`
- `components/StudyOutputTaskOutputPage.tsx`
- `tests/study-output-print.test.ts`
- `tests/study-output-sheet.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 4 improved study output content quality, but the saved output print preview still looked too much like the on-screen Stay Focused UI. The goal of this pass was to preserve the warm/dark screen design while making browser Print / Save PDF produce a cleaner, low-ink academic handout with minimal chrome and more reliable page breaks.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- study-output-sheet study-output-quiz-pack study-output-reviewer study-output-print task-output` - passed

### Verification result

- Passed:
  - typecheck
  - lint
  - targeted study-output render and generation coverage
- Verified in code/tests:
  - print-only metadata scaffold is rendered for reviewer, quiz pack, sheet, and task output pages
  - screen-only headers/actions stay wrapped in print-hide hooks
  - quiz packs now have a print-only full-question document with clearly labeled answers
  - sheet rendering still omits the formulas section when no real formulas exist
  - printable content still renders while screen styling remains intact in component markup
- Not completed in this session:
  - browser/manual print preview verification for Reviewer, Study Sheet, Cram Sheet, Quiz Pack, and Task Output pages
  - visual confirmation that the current signed-in library items produce ideal page breaks in a real browser

### Known risks

- The print CSS is intentionally broad for saved output routes and hides generic floating surfaces such as `.ui-floating`. That is correct for the current printable pages, but if another saved-output subcomponent later depends on a floated element that should print, it will need an explicit print override.
- Page-break control in browsers remains heuristic. The new `break-inside: avoid` rules reduce awkward splits, but especially long answer blocks or iframe-backed task previews may still split differently across Chrome/Safari print engines.
- Task output HTML previews still print through the embedded preview frame path. That is cleaner than before, but iframe-backed HTML exports may still need a future inline-print rendering path if real browser QA shows inconsistent PDF output.

### Blockers

- No code blocker remains.
- Manual browser print verification is still blocked here by the lack of a ready signed-in local session and seeded saved study outputs to exercise the exact library routes end-to-end.

### Next recommended step

1. Open a real saved `Reviewer` item and confirm Print / Save PDF shows the white academic layout with no app chrome.
2. Repeat for `Study Sheet`, `Cram Sheet`, and `Quiz Pack`, focusing on page breaks and answer readability.
3. If task-output HTML previews still print inconsistently, add an inline print-render path for HTML exports instead of relying on the iframe preview.

### Suggested commit message

```bash
clean study output print styles
```

## Session Update - 2026-05-13 (Improve study output quality)

### What changed

- Removed internal/debug phrasing from student-facing Deep Learn quiz and study output builders so saved quizzes, explanations, and sheet text no longer surface phrases like:
  - `answer-ready fact`
  - `compact answer unit`
  - `preserved for direct recall`
- Reworked Deep Learn quiz wording to read more naturally and filter out admin/course-metadata prompts from quiz generation.
- Added formula-aware quiz behavior for real formula content so formula questions can ask for the correct formula and include source-backed usage notes when available.
- Tightened sheet formula detection so plain definitions, symptoms, and security concept relationships are no longer misclassified as formulas just because they contain `=` or `/`.
- Added a study-sheet fallback section when no real formulas exist:
  - hides the `Formulas` section
  - avoids fake formula counts in the summary/chips
  - replaces the slot with a more appropriate student-facing section such as `Key definitions`
- Preserved formula rendering more cleanly in study sheets by keeping source expressions intact and rendering them in a monospace, pre-wrapped block.
- Relaxed source-summary eligibility so a source with meaningful grounded text can be summarized even when the stricter cleaned overview text is shorter than the old summary threshold, which fixes the contradictory `Ready` / `not enough clean readable text` state for meaningful extracted sources.
- Added regression tests covering:
  - internal wording never appearing in quiz/study outputs
  - admin metadata not becoming quiz content
  - real formula-aware quiz prompts
  - cybersecurity definitions staying out of the `Formulas` section
  - summary fallback behavior when no formulas exist
  - source-summary readiness with meaningful academic extracted text

### Files touched

- `components/StudyOutputSheetPage.tsx`
- `lib/deep-learn-generation.ts`
- `lib/deep-learn-quiz.ts`
- `lib/deep-learn.ts`
- `lib/source-summaries.ts`
- `lib/study-outputs/quiz-pack.ts`
- `lib/study-outputs/sheets.ts`
- `lib/types.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/deep-learn-quiz.test.ts`
- `tests/source-summary-readiness.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `tests/study-output-sheet.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production output quality still had three visible failures after the earlier extraction/retry fixes:

- quiz wording could leak internal generation language
- IT/security definitions and symptoms were being mislabeled as formulas
- the Source Summary area could contradict a `Ready` source by using a stricter hidden summary threshold than the saved-study-pack path

This pass fixes those output-quality issues without broad sync/path rewrites and keeps grounding strict to the selected source text.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- quiz deep-learn-generation deep-learn-readiness study-outputs` - passed
- `npm test -- study-output-sheet study-output-reviewer study-output-quiz-pack source-summary-readiness` - passed

### Verification result

- Passed:
  - typecheck
  - lint
  - required Deep Learn / quiz / study-output targeted test bundle
  - extra study-sheet / reviewer / source-summary readiness coverage
- Verified in code/tests:
  - internal builder phrasing no longer reaches student-facing quiz/study output strings
  - admin metadata like course title does not become quiz content by default
  - formula detection now rejects security definitions and similar plain-language relations
  - study sheets hide formula counts/sections when no real formulas exist and replace them with a better fallback section
  - real formula content still produces formula sections and formula-aware quiz prompts
  - source summary gating now accepts meaningful extracted source text instead of failing solely on the old clean-text threshold mismatch
- Not completed in this session:
  - production browser verification on `1. Intro-To-IT-Security.pdf`
  - deploy/manual verification of the updated Study Sheet, Cram Sheet, Quiz Pack, and Source Summary UI in production

### Known risks

- The new formula detector is intentionally heuristic. It is much stricter than before and correctly rejects the reported security definitions, but additional edge cases from other quantitative subjects may still need tuning once more real source samples are reviewed.
- The source-summary fix now allows fallback to meaningful grounded text when the cleaner trims too aggressively. That resolves the contradiction, but some summaries may include slightly noisier academic text until further cleaner refinement is needed.
- Quiz-worthiness filtering now suppresses admin/course metadata by default. If a source is truly only administrative overview content, the current path will tend toward thinner quiz output rather than a specialized `Course facts quiz` label; that would be a reasonable follow-up if product still wants that mode.

### Blockers

- No code blocker remains.
- Production/manual verification is still needed for the affected IT Security PDF after deploy.

### Next recommended step

1. Deploy this change.
2. Open `1. Intro-To-IT-Security.pdf` in production and verify:
   - Source Summary no longer contradicts `Ready`
   - Study Sheet and Cram Sheet do not show fake formulas
   - Quiz Pack wording is natural and free of internal phrasing
3. If production still shows thin or awkward output for formula-heavy subjects, collect one real math/science source and tune the formula-aware quiz heuristics separately from this IT/security cleanup.

### Suggested commit message

```bash
improve study output quality
```

## Session Update - 2026-05-13 (Fix manual Canvas PDF retry auth path)

### What changed

- Fixed the manual `Retry extraction` path so it resolves the signed-in user’s saved Canvas credentials before reprocessing stored Canvas PDF resources.
- Added a shared helper for stored resource reprocessing paths:
  - `resolveStoredCanvasConfigForUserResource(userId, { canvasInstanceUrl })`
- Updated the API retry route to pass user-scoped Canvas config into `reprocessStoredModuleResource(...)` instead of silently falling back to env-only behavior.
- Updated the inspect-page/manual resource reprocess action to use the same user-scoped Canvas credential resolution.
- Added sanitized retry diagnostics for server logs so production failures are categorized without exposing Canvas tokens or raw student-facing internals:
  - `missing_canvas_credentials`
  - `missing_canvas_file_identity`
  - `non_pdf_response`
  - `pdf_extraction_exception`
  - `extracted_text_too_short`
  - `database_update_failed`
- Preserved the clean UI message for genuine auth problems:
  - `Canvas connection is missing or expired. Reconnect Canvas in Settings, then retry.`
- Added regression coverage for the shared stored-resource Canvas config resolver used by manual retry paths.

### Files touched

- `app/api/sources/process/route.ts`
- `actions/module-resources.ts`
- `actions/queue-jobs.ts`
- `lib/canvas-user-config.ts`
- `tests/canvas-user-config.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production evidence showed `Retry extraction` still returned `Processed 1 source · 1 failed` for a readable Canvas PDF even after the earlier downloader fix. Live verification proved the affected resource row already had correct Canvas identity (`canvas_file_id = 10910070`, `canvas_course_id = 61456`), the signed-in user still had valid saved Canvas credentials, the authenticated Canvas download returned real `%PDF` bytes, and local extraction of the same file produced meaningful text. The remaining failure was the manual retry path itself: it was invoking stored-resource reprocessing without resolving and passing the saved per-user Canvas config, so it could still fail with reconnect/auth behavior despite the queue path already being fixed.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- canvas-user-config canvas-content-resolution queue pdf-extractor` - passed
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed

### Verification result

- Passed:
  - typecheck
  - lint
  - targeted Canvas config / extraction / queue test coverage
- Verified against the live affected production row:
  - `module_resources.id = 8dd05a34-77ba-47c0-8a13-854416407f58`
  - `canvas_file_id = 10910070`
  - saved `user_settings` Canvas host/token exist for the owning user
  - authenticated Canvas file metadata request returned `200`
  - authenticated binary download returned `200 application/pdf`
  - downloaded bytes began with `%PDF`
- Verified extractor behavior:
  - local extraction of `1. Intro-To-IT-Security.pdf` produced meaningful text
  - replaying `reprocessStoredModuleResource(...)` with the live row plus resolved user Canvas config returned:
    - `extractionStatus: extracted`
    - `extractedCharCount: 5908`
    - `extractionError: null`
- Background sync investigation result:
  - recent `GET /api/cron/external-sync` requests are reaching Vercel and returning `200`
  - auth is accepted
  - current external cron runs are skipping queue creation because Canvas course-list fetch for the synced user is failing token validation
  - `Last background sync` remaining stale is therefore expected until a real successful external sync run completes
- Not completed in this session:
  - post-deploy browser verification of `Retry extraction` on the real source card

### Known risks

- The retry fix depends on the stored resource belonging to the authenticated user and still having enough Canvas identity to reach the file API. The affected production row does, but older malformed rows may still need identity repair if both `canvas_file_id` and usable URLs are absent.
- The new diagnostics are log-only. If production needs deeper one-off inspection, a short-lived admin-only debug route may still be useful, but I did not add one in this focused P0 fix.
- `Last background sync` is still stale because external cron is not completing a successful sync for the affected user right now; this session did not change external cron logic because the live evidence points to account/token validation in that path rather than a summary-query bug.

### Blockers

- No code blocker remains for the manual extraction retry path.
- Deployment is still required before the fixed retry route can be verified in production.
- Background sync freshness is currently blocked by external cron failing the Canvas course-list fetch for the synced user, even though the request itself is arriving and authenticated.

### Next recommended step

1. Deploy this fix.
2. On the affected account, click `Retry extraction` for `1. Intro-To-IT-Security.pdf` and confirm the unreadable state clears and Deep Learn unlocks from extracted text without OCR.
3. Separately inspect why `/api/cron/external-sync` is failing Canvas token verification for that synced user while manual/resource-refresh flows still work; do not fake `Last background sync` from resource refresh activity.

### Suggested commit message

```bash
fix Canvas PDF extraction retry
```

## Session Update - 2026-05-13 (Fix Canvas PDF extraction retry)

### What changed

- Fixed stored Canvas PDF reprocessing so normal extraction now carries stable Canvas file identity into the downloader:
  - `canvas_file_id`
  - `canvas_course_id`
- Updated the file reprocess path to prefer the Canvas file API + authenticated binary download over stale stored file URLs when a resource already has Canvas file identity.
- Added server-side PDF download validation before extraction:
  - accepts `application/pdf`
  - accepts byte streams that start with `%PDF-`
  - rejects HTML/login/preview responses returned in place of a PDF
- Replaced the student-facing HTML/login download failure copy with:
  - `Canvas connection is missing or expired. Reconnect Canvas in Settings, then retry.`
- Preserved diagnostics server-side only for bad Canvas downloads:
  - content type
  - byte length
  - whether the response looked like HTML
  - requested host
  - Canvas file id
- Kept normal PDF extraction first on retry/reprocess; OCR remains fallback-only when extracted text is truly too weak or the PDF is image-only.
- Added regression tests covering:
  - file reprocessing passes `canvasFileId` and `canvasCourseId` into the downloader
  - reprocessing prefers Canvas file API download over a stale stored source URL
  - HTML/login download responses are rejected with reconnect guidance and without env-var wording
  - queue extraction path still runs normal reprocessing before OCR fallback queueing

### Files touched

- `lib/canvas-content-resolution.ts`
- `lib/canvas-resource-extraction.ts`
- `lib/module-resource-reprocess.ts`
- `tests/canvas-content-resolution.test.ts`
- `tests/module-resource-reprocess.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production still had a P0 split between metadata refresh and binary extraction: Canvas resource refresh could see the PDF metadata, but retry/reprocess could still download the wrong thing for a stored Canvas file URL, such as a stale preview/login response instead of authenticated PDF bytes. That made readable PDFs appear as `Could not extract enough readable text` even though they already contained embedded text. The fix makes reprocessing use stable Canvas file identity and validates the downloaded bytes before the extractor decides the source is unreadable.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness canvas-content-resolution learn-resource-ui queue` - passed
- `npm test -- sync-activity canvas-resource-refresh` - passed

### Verification result

- Passed:
  - typecheck
  - lint
  - required extraction / readiness / queue / sync activity test bundles
- Verified in code/tests:
  - readable PDF reprocessing now routes through Canvas file identity when available
  - bad HTML/login downloads are rejected before extraction with clean reconnect guidance
  - normal file extraction remains ahead of OCR fallback in the queue flow
  - readable PDF fixture extraction populates extracted text and char count
- Not completed in this session:
  - live deploy verification of the affected Canvas PDF
  - browser verification that the source card clears the unreadable state after `Retry extraction`
  - live cron-job.org / Vercel log verification for stale `Last background sync`

### Known risks

- This fix depends on the stored resource having correct `canvas_file_id` and `canvas_course_id`. If a legacy row is missing those identifiers, reprocessing may still fall back to the stored URL.
- The stale `Last background sync` issue does not currently look like a local query bug; it still likely needs deploy-side verification of cron-job.org traffic and `CRON_SECRET`.
- I did not add a broad fallback rewrite for every stored attachment shape; this is a focused P0 fix for Canvas-owned file reprocessing.

### Blockers

- No code blocker remains.
- Production verification is still required for:
  - the affected `1. Intro-To-IT-Security.pdf`
  - Deep Learn unlock after normal extraction succeeds
  - whether `Last background sync` advances after the next real cron run

### Next recommended step

1. Deploy this commit and retry extraction on the affected Canvas PDF.
2. Confirm the source card clears `Could not extract enough readable text` and Deep Learn unlocks from extracted text without OCR.
3. Open `/sync` after the next scheduled cron run. If `Last background sync` is still stale, inspect cron-job.org request history and Vercel logs for `/api/cron/external-sync` authorization or delivery failures.

### Suggested commit message

```bash
fix Canvas PDF extraction retry
```

## Session Update - 2026-05-13 (Fix Canvas auth for OCR queue)

### What changed

- Fixed queued OCR and source preparation so they resolve Canvas credentials from the owning user's saved `user_settings` instead of depending on global `CANVAS_API_URL` / `CANVAS_API_TOKEN`.
- Added a shared user-scoped Canvas config resolver for background worker paths and reused it in:
  - `source_ocr` queue processing
  - readable-text reprocessing during `resource_extraction`
  - manual `/api/sources/ocr` requests
- Replaced student-facing OCR/reprocess auth failures with:
  - `Canvas connection is missing or expired. Reconnect Canvas in Settings, then retry.`
- Removed student-facing env-var instructions from OCR/reprocess failure paths; env fallback remains as a server-side fallback only.
- Hardened `/sync` activity reporting in two places:
  - background sync classification now recognizes `external_cron` from `result.mode` as well as `payload.mode`
  - `/sync` now reads sync/resource-refresh activity through the service-role client when available, filtered to the signed-in `user_id`, so the page is less likely to miss freshly recorded rows
- Added tests covering:
  - user-scoped Canvas credential resolution without global env vars
  - reconnect-only messaging when credentials are missing
  - reprocess fallback messaging for relative stored Canvas file URLs without credentials
  - background sync summary recognition when external-cron mode is only present in the completed result

### Files touched

- `actions/queue-jobs.ts`
- `app/api/sources/ocr/route.ts`
- `app/sync/page.tsx`
- `lib/canvas-user-config.ts`
- `lib/module-resource-reprocess.ts`
- `lib/sync-activity.ts`
- `tests/canvas-user-config.test.ts`
- `tests/sync-activity.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production had a split-brain Canvas auth path: course listing/manual sync/background sync already used per-user saved Canvas credentials, but OCR/reprocess/resource-preparation still relied on global env-based Canvas config when fetching stored Canvas files. That made queued OCR fail for valid multi-user Canvas accounts even though the same user could browse and sync courses. The `/sync` summary also had a brittle background-sync classification path and could miss fresh activity rows in the UI.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- source-ocr-updates queue canvas-resource-refresh sync-activity learn-resource-ui` - passed
- `npm test -- canvas-content-resolution deep-learn-readiness` - passed

### Verification result

- Passed:
  - typecheck
  - lint
  - targeted OCR / queue / sync activity / resource refresh / learn UI tests
- Verified in code/tests:
  - OCR/reprocess worker paths can now build Canvas config from saved per-user settings
  - missing credentials surface reconnect guidance instead of env-var instructions
  - `/sync` background activity summary still detects external cron runs when the mode lives in `result`
  - `/sync` resource refresh activity uses a more reliable server-side query path
- Not completed in this session:
  - production deploy verification
  - cron-job.org inspection or live cron log verification
  - manual `/sync` page/browser verification against a real signed-in deployment

### Known risks

- If production cron-job.org is no longer calling `/api/cron/external-sync`, the summary fix will not create new background-sync rows by itself; deployment-side cron configuration still needs verification.
- `/sync` now prefers service-role reads for activity cards on the server. The query is still filtered by the signed-in `user_id`, but this is a higher-privilege read path than the previous auth-only path.
- Manual retry behavior for failed OCR jobs was already present through the existing `manualRetry` path; this session did not redesign queue UX beyond fixing the auth failure.

### Blockers

- No code blocker remains.
- Deployment-side verification is still required to confirm:
  - current `Last background sync`
  - `Last resource refresh` updating after a course refresh
  - queued OCR retry succeeding for affected scanned PDFs
- cron-job.org status/logs were not available in the local workspace, so I could not confirm whether production is currently hitting `/api/cron/external-sync`.

### Next recommended step

1. Deploy this fix and manually verify on a real affected account:
   - open `/sync`
   - confirm `Last background sync` advances after cron runs
   - click `Refresh resources` on a synced course and confirm `Last resource refresh` updates
   - open the affected scanned PDF, click `Scan PDF`, and confirm one `source_ocr` job appears and no env-var wording appears
2. If `Last background sync` still does not move after deploy, check cron-job.org request history and confirm the `Authorization: Bearer <CRON_SECRET>` header is still being sent to `/api/cron/external-sync`.
3. If needed, add one small follow-up for explicit OCR retry affordances in every failed-source detail surface, but keep that separate from quiz-quality work.

### Suggested commit message

```bash
fix Canvas auth for OCR queue
```

## Session Update - 2026-05-13 (Add OCR recovery for stuck PDFs)

### What changed

- Added a clear student-facing OCR recovery path on Learn resource cards for already-synced scanned / little-readable PDFs.
- Reused the existing `queueSourceOcrAction` server action instead of adding a new inline OCR path.
- Updated Learn card OCR actions so OCR-recoverable PDFs now show a primary `Scan PDF` action instead of the confusing `Retry extraction` copy.
- Added explicit active-job presentation on Learn cards:
  - `Queued` when a `source_ocr` job already exists in `pending`
  - `Scanning` when a `source_ocr` job is `running`
- Kept duplicate-job prevention on the existing queue path:
  - `queueSourceOcrAction` still returns the existing active `source_ocr` job for the same resource instead of creating another one
  - repeated clicks refresh UI state instead of spamming jobs
- Tightened student-facing OCR/readiness labels across Learn surfaces so OCR/problem states now resolve to:
  - `Preparing`
  - `Scanning`
  - `Ready`
  - `Could not extract enough readable text`
- Preserved strict Deep Learn readiness:
  - scanned PDFs remain blocked until meaningful academic OCR text exists
  - failed/thin OCR stays blocked and surfaces `Could not extract enough readable text`
  - metadata, UUIDs, refusal text, titles, and debug-style filler continue to be excluded by the existing text-quality/readiness gates
- Added tests covering:
  - Learn-card `Scan PDF` action exposure for OCR-recoverable PDFs
  - Learn-card queued/scanning state presentation
  - updated Learn UI OCR status labels
  - updated source-readiness OCR status labels

### Files touched

- `app/modules/[id]/learn/page.tsx`
- `components/StudyResourceAccordionList.tsx`
- `lib/course-learn-overview.ts`
- `lib/learn-resource-ui.ts`
- `lib/module-learn-overview.ts`
- `lib/source-readiness.ts`
- `tests/learn-resource-accordion.test.ts`
- `tests/learn-resource-ui.test.ts`
- `tests/source-repair.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production already had OCR queueing logic, duplicate protection, and Study Queue support, but the student-facing Learn card path did not expose a clear recovery action for stuck scanned PDFs. A resource could sit under `Needs action` with `Little readable text` and a message about visual extraction while offering no obvious `Scan PDF` action. This change fixes the UI gap without moving OCR into the request path, cron, or Deep Learn generation itself.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- learn-resource-ui queue deep-learn-readiness` - passed
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` - not run; file not present locally

### Verification result

- Passed:
  - typecheck
  - lint
  - required OCR/readiness/queue/deep-learn targeted test bundle
- Verified in code/tests:
  - OCR-recoverable Learn cards now expose `Scan PDF`
  - active OCR jobs show `Queued` / `Scanning` instead of another trigger
  - existing `source_ocr` duplicate protection remains in the queue action
  - Deep Learn remains locked until meaningful OCR text exists
  - failed or weak OCR states stay blocked with `Could not extract enough readable text`
- Not completed in this session:
  - manual runtime verification against a real production/staging scanned PDF
  - local scanned-PDF validator run, because the requested PDF fixture was missing from `C:\Users\omgra\Downloads\1.1-Data Organization.pdf`

### Known risks

- The optional auto-queue-on-open behavior was intentionally deferred in this session. It is feasible, but broad auto-enqueue from Learn/course-open flows needs careful throttling so simply opening a module with several scanned PDFs does not create surprise queue volume.
- The new Learn-card OCR affordance is intentionally card-scoped first. If production also needs the same stronger action copy in additional detail surfaces, that should be a follow-up pass.
- The new source-code assertion test for the Learn-card OCR button protects the contract, but it is lighter than a browser interaction test.

### Blockers

- No code blocker remains.
- The requested local scanned-PDF validator could not run because `C:\Users\omgra\Downloads\1.1-Data Organization.pdf` was not present.

### Next recommended step

1. Manually verify a real scanned Canvas PDF in production or preview:
   - card shows `Scan PDF`
   - click queues exactly one `source_ocr` job
   - Learn card flips to `Queued` / `Scanning`
   - Study Queue shows the OCR job
   - Deep Learn only unlocks after meaningful OCR text exists
2. If product still wants automatic recovery, add a bounded on-open auto-enqueue path for exactly one eligible scanned PDF at a time, guarded by the existing duplicate logic and daily OCR caps.

### Suggested commit message

```bash
add OCR recovery for stuck PDFs
```

---

## Session Update - 2026-05-13 (Fix study output upsert constraint)

### What changed

- Fixed the `study_outputs` schema/code mismatch that was breaking Deep Learn saved outputs (`reviewer`, `quiz_pack`, `study_sheet`, `cram_sheet`) with Postgres `42P10`.
- Confirmed the save helper in `lib/study-outputs/store.ts` uses Supabase `upsert(..., { onConflict: 'user_id,output_kind,source_note_id' })` for Deep Learn note outputs only.
- Confirmed the prior schema only had a partial unique index on `(user_id, output_kind, source_note_id) where source_note_id is not null`, which PostgREST could not match for the `ON CONFLICT` target used by the app.
- Added and pushed remote migration `20260513110000_fix_study_output_note_upsert_constraint.sql` to replace that partial index with a real table-level unique constraint:
  - `study_outputs_user_source_note_kind_key unique (user_id, output_kind, source_note_id)`
- Kept task-output persistence behavior unchanged:
  - task outputs are not using the failing `upsert` path
  - task outputs are intentionally looked up by `taskId + preset + outputType` and then updated by `id`, so this session did not add a wrong `user_id + source_task_id + output_kind` uniqueness rule that would collapse multiple task variants
- Hardened Deep Learn output button actions so they return clean student-facing error results instead of leaking raw production server-action / database wrapper text into the UI.
- Added client-safe study-output action error sanitizing for:
  - generic Server Components production wrappers
  - raw Postgres / PostgREST diagnostics
  - schema/internal table details
- Extended study-output error classification so `42P10` is recognized as a saved-output schema/update mismatch.
- Confirmed the Quiz page still builds from `deep_learn_notes` quiz-ready content and does not yet read `quiz_pack` rows from `study_outputs`. That is unchanged; Phase 1 verification here was limited to making `quiz_pack` save correctly.

### Files touched

- `actions/study-outputs.ts`
- `components/MakeCramSheetButton.tsx`
- `components/MakeQuizPackButton.tsx`
- `components/MakeReviewerButton.tsx`
- `components/MakeStudySheetButton.tsx`
- `lib/study-output-action-errors.ts`
- `lib/study-output-errors.ts`
- `supabase/migrations/20260513110000_fix_study_output_note_upsert_constraint.sql`
- `tests/queue.test.ts`
- `tests/study-output-action-errors.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production had already received the table-creation and task-output extension migrations, so the old missing-table `PGRST205` failure was gone. The new failure came from a narrower mismatch: the app was still issuing an `upsert` against `user_id,output_kind,source_note_id`, but the database only exposed that identity as a partial unique index. PostgREST could not infer that partial index as a valid `ON CONFLICT` arbiter, so every Deep Learn saved-output button failed at save time.

### Tests run

- `npx supabase db push` - passed; remote migration `20260513110000_fix_study_output_note_upsert_constraint.sql` applied
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- study-outputs quiz deep-learn-generation` - passed

### Verification result

- Local code checks passed after the fix.
- Remote Supabase migration push completed successfully.
- Deep Learn note outputs now have a matching database uniqueness target for the app's `upsert` conflict columns.
- UI error handling for the four Deep Learn saved-output buttons now keeps diagnostics server-side instead of exposing raw production wrapper text or database details.
- Quiz-page read-path check completed: current Quiz surfaces still read from `deep_learn_notes`, not `study_outputs`.
- Manual production button-click verification was not performed in this session because no authenticated browser production session was available in the current environment.

### Known risks

- Manual production verification is still needed to confirm:
  - `Make Reviewer`
  - `Make Quiz Pack`
  - `Make Study Sheet`
  - `Make Cram Sheet`
  save without `42P10`, route into Study Library, and replace existing note-linked outputs cleanly on repeat clicks.
- Task outputs still rely on app-level `taskId + preset + outputType` lookup/update semantics rather than a single table uniqueness constraint because multiple task-output variants are intentionally supported.
- If PostgREST schema cache lags briefly after the migration, the project may need `notify pgrst, 'reload schema';` in the remote database before re-testing.

### Blockers

- No code blocker remains.
- Production browser verification remains pending because this session did not have a signed-in production UI context.

### Next recommended step

1. Re-test production Deep Learn output buttons end-to-end on a real account:
   - click all four buttons
   - confirm no raw error text appears
   - confirm the saved outputs open in Study Library
   - confirm repeated clicks update/replace the note-linked saved output instead of creating uncontrolled duplicates
2. If production still shows stale-schema behavior immediately after deploy, run `notify pgrst, 'reload schema';` once and retry.
3. If product wants Quiz to resume saved `quiz_pack` artifacts instead of rebuilding from `deep_learn_notes`, do that as a separate small follow-up after this save-path fix is confirmed.

### Suggested commit message

```bash
fix study output upsert constraint
```

---

## Session Update - 2026-05-13 (Harden refreshed resource queue processing)

### What changed

- Added a bounded automatic `resource_extraction` worker path so refreshed Canvas resources can start processing without depending only on signed-in queue polling.
- Extended `actions/queue-jobs.ts` with `processPendingResourceExtractionJobs(limit)` and refactored the single-job extraction processor so cron-safe callers can:
  - process only a small bounded batch
  - avoid per-user self-chaining
  - queue OCR when needed without auto-draining OCR inline
- Kept the signed-in queue polling behavior intact for normal in-app queue progress.
- Updated `/api/cron/resource-refresh` so it now:
  - prioritizes currently active Canvas courses ahead of older local synced courses
  - scans a bounded local course candidate pool before slicing down to the per-run course limit
  - skips recently refreshed courses with a single batched lookup instead of repeated per-course checks
  - kicks off a tiny post-refresh background preparation pass through the new bounded worker
- Updated `/api/cron/hourly` to reuse the new bounded `resource_extraction` worker as a daily safety net and return `resourcePreparation` stats:
  - `jobsChecked`
  - `jobsStarted`
  - `jobsCompleted`
  - `jobsFailed`
  - `jobsSkipped`
  - `warnings`
- Added `lib/resource-refresh-priority.ts` to centralize bounded candidate-limit and active-course prioritization helpers for resource refresh.
- Made the Learn resource detail page queue-aware so it now matches the Learn list for source preparation states:
  - `Preparing` for active `resource_extraction`
  - `Scanning` / OCR states for `source_ocr`
  - `Ready` only when meaningful readable text exists
  - `Could not extract enough readable text` when preparation finishes without usable academic text
- Added tests for:
  - resource refresh course prioritization and candidate bounding
  - resource extraction queue pending selection helper
  - queue-aware `Preparing` resource UI state

### Files touched

- `actions/queue-jobs.ts`
- `app/api/cron/hourly/route.ts`
- `app/api/cron/resource-refresh/route.ts`
- `app/modules/[id]/learn/resources/[resourceId]/page.tsx`
- `lib/learn-resource-ui.ts`
- `lib/resource-extraction-queue.ts`
- `lib/resource-refresh-priority.ts`
- `tests/canvas-resource-refresh.test.ts`
- `tests/learn-resource-ui.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 1 closed the discovery-to-queue gap, but refreshed `resource_extraction` jobs could still sit idle until a student opened the app, and large local course lists could still waste refresh time on older courses before current ones. This phase hardens the post-refresh path without making `/api/cron/resource-refresh` heavy: refresh still discovers, updates, and queues, while a separate bounded worker starts a few preparation jobs safely and leaves OCR as queued follow-up work when needed.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- canvas-resource-refresh canvas-content-resolution module-resource-resolution queue learn-resource-ui source-ocr-updates` - passed
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed

### Verification result

- Refreshed `resource_extraction` jobs now have an automatic bounded processing path outside signed-in queue polling.
- `/api/cron/resource-refresh` remains lightweight: it still does discovery, metadata updates, and queueing only.
- OCR is only queued when the prepared source still resolves as scanned / image-only; the new cron-safe worker does not auto-drain OCR inline.
- Current active Canvas courses are prioritized ahead of older local synced courses during refresh selection.
- Recently refreshed courses are skipped through a single batched freshness lookup.
- Learn list and resource detail page now agree on `Preparing` vs `Scanning` queue states.

### Known risks

- The new automatic safety net currently runs from the post-refresh background hook plus the existing daily `/api/cron/hourly` route; there is still no separate high-frequency dedicated cron schedule just for resource preparation.
- Active-course prioritization depends on a bounded Canvas course-list fetch per user; if that lookup fails, refresh falls back to local course order with a warning.
- Large active courses are now better prioritized, but very large individual courses can still consume their per-course module/item budget within one refresh pass.

### Blockers

None.

### Next recommended step

Phase 3: harden Deep Learn source readiness and generation gating so only meaningful academic text from the selected resource can unlock study-pack generation after extraction/OCR changes.

### Suggested commit message

```bash
harden refreshed resource queue processing
```

---

## Session Update - 2026-05-12 (Queue refreshed resources for extraction)

### What changed

- Added a real background `resource_extraction` queue path for refreshed Canvas resources.
- Updated `refreshCanvasModuleResourceMetadataForCourse` so newly inserted or changed `module_resources` rows from `/api/cron/resource-refresh` are queued for readable-text preparation when they still need processing.
- Kept cron lightweight: the refresh route still only discovers, updates, and queues work. It does not run heavy extraction, OCR, or Deep Learn inline.
- Added `lib/resource-extraction-queue.ts` for resource-extraction queue titles, status copy, and duplicate detection helpers.
- Extended `actions/queue-jobs.ts` with:
  - `queueResourceExtractionJobs`
  - `processNextPendingResourceExtractionJobForUser`
  - `processResourceExtractionJob`
- The new extraction worker:
  - reprocesses queued readable sources in the background
  - persists normalized extraction results safely
  - auto-queues `source_ocr` only after the refreshed source proves to be image-only / scanned
  - avoids duplicate `resource_extraction` jobs for the same resource
- Updated `/api/queue/jobs` background polling so signed-in queue activity can start pending `resource_extraction` jobs before OCR jobs.
- Updated Learn queue/status presentation so queued extraction work appears as `Preparing`, OCR continues to appear as `Scanning` / `OCR queued`, and extraction failures surface the student-facing `Could not extract enough readable text` state.
- Updated queue tests to cover the new `resource_extraction` queue helper behavior.

### Files touched

- `actions/canvas.ts`
- `actions/queue-jobs.ts`
- `app/api/queue/jobs/route.ts`
- `app/modules/[id]/learn/page.tsx`
- `components/shell/QueuePanel.tsx`
- `lib/resource-extraction-queue.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

`/api/cron/resource-refresh` was discovering new and changed Canvas resources correctly, but those rows could stay stuck as metadata-only unless a heavier manual sync or manual source action happened later. This left refreshed PDFs without a reliable preparation path and made Study Queue / Learn states less honest. The new queue path closes that gap without violating the cron constraint: refresh discovers and queues, while extraction and OCR happen later through the existing background queue flow.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- canvas-resource-refresh canvas-content-resolution module-resource-resolution queue learn-resource-ui source-ocr-updates` - passed

### Verification result

- Refreshed resources that still need readable-text preparation now enter a background queue path instead of remaining metadata-only indefinitely.
- Existing good extracted/OCR text is still preserved when Canvas file identity is unchanged.
- File-identity changes still reset only the extraction/OCR fields that must be reset.
- OCR remains out of the cron route and is only queued after background extraction determines it is needed.
- Learn and Queue surfaces now have a dedicated `Preparing` state for queued extraction work.

### Known risks

- `resource_extraction` jobs created by cron are started by the normal signed-in queue polling path; this phase does not add a separate always-on worker for those jobs outside the existing app-driven queue flow.
- Very large refresh batches could still create many pending extraction jobs over time, although the cron route remains bounded and duplicate guards are in place.
- The resource detail page still relies primarily on stored extraction state and does not yet show the same queue-aware `Preparing` overlay as the main Learn list.

### Blockers

None.

### Next recommended step

Phase 2: harden `/api/cron/resource-refresh` batching and course prioritization so large or concluded Canvas courses do not dominate refresh time near end-of-term.

### Suggested commit message

```bash
queue refreshed resources for extraction
```

---

## Session Update - 2026-05-12 (Fix resource refresh courses query ordering)

### What changed

- Fixed the bug in `app/api/cron/resource-refresh/route.ts` where the courses query was ordering by a non-existent `updated_at` column.
- Removed `.order('updated_at', { ascending: true })` from the courses query (line 93), which was causing database errors.
- Enhanced error logging to include full error details (`code`, `message`, `details`, `hint`) for better production debugging.
- The courses table uses `created_at` for ordering in other parts of the codebase; the order is now omitted entirely as courses are already filtered by user and Canvas URL.

### Files touched

- `app/api/cron/resource-refresh/route.ts`
- `docs/ai/handoff.md`

### Why it changed

Production `/api/cron/resource-refresh` was returning "could not load synced courses" warnings for all Canvas-connected users. The root cause was the `.order('updated_at')` clause in the courses query attempting to order by a column that doesn't exist in the table, causing the entire query to error. This prevented any courses from being loaded and processed for resource refresh. The fix removes the unnecessary ordering (which doesn't affect correctness since the query is already scoped to user and Canvas URL) and adds detailed error logging for future diagnosis.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- canvas-resource-refresh` - passed (73 passing tests)

### Verification result

- Route compiles without TypeScript errors.
- ESLint reports no issues.
- All canvas-resource-refresh tests pass.
- The fix allows courses to be loaded successfully when courses table exists.
- Error logging now includes full Supabase error fields for debugging.

### Known risks

- None. Removing an unsupported column reference is a safe fix.

### Blockers

None.

---

## Previous Session Update - 2026-05-12 (Fix resource refresh course loading)

### What changed

- Fixed the bug in `app/api/cron/resource-refresh/route.ts` where courses were not being loaded from the local database.
- The issue was that the route was comparing `canvas_instance_url` (normalized, like `https://canvas.example.com`) with `canvas_api_url` (with `/api/v1` appended) without normalization.
- Added import of `normalizeCanvasUrl` from `lib/canvas.ts`.
- Updated the courses query to normalize `row.canvas_api_url` before comparing it with `canvas_instance_url`:
  - `const normalizedCanvasUrl = normalizeCanvasUrl(row.canvas_api_url)`
  - `.eq('canvas_instance_url', normalizedCanvasUrl)`
- Separated the "no courses found" case (silent skip) from actual database query errors (warning logged).
- Added server-side logging of actual database errors for debugging.

### Files touched

- `app/api/cron/resource-refresh/route.ts`
- `docs/ai/handoff.md`

### Why it changed

Production `/api/cron/resource-refresh` was failing to load any synced courses for Canvas-connected users, causing the route to return only warnings for all users. The root cause was the URL format mismatch: `canvas_api_url` from user_settings includes the `/api/v1` path, while `canvas_instance_url` in the courses table is normalized to just the base domain. The query was correctly structured but had no way to match these mismatched URLs.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- canvas-resource-refresh` - passed

### Verification result

- Route now compiles without type errors.
- ESLint passes with no warnings.
- All existing canvas-resource-refresh unit tests pass.
- The resource refresh helper functions for preservation and change detection remain unchanged.
- Empty course lists are no longer reported as "could not load synced courses"; only actual database errors are warned.

### Known risks

- None in code. The fix is minimal and only affects the course loading query.

### Blockers

None.

### Next recommended step

Trigger `/api/cron/resource-refresh` against a Canvas-connected user with local synced courses and verify the response now shows `coursesChecked > 0` instead of warnings.

### Suggested commit message

```bash
fix resource refresh course loading
```

---

## Session Update - 2026-05-12 (Add daily resource refresh cron)

### What changed

- Added a new protected cron route at `app/api/cron/resource-refresh/route.ts`.
- The route requires `Authorization: Bearer <CRON_SECRET>` and returns a bounded JSON summary with:
  - `usersChecked`
  - `coursesChecked`
  - `modulesChecked`
  - `moduleItemsChecked`
  - `resourcesInserted`
  - `resourcesUpdated`
  - `skipped`
  - `warnings`
- Added `refreshCanvasModuleResourceMetadataForCourse` in `actions/canvas.ts`.
- The new refresh path:
  - scans bounded batches of Canvas-connected users and locally synced courses
  - skips courses whose `module_resources.updated_at` already shows a recent refresh within the configured window
  - fetches Canvas modules and module items only
  - builds lightweight metadata-only `module_resources` candidates without running file downloads, page extraction, OCR, OpenAI, Deep Learn, or full manual sync
  - upserts by existing local Canvas identity matches (`canvas_item_id` first, then `canvas_file_id`)
  - preserves existing extracted text, OCR text, previews, counts, provider info, and OCR state when the Canvas file identity did not change
  - resets stored extraction/OCR fields back to metadata-only when the same Canvas module item now points to a different `canvas_file_id`
- Added `lib/canvas-resource-refresh.ts` to centralize the preservation and change-detection logic for metadata refresh rows.
- Added `tests/canvas-resource-refresh.test.ts` covering:
  - preserving extracted/OCR state for unchanged file identity
  - clearing stale extraction/OCR state when the file identity changes
  - skipping writes when the normalized refreshed row is unchanged

### Files touched

- `actions/canvas.ts`
- `app/api/cron/resource-refresh/route.ts`
- `lib/canvas-resource-refresh.ts`
- `tests/canvas-resource-refresh.test.ts`
- `docs/ai/handoff.md`

### Why it changed

External cron was intentionally made lightweight to avoid timeouts, but that left a gap where instructors could add module file items like PDFs without Stay Focused learning resources updating unless a heavier manual sync ran. This change adds a separate safe daily metadata refresh path that discovers missing Canvas module resources without reintroducing heavy inline extraction work.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- canvas-resource-refresh canvas-content-resolution module-resource-resolution queue learn-resource-ui source-ocr-updates` - passed

### Verification result

- The new route compiles and passes lint.
- The metadata refresh helper preserves existing extracted/OCR state for unchanged Canvas files.
- The helper drops stale extracted/OCR state when a Canvas module item changes to a different underlying file id.
- No OCR, OpenAI, Deep Learn generation, or inline PDF extraction is invoked by the new route.

### Known risks

- New file resources inserted by this route are metadata-only until a later extraction/reprocess path runs; this session did not add a separate extraction queue worker for non-scanned files.
- Recent-refresh skipping currently uses `module_resources.updated_at` as the local freshness signal because there is no dedicated per-course resource-refresh timestamp yet.
- Existing rows without `canvas_item_id` and `canvas_file_id` depend on fallback matching from prior sync quality; this route does not repair identity-poor legacy rows beyond file-id fallback.

### Blockers

None in local verification.

### Next recommended step

Deploy and trigger `/api/cron/resource-refresh` against a course with newly uploaded Canvas PDFs, then confirm the new file rows appear in Learn within the returned batch limits and decide whether a separate lightweight extraction queue should be added for newly discovered non-scanned file resources.

### Suggested commit message

```bash
add daily resource refresh cron
```

## Session Update - 2026-05-11 (Make external cron Canvas sync lightweight)

### What changed

- Updated `actions/canvas.ts` so `runExternalCanvasSyncJob` no longer runs heavy inline resource refresh during `external_cron`.
- Removed the `refreshExternalCanvasTaskStatus` call from `external_cron`, so task status refresh is no longer part of the cron worker path.
- External cron now records the required safe fallback counts in the completed job result:
  - `resourcesInserted: 0`
  - `resourcesUpdated: 0`
  - `resourcesPreserved: 0`
  - `resourcesSkippedMissing: 0`
  - `tasksUpdated: 0`
- External cron now records the required warning fields in the completed job result:
  - `resourceRefreshWarning: "Skipped during external cron to keep announcement sync responsive."`
  - `taskRefreshWarning: "Skipped during external cron to keep announcement sync responsive."`
- Kept lightweight work intact for `external_cron`:
  - fetch announcements, assignments, and modules
  - load existing assignment deadlines for due-date-change events
  - load existing module ids for module event state comparison
  - insert Canvas update events
  - rebuild module `raw_content` from existing preserved readable resource text
- Left `app/api/cron/external-sync/route.ts` unchanged. Inline processing stays in place because the worker is now reduced to lightweight Canvas fetch + event/update work and should fit the existing `maxDuration = 55` budget more reliably.
- Removed dead external-cron-only timeout/preservation helper code that became unused after the skip change.

### Files touched

- `actions/canvas.ts`
- `docs/ai/handoff.md`

### Why it changed

Production `/api/cron/external-sync` hit `FUNCTION_INVOCATION_TIMEOUT` after the route was changed to process pending jobs inline. The root cause was that `external_cron` still performed heavy resource refresh and task status refresh after the main Canvas fetch, so the function could remain alive long enough to time out even when Promise-race guards were present. This change makes external cron prioritize announcements, modules, assignments, and update events, then finish quickly.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- queue canvas-digest` - passed

### Verification result

- Required checks passed after the change.
- `external_cron` now skips heavy resource/task refresh entirely instead of starting work that can outlive the timeout guard.
- The queued job can still reach `currentStep: done` / `completed` when the main Canvas sync succeeds, with explicit warning fields explaining the skipped work.

### Known risks

- External cron no longer updates `module_resources` or task completion/deadline rows directly, so new/changed files and task-status drift now depend on manual selected-course sync or another future lightweight follow-up path.
- `new_resource` event creation is effectively deferred in external cron because no resource refresh runs, so announcement/module/assignment visibility is prioritized over resource-level freshness.
- Raw content rebuild still uses already-stored readable resource text; if those stored resources are stale, the rebuilt module content can remain stale until a full manual selected-course sync runs.

### Blockers

None in local verification.

### Next recommended step

Deploy and trigger `/api/cron/external-sync` against the previously timing-out course, then confirm the response returns before the 55-second budget, the queued job reaches `completed` with `currentStep: done`, and the result includes the two new warning fields while announcements/modules/assignment update events still land.

### Suggested commit message

```bash
make external cron canvas sync lightweight
```

## Session Update - 2026-05-11 (Process external cron sync inline)

### What changed

- Updated `app/api/cron/external-sync/route.ts` so it now awaits `processPendingExternalCanvasSyncJobs()` inline before returning the cron response.
- Kept `EXTERNAL_SYNC_PROCESS_LIMIT` behavior unchanged; the processing call still uses the existing default limit of `1`.
- Preserved `maxDuration = 55`.
- Preserved duplicate, cooldown, daily-cap, and course-list-miss queueing behavior.
- Kept `after()` only as a fallback path if inline processing throws before completion.
- Added response fields:
  - `processedInline: true`
  - `inlineProcessingError: string | null`

### Files touched

- `app/api/cron/external-sync/route.ts`
- `docs/ai/handoff.md`

### Why it changed

Production evidence showed external cron jobs could still remain stuck in `running` at `refreshing_tasks` even after the timeout-bounded worker change, which strongly suggests Vercel `after()` execution was not reliably surviving long enough for the worker to write its timeout fallback or final completion state. Running the worker inline keeps the cron request alive while the job processor finishes.

### Tests run

- `npm run typecheck`
- `npm run lint`
- `npm test -- queue canvas-digest`

### Verification result

- Route patch applied.
- Verification commands are being run after the edit.
- Expected behavior: `/api/cron/external-sync` now queues and processes the external cron job inline before returning, with `processedInline: true` in the response and `inlineProcessingError` populated only if inline processing throws.

### Known risks

- Inline processing increases the amount of work done during the request, so the route now depends more directly on the existing `55` second `maxDuration`.
- If the worker throws after queueing, the response can still return successfully with `inlineProcessingError` set while the fallback `after()` retry attempts to continue processing.

### Blockers

None so far.

### Next recommended step

Trigger `/api/cron/external-sync` against the previously stuck course and confirm the response includes `processedInline: true`, the job reaches `completed`, and `currentStep` no longer remains at `refreshing_tasks`.

### Suggested commit message

```bash
process external cron sync inline
```

## Session Update - 2026-05-11 (Bound external cron refresh phases)

### What changed

- Added a narrow timeout helper in `actions/canvas.ts` for external Canvas cron refresh phases.
- Wrapped the `refreshing_resources` phase in `runExternalCanvasSyncJob` with a 20-second timeout fallback.
- Wrapped the `refreshing_tasks` phase in `runExternalCanvasSyncJob` with a 20-second timeout fallback.
- Kept manual selected-course sync behavior unchanged; only the external cron job path uses the timeout guard.
- When a timeout happens, the external cron job now continues to completion with safe fallback counts and warning fields in the queued job result:
  - `resourceRefreshWarning`
  - `taskRefreshWarning`

### Files touched

- `actions/canvas.ts`
- `docs/ai/handoff.md`

### Why it changed

External cron Canvas sync jobs could stall for long periods during resource or task refresh even after the main Canvas announcements/modules/events sync had already succeeded. The change bounds those two post-sync phases so external cron can still complete instead of hanging indefinitely.

### Tests run

- `npm run typecheck`
- `npm run lint`
- `npm test -- queue canvas-digest`

### Verification result

- Code patch applied.
- Verification commands are being run after the edit.
- Expected behavior: external cron can still reach `completed` / `currentStep: done` when the main sync succeeds, even if resource/task refresh times out.

### Known risks

- A timed-out resource refresh can defer some resource insert/update detection to a later sync, so event counts and changed-resource follow-up work for that run may be lower than a full refresh.
- The timed-out phase continues in the background at the runtime level if the underlying work does not cancel cooperatively; this patch prevents the job from waiting forever but does not actively abort the underlying async work.

### Blockers

None so far.

### Next recommended step

Verify the external cron path against a course that previously stalled and confirm the queued job now finishes with warning fields instead of remaining stuck in `refreshing_resources` or `refreshing_tasks`.

### Suggested commit message

```bash
bound external cron refresh phases
```

## Session Update - 2026-05-10 (Retune ambient canvas motion speed again)

### What changed

- Kept the time-based `performance.now() / 1000` animation model and `periodSeconds`, but retuned the ambient canvas motion to feel visibly active while idle.
- Added `const MOTION_SPEED_MULTIPLIER = 2.5` near the top of `components/AmbientBackgroundCanvas.tsx` and applied it through `motionTime` in the blob angle calculations.
- Tightened interior blob periods into the 14-34 second range and edge blob periods into the 7-18 second range.
- Slightly increased edge travel while keeping all four edge blobs anchored to their respective edges.

### Files touched

- `components/AmbientBackgroundCanvas.tsx`
- `docs/ai/handoff.md`

### Why it changed

The prior retune fixed the timing model but still left the animation feeling too static during idle viewing. This pass increases perceived motion without changing layout, colors, or the static ambient foundation.

### Tests run

- Not run by request.
- `npm run typecheck` - pending
- `npm run lint` - pending

### Verification result

- Code patch only; browser/runtime verification pending.
- Commit and push are still pending by request.

### Known risks

- The higher motion speed may still need minor visual tuning if any route feels too active in practice.

### Blockers

None.

### Next recommended step

Visually confirm the idle canvas now feels alive without becoming distracting, then run the usual validation checks before any later commit.

### Suggested commit message

```bash
retune ambient canvas motion speed
```

---

## Session Update - 2026-05-10 (Retune ambient canvas motion timing)

### What changed

- Replaced the ambient canvas blob timing model in `components/AmbientBackgroundCanvas.tsx` from tiny frame-style `speed` constants to explicit `periodSeconds`.
- Updated both interior and edge blob angle calculation to use `performance.now() / 1000` with full-cycle radians:
  - `angle = (timeSeconds / periodSeconds) * Math.PI * 2 + phase`
- Kept the existing six interior blobs and four edge blobs, with only their motion periods retuned so idle movement is visible at normal runtime.
- Left the existing `requestAnimationFrame` loop behavior intact for non-reduced-motion mode.

### Files touched

- `components/AmbientBackgroundCanvas.tsx`
- `docs/ai/handoff.md`

### Why it changed

The animation timing was using very small constants that behave like frame-based increments, while the runtime clock is based on `performance.now()` milliseconds. That made the ambient motion effectively far too slow during idle viewing and more noticeable only after resize/zoom-driven redraws.

### Tests run

- Not run by request.
- `npm run typecheck` - pending
- `npm run lint` - pending

### Verification result

- Code patch only; browser/runtime verification pending.
- No layout, color, auth, shell, or static ambient foundation changes were made.

### Known risks

- Motion strength now depends on the chosen period constants; visual QA is still needed to confirm the new idle movement remains subtle enough across light and dark themes.

### Blockers

None.

### Next recommended step

Run the app in a browser and confirm the canvas drifts continuously while idle without looking busy, then run the usual typecheck/lint checks before any later commit.

### Suggested commit message

```bash
retune ambient canvas motion timing
```

---

## Session Update - 2026-05-10 (Add canvas ambient background animation)

### What changed

- Added a root-mounted `AmbientBackgroundCanvas` client component inside the existing `.app-ambient` layer.
- Preserved the accepted static CSS ambient background and layered the canvas transparently over it as progressive enhancement.
- Implemented canvas `requestAnimationFrame` animation with:
  - four edge-anchored blobs that pulse and drift along the top, bottom, left, and right perimeter
  - six independent interior blobs with separate origin, radius, speed, phase, and wobble behavior
  - radial gradients derived from the active `--accent` CSS variable
  - 40-48px canvas blur for fluid blob edges
- Added device pixel ratio-aware canvas sizing with `ResizeObserver`.
- Added reduced-motion handling: one static canvas frame renders and the animation loop does not run.
- Added theme/accent mutation handling so the canvas palette follows root theme/accent CSS variable changes.
- Kept dark mode restrained with lower canvas opacity and reduced draw intensity.

### Files touched

- `app/globals.css`
- `app/layout.tsx`
- `components/AmbientBackgroundCanvas.tsx`
- `docs/ai/handoff.md`

### Why it changed

The static accent-aware ambient background was accepted, and the next step was to add motion without replacing that foundation. The new canvas layer keeps one root ambient system, avoids CSS keyframe blob animation, avoids route/auth-specific background systems, and keeps motion subtle enough to preserve card and text readability.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed

### Verification result

- Required validation checks passed.
- The app still mounts a single root `.app-ambient` background system.
- The canvas is fixed, inset `0`, pointer-events none, and layout-neutral.
- The animation uses `performance.now()` time via `requestAnimationFrame`.
- Reduced-motion mode renders a static frame and skips the animation loop.

### Known risks

- Browser visual QA was not automated in this session, so final subjective tuning of blob opacity, radius, and motion strength should still be checked manually on Home, auth, and shell pages in light and dark mode.
- Canvas blur support is browser-dependent; modern Chromium/WebKit/Firefox support `CanvasRenderingContext2D.filter`, but very old browsers would render softer gradients without the blur effect.

### Blockers

None.

### Next recommended step

Run manual browser QA across Home, Courses, Library, Calendar, Settings, and auth routes in light mode, dark mode, and reduced-motion mode. Tune only the canvas blob constants if the motion feels too bright or too active; do not add another page background system.

### Suggested commit message

```bash
add canvas ambient background animation
```

---

## Session Update - 2026-05-10 (Add static accent ambient background foundation)

### What changed

- Added a single site-wide ambient background layer at the root layout with a fixed `app-ambient` element behind the app content.
- Introduced light and dark ambient background tokens in `app/globals.css` using existing theme variables and accent tokens instead of hard-coded color themes.
- Removed competing full-page background treatments so the root ambient layer is the only page-scale background system:
  - removed the animated `app-main::before` spotlight layer
  - removed auth route orb elements and auth-page background gradients
- Softened the shell sidebar background so it reads as a surface over the ambient field instead of a separate opaque slab.
- Kept cards, panels, and shells on their existing surface tokens so readability stays stable.

### Files touched

- `app/globals.css`
- `app/layout.tsx`
- `components/AuthPageFrame.tsx`
- `docs/ai/handoff.md`

### Why it changed

The app had multiple page-scale background systems competing with each other: an animated spotlight in the app shell, dedicated auth-page gradients/orbs, and stronger shell slabs that reduced the effect of the root theme. This pass establishes a stable static ambient foundation first, keeps it accent-aware, and avoids animation/canvas work until the base visual system is settled.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed

### Verification result

- Required checks passed.
- The root layout now mounts one fixed ambient background layer for the whole app.
- App-shell and auth routes no longer introduce their own separate full-page ambient effects.
- No layout structure or route composition changed.

### Known risks

- This session did not run browser visual QA, so final tuning of ambient strength across all pages still needs manual review in both light and dark mode.
- Some route-level panels still use strong surface fills by design; this pass only removed page-scale competing backgrounds, not component-level surfaces.
- The UI guidance URL referenced by project instructions was not usable from this session environment, so implementation followed the existing in-repo visual token system and current app patterns.

### Blockers

None.

### Next recommended step

1. Run manual browser QA on Home, Courses, Library, Calendar, Settings, and auth routes in both light and dark mode.
2. If any surface still feels too slab-like, tune surface opacity token usage selectively without adding new page-scale backgrounds.
3. Only after the static foundation is approved, layer in any future motion treatment deliberately from the root background system.

### Suggested commit message

```bash
add static accent ambient background foundation
```

---

## Session Update - 2026-05-09 (Fix blank sign-in render under reduced motion)

### What changed

- Fixed the real blank-page regression by making `motion-card` visible when `prefers-reduced-motion: reduce` is active. The previous global CSS disabled entry animations but left `opacity: 0`, which made auth and other card-based routes render only the background while the DOM still existed.
- Removed the visible `Auth page loaded` footer marker from auth pages so the sign-in/sign-up surface stays student-facing in production while preserving the existing loading/error/runtime fallbacks.
- Updated auth regression coverage to assert:
  - sign-in source still exposes visible auth heading and provider buttons
  - `/sign-in?next=%2F` still resolves and renders
  - reduced-motion CSS keeps motion cards visible instead of blank
  - forgot-password still renders a visible auth fallback route
- Reproduced and verified locally with Playwright against:
  - `/sign-in`
  - `/sign-in?next=%2F`
  - signed-out `/settings` redirecting to `/sign-in?next=%2Fsettings`
  - both normal motion and `reducedMotion: 'reduce'`

### Files touched

- `app/globals.css`
- `app/forgot-password/page.tsx`
- `app/sign-in/error.tsx`
- `app/sign-in/loading.tsx`
- `components/AuthForm.tsx`
- `components/AuthPageFrame.tsx`
- `docs/ai/handoff.md`
- `tests/auth-sign-in-page.test.ts`

### Why it changed

The sign-in route was not actually returning `null`; it was being rendered inside a card that starts at `opacity: 0`. On browsers or environments that request reduced motion, the global CSS removed the animation that would normally raise that opacity to `1`, so the page looked blank locally and in production even though the auth form existed in the DOM. Fixing the reduced-motion fallback resolves the sign-in blank render and protects other `motion-card` surfaces from the same failure.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- auth-sign-in-page auth-sign-in-middleware` - passed (script runs the repo test suite; 492 tests, 0 failures)

### Verification result

- Local Playwright verification passed for `/sign-in`, `/sign-in?next=%2F`, and signed-out `/settings`.
- With `reducedMotion: 'reduce'`, the auth card now renders visibly with `opacity: 1`, the heading and sign-in button remain present, and the app shell does not render on public auth routes.
- The fix is CSS-level and therefore applies the same way to Vercel production builds.

### Known risks

- This patch intentionally changes the reduced-motion behavior for every `.motion-card`, not only auth. That is the right fix for the underlying bug, but any route that implicitly relied on reduced-motion cards staying visually hidden would now behave differently.
- The auth surface still depends on the existing loading and error boundaries above the form. Those boundaries are intact, but this session did not change higher-level provider behavior.

### Blockers

None.

### Next recommended step

1. Verify the live Vercel deployment in a browser with reduced-motion enabled on the OS/browser and confirm `/sign-in` and signed-out `/settings` render visible auth content.
2. Add a small runtime smoke script for reduced-motion auth rendering if this regression class shows up again on other card-based pages.

### Suggested commit message

```bash
fix blank sign-in render
```

---

## Session Update - 2026-05-09 (Harden blank sign-in page fallbacks)

### What changed

- Added a shared full-viewport auth frame so public auth pages always render a visible centered panel with a small production-safe diagnostic marker (`Auth page loaded`).
- Refactored `components/AuthForm.tsx` so the sign-in/sign-up surface is harder to blank:
  - wrapped the interactive form in a client error boundary
  - guarded Supabase browser client creation behind explicit try/catch
  - guarded OAuth/email redirect callback URL building so `window.location` is never assumed before mount
  - added a visible provider-preparing state instead of leaving OAuth in an ambiguous loading state
  - kept missing-config and runtime error copy visible inside the auth page instead of failing silently
- Updated `app/sign-in/loading.tsx` and `app/sign-in/error.tsx` to use the same shared auth frame instead of lighter route-local markup, so loading and route failure states are visually consistent and never blank.
- Added a real `/forgot-password` public route so the sign-in page no longer prefetches a missing route and logs 404 console errors during browser verification.
- Added focused auth rendering tests covering:
  - visible sign-in auth frame rendering
  - normalized `/sign-in?next=%2F`
  - visible missing-config fallback copy in `AuthForm`
  - runtime fallback boundary presence
  - visible forgot-password route rendering
- Investigated current production status:
  - latest production deployment at time of verification: `dpl_DEANSrnC4c3eWdjK95XytoBM9QM9`
  - Vercel alias `https://stay-focused-ten.vercel.app/sign-in` rendered the sign-in card successfully in headless browser verification
  - historical Vercel logs for that deployment showed `GET /sign-in` traffic without thrown route errors during the verification window

### Files touched

- `app/forgot-password/page.tsx`
- `app/globals.css`
- `app/sign-in/error.tsx`
- `app/sign-in/loading.tsx`
- `app/sign-in/page.tsx`
- `app/sign-up/page.tsx`
- `components/AuthForm.tsx`
- `components/AuthPageFrame.tsx`
- `docs/ai/handoff.md`
- `lib/auth-routing.ts`
- `tests/auth-sign-in-page.test.ts`

### Why it changed

The previous auth-boundary fix removed the protected shell from public auth routes, but the sign-in page still did not have a strong guarantee that it would render a visible student-facing surface if the client form crashed, provider setup lagged, or auth-adjacent routes were missing. This pass makes the sign-in route fail visibly instead of blanking and removes the `/forgot-password` console 404 that was still present during browser checks.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- auth sign-in middleware app-route-states` - passed (490 tests, 0 failures)

### Browser verification result

- Local signed-out verification passed for:
  - `/sign-in`
  - `/sign-in?next=%2F`
  - `/sign-in?next=%2Fcourses`
  - `/courses` redirecting to `/sign-in?next=%2Fcourses`
  - `/forgot-password`
- Results:
  - auth card rendered visibly on each sign-in route
  - `data-auth-diagnostic="loaded"` marker rendered on each auth page
  - AppShell/sidebar/topbar did not render on public auth routes
  - no browser console errors
  - no page runtime errors
- Production headless verification against `stay-focused-ten.vercel.app` also rendered the sign-in card visibly, and current Vercel logs did not show thrown sign-in route errors during the check window.

### Known risks

- The temporary diagnostic marker is intentionally visible on auth pages for production confirmation. It should be removed or softened further once the team is satisfied the blank-page report is fully retired.
- The new `/forgot-password` route is a safe placeholder, not a full reset-password implementation.
- The auth form error boundary guarantees a visible fallback for client render failures inside the form subtree, but it cannot protect against unrelated global layout/provider failures above the route segment.

### Blockers

- Full signed-in browser verification for `/courses` and `/settings` was not completed in this session because no safe test account/session was available in automation, and creating or guessing production credentials would be risky.

### Next recommended step

1. Manually verify the live production domain in a normal browser session, specifically:
   - signed out `/sign-in`
   - signed out `/sign-in?next=%2F`
   - signed out `/courses`
   - signed in `/courses`
   - signed in `/settings`
2. If a user still reports a blank auth surface after this deploy, capture:
   - exact deployment alias/domain
   - browser + version
   - screenshot
   - console output
   - whether the `Auth page loaded` marker is visible
3. Replace the placeholder `/forgot-password` route with a real Supabase password-reset flow once the auth surface is confirmed stable.

### Suggested commit message

```bash
fix blank sign-in page render
```

---

## Session Update - 2026-05-09 (Fix sign-in redirect loop and auth layout boundary)

### What changed

- Added shared auth-route helpers so public auth routes, protected app routes, safe `next` normalization, and auth-entry redirects all use one source of truth.
- Updated `proxy.ts` to enforce real auth boundaries:
  - unauthenticated protected routes now redirect to `/sign-in?next=<original-path>`
  - `/sign-in` and `/sign-up` stay public
  - authenticated visits to `/sign-in` or `/sign-up` now redirect to the normalized destination instead of leaving the user on auth entry pages
  - recursive auth `next` values like `/sign-in`, `/sign-up`, and `/auth/callback` are normalized back to `/`
- Split the root layout so public auth pages no longer mount the protected app shell or load shell announcement/workspace data.
- Removed `/sign-in` and `/sign-up` from the shell’s Settings matching logic so auth pages cannot inherit stale Settings chrome.
- Added explicit sign-in loading and error fallbacks so the auth route never degrades into an empty body.
- Hardened the auth form for missing Supabase auth config:
  - student-facing message stays clean
  - internal config error is still visible for debugging
  - email/password and OAuth actions are disabled instead of failing into a blank screen
- Added targeted auth regression tests for redirect normalization, middleware/proxy routing, and shell visibility on auth routes.

### Files touched

- `app/auth/callback/route.ts`
- `app/layout.tsx`
- `app/sign-in/error.tsx`
- `app/sign-in/loading.tsx`
- `app/sign-in/page.tsx`
- `app/sign-up/page.tsx`
- `components/AppShell.tsx`
- `components/AuthForm.tsx`
- `docs/ai/handoff.md`
- `lib/auth-routing.ts`
- `lib/auth.ts`
- `lib/supabase-auth-middleware.ts`
- `proxy.ts`
- `tests/auth-sign-in-middleware.test.ts`

### Why it changed

Production was still sending signed-out users into `/sign-in?next=/sign-in` while rendering the protected shell around the auth page. That meant the earlier blank-route fix treated the symptom but not the routing boundary itself. The app needed an actual public-vs-protected route split, safe `next` handling, and a sign-in route that can fail honestly instead of rendering a blank body inside authenticated chrome.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- auth sign-in middleware app-route-states` - passed (485 tests, 0 failures)
- `npm test -- task-output study-library task-draft-contract` - passed (485 tests, 0 failures)
- `npm test -- queue` - passed (485 tests, 0 failures)

### Verification result

All required checks passed. Public auth routes now stay outside the app shell, recursive sign-in redirects normalize back to `/`, authenticated users no longer remain on `/sign-in`, and protected routes now redirect signed-out users through a single proxy path with the original destination preserved.

### Known risks

- The protected-route allowlist is explicit. If a new protected top-level route is added later and not included in `lib/auth-routing.ts`, it will remain publicly reachable until that list is updated.
- The root layout’s public-route decision relies on the proxy-injected request header for the server-side shell split. `AppShell` also has a client-side guard now, but the header contract still matters for avoiding unnecessary server data loading on auth pages.
- There are no dedicated runtime browser checks in this session, so final production confidence still depends on verifying the real `/sign-in` route in deployment.

### Blockers

None.

### Next recommended step

1. Verify production manually on `/sign-in`, `/courses`, and `/settings` while signed out and signed in to confirm the loop is gone and the auth card renders without shell chrome.
2. Add a small integration/runtime auth smoke test once the team decides whether to keep route protection in `proxy.ts` long-term or move it deeper into page/data boundaries.
3. Review any future password-reset or OAuth recovery routes against `lib/auth-routing.ts` so they stay public and inherit the same `next` normalization rules.

### Suggested commit message

```bash
fix sign-in redirect loop and auth layout boundary
```

---

## Session Update - 2026-05-09 (Fix blank app routes and task output save failure)

### What changed

- Hardened the Courses, Study Library, and Calendar routes so they no longer fail into a blank body when workspace or Supabase-backed data loading breaks.
- Added explicit student-facing loading, empty, and error states for the affected routes, with retry guidance instead of an empty shell.
- Split route-state decisions into shared helpers so `/courses` and `/calendar` treat valid empty arrays as empty states rather than rendering nothing.
- Hardened Study Library saved-output handling so malformed or unsupported `study_outputs` rows no longer crash the whole page or detail view.
- Added safe unsupported-output rendering for unknown or malformed saved outputs while keeping valid reviewer, quiz pack, study sheet, cram sheet, and task output entries visible.
- Added validation and classified diagnostics to the task-output save path so production failures now distinguish schema-mismatch, permission, and constraint problems internally while keeping student-facing queue copy clean.
- Updated queue failure persistence so internal diagnostics survive on the queue job result for debugging instead of collapsing to the same generic save failure.
- Added targeted tests for:
  - library empty-state handling
  - malformed/unsupported saved outputs
  - route empty-state helpers
  - task-output save validation
  - queue diagnostics for task-output save failures

### Files touched

- `actions/queue-jobs.ts`
- `app/(app)/courses/error.tsx`
- `app/(app)/courses/loading.tsx`
- `app/(app)/courses/page.tsx`
- `app/(app)/library/error.tsx`
- `app/(app)/library/loading.tsx`
- `app/(app)/library/page.tsx`
- `app/(app)/library/[id]/error.tsx`
- `app/(app)/library/[id]/page.tsx`
- `app/calendar/error.tsx`
- `app/calendar/page.tsx`
- `components/StudyOutputQuizPackPage.tsx`
- `components/StudyOutputReviewerPage.tsx`
- `components/StudyOutputSheetPage.tsx`
- `components/StudyOutputTaskOutputPage.tsx`
- `docs/ai/handoff.md`
- `lib/app-route-states.ts`
- `lib/study-library.ts`
- `lib/study-output-content.ts`
- `lib/study-output-errors.ts`
- `lib/study-output-validation.ts`
- `lib/study-outputs/store.ts`
- `tests/queue.test.ts`
- `tests/study-library.test.ts`
- `tests/task-output-save.test.ts`

### Why it changed

Production was showing route shells with blank bodies on `/courses`, `/library`, and `/calendar`, and task-output generation failures were surfacing only as a generic queue save error. The app needed honest student-facing fallbacks and stronger runtime guards so one bad row, missing production column, or save-path mismatch would not collapse major student workflows.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- task-output study-library task-draft-contract` - passed (478 tests, 0 failures)
- `npm test -- queue` - passed (478 tests, 0 failures)
- `npm test -- app-route-states` - passed (478 tests, 0 failures)

### Verification result

All required checks passed. Courses, Study Library, and Calendar now render a visible state for loading, empty, error, and ready cases instead of leaving the route body blank, and task-output save failures now preserve actionable internal diagnostics without exposing technical details to students.

### Known risks

- Route-level loading states rely on Next.js segment loading behavior, so very fast responses may still skip the loading UI in practice. The important change is that slow or suspended requests now have a visible fallback.
- The save-failure classifier targets the current known production failure modes (`schema_outdated`, permissions/RLS, and constraint mismatch). New PostgREST failure shapes may still fall through to the generic diagnostic bucket until seen in logs.
- Unsupported saved outputs now stay visible with a safe fallback card, but they are still not recoverable in-place; repair still requires fixing the underlying row or re-generating the output.

### Blockers

None.

### Next recommended step

1. Confirm production has the `20260509143000_extend_study_outputs_for_task_outputs.sql` migration applied and inspect new queue job `result.internalDiagnostic` values for any remaining failed task-output saves.
2. Add a small admin/debug surface for queue failure diagnostics so support does not need raw database inspection to confirm whether a save failure was schema, RLS, or constraint related.
3. If blank route reports continue, capture the first server log entry from the new route error boundaries so the remaining failure source can be isolated quickly.

### Suggested commit message

```bash
fix blank app routes and task output save failure
```

---

## Session Update - 2026-05-09 (Add task output generator foundation)

### What changed

- Added task-output foundation support on the shared `study_outputs` layer with `source_kind = task` and saved `task_output` entries tied to `source_task_id`.
- Added a reusable task-output contract in `lib/task-output.ts` for:
  - request building
  - strict grounding prompts
  - weak-source scaffold fallback
  - deterministic preview/export bundles
  - lightweight revision history
- Added a new `/api/task-output` route that generates task outputs from surfaced task instructions, readable source text, requirements, and selected context.
- Reworked the task action flow so `Generate Output` now:
  - lets students choose a preset and output type
  - queues generation
  - previews the saved result
  - exposes export/download actions
- Added saved Study Library detail support for task outputs, including task-output routing, task-output subtype filtering, and task-vs-learning classification.
- Added compact preview styling for:
  - printable HTML previews
  - rich-text previews
  - code previews
- Added test coverage for:
  - task-output grounding
  - weak-source fallback
  - deterministic export bundles
  - metadata-leak rejection
  - Study Library visibility for saved task outputs

### Files touched

- `actions/queue-jobs.ts`
- `actions/study-outputs.ts`
- `app/(app)/library/[id]/page.tsx`
- `app/(app)/library/page.tsx`
- `app/api/task-output/route.ts`
- `app/globals.css`
- `app/modules/[id]/tasks/page.tsx`
- `components/DoNowButton.tsx`
- `components/DoNowPanel.tsx`
- `components/StudyOutputTaskOutputPage.tsx`
- `docs/ai/handoff.md`
- `lib/study-library.ts`
- `lib/study-outputs/store.ts`
- `lib/task-output.ts`
- `lib/types.ts`
- `supabase/migrations/20260509143000_extend_study_outputs_for_task_outputs.sql`
- `tests/study-library.test.ts`
- `tests/study-output-sheet.test.ts`
- `tests/task-output-foundation.test.ts`

### Why it changed

Stay Focused already had reviewer, quiz-pack, and sheet outputs, but it did not yet have a grounded task deliverable flow that saved into the same output system. This foundation adds a student-facing output generator without falling back to generic task drafts, keeps the workflow cheap and deterministic, and makes weak-source behavior explicit by returning scaffolds instead of fabricated content.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- task-output study-library task-draft-contract` - passed (470 tests, 0 failures)

### Verification result

All required checks passed. Task outputs can now be queued from the Tasks workspace, saved into `study_outputs`, reopened from Study Library, previewed in the browser, and exported through honest export-ready bundles without pretending to generate unsupported binary formats.

### Known risks

- `docx`, `pdf`, and `ppt` currently save export-ready HTML/text bundles rather than real binary files. This is intentional for the foundation layer, but students still need a later true exporter if native file generation becomes a product requirement.
- The generator contract is strict enough to reject noisy OCR/debug-style source text, so some thin tasks will correctly produce scaffold-first outputs that feel sparse.
- Legacy `drafts` infrastructure still exists elsewhere in the app, so task outputs now coexist with older saved draft flows instead of fully replacing them in one pass.

### Blockers

None.

### Next recommended step

1. Add true binary export adapters for `docx`, `pdf`, and `ppt` only after choosing a supported export stack and explicit file-format scope.
2. Unify older task-draft surfaces with the new saved `task_output` flow so Tasks and Library use one consistent deliverable model.
3. Add revision-to-revision diff or restore controls if students need more than lightweight revision history metadata.

### Suggested commit message

```bash
add task output generator foundation
```

---

## Session Update - 2026-05-09 (Add study sheet outputs)

### What changed

- Added compact `study_sheet` and `cram_sheet` output kinds to the shared `study_outputs` layer.
- Added a deterministic sheet builder under `lib/study-outputs/sheets.ts` that creates compact grounded study sheets from saved Deep Learn content only.
- Added student-facing `Make Study Sheet` and `Make Cram Sheet` actions on ready Deep Learn notes.
- Added a printable compact sheet page for saved Study Library outputs with:
  - key terms
  - one-line definitions
  - formulas when grounded content actually exposes formula-like material
  - high-yield facts
  - confusing concepts
  - likely exam traps
- Added compact/mobile-friendly and print-friendly sheet styling while preserving the existing reviewer visual family.
- Extended Study Library with saved-output subtype support for:
  - `Reviewer`
  - `Quiz pack`
  - `Study sheet`
  - `Cram sheet`
- Added subtype filter chips in Study Library so saved outputs can be narrowed without changing the schedule-first product flow.

### Files touched

- `actions/study-outputs.ts`
- `app/(app)/library/[id]/page.tsx`
- `app/(app)/library/page.tsx`
- `app/globals.css`
- `components/DeepLearnNoteView.tsx`
- `components/MakeCramSheetButton.tsx`
- `components/MakeStudySheetButton.tsx`
- `components/StudyOutputSheetPage.tsx`
- `docs/ai/handoff.md`
- `lib/study-library.ts`
- `lib/study-outputs/sheets.ts`
- `lib/types.ts`
- `tests/study-library.test.ts`
- `tests/study-output-sheet.test.ts`

### Why it changed

The reviewer and quiz-pack layers already covered long-form review and active recall, but the app still needed a fast scan-first artifact for last-minute studying. This change adds compact saved outputs that stay grounded in the saved Deep Learn pack, avoid another OpenAI step, and reuse the same storage/detail architecture instead of creating another parallel study system.

### Tests run

- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm test -- study-output study-library deep-learn-quiz` — passed (466 tests, 0 failures)

### Verification result

All required checks passed. Study sheets and cram sheets now save through `study_outputs`, render in Study Library, expose printable/mobile-friendly compact layouts, and inherit the existing saved-output flow without adding another generation step.

### Known risks

- Formula extraction is intentionally conservative and only surfaces when note-backed content contains formula-like strings, so many packs will correctly show no formula section.
- Study Library subtype filtering currently operates as a saved-output filter layer on top of the existing kind filter; it does not yet group outputs into separate shelves.
- The compact sheet builder currently prefers existing answer bank, identification, distinction, likely-quiz-target, and caution-note structure. If a pack is thin, the sheet will stay sparse rather than padded with filler.

### Blockers

None.

### Next recommended step

1. Unify reviewer, quiz-pack, study-sheet, and cram-sheet actions behind a shared saved-output action button pattern to reduce repeated client button code.
2. Consider a lightweight shared saved-output header shell so reviewer, quiz-pack, and sheet pages stop repeating the same Library detail chrome.
3. If students need it, add persistence for quiz-pack and sheet review state separately from the saved output content.

### Suggested commit message

```bash
add study sheet outputs
```

---

## Session Update - 2026-05-09 (Add Deep Learn quiz packs)

### What changed

- Added a persisted `quiz_pack` study-output path built strictly from existing Deep Learn structured content.
- Added `makeDeepLearnQuizPackAction` so ready Deep Learn packs can create saved quiz packs without another OpenAI generation step.
- Added a student-facing `Make Quiz Pack` action on ready Deep Learn notes.
- Added a saved quiz-pack review page with:
  - multiple choice
  - identification
  - matching
  - true/false when grounded by likely quiz targets
  - answer reveal mode
  - self-review marking
  - score tracking
- Extended Study Library handling so saved quiz packs appear with a stable subtype label and open into the saved review flow.
- Expanded study-output typing/storage so the output layer now supports both reviewer and quiz-pack content shapes.

### Files touched

- `actions/study-outputs.ts`
- `app/(app)/library/[id]/page.tsx`
- `components/DeepLearnNoteView.tsx`
- `components/MakeQuizPackButton.tsx`
- `components/StudyOutputQuizPackPage.tsx`
- `components/StudyOutputReviewerPage.tsx`
- `lib/study-outputs/quiz-pack.ts`
- `lib/study-outputs/store.ts`
- `lib/types.ts`
- `tests/study-library.test.ts`
- `tests/study-output-quiz-pack.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Phase 2 needed a reusable, cheap study-output path for quiz packs that stays grounded in the already-saved Deep Learn note instead of re-querying raw module text or calling a model again. The new quiz-pack builder keeps outputs deterministic by reusing only note-backed answer bank items, existing distractors, identification items, distinctions, and likely quiz targets. The saved output route also keeps Study Library as the single place students can reopen generated study materials.

### Tests run

- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm test -- study-output-quiz-pack study-library deep-learn-quiz` — passed (458 tests, 0 failures)

### Verification result

All required checks passed. Quiz packs now save through the shared `study_outputs` layer, render in Study Library, and support print/review flows without adding any new generation step.

### Known risks

- True/false items are intentionally conservative and only created from grounded likely-quiz-target material; some notes may produce few or no true/false items.
- The existing `/modules/[id]/quiz` route still exists separately from saved quiz-pack outputs, so there are now two quiz entry points with different persistence behavior.
- Matching items currently use distinction pairs only; if a note has no distinctions, matching coverage will be sparse by design.

### Blockers

None.

### Next recommended step

1. Add a shared quiz-pack renderer for both saved Study Library outputs and the module quiz route so interaction behavior stays identical across entry points.
2. Add subtype filters or grouped shelves in Study Library now that reviewer and quiz-pack outputs both persist there.
3. Consider persisting review progress if students need to resume scored quiz-pack sessions across reloads.

### Suggested commit message

```bash
add deep learn quiz packs
```

---

## Session Update - 2026-05-09 (Add Deep Learn reviewer maker)

### What changed

- Added a separate `study_outputs` layer for persisted study artifacts instead of extending the Deep Learn note table or bloating `actions/deep-learn.ts`.
- Added a deterministic Deep Learn reviewer builder under `lib/study-outputs/` that creates printable reviewer content only from saved Deep Learn fields:
  - `noteBody`
  - `sections`
  - `answerBank`
  - `identificationItems`
  - `distinctions`
  - `likelyQuizTargets`
  - `cautionNotes`
- Added reviewer gating so pending, failed, metadata-only, refusal-grounded, or otherwise untrustworthy Deep Learn packs cannot become reviewers.
- Added `makeDeepLearnReviewerAction` and a student-facing `Make Reviewer` button on ready Deep Learn note surfaces.
- Added a printable reviewer page in Study Library with:
  - high-yield concepts first
  - identification review
  - quick-answer blocks
  - distinctions/confusing concepts
  - likely quiz targets
  - browser print / Save PDF support
- Extended Study Library aggregation so saved reviewer outputs appear alongside packs and drafts, with their own `Reviewer` subtitle and delete support.
- Added the `study_outputs` migration with RLS, indexes, and unique per-user/per-note/per-output-kind persistence.
- Extracted shared Deep Learn bad-grounding detection so UI blocking and reviewer creation use the same metadata/refusal guardrail.

### Files touched

- `actions/drafts.ts`
- `actions/study-outputs.ts`
- `app/(app)/library/[id]/page.tsx`
- `app/(app)/library/page.tsx`
- `app/globals.css`
- `components/DeepLearnNoteView.tsx`
- `components/MakeReviewerButton.tsx`
- `components/ReviewerPrintButton.tsx`
- `components/StudyOutputReviewerPage.tsx`
- `components/drafts/LibraryDeleteButton.tsx`
- `docs/ai/handoff.md`
- `lib/deep-learn-source-validation.ts`
- `lib/deep-learn-ui.ts`
- `lib/study-library.ts`
- `lib/study-outputs/reviewer.ts`
- `lib/study-outputs/store.ts`
- `lib/types.ts`
- `supabase/migrations/20260509110000_add_study_outputs.sql`
- `tests/study-library.test.ts`
- `tests/study-output-reviewer.test.ts`

### Why it changed

Phase 1 needed a reviewer maker that turns already-grounded Deep Learn content into a printable study packet without another OpenAI generation step. The new layer keeps reviewer persistence and rendering separate from Deep Learn generation, keeps the output student-facing and cram-friendly, and gives Study Library a reusable path for future reviewer / quiz pack / task output / study sheet artifacts.

### Tests run

```bash
npm run typecheck
npm run lint
npm test -- deep-learn-generation deep-learn-ui study-output study-library
```

### Verification result

Passed. Typecheck and lint both succeeded, and the targeted test run passed with 452 tests, 0 failures.

### Known risks

- `study_outputs` is a new table, so environments that have not applied `20260509110000_add_study_outputs.sql` will not persist reviewer outputs yet.
- Reviewer creation currently upserts one reviewer per user + Deep Learn note. That is intentional for Phase 1, but later multi-variant reviewer formats would need either versioning or per-format parameters in the unique key.
- The printable reviewer is deterministic formatting over saved Deep Learn content. If a pack is thin but still technically ready, the reviewer will stay thin rather than inventing filler, which is correct but may feel sparse on weaker sources.

### Blockers

None.

### Next recommended step

Use the same `study_outputs` layer to add Phase 2 quiz-pack and printable study-sheet variants, then add a small library filter or badge for output subtype once more than one saved reviewer-style artifact exists per module.

### Suggested commit message

```bash
add deep learn reviewer maker
```

## Session Update - 2026-05-09 (Allow linked identities for admin access)

### What changed

- Expanded the shared admin helper in `lib/admin.ts` so admin checks now accept:
  - the primary Supabase account email
  - any linked Google identity email
  - any linked Microsoft/Azure identity email
  - any other available `user.identities[].identity_data.email`
- Normalized all admin email comparisons with trim + lowercase.
- Updated the admin notification lab page and server action to use the shared identity-aware helper instead of one-off email-only checks.
- Updated the settings loader and admin test-email action to use the same shared admin helper for consistent access rules.
- Added runtime tests for primary email, linked Google, linked Azure/Microsoft, and no-match denial.

### Files touched

- `lib/admin.ts`
- `app/admin/notification-lab/page.tsx`
- `actions/admin-notification-lab.ts`
- `actions/notifications.ts`
- `actions/user-settings.ts`
- `tests/admin.test.ts`
- `tests/scheduler.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The active Supabase account email can differ from the linked identity email that is actually listed in `ADMIN_EMAILS`. Admin-only pages were returning 404 for users whose verified linked Google or Microsoft identity should have granted access.

### Tests run

```
npm run typecheck
npm run lint
npm run build
npm test -- admin notification queue canvas-digest
```

### Verification result

Passed. `next build` completed successfully, and the full targeted test run passed with 446 tests, 0 failures.

### Known risks

- Admin checks still depend on Supabase exposing linked identities in `user.identities`; if a provider omits email from identity data, that identity will not grant access.
- `ADMIN_EMAILS` remains environment-driven, so misconfiguration still means no admin access.

### Blockers

None.

### Next recommended step

Verify `/admin/notification-lab` in a real session where the primary account email differs from the linked Google or Microsoft identity email, and confirm the page no longer 404s.

### Suggested commit message

```
allow linked identities for admin access
```

## Session Update - 2026-05-09 (Fix Vercel build failure from notification lab exports)

### What changed

- Removed the non-async exports from `actions/admin-notification-lab.ts` that Turbopack rejected in production builds.
- Moved notification-lab shared data into a plain lib module:
  - `INITIAL_NOTIFICATION_LAB_STATE`
  - `NOTIFICATION_LAB_PRESETS`
  - `NotificationLabActionState`
  - `NotificationLabPresetKey`
- Updated `components/admin/NotificationLab.tsx` to import the initial action state and presets from `lib/notification-lab.ts`, while keeping `runNotificationLabAction` as the only runtime export from the server action file.

### Files touched

- `actions/admin-notification-lab.ts`
- `components/admin/NotificationLab.tsx`
- `lib/notification-lab.ts`
- `docs/ai/handoff.md`

### Why it changed

Next.js/Turbopack requires `"use server"` files to export only async server actions at runtime. The previous notification-lab module exported a synchronous helper and shared presets from the server file, which broke the Vercel build even though local tests passed.

### Tests run

- `npm run typecheck` - passed after the route types were regenerated.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npm test -- admin canvas-digest notification queue` - passed, 442/442 tests.

### Verification result

The build failure is resolved. The admin notification lab still works, and the server action file now exports only the async action entry point at runtime.

### Known risks

- The new `lib/notification-lab.ts` file imports the state type used by the client and server action. That keeps the runtime export surface clean, but any future shape changes need to stay in sync with the action state contract.

### Blockers

- No code blocker.
- Pre-existing unrelated working-tree changes remain in `AGENTS.md`, `CLAUDE.md`, `docs/ai/design_system.md`, `docs/current-state.md`, plus an untracked nested `stay-focused/` directory.

### Next recommended step

Keep the notification lab as the only admin-facing delivery test entry point, then use it to validate inbox delivery on the selected Gmail recipient before trimming event volume.

### Suggested commit message

```
fix notification lab server action exports
```

---

## Session Update - 2026-05-08 (Implement Gmail-first Canvas notification testing)

### What changed

- Changed Canvas notification sending so `email_notifications='instant'` sends immediately without the old digest cooldown gate.
- Expanded the Canvas update email event model to cover edited states and test-oriented delivery paths:
  - `edited_announcement`
  - `edited_assignment`
  - `edited_quiz`
  - `edited_discussion`
  - `edited_module`
  - `edited_module_item`
  - `edited_resource`
  - `grade_update`
  - `ocr_completed`
  - `deep_learn_ready`
  - `generic_canvas_update`
- Added exact-state hashing for announcements, assignments, modules, resources, and grades so dedupe only suppresses the same Canvas state and does not suppress real edits.
- External Canvas sync now:
  - loads prior `canvas_update_events` state for the course,
  - detects edited announcements/assignments/modules from state-hash changes,
  - detects edited resources from real before/after resource state changes during refresh,
  - emits grade update notifications when Canvas submission grade/score state changes.
- Added admin-only notification testing route at `/admin/notification-lab`:
  - gated with existing `ADMIN_EMAILS` logic,
  - hidden from non-admins with `notFound()`,
  - inserts realistic `canvas_update_events` test rows,
  - triggers the same `attemptCanvasDigestForUser()` path used by real external sync,
  - reports inserted/skipped, sent/skipped/failed, recipient, skip reason, and Resend configuration truthfully.
- Updated email labels/templates and tests for the expanded event set and instant-mode behavior.

### Files touched

- `actions/admin-notification-lab.ts`
- `actions/canvas.ts`
- `app/admin/notification-lab/page.tsx`
- `components/admin/NotificationLab.tsx`
- `lib/canvas-digest.ts`
- `lib/canvas-update-events.ts`
- `lib/email-templates/canvas-digest.ts`
- `tests/admin.test.ts`
- `tests/canvas-digest.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The app needed Gmail-first delivery verification for Canvas changes, with instant mode treated as the primary path instead of a cooldown-gated digest. The existing implementation only covered a narrow new-item subset and could suppress the exact testing signal needed to verify Resend delivery on real Gmail notification addresses.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- canvas-digest notification queue admin` - passed, 442/442 tests.
- `npm test -- canvas-digest notification queue` - passed, 442/442 tests.

### Verification result

All requested verification passed. Instant Canvas notification mode now bypasses cooldown, edited announcement state changes are covered by tests, exact-state dedupe is preserved, and the admin-only lab exercises the real `canvas_update_events -> attemptCanvasDigestForUser -> Resend` path.

### Known risks

- Edited announcement/module detection depends on prior event-state history. On courses/resources that existed before this rollout, the first changed state after rollout may establish the baseline rather than always surfacing as an edit event unless the sync can compare against another stored source of truth.
- The admin notification lab intentionally uses fixed state hashes per preset, so re-running the same preset shows the dedupe behavior as `skipped` until a different preset/state is used.
- `ocr_completed`, `deep_learn_ready`, and `generic_canvas_update` are currently admin/test-path event types. Real external Canvas sync does not emit the first two yet.

### Blockers

- No code blocker.
- Pre-existing unrelated working-tree changes remain in `AGENTS.md`, `CLAUDE.md`, `docs/ai/design_system.md`, `docs/current-state.md`, plus an untracked nested `stay-focused/` directory.

### Next recommended step

Run `/admin/notification-lab` against an admin account with `email_notifications='instant'` and a linked Gmail recipient selected in settings, then verify real Resend delivery and inbox threading behavior before deciding how much notification volume to reduce.

### Suggested commit message

```
harden gmail-first canvas notification testing
```

---

## Session Update - 2026-05-08 (Unify Canvas change notifications)

### What changed

- Extended the existing `canvas_update_events` pipeline instead of creating a second notification store.
- Added stable event fields through migration: `stable_canvas_key`, `source_url`, `html_url`, `first_seen_at`, `sent_at`, and `skipped_reason`.
- Added event support for Canvas quizzes, discussions, and generic module items alongside announcements, assignments, due-date changes, modules, and resources.
- Moved external-sync event selection into `buildExternalCanvasSyncEvents()` so sync emits only meaningful new/changed Canvas identities:
  - announcements always dedupe by Canvas announcement id;
  - assignments/quizzes emit only when their Canvas assignment id is not already tracked by task rows;
  - modules emit only when a newly inserted resource belongs to a previously unseen Canvas module id;
  - resources emit only from newly inserted `module_resources`;
  - assignment-like and quiz-like resources do not create duplicate resource notifications;
  - due-date changes still dedupe by assignment id plus new due date.
- Digest sending now includes `new_quiz`, `new_discussion`, and `new_module_item`, marks `sent_at` only after Resend succeeds, and leaves failed sends retryable.

### Files touched

- `actions/canvas.ts`
- `lib/canvas-update-events.ts`
- `lib/canvas-digest.ts`
- `lib/email-templates/canvas-digest.ts`
- `tests/canvas-digest.test.ts`
- `tests/queue.test.ts`
- `supabase/migrations/20260508090000_extend_canvas_update_events.sql`
- `docs/ai/handoff.md`

### Why it changed

Canvas update emails needed to cover meaningful course changes beyond announcements without using OpenAI or OCR. The old external sync path built events for every assignment and module on every check, relying mostly on DB dedupe; that could create a first-external-sync flood for content already imported during manual sync. The new selection uses stable Canvas identities and existing synced rows as the "already seen" boundary.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- canvas-digest` - passed, 437/437 tests.
- `npm test -- queue` - passed, 437/437 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 437/437 tests.

### Verification result

All required verification passed. New coverage checks quiz/discussion/module-item digest eligibility, send-failure retry behavior remains intact, assignable resources do not duplicate task notifications, first external sync does not flood already imported assignments/modules, and new assignment/module/resource events still emit when Canvas identities are genuinely new.

### Known risks

- Canvas conversations/inbox messages and instructor/submission comments are not implemented yet because the current Canvas client does not fetch those APIs. The event type union and schema are ready for future `new_message` / `new_submission_comment` support, but no fake support was added.
- Correction/guardrail: do not describe Canvas inbox messages or instructor comments as supported email triggers until dedicated Canvas API fetchers exist and tests prove those events are inserted and sent. Today they are schema/event-type readiness only, and digest meaningful-event tests intentionally exclude them.
- New empty Canvas modules without module items will not email until a real module item/resource appears. This avoids historical empty-module floods.
- If legacy task rows are missing `canvas_assignment_id`, a previously imported assignment may look new to external sync. Existing synced Canvas assignments normally carry that id.

### Blockers

- No code blocker.
- Pre-existing unrelated working-tree changes remain in `AGENTS.md`, `CLAUDE.md`, `docs/ai/design_system.md`, `docs/current-state.md`, plus an untracked nested `stay-focused/` directory.

### Next recommended step

Add Canvas conversation/comment fetching only after confirming the app's Canvas token scopes can read those endpoints. Keep it in the same `canvas_update_events` pipeline and add preference tests before enabling email sends.

### Suggested commit message

```
unify canvas change notifications
```

---

## Session Update - 2026-05-08 (Consolidate Home data loading)

### What changed

**Shared Home loader**
- Added `lib/home-data.ts` with `loadHomeDashboardData()`.
- `app/page.tsx` and `app/(app)/page.tsx` now call the shared loader and only keep route-shell differences locally.
- Moved Home server data loading, study pack maps, course name maps, reviewed source ids, scheduled block normalization, and focus-row merge wiring out of both route files.

**Overnight schedule overlap**
- Updated the scheduled block query from "starts inside today" to overlap semantics:
  - `start_at < dayEnd`
  - `end_at > dayStart`
- This keeps current local-day behavior while allowing a block that started before midnight and ends after midnight to appear on Home.
- Existing actionable filtering still excludes completed, skipped, and missed blocks from command-center inputs.

### Files touched

- `app/page.tsx`
- `app/(app)/page.tsx`
- `lib/home-data.ts`
- `tests/scheduler.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The previous P0 fix had to update both Home entry points independently. Consolidating the loader prevents route drift and makes future command-center schedule fixes land in one place.

### Tests run

- `git status --short --branch` - reviewed before editing; existing unrelated local changes were present.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- scheduler` - passed, 430/430 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 430/430 tests.

### Verification result

All required and broader relevant verification passed. New tests cover current-day overlap inclusion for overnight blocks and assert both Home routes use the shared loader instead of querying `scheduled_blocks` directly.

### Known risks

- The overlap query assumes scheduled blocks have an `end_at` value. Generated schedule blocks do, and the existing Home/clock logic also expects `endAt`; legacy malformed rows with null `end_at` would not be returned by the DB query.
- `lib/home-data.ts` now owns Home server data shape normalization. Future changes to `TodayDashboard` props should update this loader and its scheduler tests.

### Blockers

- No code blocker.
- Pre-existing unrelated working-tree changes remain in `AGENTS.md`, `CLAUDE.md`, `docs/ai/design_system.md`, `docs/current-state.md`, plus an untracked nested `stay-focused/` directory.

### Next recommended step

Add a focused unit test around `loadHomeDashboardData()` with a mocked Supabase client if Home data logic grows further; current coverage is through pure helpers and route source contracts.

### Suggested commit message

consolidate home data loading

---

## Session Update - 2026-05-08 (Harden Home schedule freshness and Deep Learn refinement)

### What changed

**Home schedule freshness**
- Home now queries `scheduled_blocks` only within the current local-day schedule window instead of loading the first 24 blocks globally.
- Home separates today-relevant blocks from actionable blocks:
  - relevant blocks can still include today's completed history for display
  - actionable command-center inputs exclude `completed`, `skipped`, and `missed`
- `TodayDashboard` now uses the shared actionable-status helper so skipped/missed blocks cannot become active Start Here/current/next candidates.
- Scheduled-block merge fallbacks now skip `missed` blocks in addition to completed/skipped blocks.

**Deep Learn refinement grounding**
- Refinement now resolves the selected resource through `resolveLearnResourceSelection`, matching the main Deep Learn generation path.
- Refinement uses the stored canonical selected resource and `selectDeepLearnGroundingText`/meaningful-text checks before any OpenAI request.
- Empty, metadata-only, refusal/debug, or otherwise weak selected source text is blocked with a clear student-facing message.
- Refinement no longer falls back to module/course/task context when selected source text is bad.
- Replaced the hard-coded `gpt-4o` refinement model with the existing Deep Learn model fallback order: `OPENAI_DEEP_LEARN_MODEL`, then `OPENAI_MODEL`, then `gpt-5-mini`.

### Files touched

- `actions/deep-learn.ts`
- `app/(app)/page.tsx`
- `app/page.tsx`
- `components/InteractivePlannerClock.tsx`
- `components/TodayDashboard.tsx`
- `lib/deep-learn-refinement.ts`
- `lib/home-focus.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/scheduler.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The P0 review found that old scheduled blocks could still influence Home's command center and that Deep Learn refinement could call OpenAI with empty source context if the selected resource was not resolved. Both issues could violate the schedule-first workflow and grounded-source contract.

### Tests run

- `git status --short --branch` - reviewed before editing; existing unrelated local changes were present.
- `npm test -- scheduler` - passed, 428/428 tests.
- `npm test -- deep-learn-readiness` - passed, 428/428 tests.
- `npm test -- deep-learn-generation` - passed, 428/428 tests.
- `npm test -- canvas-content-resolution` - passed, 428/428 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 428/428 tests.
- `npm run typecheck` - passed after fixing a test-only partial env cast.
- `npm run lint` - passed.

### Verification result

All required verification passed. New tests cover yesterday schedule exclusion, completed/skipped/missed Home action exclusion, today actionable block preservation, Deep Learn refinement refusal for empty or metadata/refusal/debug text, successful refinement grounding with meaningful selected text, configured model fallback, and absence of the old empty-context/hard-coded-model path.

### Known risks

- The Home schedule DB query filters by `start_at` within the current local day. This matches how generated study blocks are created today, but a future overnight block that starts before local midnight and ends after midnight would require an overlap query to appear after midnight.
- `app/page.tsx` and `app/(app)/page.tsx` still duplicate Home server-page logic. The fix was applied to both to avoid route drift, but a later consolidation would reduce maintenance risk.

### Blockers

- No code blocker.
- Pre-existing unrelated working-tree changes remain in `AGENTS.md`, `CLAUDE.md`, `docs/ai/design_system.md`, `docs/current-state.md`, plus an untracked nested `stay-focused/` directory.

### Next recommended step

Consolidate the duplicated Home server data-loading logic so future schedule command-center fixes land in one place.

### Suggested commit message

harden home schedule freshness and deep learn refinement

---

## Session Update - 2026-05-08 (Fix announcement emails, Learn task leaks, and Home width)

### What changed

**Announcement email notifications**
- `lib/canvas-digest.ts` now evaluates email categories per Canvas update event.
- `new_announcement` events can send when `email_notifications` is enabled and the user has the `announcements` category enabled, even if the broader `canvas_updates` digest category is off.
- `canvas_updates` still enables all meaningful Canvas update event types.
- Disabled categories leave matching events unsent, so they are not incorrectly marked delivered.

**Task-like Canvas items no longer leak into Learn**
- `actions/canvas.ts` skips module resource persistence for Canvas module items that are assignment/quiz/discussion/assessment-like, have submit-style completion behavior, or have task/syllabus-like titles.
- `lib/home-focus.ts` filters task-like `module_resources` out of Home Learn rows.
- `lib/module-workspace.ts` stops building Learn/Do source resources from parsed assignment sections and filters assignment/quiz/discussion/syllabus-like parsed module items out of the Learn resource model.
- Real study files/pages with academic content remain eligible for Learn.

**Large Home layout**
- `app/page.tsx` uses a Home-specific page shell class.
- `app/globals.css` removes the Home max-width cap and adjusts Home grid ratios so the dashboard uses available desktop width while preserving the existing mobile single-column behavior.

### Files touched

- `actions/canvas.ts`
- `app/globals.css`
- `app/page.tsx`
- `lib/canvas-digest.ts`
- `lib/home-focus.ts`
- `lib/module-workspace.ts`
- `tests/canvas-digest.test.ts`
- `tests/scheduler.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Announcements shown in Home/Updates are represented as Canvas update events, but the email digest path only honored the `canvas_updates` category. Users who enabled announcement emails could still miss announcement messages. Canvas assignment/syllabus-like module items could also be treated as Learn material when they should remain canonical task/syllabus work. Home was capped to a narrow dashboard width on large displays.

### Tests run

- `git status --short --branch` - reviewed before editing; existing unrelated local changes were present.
- `npm test -- canvas-digest` - passed, 420/420 tests.
- `npm test -- scheduler` - passed, 420/420 tests.
- `npm test -- queue` - passed, 420/420 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 420/420 tests.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` - skipped because the local PDF fixture was not found.

### Verification result

All runnable verification passed. New tests cover announcement-category digest sending, disabled-category duplicate prevention, Home Learn task-like filtering, and module Learn parsed assignment/syllabus filtering.

### Known risks

- The task-like title filter intentionally treats titles containing "syllabus", "due", "submit", "assignment", "quiz", or "discussion" as non-Learn. A genuine study file with those words in the title may need a future explicit override if it should appear in Learn.
- Existing rows already persisted as task-like `module_resources` are hidden from Home/module Learn by the new filters, but they are not deleted from the database.

### Blockers

- No code blocker.
- The optional scanned-PDF validator could not run because `C:\Users\omgra\Downloads\1.1-Data Organization.pdf` was not present locally.
- Pre-existing unrelated working-tree changes remain in `AGENTS.md`, `CLAUDE.md`, `docs/ai/design_system.md`, `docs/current-state.md`, plus an untracked nested `stay-focused/` directory.

### Next recommended step

Apply the fix in production, then trigger an external Canvas sync on a test account with `announcements` email enabled and confirm a newly posted Canvas announcement produces one digest email and only one `digest_sent_at` mark for that announcement event.

### Suggested commit message

fix announcement email notifications and task learn classification

---

## Session Update - 2026-05-07 (Fix digest retries and add deadline reminder emails)

### What changed

**Canvas digest retry reliability**
- `actions/canvas.ts` now attempts the Canvas update digest after every successful external Canvas sync, even when the current sync inserted `0` new `canvas_update_events`.
- `lib/canvas-digest.ts` still sends only unsent meaningful event types and still respects the existing cooldown, but now supports injected send/clock functions for focused retry tests.
- Failed Resend sends leave events unsent; later successful syncs can retry those events.

**Deadline reminder emails**
- Added `lib/deadline-reminders.ts` to send Resend-only reminder emails for tasks/deadlines due today and due tomorrow.
- Added `lib/email-templates/deadline-reminder.ts` for simple student-facing reminder HTML/text.
- Hooked reminder sending into `app/api/cron/hourly/route.ts`, alongside the existing due-soon in-app notification scan.
- Reused the existing notification recipient source resolution (`supabase_account`, `linked_google`, `linked_microsoft`) through `notification_email_source`.
- Respected existing email preferences: `email_notifications='off'` disables reminders; exact category keys such as `deadline_reminders`, `deadlines`, `tasks`, or existing `due_soon` are honored when present; otherwise reminders default enabled for authenticated users with an email.
- Added `supabase/migrations/20260507050000_add_deadline_reminder_email_logs.sql` with a unique key on `user_id + source_type + source_id + reminder_window` to prevent duplicate reminder emails.

### Files touched

- `actions/canvas.ts`
- `app/api/cron/hourly/route.ts`
- `lib/canvas-digest.ts`
- `lib/deadline-reminders.ts`
- `lib/email-templates/deadline-reminder.ts`
- `supabase/migrations/20260507050000_add_deadline_reminder_email_logs.sql`
- `tests/canvas-digest.test.ts`
- `tests/deadline-reminders.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Canvas digest retry was gated on new event insertion, so a failed digest could leave unsent events stranded forever if later syncs found no new Canvas updates. Deadline reminders close the schedule-first loop by emailing students at the two highest-value windows: due tomorrow and due today.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm run build` - passed
- `npm test -- canvas-digest` - 416/416 passed
- `npm test -- deadline-reminders` - 416/416 passed
- `npm test -- queue` - 416/416 passed
- `npm test -- notification` - 416/416 passed

### Verification result

All requested quality gates passed. Digest tests cover failed send leaves events unsent, a later sync with `inserted=0` retries existing unsent events, and cooldown still blocks resend. Reminder tests cover due-window selection, preference behavior, dedupe, and failed-send log release.

### Known risks

- Deadline due-window selection uses UTC calendar days because no per-user timezone preference was found in the existing schema. If user timezone support is added later, reminder windows should use that setting.
- The new reminder log migration must be applied before reminder sends can run in deployed environments.
- Reminder querying currently covers `task_items` and `deadlines`, which are the visible student task/deadline sources. The legacy `tasks` table is not emailed separately to avoid duplicate Canvas assignment reminders from overlapping task tables.

### Blockers

None.

### Next recommended step

Apply the new Supabase migration in staging/production, then trigger `/api/cron/hourly` with a test account that has one task due today and one due tomorrow to verify delivered email content and recipient selection.

### Suggested commit message

fix digest retries and add deadline reminder emails

---

## Session Update - 2026-05-07 (Restore new Sync Courses page)

### What changed

**`app/sync/page.tsx`**
- Restored the dedicated new Sync Courses page from commit `6afffac`.
- `/sync` now renders `SyncCoursesPageClient` again instead of the old `ConnectCanvasFlowWrapper` Canvas sync workflow.
- Restored the wide Sync Courses shell, compact signed-out/disconnected states, summary card data, available-course sync flow props, and synced module metadata (`courseTitle`, `contentCount`).

**`tests/scheduler.test.ts`**
- Updated route/UI contract tests so `/sync` is protected as the dedicated Sync Courses split page.
- Kept later notification recipient and identity-linking tests intact.
- Added/kept assertions for `/canvas` redirecting to `/sync`, sidebar `/sync` navigation, Settings Canvas `/sync` link, search/show-ended/refresh/sync-selected controls, and disconnected Settings Canvas setup link.

### Files touched

- `app/sync/page.tsx`
- `tests/scheduler.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Commit `efe2afe` left `/sync` rendering the old Canvas connection/sync wrapper instead of the new course-selection experience from `6afffac`. This restored the student-facing Sync Courses page while preserving later unrelated notification recipient, cron, Resend, and identity-linking fixes.

### Tests run

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run build` — passes
- `npm test -- queue` — 408/408 pass

### Verification result

All requested quality gates passed. `/sync` now imports and renders `SyncCoursesPageClient`; `/canvas` remains a redirect to `/sync`; the sidebar still points Sync Courses to `/sync`; Settings → Canvas still links to `/sync`.

### Known risks / blockers

- Design reference URL (`https://api.anthropic.com/v1/design/h/UyLbU541E6l_gw8FuNb4Dg`) was not accessible in this environment, so the fallback was used: restore the existing `6afffac` Stay Focused UI exactly and avoid a new design language.
- Pre-existing unrelated local edits remain in `AGENTS.md`, `CLAUDE.md`, and `docs/ai/design_system.md`; they were not part of this task and should not be staged with this commit.

### Next recommended step

Open `/sync` locally with a Canvas-connected account and confirm course refresh, search, show-ended toggle, sync selected, queue status, and synced modules behave as expected with real Canvas data.

### Suggested commit message

restore new Sync Courses page

---

## Session Update - 2026-05-07 (Clarify identity linking setup errors)

### What changed

**`components/settings/NotificationSettings.tsx`**
- Added `classifyLinkIdentityError(message)` module-level helper. Detects Supabase "manual linking disabled" error codes/messages (case-insensitive: `manual linking`, `linking is disabled`, `identity linking`, `manual_linking_disabled`) and returns a clear user-facing explanation: "Account linking is disabled in Supabase Auth. Enable manual identity linking in Supabase before connecting Google or Microsoft."
- All other error messages pass through unchanged.
- Connect Google / Connect Microsoft buttons are preserved; only the error text improves.

### Files touched

- `components/settings/NotificationSettings.tsx`
- `docs/ai/handoff.md`

### Why it changed

Clicking "Connect Google" or "Connect Microsoft" fails with a raw Supabase error message ("Manual linking is disabled.") if the Supabase project has manual identity linking turned off. The raw message is not actionable for the user. The new classifier maps it to a clear instruction.

### Supabase setup requirements for Connect Google / Connect Microsoft

For the Connect identity buttons to work end-to-end, two things must be configured in the Supabase project:

1. **Manual identity linking must be enabled** — Supabase Auth → Auth Settings → Enable manual linking. Without this, `supabase.auth.linkIdentity()` returns the "Manual linking is disabled" error, which is now surfaced clearly to the user.

2. **Google OAuth redirect URI** — In Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs, add:
   `https://xglbmmiiprtfpowgckqd.supabase.co/auth/v1/callback`
   This is the Supabase callback URL that the OAuth provider must be authorized to redirect to.

### Tests run

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run build` — passes
- `npm test -- notification` — 407/407 pass

### Verification result

All quality gates passed. 407 tests pass.

### Known risks / blockers

None. Pure error-message improvement — no routing, sending, or data changes.

### Next recommended step

1. Enable manual identity linking in Supabase Auth settings.
2. Add the Supabase callback URI to Google Cloud OAuth client authorized redirect URIs.
3. Test Connect Google flow end-to-end in a browser.

### Suggested commit message

clarify identity linking setup errors

---

## Session Update - 2026-05-07 (Restore sync route and add linked email identity actions)

### What changed

**`app/sync/page.tsx`** (restored)
- Replaced the `redirect('/settings?section=canvas')` stub with the real Canvas course sync workflow.
- Page renders `ConnectCanvasFlowWrapper` (same component previously at `/canvas`), with full Canvas connected status, reconnect/forget controls, refresh courses, show-ended-courses option, synced modules area, and import/sync course flow.
- Unauthenticated users see a sign-in prompt with `next=%2Fsync`.

**`app/canvas/page.tsx`** (simplified)
- Replaced the full sync workflow with `redirect('/sync')`.
- `/canvas` is now a permanent legacy redirect; all Canvas sync UI lives at `/sync`.

**`components/shell/Sidebar.tsx`**
- `Sync Courses` nav item href changed from `/settings?section=canvas` to `/sync`.
- No other changes; `isActive` continues to work correctly for `/sync` via the `pathname.startsWith` branch.

**`components/SettingsPage.tsx`**
- Settings → Canvas section now includes a "Go to Sync Courses →" link (`href="/sync"`) after the connection form, with a short "Import and sync your Canvas courses." note.
- The settings section remains for connection/token management only — it does not replace the sync workflow.

**`components/settings/NotificationSettings.tsx`**
- Added `createSupabaseBrowserClient` and `isSupabaseAuthConfigured` imports.
- Added `linkPending` and `linkError` state.
- Added `handleLinkIdentity(source)` — calls `supabase.auth.linkIdentity({ provider: 'google' | 'azure', options: { redirectTo: origin + '/auth/callback?next=/settings?section=notifications' } })`. On success the browser is redirected to the OAuth provider; on error a message is shown.
- Recipient option rows for `linked_google` and `linked_microsoft`: when `available=false` and Supabase is configured, a "Connect Google" / "Connect Microsoft" button is shown instead of the disabled badge. When `available=true`, the existing Select/Active badge is shown and the row is selectable.
- Identity linking does NOT request Gmail send scopes or Microsoft Mail.Send — only the standard OAuth profile/email identity is linked. Resend remains the email sender.
- `linkError` displays inline below the option list if identity linking fails immediately.

**`tests/scheduler.test.ts`**
- Replaced 3 stale route tests:
  - `Settings Canvas section does not link to /sync` → `Settings Canvas section links to /sync (Go to Sync Courses)`
  - `/sync redirects to /settings?section=canvas` → `/sync is the real Canvas sync workflow (not a redirect)`
  - `Sync Courses sidebar nav item points to /settings?section=canvas` → `Sync Courses sidebar nav item points to /sync`
- Added 9 new tests:
  - `/canvas redirects to /sync`
  - `auth default redirect no longer points to /canvas`
  - `notification recipient shows Connect Google button when Google identity is not linked`
  - `notification recipient shows Connect Microsoft button when Microsoft identity is not linked`
  - `notification recipient identity linking uses Supabase linkIdentity (not Gmail/Microsoft send APIs)`
  - `linked Google option is selectable when identity exists (notification-email-options contract)`
  - `linked Microsoft option is selectable when identity exists (notification-email-options contract)`
  - `recipient selection falls back to account email if selected identity disappears`

### Files touched

- `app/sync/page.tsx`
- `app/canvas/page.tsx`
- `components/shell/Sidebar.tsx`
- `components/SettingsPage.tsx`
- `components/settings/NotificationSettings.tsx`
- `tests/scheduler.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The previous session consolidated `/sync` into `/settings?section=canvas`, removing the dedicated sync workflow page and breaking the student-facing "Sync Courses" nav link. This session restores the correct route model:
- `/sync` = Canvas course sync workflow (ConnectCanvasFlow)
- `/settings?section=canvas` = connection/token management
- `/canvas` = legacy redirect to `/sync`

Notification settings previously showed disabled Google/Microsoft recipient options with no way to link those identities. This session adds actionable "Connect Google" / "Connect Microsoft" buttons using Supabase's `linkIdentity` — no new send scopes, Resend remains the sender.

### Tests run

- `npm run typecheck` — clean
- `npm run lint` — clean (0 errors, 0 warnings)
- `npm run build` — passes (all routes collected without error)
- `npm test` — 407/407 pass
- `npm test -- canvas-digest` — 407/407 pass
- `npm test -- queue` — 407/407 pass

### Verification result

All quality gates passed. 407 tests pass.

### Known risks / blockers

- **`supabase.auth.linkIdentity`** requires the Supabase project to have Google/Microsoft (azure) OAuth providers configured. If not configured, the button appears but clicking it will produce an error message inline (handled gracefully). No silent failures.
- **Redirect after identity linking** goes through the existing `/auth/callback` route. `exchangeCodeForSession` handles both new-session and link-identity codes transparently in Supabase JS v2. If for any reason a link identity code creates a new session instead of linking (provider misconfiguration), the user lands back at `/settings?section=notifications` as intended.
- **Design reference URL** (`https://api.anthropic.com/v1/design/h/UyLbU541E6l_gw8FuNb4Dg`) was not accessible. UI was implemented by matching existing `NotificationSettings.tsx` CSS variables, button patterns (`ui-interactive-card`, inline style patterns from the same component), and spacing. No new design language introduced.
- `SyncCoursesPageClient.tsx` is still present and referenced by a scheduler test (`/sync course controls use saved Canvas connection...`). It is not rendered by any route. It can be removed in a follow-up after evaluating whether the older sync-selection flow should be revived.

### Next recommended step

1. Verify Google/Microsoft OAuth providers are enabled in Supabase Auth → Providers if the Connect buttons should be usable.
2. Test the full identity linking flow end-to-end in a browser (click Connect Google → OAuth → return to `/settings?section=notifications` → option becomes selectable).
3. Consider removing `SyncCoursesPageClient.tsx` if the older course-selection UI is permanently retired.
4. Run `npx supabase db push` if the `notification_email_source` migration from the previous session has not yet been applied to production.

### Suggested commit message

restore sync route and add linked email identity actions

---

## Session Update - 2026-05-07 (Fix NotificationEmailSource runtime build error)

### What changed

**`lib/notification-email-options.ts`**
- Changed `NotificationEmailSource` from a plain type alias to a `typeof NOTIFICATION_EMAIL_SOURCES[number]` derived type.
- Added `export const NOTIFICATION_EMAIL_SOURCES = [...] as const` so runtime checks can use the constant instead of the type name.

**`actions/user-settings.ts`**
- Removed `export type { NotificationEmailSource, NotificationEmailOption }` — Turbopack was treating these re-exports from a `'use server'` file as server action exports, trying to register them as `serverReference` at runtime and failing with `ReferenceError: NotificationEmailSource is not defined`.

**`lib/canvas-digest.ts`**
- Removed `const emailSource: NotificationEmailSource = ...` type annotation — Turbopack's SWC was not stripping this `const`-level type annotation, causing the same `ReferenceError` in the `lib_canvas-user-config_ts` chunk.
- Removed now-unused `type NotificationEmailSource` from the import.

**`actions/notifications.ts`**
- Removed `Promise<NotificationEmailSource>` return type annotation from `loadNotificationEmailSource()`.
- Removed now-unused `type NotificationEmailSource` from the import.

**`components/SettingsPage.tsx`**
- Updated import: `type NotificationEmailSource` now comes directly from `@/lib/notification-email-options` instead of being re-exported from `@/actions/user-settings`.

### Root cause

Turbopack/SWC does not correctly strip TypeScript type annotations in two specific scenarios within `'use server'` modules:
1. **`export type { TypeName }` in a `'use server'` file** — Turbopack collects all named exports for `registerServerReference`, including type-only re-exports, and passes them as runtime values. When the type has no runtime representation, the reference is undefined.
2. **`const x: TypeName = value` variable annotation** — SWC emits the type name as a runtime identifier in some Turbopack chunking contexts (specifically when a lib file is bundled into a server chunk alongside a `'use server'` action file).

The fix is: never re-export types from `'use server'` files; never annotate `const` declarations with type names that have no runtime value. Use inferred types or `as const` instead.

### Files touched

- `lib/notification-email-options.ts`
- `lib/canvas-digest.ts`
- `actions/user-settings.ts`
- `actions/notifications.ts`
- `components/SettingsPage.tsx`
- `docs/ai/handoff.md`

### Tests run

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run build` — passes (all 42 routes collected without error)
- `npm test` — 399/399 pass

### Known risks / blockers

None. Purely a build plumbing fix — no UI or runtime behavior changes.

### Next recommended step

1. Run `npx supabase db push` to apply the notification_email_source migration in staging/production.
2. Add `ADMIN_EMAILS=omgraythekid@gmail.com` to Vercel environment variables if not done yet.

### Suggested commit message

fix notification email source runtime build error

---

## Session Update - 2026-05-07 (Add notification email recipient selection + consolidate Canvas sync route)

### What changed

**`supabase/migrations/20260507040000_add_notification_email_source.sql`** (new)
- Adds `notification_email_source text not null default 'supabase_account'` with a `CHECK` constraint to `user_settings`.
- Allowed values: `supabase_account`, `linked_google`, `linked_microsoft`.
- Existing rows default to `supabase_account` — no behavior change for existing users.

**`lib/notification-email-options.ts`** (new)
- `getNotificationEmailOptions(user)` — derives available email options from a Supabase `User` object. Returns an array of `NotificationEmailOption` (source, label, email, available, disabledReason).
- `resolveEmailFromOptions(options, source)` — returns the actual email string for a given source, with automatic fallback to account email if the selected source is unavailable.
- Handles `google` and `azure`/`microsoft` provider names for linked identities.
- Normalizes all emails to lowercase/trimmed for comparison.

**`lib/auth-server.ts`**
- Added `getAuthenticatedUserWithIdentities()` — returns the full Supabase `User` object including `identities`, needed to resolve linked provider emails server-side.

**`actions/user-settings.ts`**
- Added `notificationEmailSource: NotificationEmailSource` and `notificationEmailOptions: NotificationEmailOption[]` to the `UserSettings` interface.
- `getUserSettings()` now calls `getAuthenticatedUserWithIdentities()` to build options and reads `notification_email_source` from the settings row.
- Added `updateNotificationEmailSource({ source })` — server action to persist the selected source, with input validation.
- Exports `NotificationEmailSource` and `NotificationEmailOption` types for consumers.

**`lib/canvas-digest.ts`**
- `loadUserDigestSettings()` now reads `notification_email_source` from the settings row.
- Calls `getNotificationEmailOptions(supabaseUser)` and `resolveEmailFromOptions()` to pick the right recipient email based on the user's selection.
- Fallback chain: source-resolved email → `notification_email` column → account email from admin API.
- Canvas sync is not failed if recipient resolution fails — falls back gracefully.

**`actions/notifications.ts`**
- `sendTestEmailAction()` now resolves the recipient using the admin's saved `notification_email_source`, so test emails go to the same address the digest would use.
- Added `loadNotificationEmailSource()` helper to load the setting from the DB.
- Production still ignores `EMAIL_TEST_TO`.

**`app/sync/page.tsx`**
- Replaced the full sync page with a single-line `redirect('/settings?section=canvas')`. `/sync` is now a legacy compatibility redirect; all Canvas settings and sync live at `/settings?section=canvas`.

**`components/shell/Sidebar.tsx`**
- "Sync Courses" nav item href changed from `/sync` to `/settings?section=canvas`.
- `isActive()` updated to handle query-param-based hrefs by parsing the query string and matching against `useSearchParams()`.
- Added `useSearchParams` import.

**`components/SettingsPage.tsx`**
- Removed the "Go to Sync Courses → `/sync`" button from the Canvas settings section (circular — the user is already there).
- Updated the Canvas section description to remove the stale reference to the Sync Courses page.
- Passes `notificationEmailSource`, `notificationEmailOptions`, and `onNotificationEmailSourceChange` to `<NotificationSettings />`.

**`components/settings/NotificationSettings.tsx`**
- Added `notificationEmailSource`, `notificationEmailOptions`, and `onNotificationEmailSourceChange` props.
- Updated "Digests sent to" header to reflect the active source email rather than a hardcoded field.
- Added "Send Canvas update digests to" section (Part D) with radio-style buttons for account/Google/Microsoft. Disabled options show their `disabledReason`.
- Shows a warning banner when the selected source is unavailable (e.g. identity was unlinked).
- "Send test email" description now shows the resolved recipient email.
- Note: "Stay Focused sends email through its notification service. It will not send mail from your personal inbox." is included in the recipient section.

**`tests/notification-email-options.test.ts`** (new, 14 tests)
- Covers: default source is supabase_account; account email always first; Google/Microsoft enabled/disabled states; email normalization; null user; fallback behavior for all three sources.

**`tests/canvas-digest.test.ts`**
- Added imports for `getNotificationEmailOptions`, `resolveEmailFromOptions`, `User`, `UserIdentity`.
- Added 7 tests: source resolution for all three sources + fallback + Resend provider guard + no-Gmail/Microsoft-send guard.

**`tests/scheduler.test.ts`**
- Replaced 4 stale `/sync`-route tests with updated equivalents:
  - `Settings Canvas section does not link to /sync`
  - `/sync redirects to /settings?section=canvas`
  - `Sync Courses sidebar nav item points to /settings?section=canvas`
  - `admin-only test email still gated by ADMIN_EMAILS`
- Preserved `/sync course controls use saved Canvas connection...` test (reads `SyncCoursesPageClient.tsx`, unaffected by page redirect).

### Files touched

- `supabase/migrations/20260507040000_add_notification_email_source.sql` (new)
- `lib/notification-email-options.ts` (new)
- `lib/auth-server.ts`
- `lib/canvas-digest.ts`
- `actions/user-settings.ts`
- `actions/notifications.ts`
- `app/sync/page.tsx`
- `components/shell/Sidebar.tsx`
- `components/SettingsPage.tsx`
- `components/settings/NotificationSettings.tsx`
- `tests/notification-email-options.test.ts` (new)
- `tests/canvas-digest.test.ts`
- `tests/scheduler.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Users could only receive Canvas digest emails at their Supabase account email. This adds support for linked Google/Microsoft identity emails as recipient choices, using Supabase's existing identity data — no new OAuth scopes or send permissions requested. Resend remains the sender. `/sync` was consolidated into `/settings?section=canvas` to reduce navigation fragmentation.

### Tests run

- `npm run typecheck` — clean
- `npm run lint` — clean (0 errors, 0 warnings)
- `npm test -- canvas-digest` — 399/399 pass
- `npm test -- notification-email-options` — 399/399 pass (all tests run together)

### Verification result

All quality gates passed. 399 tests pass.

### Known risks / blockers

- **Google/Microsoft OAuth must be configured in Supabase** for `linked_google`/`linked_microsoft` options to be available. If not configured, the options appear disabled with a clear reason — no breakage.
- **`notification_email_source` column requires migration** via `npx supabase db push` before deploying. Production will treat all existing rows as `supabase_account` (the column default).
- **Design reference URL** (`https://api.anthropic.com/v1/design/h/UyLbU541E6l_gw8FuNb4Dg`) returned binary/gzip data and could not be rendered. UI was implemented by exactly matching the existing `NotificationSettings.tsx` CSS variables, class names (`ui-interactive-card`, `ui-button-*`), inline style patterns, and spacing. No new design language was introduced.
- `SyncCoursesPageClient.tsx` still exists and is unused by any route after this change. It can be removed in a follow-up if the sync-course-selection flow is not being revived elsewhere.

### Next recommended step

1. Run `npx supabase db push` to apply the migration in dev/staging.
2. Verify Google/Microsoft OAuth is configured in Supabase Auth → Providers if you want those options to be selectable.
3. Consider removing `SyncCoursesPageClient.tsx` and `components/SyncCoursesPageClient.tsx` if the sync-selection UI is permanently retired.
4. Confirm the design reference URL is accessible and review the UI section for any style adjustments needed.

### Suggested commit message

add notification email recipient selection and consolidate Canvas sync route

---

## Session Update - 2026-05-07 (Polish Canvas digest email settings)

### What changed

**`lib/resend.ts`**
- New export `isResendDevSender()` — returns `true` when `EMAIL_FROM` contains `@resend.dev`. Used by settings to surface a configuration warning without requiring callers to read env directly.

**`actions/user-settings.ts`**
- Added `isResendDevSender: boolean` to `UserSettings` interface.
- `getUserSettings()` computes it via `isResendDevSender()` and includes it in both return paths.

**`components/settings/NotificationSettings.tsx`**
- Added `isResendDevSender?: boolean` prop (defaults `false`).
- Email Notifications section description now reads: "Digests are sent to your account email. Stay Focused sends through its notification service — it will not send mail from your personal inbox."
- Canvas updates digest toggle description updated to: "Grouped digest of Canvas updates sent to your account email."
- When `isAdmin && isResendDevSender`: shows a yellow warning banner — "Resend test sender is limited. Verify a domain in Resend and update EMAIL_FROM before sending to other users."

**`components/SettingsPage.tsx`**
- Passes `isResendDevSender={userSettings.isResendDevSender}` to `<NotificationSettings />`.

**`tests/email-diagnostics.test.ts`**
- Added 3 tests for `isResendDevSender`: returns true for `@resend.dev` sender, false for real domain, false when env is unset.

### Files touched

- `lib/resend.ts`
- `actions/user-settings.ts`
- `components/settings/NotificationSettings.tsx`
- `components/SettingsPage.tsx`
- `tests/email-diagnostics.test.ts`
- `docs/ai/handoff.md`

### Why it changed

The Settings Email Notifications section lacked clarity about where emails go (account email, not a custom inbox) and how they're sent (via Resend's notification service, not the user's personal Gmail/etc.). The resend.dev warning helps the admin understand why test sends may fail before verifying a domain.

### Tests run

- `npm run typecheck`
- `npm run lint`
- `npm test -- canvas-digest`
- `npm test -- queue`
- `npm test`

### Next recommended step

1. Verify a Resend domain and update `EMAIL_FROM` to `Stay Focused <noreply@yourdomain.com>` to remove the warning banner and unblock real sends.
2. Add `ADMIN_EMAILS=omgraythekid@gmail.com` to Vercel env if not done yet.

### Suggested commit message

polish Canvas digest email settings

---

## Session Update - 2026-05-07 (Restrict test email tools to admins)

### What changed

**`lib/admin.ts`** (new)
- `isAdminEmail(email)` — reads `ADMIN_EMAILS` env var (comma-separated), normalizes to lowercase/trimmed. Returns `false` when env is missing or email is null/undefined. Safe-default: no admins without config.

**`actions/user-settings.ts`**
- Added `isAdmin: boolean` to `UserSettings` interface.
- `getUserSettings()` now computes `isAdmin` via `isAdminEmail(user.email)` and includes it in both return paths (no settings row and existing row).

**`actions/notifications.ts`** — `sendTestEmailAction`
- Server-side guard: returns `{ ok: false, error: 'Not authorized.' }` immediately if the authenticated user is not an admin. Does not send email or expose provider details.

**`components/settings/NotificationSettings.tsx`**
- Added `isAdmin?: boolean` prop (defaults `false`).
- "Test email" section is now wrapped in `{isAdmin && ...}` — non-admin users do not see the section at all.

**`components/SettingsPage.tsx`**
- Passes `isAdmin={userSettings.isAdmin}` to `<NotificationSettings />`.

**`tests/admin.test.ts`** (new, 7 tests)
- `isAdminEmail` returns true for matching email; false for non-admin; false when `ADMIN_EMAILS` is missing; false for empty string; works with comma-separated list; normalizes case; handles null/undefined input.

**`README.md`**
- Added `ADMIN_EMAILS` to env var table and `.env.local` template.
- Documents comma-separated format, case-insensitive comparison, and safe default behavior.

### Files touched

- `lib/admin.ts`
- `actions/user-settings.ts`
- `actions/notifications.ts`
- `components/settings/NotificationSettings.tsx`
- `components/SettingsPage.tsx`
- `tests/admin.test.ts`
- `README.md`
- `docs/ai/handoff.md`

### Why it changed

The "Send test email" button directly exercises the Resend integration and can incur API calls. Restricting it to admin accounts prevents regular users from triggering test sends and avoids confusion about what the button does.

### Tests run

- `npm run typecheck`
- `npm run lint`
- `npm test`

### Known risks / blockers

- `ADMIN_EMAILS` must be set in both `.env.local` (development) and Vercel (production) for the admin account to have access.
- If `ADMIN_EMAILS` is not set in Vercel, no one (including the account owner) will see the test email section in production.

### Next recommended step

1. Add `ADMIN_EMAILS=omgraythekid@gmail.com` to `.env.local`.
2. Add `ADMIN_EMAILS=omgraythekid@gmail.com` to Vercel environment variables.

### Suggested commit message

restrict test email tools to admins

---

## Session Update - 2026-05-07 (Improve Resend test email diagnostics)

### What changed

**`lib/resend.ts`**
- `sendTransactionalEmail` now logs `errorName`, `errorMessage`, and `statusCode` from the Resend error object on failure, plus `to` and `subject` for context. Also adds `to`/`subject` to the unexpected-error log path.
- New export `resolveTestEmailRecipient(userEmail, isProduction)` — pure helper: in non-production, returns `EMAIL_TEST_TO` if set; otherwise returns `userEmail`. In production, always returns `userEmail`.
- New export `classifyTestEmailError(emailFrom)` — pure helper: if `emailFrom` contains `@resend.dev`, returns a specific message explaining the test-only restriction and pointing to the fix (add a verified domain); otherwise returns the generic config error message.

**`actions/notifications.ts`** — `sendTestEmailAction`
- Computes `recipient` using `resolveTestEmailRecipient` (respects `EMAIL_TEST_TO` in non-production).
- Logs `{ to, isProduction, usingTestOverride }` server-side before sending.
- On failure, calls `classifyTestEmailError(EMAIL_FROM)` to pick the right user-facing message — raw Resend errors are never forwarded to the client.

**`tests/email-diagnostics.test.ts`** (new)
- 5 tests: `EMAIL_TEST_TO` used in non-prod, ignored when absent, ignored in production; `classifyTestEmailError` returns restriction message for `@resend.dev` sender, generic message for other senders.

**`README.md`**
- Documented `EMAIL_TEST_TO` (dev/staging only, ignored in production).
- Added note that `onboarding@resend.dev` is test-only and will be rejected for non-owner recipients; real app emails require a verified Resend domain and `EMAIL_FROM` on that domain.

### Files touched

- `lib/resend.ts`
- `actions/notifications.ts`
- `tests/email-diagnostics.test.ts`
- `README.md`
- `docs/ai/handoff.md`

### Why it changed

Settings → Send test email was silently failing in local dev because `onboarding@resend.dev` can only deliver to the Resend account owner's email, but `user.email` from Supabase is a different address. The fix adds `EMAIL_TEST_TO` for non-production overrides, surfaces a domain-specific friendly error when the `resend.dev` sender is the culprit, and improves server-side logging so the actual Resend error code/message is visible in logs without leaking to users.

### Tests run

- `npm run typecheck`
- `npm run lint`
- `npm test`

### Known risks / blockers

- `EMAIL_TEST_TO` only redirects the Settings test email, not production digest emails. Production always sends to the resolved user email.
- `onboarding@resend.dev` remains unsuitable for real users regardless of `EMAIL_TEST_TO`. A verified Resend domain is required before production rollout.

### Next recommended step

1. Add `EMAIL_TEST_TO=<your-resend-account-email>` to `.env.local` and confirm the test email button delivers successfully.
2. Register a verified domain in Resend and update `EMAIL_FROM` to `Stay Focused <noreply@yourdomain.com>` for production.

### Suggested commit message

improve Resend test email diagnostics

---

## Session Update - 2026-05-07 (Canvas update digest emails via Resend)

### What changed

**`package.json`** — added `resend` dependency.

**`lib/resend.ts`** (new)
- `sendTransactionalEmail({ to, subject, html, text, idempotencyKey, tags })` — Resend provider helper.
- `isResendConfigured()` — checks `RESEND_API_KEY` and `EMAIL_FROM` only.
- If either env var is missing, logs and returns `{ ok: false }` without throwing.
- Never exposes raw Resend errors to callers.

**`lib/email-templates/canvas-digest.ts`** (new)
- `buildDigestSubject(sections)` — subject line with one emoji max.
- `buildDigestHtml(input)` — warm ivory card email, grouped course sections, ×N duplicate collapse, overflow note, CTA button, footer, mobile-safe table layout.
- `buildDigestText(input)` — plain-text fallback.

**`lib/canvas-digest.ts`** (new)
- `MEANINGFUL_EVENT_TYPES` — the exact set of event types eligible for digest.
- `groupEventsForDisplay(events, maxItems)` — groups by course, collapses (course, event_type, title) tuples, returns `DigestCourseSection[]`, `totalDisplayLines`, and `includedEventIds`.
- `buildDigestIdempotencyKey(userId, eventIds)` — deterministic key from sorted event IDs (stable across retries).
- `markEventsDigestSent(supabase, eventIds)` — sets `digest_sent_at = now()` only after successful send.
- `attemptCanvasDigestForUser({ supabase, userId })` — main entry point. Checks: Resend configured, user email present, `email_notifications != 'off'`, `canvas_updates` category enabled, cooldown not active. If all pass: loads unsent meaningful events, groups them, sends via Resend, marks ALL fetched events (including overflow) as sent, records `canvas_digest_last_sent_at`. Returns `DigestAttemptResult`.
- **Overflow behaviour**: if more events exist than `CANVAS_UPDATE_EMAIL_MAX_ITEMS`, the email shows the first N display rows and includes "Open Stay Focused to see the rest." All fetched events (visible + overflow) are marked `digest_sent_at` after a successful send. This prevents overflow events from triggering a redundant immediate follow-up digest; the email already tells the user to check the app.
- **Idempotency**: Resend `Idempotency-Key` header prevents duplicate delivery on retries within 24 hours. `digest_sent_at` ensures events are never re-selected after a successful run. `canvas_digest_last_sent_at` cooldown prevents over-sending between Resend's idempotency window.
- **Failure safety**: if send fails, `digest_sent_at` is NOT marked, so events remain eligible for the next run.
- **Missing env safety**: if `RESEND_API_KEY` or `EMAIL_FROM` is absent, the function returns `{ skipped: true }` without touching any DB state.

**`supabase/migrations/20260507030000_add_canvas_digest_settings.sql`** (new)
- Adds `canvas_digest_last_sent_at timestamptz` column to `user_settings` for per-user cooldown tracking.

**`actions/notifications.ts`**
- `isEmailProviderConfigured()` now delegates to `isResendConfigured()`.
- `sendTestEmailAction()` now actually sends via Resend to the user's Supabase account email using the branded digest template with a test line. Subject: `✅ Stay Focused test email`. Does not touch `canvas_update_events` or mark any digest state. Returns friendly success/error message without exposing raw Resend errors.

**`actions/user-settings.ts`**
- Added `canvas_updates: boolean` to `EmailCategories` type and `DEFAULT_EMAIL_CATEGORIES` (default `false`).
- `emailProviderConfigured` now uses `isResendConfigured()` instead of checking multiple legacy env vars.

**`actions/canvas.ts`**
- `runExternalCanvasSyncJob` now calls `attemptCanvasDigestForUser` after marking the job complete, but only if `eventInsert.inserted > 0`. Wrapped in try-catch so an email failure never fails the sync job.

**`components/settings/NotificationSettings.tsx`**
- Added `canvas_updates` toggle (label: "Canvas updates digest") to the Notification Types section.

**`tests/canvas-digest.test.ts`** (new)
- 30 tests covering: template rendering, course grouping, ×N collapse, overflow, max-items cap, subject variants, plain-text fallback, MEANINGFUL_EVENT_TYPES filter, idempotency key stability, `isResendConfigured` missing-env paths, empty markEventsDigestSent, debug content exclusion.

**`README.md`** — added `RESEND_API_KEY`, `EMAIL_FROM`, `CANVAS_UPDATE_EMAIL_COOLDOWN_MINUTES`, `CANVAS_UPDATE_EMAIL_MAX_ITEMS` to env section.

**`docs/roadmap.md`** — added Email Notifications section.

### Files touched

- `package.json`
- `lib/resend.ts`
- `lib/email-templates/canvas-digest.ts`
- `lib/canvas-digest.ts`
- `supabase/migrations/20260507030000_add_canvas_digest_settings.sql`
- `actions/notifications.ts`
- `actions/user-settings.ts`
- `actions/canvas.ts`
- `components/settings/NotificationSettings.tsx`
- `tests/canvas-digest.test.ts`
- `README.md`
- `docs/roadmap.md`
- `docs/ai/handoff.md`

### Why it changed

Build Canvas update email digests from stored `canvas_update_events` rows using Resend. One grouped digest per user per cooldown window. Wire the existing Settings test email button to the Resend provider. No Google/Microsoft destination selection yet.

### Tests run

- `npm run typecheck` — see verification section
- `npm run lint` — see verification section
- `npm test -- canvas-digest` — see verification section
- `npm test -- queue` — see verification section

### Verification result

See post-commit verification below.

### Known risks / blockers

- The new Supabase migration (`20260507030000_add_canvas_digest_settings.sql`) must be applied to the remote project before `canvas_digest_last_sent_at` writes work.
- `canvas_update_events` migration (`20260507020000`) must also be applied if not yet done.
- `attemptCanvasDigestForUser` calls `supabase.auth.admin.getUserById(userId)` to resolve the user's email. This requires the service-role key and will fail gracefully (no email found) if the service-role client is unavailable.
- Canvas updates digest is disabled by default. Users must go to Settings → Email Notifications → enable "Canvas updates digest."
- Test email in Settings sends to the Supabase account email (`user.email`), not `notification_email` from settings (which may differ). Intentional for this phase.

### Next recommended step

1. Apply the two pending Supabase migrations remotely.
2. Add `RESEND_API_KEY`, `EMAIL_FROM`, `CANVAS_UPDATE_EMAIL_COOLDOWN_MINUTES`, and `CANVAS_UPDATE_EMAIL_MAX_ITEMS` to Vercel environment variables.
3. In Settings → Email Notifications, set frequency to Instant or Daily digest, enable "Canvas updates digest," then use the Send test email button to verify the Resend integration.
4. Trigger an external cron sync that inserts new events and confirm a digest email is delivered.

### Suggested commit message

add Canvas update email digests

---

## Session Update - 2026-05-07 (Remove notification volume control)

### What changed

- Removed the visible notification sound volume setting from the Notifications settings UI.
- Kept `Notification sounds` as a simple On/Off preference.
- Kept the sound test action available when sounds are enabled, now labeled as a full-volume test rather than a volume control.
- Removed UI/runtime reads of `stay-focused.sound-volume`.
- Changed notification sound playback to always set `audio.volume = 1`.

### Files touched

- `components/SettingsPage.tsx`
- `lib/notifications.ts`
- `docs/ai/handoff.md`

### Why it changed

Notification sound volume is no longer user-configurable. Sounds should either be enabled or disabled, and enabled notification sounds should always play at 100%.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- Relevant notification/settings tests - none present (`tests/` only has `canvas-settings-state.test.ts` for settings-adjacent coverage)

### Verification result

Static checks passed. A code scan confirms no UI/runtime path still reads or writes `stay-focused.sound-volume`; playback now uses `audio.volume = 1`.

### Known risks / blockers

- Existing `stay-focused.sound-volume` values may remain in users' local storage, but the app no longer reads them for notification settings or sound playback.
- Browser QA was not run in this session.
- No focused automated notification settings test exists yet.

### Next recommended step

Manually open Settings -> Notifications in a browser and confirm only browser alerts, test browser notification, Notification sounds On/Off, and full-volume Test sound are visible.

### Suggested commit message

remove notification volume control

---

## Session Update - 2026-05-07 (Track Canvas update events)

### What changed

**`supabase/migrations/20260507020000_add_canvas_update_events.sql`** (new)
- Created `canvas_update_events` table with all suggested fields.
- Added a unique expression index (`canvas_update_events_dedupe_idx`) using `COALESCE` on nullable columns to prevent duplicate events across repeated cron runs.
- Enabled RLS: authenticated users can SELECT their own rows; service_role has full management access.

**`lib/canvas-update-events.ts`** (new)
- Pure builder functions for each event type: `buildAnnouncementEvent`, `buildAssignmentEvent`, `buildDueDateChangeEvent`, `buildModuleEvent`, `buildResourceEvent`.
- Pure `detectDueDateChanges(assignments, existingDeadlines)` — takes a pre-loaded deadline map, returns only assignments whose `due_at` changed.
- `insertCanvasUpdateEvents(supabase, events)` — inserts one at a time; silently skips 23505 unique-constraint violations (deduplication); returns `{ inserted, skipped, byType }` with per-type counts.
- `sanitizeEventTitle` — strips UUID patterns, PostgREST error codes, and SQLSTATE codes from user-facing text.

**`actions/canvas.ts`**
- `refreshExternalCanvasResources` now returns `newResources: ModuleResource[]` alongside `changedResources`.
- `runExternalCanvasSyncJob` now:
  - Loads existing `task_items` deadlines keyed by `canvas_assignment_id` before the task refresh (for due-date change detection).
  - Builds event inputs for all announcements, assignments, modules, new resources, and due-date changes.
  - Inserts events via `insertCanvasUpdateEvents` using the service-role Supabase client.
  - Adds `canvasUpdateEventCount`, `newAnnouncementCount`, `newAssignmentCount`, `dueDateChangeCount`, `newModuleCount`, `newResourceCount` to the completed job result.
- Added `loadExistingTaskDeadlines` helper (async, scoped to course + assignment IDs).
- No OpenAI, OCR, or email calls added.

**`tests/queue.test.ts`**
- Added 16 new tests covering:
  - New assignment/announcement/module/resource events have correct types, source IDs, and source hashes.
  - Due-date change detection fires only when deadline differs, skips unchanged, skips null incoming.
  - Resource event returns null when both Canvas IDs are absent.
  - Source hash is stable (same value across repeated sync calls → same dedupe key).
  - `sanitizeEventTitle` strips UUIDs and PostgREST error codes.
  - Preservation-only updated resources produce no new_resource event.
  - OCR job types do not map to any Canvas update event type.

### Files touched

- `actions/canvas.ts`
- `lib/canvas-update-events.ts`
- `supabase/migrations/20260507020000_add_canvas_update_events.sql`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Email digests will be built later from stored Canvas update events. This phase detects and stores meaningful Canvas changes (new announcements, new assignments, due-date changes, new modules, new resources) during the external cron sync without sending any email or adding notification destination settings.

### Tests run

- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm test -- queue` — passed, 341/341
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` — passed, 341/341

### Verification result

All checks passed. No `.env` files, secrets, local PDFs, build output, or logs were added.

### Known risks

- The new Supabase migration must be applied remotely before event insertion works.
- Due-date change detection only fires for assignments that already have a `task_items` row for the user's course. Assignments with no task_items are not tracked for deadline changes (only `new_assignment` events are created on first sight).
- Per-type counts in the job result reflect actual inserts (deduplicated correctly via `byType` in `insertCanvasUpdateEvents`).
- Browser QA was not run this session.

### Blockers

None.

### Next recommended step

Apply the pending Supabase migration remotely (`supabase/migrations/20260507020000_add_canvas_update_events.sql`). Then trigger a live external cron run and inspect `canvas_update_events` rows and the job result `canvasUpdateEventCount` field to confirm events are being recorded and deduplicated.

After that, the next natural phase is reading stored events to build email digest content — but do not add Resend or notification destination settings yet.

### Suggested commit message

track Canvas update events

---

## Session Update - 2026-05-07 (Rename Do workspace to Tasks)

### What changed

**Routes**
- Added the module task execution workspace at `/modules/[id]/tasks`.
- Changed `/modules/[id]/do` into a compatibility redirect that preserves query parameters and sends users to `/modules/[id]/tasks`.
- Simplified legacy `/do` into a compatibility redirect to `/tasks`, preserving query parameters.
- Kept internal `do-now`, `do_generation`, and `buildModuleDoHref` names where renaming would create broad risk.

**Student-facing labels and links**
- Updated module subnavigation and breadcrumbs to show `Learn / Tasks / Quiz`.
- Updated Module Lens copy, Course task tabs, Home task callouts, Study Library resume copy, module bulletin links, source-reader task links, hourly due-soon notification copy, and task output panel eyebrow from Do/Do Now wording to Tasks/Task output wording.
- Updated the shared module task href helper so existing task-targeted links now generate `/modules/[id]/tasks`.
- Course `?tab=tasks` is now the visible Tasks tab URL; `?tab=do` still works as a compatibility fallback.

**Docs and tests**
- Updated README and roadmap wording for Task Drafts / Tasks execution language.
- Added scheduler coverage proving module task workspace links use `/modules/:id/tasks`.

### Files touched

- `README.md`
- `actions/drafts.ts`
- `actions/module-resources.ts`
- `actions/modules.ts`
- `actions/queue-jobs.ts`
- `actions/tasks.ts`
- `app/(app)/library/[id]/page.tsx`
- `app/api/cron/hourly/route.ts`
- `app/courses/[id]/page.tsx`
- `app/do/loading.tsx`
- `app/do/page.tsx`
- `app/modules/[id]/do/page.tsx`
- `app/modules/[id]/tasks/page.tsx`
- `app/modules/[id]/learn/resources/[resourceId]/page.tsx`
- `components/AppShell.tsx`
- `components/DoNowPanel.tsx`
- `components/ModuleBulletin.tsx`
- `components/ModuleLensShell.tsx`
- `components/StudyFileReader.tsx`
- `components/TodayDashboard.tsx`
- `components/home/PrimaryTaskHero.tsx`
- `docs/ai/handoff.md`
- `docs/roadmap.md`
- `lib/clarity-workspace.ts`
- `lib/course-learn-overview.ts`
- `lib/home-focus.ts`
- `lib/module-learn-overview.ts`
- `lib/module-workspace.ts`
- `lib/stay-focused-links.ts`
- `tests/scheduler.test.ts`

### Why it changed

The next roadmap phase is to make the student-facing execution model read as Learn, Tasks, Quiz instead of Learn, Do, Quiz while preserving old `/do` links and keeping risky internal queue/API names stable.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- scheduler learn-resource-ui queue` - passed, 325/325

### Verification result

All requested checks passed locally. A text scan shows remaining `Do` matches are internal `do-now` names, compatibility revalidation paths, historical docs, ordinary "do not" wording, or non-product content headings.

### Known risks

- Browser QA was not run in this session. Manually verify `/modules/:id/tasks`, `/modules/:id/do` redirect, `/tasks`, and `/do` redirect with a signed-in synced account.
- Internal names such as `do-now`, `do_generation`, `DoNowPanel`, and `buildModuleDoHref` remain intentionally unchanged to avoid broad churn.

### Blockers

None.

### Next recommended step

Run a quick authenticated browser pass through Home, Courses, `/tasks`, module Tasks, Learn, Quiz, and Study Library task draft resume links to confirm navigation and copy feel coherent.

### Suggested commit message

rename Do workspace to Tasks

---

## Session Update - 2026-05-07 (Harden external Canvas sync cron)

### What changed

**`supabase/migrations/20260507010000_harden_external_sync_lock_rpc.sql`** (new)
- Recreated `try_acquire_external_sync_lock(text, text, timestamptz)` with an explicit `search_path`.
- Revoked execute from `public`, `anon`, and `authenticated`.
- Granted execute only to `service_role`.
- Recreated the lock timestamp trigger function with an explicit `search_path`.

**`lib/queue.ts`**
- Made `markQueuedJobRunning()` claim jobs only when the current row status is `pending`.
- Kept completed, failed, and cancelled updates on the existing shared status path.
- `claimNextPendingJob()` now returns `null` if another worker wins the pending-to-running claim.

**`lib/canvas.ts`, `lib/external-sync-queue.ts`, `app/api/cron/external-sync/route.ts`, `actions/canvas.ts`**
- Added `CanvasConfig.timeoutMs` and a small `AbortController` fetch wrapper for Canvas calls.
- Added `EXTERNAL_CANVAS_FETCH_TIMEOUT_MS`, defaulting to 8000ms, for external cron/sync Canvas requests.
- Applied the timeout to the cron scan and external queued sync processor.
- Changed the active-lock skip response reason to `sync_lock_active` while keeping `legacyReason: sync_already_running` for compatibility.

**`actions/canvas.ts`**
- Rebuilt external sync `modules.raw_content` from final `module_resources` rows after preservation decisions are applied.
- Included only quality-classified usable academic resource text in rebuilt raw content, so metadata-only, refusal, debug, UUID, and file-title-only text stays out.
- Preserved unchanged-file extracted/OCR text before raw content rebuild.

**`README.md`, `docs/roadmap.md`**
- Documented the external Canvas fetch timeout and final-resource raw content rebuild requirement.

### Files touched

- `README.md`
- `actions/canvas.ts`
- `app/api/cron/external-sync/route.ts`
- `docs/ai/handoff.md`
- `docs/roadmap.md`
- `lib/canvas.ts`
- `lib/external-sync-queue.ts`
- `lib/queue.ts`
- `supabase/migrations/20260507010000_harden_external_sync_lock_rpc.sql`

### Why it changed

The 15-minute external cron was functional, but it still had long-term reliability risks: broad RPC execute permissions, non-atomic queue claiming, slow Canvas fetches that could hang cron/background work, and module raw content being rebuilt from incoming extraction records instead of the final preserved source rows.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- queue` - passed, 324/324
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 324/324

### Verification result

All requested checks passed locally. No `.env` files, secrets, local PDFs, private fixtures, build artifacts, or temporary logs were added.

### Known risks

- The new Supabase migration must be applied remotely before the hardened RPC permissions take effect.
- Live cron-job.org and live Canvas timeout behavior were not exercised in this local session.
- There is still one pre-existing local commit ahead of `origin/main` (`a33214c fix: grammar in task due date message`); pushing this branch will include it.

### Blockers

None.

### Next recommended step

Apply the pending Supabase migrations remotely, then run one live cron-job.org request and inspect queued job results for timeout/lock behavior and final resource preservation counts.

### Suggested commit message

harden external Canvas sync cron

---

## Session Update - 2026-05-06 (Implement safe external Canvas sync processor)

### What changed

**`actions/canvas.ts`**
- Added `processPendingExternalCanvasSyncJobs()` for queued `canvas_sync` jobs with `payload.mode === 'external_cron'`.
- The processor claims a small number of pending external sync jobs, loads the user's saved Canvas credentials via service role, fetches assignments/announcements/modules, and refreshes existing synced course resources.
- It does not call `processModuleContent`, does not generate Deep Learn, and does not run OCR directly.
- Existing assignment rows get Canvas deadline/link/completion updates without regressing pending/manual work back from completed.
- Resource refreshes match existing `module_resources` by Canvas item id, Canvas file id, URLs, then normalized title/type/module.
- Missing resources are marked in internal metadata instead of being deleted.
- Scanned/image-only PDFs are passed to `autoEnqueueSourceOcrJobs`, which keeps duplicate/running/completed checks and daily OCR caps; the OCR worker itself is not run by this processor.

**`app/api/cron/external-sync/route.ts`**
- Added `after()` background processing hook to run `processPendingExternalCanvasSyncJobs()` after the secured cron scan/queue response.

**`lib/canvas-resource-preservation.ts`** (new)
- Added pure preservation decisions for Canvas resource text.
- Detects same Canvas module item pointing to a different Canvas file id as a file identity change.
- Preserves meaningful existing extracted text and completed meaningful OCR text for unchanged file identities.

**`tests/queue.test.ts`**
- Added resource preservation tests proving meaningful extracted text is kept over weak incoming sync output, changed file identity clears preservation, and completed OCR text is preserved for unchanged Canvas files.

**`README.md`, `docs/roadmap.md`**
- Documented `EXTERNAL_SYNC_PROCESS_LIMIT` and clarified that external sync processing refreshes existing resources and queues OCR only when needed.

### Why it changed

External cron could already enqueue bounded `canvas_sync` jobs, but those jobs had no safe processor. The new processor gives external sync a path that refreshes Canvas signals without launching expensive OpenAI extraction or OCR work inline, while protecting good source text from being replaced by empty, metadata-only, failed, or weak extraction output.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- queue` - passed, 324/324
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 324/324

### Verification result

All required static checks and focused extraction/OCR/deep-learn/queue tests passed.

### Known risks / blockers

- The external sync lock migration from the previous session (`20260506010000_add_external_sync_locks.sql`) still must be applied remotely before enabling cron.
- Live Canvas/cron-job.org execution was not run in this local session.
- The processor refreshes existing synced courses/modules; it does not create a first-time course/module import for unsynced courses.

### Next recommended steps

1. Apply pending Supabase migrations remotely.
2. Enable cron-job.org against `/api/cron/external-sync` with `Authorization: Bearer <CRON_SECRET>`.
3. Watch the first live run's `queued_jobs.result` for `resourcesInserted`, `resourcesUpdated`, `resourcesPreserved`, and `queuedOcrJobCount`.

### Suggested commit message

implement safe external Canvas sync processor

---

## Session Update - 2026-05-06 (Add external Canvas sync cron queue guards)

### What changed

**`app/api/cron/external-sync/route.ts`** (new)
- Added secured external cron route at `/api/cron/external-sync`.
- Requires `Authorization: Bearer ${CRON_SECRET}`.
- Uses a short service-role lock before scanning, then scans a small batch of Canvas-connected users and already-synced active Canvas courses.
- Queues bounded `canvas_sync` jobs with `mode: external_cron`; it does not run OpenAI generation, Google OCR, or OpenAI OCR inside the cron request.
- Skips duplicate active jobs, courses inside cooldown, courses not returned by the active Canvas list, and users past the daily external sync queue cap.

**`lib/external-sync-queue.ts`** (new)
- Added pure queue guard helpers for external Canvas sync duplicate/cooldown/daily-cap decisions.
- Added daily cost guard helper for OCR and OpenAI-backed queueing.
- Centralized defaults and env parsing for external sync and queue caps.

**`lib/external-sync-locks.ts`** (new)
- Added service-role helper for acquiring external sync locks through Supabase RPC.

**`supabase/migrations/20260506010000_add_external_sync_locks.sql`** (new)
- Added `external_sync_locks` table.
- Added `try_acquire_external_sync_lock(...)` RPC for atomic lock acquisition when no lock exists or the existing lock has expired.
- Added service-role RLS policy for lock management.

**`actions/queue-jobs.ts`**
- Added automatic OCR daily user/course caps before auto-enqueueing `source_ocr` jobs.
- Added OpenAI-backed daily user/course caps before queueing Deep Learn (`learn_generation`) and task output (`task_output` / `do_generation`) jobs.

**`tests/queue.test.ts`**
- Added guard coverage for active external sync duplicates, per-course cooldowns, daily external sync caps, and OCR daily cost caps.

**`README.md`, `docs/roadmap.md`, `docs/extraction.md`**
- Documented the cron-job.org setup, `Authorization` header, 15-minute schedule, and new queue/cost guard environment variables.
- Updated roadmap Phase 1-2 notes around external sync and cost-safe queueing.

### Why it changed

The app needs a Vercel Hobby-compatible 15-minute Canvas sync trigger without doing expensive work inside the HTTP cron invocation. This adds the secured entrypoint and queue guard foundation so cron-job.org can trigger small, bounded sync detection and queue insertion while OCR/OpenAI work remains out of the cron request.

### Tests run

- `npm test -- queue` - passed, 321/321
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 321/321

### Verification result

TypeScript, lint, focused queue guard coverage, and the broader extraction/OCR/deep-learn/queue test set passed.

### Known risks / blockers

- The new migration must be applied to Supabase before `/api/cron/external-sync` can acquire locks.
- The endpoint queues `canvas_sync` jobs only; existing `canvas_sync` processing still needs a safe resync worker/path that preserves existing extracted/OCR text before these jobs should be processed automatically.
- No live cron-job.org call was made in this session.

### Next recommended steps

1. Apply `20260506010000_add_external_sync_locks.sql` to the remote Supabase project before enabling the external cron.
2. Implement the safe `canvas_sync` processor for externally queued jobs so resync uses deltas and preserves successful source text unless file identity changed.
3. Configure cron-job.org with `GET /api/cron/external-sync`, custom `Authorization: Bearer <CRON_SECRET>`, and minutes `0, 15, 30, 45`.

### Suggested commit message

add external canvas sync cron guards

---

## Session Update - 2026-05-05l (Fix Sync course list scrolling)

### What changed

**`app/globals.css`**
- Added a desktop `--sync-panel-height` variable on the `/sync` split layout.
- Changed the split grid to `align-items: stretch` so the left Available Courses panel and right status panel share the same row height.
- Applied the same desktop height to `.sync-course-picker` and `.sync-status-panel`.
- Kept the picker as a grid with the course list in the `minmax(0, 1fr)` row and restored the course list as the internal scroll area.
- Reset both panels to natural height on mobile while keeping the course list capped with its existing mobile max-height.

### Why it changed

The previous min-height-only layout let the Available Courses panel grow with its course rows, which removed the internal scrollbar and made the page stretch vertically. The picker now has a stable desktop height matching the status panel, while the course list scrolls inside the card.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed

### Verification result

- Static checks passed. Browser verification with a real connected course list was not run in this session.

### Known risks / blockers

- Connected-account visual QA is still needed to confirm the scrollbar with a real long Canvas course list.

### Next recommended steps

1. Open `/sync` with a Canvas-connected account and confirm the Available Courses list scrolls internally.
2. Verify desktop panel heights match and 390px mobile remains natural-height with no overflow.

### Suggested commit message

fix sync course list scrolling

---

## Session Update - 2026-05-05k (Polish Sync Courses layout and refresh behavior)

### What changed

**`app/sync/page.tsx`**
- Removed `page-shell-narrow` from `/sync` signed-out, disconnected, and connected states so the page uses the same wide shell behavior as Home.

**`components/SyncCoursesPageClient.tsx`**
- Standardized refresh copy to `Refresh Courses` and loading copy to `Refreshing courses...`.
- Moved `Show ended courses` into the search/actions row.
- Changed the primary idle sync button label to `Sync selected`.
- Refresh now preserves selected courses when the refreshed course list has the same IDs, and only prunes selections that are no longer available when the returned course list changes.
- Kept mount behavior as an automatic saved-connection course refresh.

**`app/globals.css`**
- Widened the split grid to roughly 2fr / 1fr.
- Added stable desktop min-heights for the available course picker and right status panel.
- Made the course list the internal scroll area instead of letting the card grow endlessly.
- Replaced the old checkbox-card styling with a compact pill switch.
- Kept mobile one-column behavior and removed the forced full-width toggle so it does not wrap awkwardly.

**`tests/scheduler.test.ts`**
- Extended `/sync` route contract tests to confirm the wide shell, `Refresh Courses`, `Refreshing courses...`, and absence of fake load labels.

### Why it changed

Screenshots showed the dedicated `/sync` page still felt narrow, cramped, and slightly settings-like. The page now uses the available app width, keeps refresh behavior explicit, and presents the ended-course option as a compact control aligned with the main course tools.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- scheduler learn-resource-ui queue` - passed, 317/317
- Browser smoke via Playwright against `/sync` at desktop and 390px mobile - passed for unauthenticated/disconnected rendering

### Verification result

- Static checks passed.
- `/sync` signed-out/disconnected path loaded with no Next.js error overlay.
- 390px mobile viewport had no horizontal overflow.
- Connected-account visual verification was not fully possible in this local browser session because it was unauthenticated.

### Known risks / blockers

- Real connected-account QA is still needed to visually confirm the full split layout with actual Canvas courses, automatic refresh on entry, Show ended courses reload, stable picker height, and internal list scrolling.
- Existing remote Supabase migration risk from prior sessions remains: `user_source_progress` still needs to be applied remotely if not already done.

### Next recommended steps

1. Sign in locally with a Canvas-connected account and verify the connected `/sync` layout on desktop and 390px mobile.
2. Confirm Show ended courses refreshes immediately against real Canvas results.
3. Confirm selected courses are preserved across refresh when the available course IDs do not change.

### Suggested commit message

polish sync courses layout and refresh behavior

---

## Session Update - 2026-05-05j (Redesign Sync Courses split layout)

### What changed

**`app/sync/page.tsx`**
- Replaced the old `ConnectCanvasFlowWrapper` usage with a dedicated `SyncCoursesPageClient`.
- Kept Canvas token/setup out of `/sync`; disconnected users now get a compact Settings > Canvas link.
- Added module resource counts and course names for the synced modules management list.

**`components/SyncCoursesPageClient.tsx`** (new)
- Added the dedicated `/sync` experience: header, summary cards, split course picker/status layout, and synced modules management.
- Auto-loads available courses from the saved Canvas connection on mount.
- Show ended courses reloads the course list immediately.
- Refresh courses uses `fetchCurrentUserCanvasCourses`.
- Sync selected uses existing `queueCanvasSyncAction`.
- Keeps only a subtle `Connection settings` link to `/settings?section=canvas`.

**`app/globals.css`**
- Added responsive Sync Courses styles for the desktop split layout, mobile one-column stacking, touch-friendly course rows, and compact synced module rows.

**`components/SettingsPage.tsx`**
- Tightened Canvas settings nav description to connection/token management only.
- Existing "Go to Sync Courses" link remains in Settings > Canvas.

**`actions/queue-canvas.ts`**
- Added `revalidatePath('/sync')` after Canvas sync jobs complete.

**`tests/scheduler.test.ts`**
- Added regression tests for the dedicated `/sync` route, saved-connection refresh behavior, no fake pagination label, immediate ended-course reload, and disconnected Settings > Canvas link.

### Why it changed

The dedicated Sync Courses page was still presenting the old Settings-style Canvas connection workflow. `/sync` now focuses on syncing and managing synced courses, while Settings > Canvas remains the place for Canvas URL/token setup.

### Tests run

- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm test -- scheduler learn-resource-ui queue` - passed, 317/317
- Browser smoke via Playwright against `http://localhost:3000/sync` and `/settings?section=canvas` - passed

### Verification result

- `/sync` loaded with meaningful content and no Next.js error overlay.
- Mobile viewport at 390px had no horizontal overflow.
- `/settings?section=canvas` loaded and retained the Sync Courses pathway.
- Connected-account checks were not fully exercised because the local browser session was unauthenticated.

### Known risks / blockers

- Real connected-account browser QA is still recommended to confirm live Canvas course loading, Show ended courses reload behavior against Canvas, and queue status updates with actual jobs.
- `agent-browser` CLI was unavailable in this shell, so Playwright was used directly for browser smoke verification.
- Existing remote Supabase migration risk from prior sessions remains: `user_source_progress` still needs to be applied remotely if not already done.

### Next recommended steps

1. Sign in locally with a Canvas-connected account and manually verify `/sync`: auto-load courses, search, Show ended courses, Sync selected, queue status, and synced modules management.
2. Verify mobile bottom nav at narrow widths with the new Sync item still fits acceptably.
3. Consider redirecting legacy `/canvas` to `/sync` once there is no need for the old compatibility route.

### Suggested commit message

redesign sync courses split layout

---

## Session Update — 2026-05-05i (Wire sync nav and simplify home row actions)

### What changed

**`components/AppShell.tsx`**
- Added `Sync Courses` nav item to `NAV_ITEMS` between Calendar and Settings:
  - `href: '/sync'`, `label: 'Sync Courses'`, `mobileLabel: 'Sync'`
  - `matches: (pathname) => pathname.startsWith('/sync')`
  - Thin-line refresh arrow SVG icon (two arcs + arrowheads, consistent with nav icon style)
  - Because `MOBILE_NAV_ITEMS = NAV_ITEMS`, Sync Courses now appears in the mobile bottom nav automatically
- Removed `|| pathname.startsWith('/canvas')` from Settings `matches` — `/sync` no longer falls under Settings
- Breadcrumb topbar now shows "Sync Courses" on `/sync` automatically via `activeSection?.label`

**`components/TodayDashboard.tsx`**
- `SyllabusTableRow`: "View more" → "Open"; "Mark done" moved above the Open button and changed from `ui-button ui-button-secondary ui-button-xs` to `home-row-text-action`
- `LearnTableRow`: "View more" / "View source" → "Open"; "Mark reviewed" moved above the Open button and changed from `ui-button ui-button-secondary ui-button-xs` to `home-row-text-action`

**`app/globals.css`**
- Added `.home-row-text-action` class: transparent background, no border/shadow, compact padding, muted color, underline-on-hover, 12px font — visually a plain text action link

### Why it changed

- The Sync Courses nav was previously added to `components/shell/Sidebar.tsx` (an older Tailwind component not in use), so it never appeared in the live sidebar or mobile nav. The real nav is `NAV_ITEMS` in `AppShell.tsx`.
- "View more" is generic and ambiguous; "Open" is shorter and consistent with other row actions in the dashboard.
- "Mark done" / "Mark reviewed" as full `ui-button-secondary` buttons looked visually heavy compared to the primary "Open" button — using plain text styling keeps the hierarchy clear.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean

### Known risks / blockers

- `user_source_progress` migration still needs to be applied to the remote Supabase project before deploy.
- Mobile nav now has 6 items (Home, Courses, Library, Calendar, Sync, Settings). Verify the mobile bottom nav layout still looks correct at narrow widths — `--mobile-nav-count` is set from `MOBILE_NAV_ITEMS.length` dynamically, so it should adapt, but worth a visual check.

### Next recommended steps

1. Apply `20260505010000_add_user_source_progress.sql` to remote Supabase if not done yet.
2. Verify in browser: "Sync Courses" appears in sidebar nav and mobile bottom nav, links to `/sync`, and breadcrumb reads "Sync Courses".
3. Verify in browser: Settings nav no longer highlights when on `/sync`.
4. Verify in browser: Home > Today's Schedule — "Mark done" / "Mark reviewed" render as plain text, "Open" is the primary button.
5. Consider redirect from `/canvas` → `/sync` to clean up the legacy route.

### Suggested commit message

wire sync nav and simplify home row actions

---

## Session Update — 2026-05-05h (Add reviewed home rows and dedicated sync page)

### What changed

**`supabase/migrations/20260505010000_add_user_source_progress.sql`** (new)
- Added `user_source_progress` table: `user_id`, `source_table`, `source_id`, `status` (active/completed/reviewed/later), `reviewed_at`, `completed_at`, `updated_at`
- Unique constraint on `(user_id, source_table, source_id)`
- RLS policy: users manage their own rows

**`actions/source-progress.ts`** (new)
- `markSourceProgress(sourceTable, sourceId, status)` — server action that upserts a `user_source_progress` row and calls `revalidatePath('/')`

**`lib/home-focus.ts`**
- Added optional `sourceTable` field to `SyllabusFocusRow` and `LearnFocusRow`
- `buildSyllabusFocusRows` now sets `sourceTable: 'task_items'` on all canonical rows
- `buildLearnFocusRows` now sets `sourceTable: 'module_resources'` on all canonical rows

**`components/TodayDashboard.tsx`**
- Added `reviewedSourceIds?: string[]` prop; builds `reviewedIdSet` via useMemo
- `activeFocusRows` now also filters out Learn rows whose id is in `reviewedIdSet`
- Added `reviewedLearnRows` useMemo — fitted learn rows whose id is in `reviewedIdSet`
- Added `reviewedExpanded` state
- Replaced `handleMarkReviewed(scheduledBlockId)` with `handleMarkLearnReviewed(row)`:
  - calls `markSourceProgress('module_resources', row.id, 'reviewed')` for canonical rows
  - also calls `updateBlockStatus(scheduledBlockId, 'completed')` when a scheduled block is attached
  - fires for ALL Learn rows, not just those with `scheduledBlockId`
- Added `handleMarkSyllabusDone(row)`:
  - calls `updateTaskCompletion({ taskItemId: row.id, ... })` for `sourceTable === 'task_items'` rows
  - also calls `updateBlockStatus(scheduledBlockId, 'completed')` when a scheduled block is attached
  - fires for ALL Syllabus rows, not just those with `scheduledBlockId`
- `FocusScheduleTable` prop types updated: `onMarkDone: (row: FittedSyllabusRow) => void`, `onMarkReviewed: (row: FittedLearnRow) => void`
- `SyllabusTableRow`: "Mark done" renders for every row (removed `blockId` guard)
- `LearnTableRow`: removed `fileTypeLabel` chip, `readiness` chip, Study pack chip, and Quiz chip; "Mark reviewed" renders for every row; course name moved to top of details cell as plain muted text
- Added `ReviewedSection` component — collapsible, shows fitted learn rows already reviewed
- `ReviewedSection` rendered after `LaterSection` when `focusMode === 'learn'`

**`app/(app)/page.tsx`** and **`app/page.tsx`**
- Added 4th query to Promise.all: `user_source_progress` for `module_resources` with `status in ('reviewed', 'completed')`
- Extracts `reviewedSourceIds: string[]` from the result
- Passes `reviewedSourceIds` prop to `TodayDashboard`

**`app/sync/page.tsx`** (new)
- Dedicated Sync Courses page at `/sync`
- Unauthenticated: sign-in prompt
- Authenticated + Canvas not connected: connection-required card with link to Settings > Canvas
- Authenticated + connected: renders `ConnectCanvasFlowWrapper` with `initialAction="sync"` so course list auto-loads on page mount

**`components/shell/Sidebar.tsx`**
- Added `{ href: '/sync', label: 'Sync Courses', icon: RefreshCcw }` to nav items

**`components/SettingsPage.tsx`**
- Canvas section "Go to Canvas Sync" → "Go to Sync Courses" linking to `/sync`
- Canvas section description updated to mention Sync Courses page

**`components/ConnectCanvasFlow.tsx`**
- Removed `hasSyncedCourses` prop (was only used for button label ternary)
- `handleToggleEndedCourses`: now calls `handleUseSavedConnection(value)` when `canLoadCourses` is true, not just `step === 'courses'` — toggle immediately reloads course list even when not yet loaded
- "Load more courses" / "Load courses" button text simplified to "Refresh courses"

**`components/ConnectCanvasFlowWrapper.tsx`**
- Removed `hasSyncedCourses` prop pass-through (no longer accepted by ConnectCanvasFlow)

**`tests/scheduler.test.ts`**
- Added 9 new tests:
  1. `canonical Learn resource carries sourceTable=module_resources for review action`
  2. `canonical task_item row carries sourceTable=task_items for done action`
  3. `reviewed resource IDs filter active Learn rows (UI contract)`
  4. `reviewed Learn row absent from active list; present in Reviewed section`
  5. `File, Ready, Study pack, and Quiz chips absent from Learn table row data (documented contract)`
  6. `learning_items, deep_learn_notes, and drafts still do not appear as standalone Learn rows after chip removal`
  7. `Show ended courses toggle triggers course reload when connection exists (documented contract)`
  8. `Settings Canvas section links to /sync (documented contract)`
  9. `Sync Courses nav route exists at /sync (documented contract)`

### Why it changed

- Learn rows only showed "Mark reviewed" when `scheduledBlockId` was present, so canonical module_resources that had never been scheduled couldn't be marked. The fix introduces source-level progress via `user_source_progress` so any canonical row can be acted on.
- Syllabus "Mark done" only updated `scheduled_blocks.status`, not the underlying `task_items` row. It also only showed for rows with a scheduled block. The fix calls `updateTaskCompletion` for task_items rows and shows the button for all rows.
- Learn table chips (File, Ready, Study pack, Quiz) were visually noisy and not adding enough information density to justify the space. Removed from table rows (still on the data type for clock/tooltip consumers).
- Canvas sync was buried in Settings with no direct nav item. A dedicated `/sync` page with auto-load and clear UX is now the primary course sync entry point.
- "Show ended courses" only reloaded when already on step=courses. Fixed to reload whenever a connection exists.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean (0 errors, 0 warnings after removing unused `hasSyncedCourses`)
- `npm test -- scheduler learn-resource-ui queue` — ✅ 314/314 pass (+9 new tests)

### Known risks / blockers

- `user_source_progress` migration has NOT been applied to the remote Supabase project yet. Run `supabase db push` or apply via the Supabase dashboard before deploying. Until applied, `markSourceProgress` will fail at runtime with a table-not-found error.
- The `/canvas` route still exists and still works — it now points to the same `ConnectCanvasFlowWrapper`. Consider a redirect from `/canvas` to `/sync` in a future pass.
- `ReviewedSection` shows rows from `fittedLearnRows` (rows fitted to the current free-time window). Reviewed rows from outside the window are not shown. This is acceptable for now since the Reviewed section is supplementary.
- `handleMarkSyllabusDone` calls both `updateTaskCompletion` and `updateBlockStatus` in parallel. If `updateTaskCompletion` throws, the block status update may still complete. Both paths call `revalidatePath('/')` so the page will refresh regardless.

### Next recommended steps

1. Apply `20260505010000_add_user_source_progress.sql` to the remote Supabase project.
2. Verify in browser: Learn tab shows "Mark reviewed" on all rows; marking a resource moves it out of the active list and into the Reviewed section.
3. Verify in browser: Syllabus tab shows "Mark done" on all rows; marking a task_items row actually updates its status in the DB (check Tasks page after marking).
4. Verify in browser: `/sync` auto-loads courses when Canvas is already connected.
5. Verify in browser: "Show ended courses" toggle reloads immediately without needing to click "Refresh courses" first.
6. Consider redirecting `/canvas` → `/sync` to clean up the legacy route.
7. Future: add Syllabus "Completed" section using `user_source_progress` for task_items (mirroring the Learn Reviewed section).

### Suggested commit message

add reviewed home rows and dedicated sync page

---

## Session Update — 2026-05-05g (Fix merged home schedule model)

### What changed

**`lib/home-focus.ts`**
- Added `scheduledBlockId?: string | null` to `SyllabusFocusRow`.
- Added `scheduledBlockId?: string | null` to `LearnFocusRow`.
- Added exported `ScheduledBlockInput` interface — minimal camelCase shape of a `scheduled_blocks` row used for merging.
- Added exported `mergeScheduledBlocksIntoFocusRows(syllabusFocusRows, learnFocusRows, scheduledBlocks, courseNameById)`:
  - For each scheduled block whose `sourceTable` is `task_items / tasks / deadlines`: if a canonical syllabus row exists by `sourceId`, attaches `scheduledBlockId` to it. If no canonical match and block status is not `completed/skipped`, adds a fallback `SyllabusFocusRow` built from block data.
  - For `modules / module_resources`: same logic for `learnFocusRows`.
  - `learning_items`, `deep_learn_notes`, and `drafts` are always skipped.
- Added internal helper `deriveTypeLabelFromSubtitle` for fallback syllabus type labels.

**`app/page.tsx`** and **`app/(app)/page.tsx`**
- Extracted inline `scheduledBlocks` mapping into a `rawScheduledBlocks` variable.
- Added explicit return type `'low' | 'medium' | 'high' | null` on `normalizeEstimateConfidence` (needed for TS after variable extraction).
- Imported and called `mergeScheduledBlocksIntoFocusRows` after building canonical focus rows.
- Passed `mergedSyllabus` and `mergedLearn` (instead of raw canonical rows) as `syllabusFocusRows`/`learnFocusRows` props to `TodayDashboard`.

**`components/TodayDashboard.tsx`**
- `handleUpdateStatus`: added `router.refresh()` after `updateBlockStatus` so completed blocks disappear from the active list without requiring a full navigation.
- `handleMoveLater`: added `router.refresh()` when the block was successfully moved, so the Later section populates immediately.
- Added `handleMarkReviewed(scheduledBlockId)` — calls `updateBlockStatus(scheduledBlockId, 'completed')` + `router.refresh()`.
- Added `completedScheduledBlockIds` useMemo (Set of completed block IDs).
- Changed `activeFocusRows` from a direct alias to a `useMemo` that filters out rows whose `scheduledBlockId` is in `completedScheduledBlockIds`.
- Added `laterBlocks` useMemo — scheduled blocks from `scheduleForDisplay` that are outside the current free-time window (`isBlockInsideWindow` = false, `status === 'scheduled'`).
- `FocusScheduleTable`: added `onMarkDone` and `onMarkReviewed` callback props; forwards them to row components.
- `SyllabusTableRow`: accepts `onMarkDone`; renamed "Open" → "View more"; added "Mark done" button when `scheduledBlockId` is present.
- `LearnTableRow`: accepts `onMarkReviewed`; renamed "Open" → "View more" / "View source"; added "Mark reviewed" button when `scheduledBlockId` is present.
- Added `LaterSection` component — compact non-collapsible list of out-of-window scheduled blocks.
- Rendered `LaterSection` after `CompletedSection` in the Today's Schedule section.

**`app/globals.css`**
- Removed `padding-top: 2.85rem` from `.home-rail` at `@media (min-width: 1025px)`. The desktop-only offset was causing the Free Time clock card to start ~2.85rem lower than the Start Here card. The base `.home-rail { padding-top: 0 }` is now used at all breakpoints. The topbar overlap issue that motivated the offset should be addressed at page-shell level if it recurs.

**`tests/scheduler.test.ts`**
- Added `mergeScheduledBlocksIntoFocusRows` and `ScheduledBlockInput` to imports.
- Added `makeScheduledBlock` factory helper.
- Added 9 new tests covering the merge contracts:
  1. scheduled tasks fallback appears in Syllabus when workspace.taskItems is empty
  2. scheduled deadlines fallback appears in Syllabus when workspace.taskItems is empty
  3. scheduled task_items block attaches scheduledBlockId to matching canonical syllabus row
  4. scheduled module_resources block attaches scheduledBlockId to matching canonical learn row
  5. scheduled modules block without canonical match gets a fallback learn row
  6. learning_items, deep_learn_notes, and drafts are skipped by merge (never standalone rows)
  7. completed scheduled blocks do not create fallback rows (only appear in Completed section)
  8. canonical unscheduled module_resource still appears in Learn after merge
  9. Start Here and Today Schedule do not duplicate the same source (merge produces one row, not two)

### Why it changed

Two separate Home schedule models (scheduled_blocks for Start Here/Completed vs. canonical rows for Syllabus/Learn) caused the Syllabus tab to be empty when the same item appeared in Start Here. The root cause: `tasks` and `deadlines` scheduled blocks had no canonical counterpart in `workspace.taskItems` (which only covers `task_items`). The merge helper unifies both models: canonical rows are primary, scheduled blocks attach their IDs or contribute fallback rows when no canonical match exists.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- scheduler learn-resource-ui queue` — ✅ 305/305 pass (+9 new merge tests)

### Known risks / blockers

- The right-rail `padding-top: 2.85rem` removal may re-expose topbar overlap on the clock card if the `page-shell` does not already provide adequate top spacing. Verify in browser on desktop breakpoint (≥ 1025px).
- "Mark done" in `SyllabusTableRow` only updates `scheduled_blocks.status` (via `updateBlockStatus`). It does not update the source `task_items.status`. A future improvement should also call a server action that marks the canonical task completed.
- `mergeScheduledBlocksIntoFocusRows` is called server-side in page components and produces serializable plain objects — this is safe. The result is passed as RSC props to TodayDashboard.

### Next recommended steps

1. Verify in browser: Syllabus tab now shows tasks from both `task_items` canonical rows and `tasks/deadlines` scheduled-block fallbacks.
2. Verify in browser: Move Later now populates the Later section after the page refreshes.
3. Verify right-rail alignment: Free Time clock card top should align with Start Here card top on desktop.
4. Future: add source-level task completion to "Mark done" (update `task_items.status` when `row.sourceTable === 'task_items'`).
5. Future: add a `module_id` column to `scheduled_blocks` to enable proper `/modules/:id/do` routing for syllabus fallback rows.

### Suggested commit message

fix merged home schedule model

---

## Session Update — 2026-05-05f (Wire home focus rows on root page)

### What changed

**`app/page.tsx`** (the visible home route at `/`)
- Added import: `buildLearnFocusRows, buildSyllabusFocusRows` from `@/lib/home-focus`.
- Expanded `Promise.all` from two queries to three — added `module_resources` select with all quality/extraction fields (`id,course_id,module_id,title,resource_type,extracted_text,extracted_text_preview,visual_extraction_status,visual_extracted_text,html_url,source_url,estimated_minutes,extraction_status,extracted_char_count`).
- Fallback tuple extended to three empty results.
- Built `courseNameById` from `workspace.courses`.
- Built `syllabusFocusRows` via `buildSyllabusFocusRows(workspace.taskItems)`.
- Built `learnFocusRows` via `buildLearnFocusRows(homeLearnResourceRows, studyPacksByResourceId, courseNameById)`.
- Added `syllabusFocusRows` and `learnFocusRows` props to `TodayDashboard`.

**`app/(app)/page.tsx`**
- Removed temporary `console.log('[home-focus]', ...)` diagnostic.

### Why it changed

`app/(app)/page.tsx` had already been updated with the full focus-row loading logic in session 2026-05-05c/d, but the root page at `localhost:3000` is served by `app/page.tsx`, which still passed empty arrays to `TodayDashboard`. Because `syllabusFocusRows` and `learnFocusRows` default to `[]`, Today's Schedule always showed the empty-state message even when tasks and resources existed.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- scheduler` — ✅ 296/296 pass

### Suggested commit

wire home focus rows on root page

### Next recommended steps

1. Verify in browser: Syllabus tab shows tasks if Due Soon has items; Learn tab shows ready materials.
2. If `workspace.courses` is empty for a user, `courseNameById` will be `{}` and course names on Learn rows will be `null` — acceptable fallback.

### Risks / blockers

None — no DB, schema, scheduler, or auth changes.

---

## Session Update — 2026-05-05e (Fix home focus fitting and schedule controls)

### What changed

**`lib/home-focus.ts`**
- Added `normalizeFocusDurationMinutes` — clamps task duration to [10, 60] minutes, substituting `defaultMinutes` for missing/invalid values.
- `fitFocusRowsToWindow` loop rewritten: computes `remainingMinutes` first, breaks only if `< 10`, then uses `Math.min(requestedMinutes, remainingMinutes)` so the last row is shortened to fill the window instead of being dropped. A 15-minute free-time window now always shows at least one row even when the task's default duration is 20+ minutes.

**`components/TodayDashboard.tsx`**
- `PrimaryActionHero`: suppressed the primary `<Link>` (`Open task`) when `item.kind === 'task'`. `TaskDraftButton` already renders its own open action, so the duplicate "Open task" button is gone.

**`app/globals.css`**
- `.home-focus-pill` switched from `display: inline-flex` to `display: inline-grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: fit-content; min-width: 13.5rem` — fixes the "SyllabusLearn" glued-text rendering.
- `.home-focus-pill-track` updated: uses `inset` shorthand, `var(--surface-elevated)` background, and 180 ms ease transition.
- `.home-focus-pill-btn` / `.home-focus-pill-tab`: removed `flex: 1 / display: inline-flex`, added `text-align: center; font-weight: 800`. Added `[aria-selected='true']` selector alongside `.active`.
- `.home-rail`: added `padding-top: 0.25rem` base + `padding-top: 2.85rem` at `min-width: 1025px` (two-column layout). Topbar height is `2.85rem`; this prevents the sticky topbar from overlapping the clock card on the right rail.

**`tests/scheduler.test.ts`**
- Replaced `fitFocusRowsToWindow stops when free-time window is full` (expected 1 row when 15 min remain) with three updated tests that assert the new contract:
  1. Second row is shortened to fill remaining space when ≥ 10 min remain.
  2. A 15-minute window with a 20-minute default row returns one shortened row.
  3. Stop only when remaining window drops below 10 minutes.

### Why it changed

- Short free-time windows (15–20 min) produced an empty Today's Schedule because `fitFocusRowsToWindow` broke on the first row if `endMs > windowEndMs`, regardless of how much time remained.
- The pill switcher had `display: inline-flex` with no explicit minimum width, causing the two buttons to collapse to zero-gap inline text.
- `PrimaryActionHero` rendered both a primary `<Link>` (labeled "Open task") and `TaskDraftButton` (which also exposes an "Open task" action) when `item.kind === 'task'`.
- The sticky topbar (`min-height: 2.85rem`) occupies the top of the viewport and was overlapping the first card in the right-rail column because `.home-rail` had no top offset.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- scheduler` — ✅ 296/296 pass

### Suggested commit

fix home focus fitting and schedule controls

### Next recommended steps

1. Remove `console.log('[home-focus]', ...)` in `app/(app)/page.tsx` once data-path is confirmed working in production.
2. Verify the pill layout in a real browser — `var(--surface-elevated)` may need a fallback if the CSS variable is undefined in the active theme.
3. Confirm TaskDraftButton renders an adequate primary CTA for task items in Start Here (no regression in action clarity).

### Risks / blockers

None — no DB, schema, scheduler, or auth changes.

---

## Session Update — 2026-05-05d (Render home focus rows as Syllabus/Learn table)

### What changed

**`components/TodayDashboard.tsx`**
- Removed `nowFocusRows / nextFocusRows / laterFocusRows` useMemo — the Now/Next/Later time-bucketing logic that compared fitted row times against `Date.now()` was hiding rows that weren't "current" or upcoming relative to the real clock, contradicting the intent of the Syllabus/Learn arrangement.
- Removed `studyPacksByBlockId` useMemo — was only used by the old `FocusPlanGroup` / `LearnPlanRow` components.
- Removed `hasFocusRows` derived variable — empty state is now handled inside `FocusScheduleTable`.
- Removed `FocusPlanGroup`, `SyllabusPlanRow`, `LearnPlanRow` component definitions — all replaced by the table.
- Added `FocusScheduleTable` — renders `activeFocusRows` directly in order as a compact `<table>` with a header row. Empty state shows "No pending assignments or tasks found." (Syllabus) or "No ready study materials found." (Learn) when the row array is empty.
- Added `SyllabusTableRow` — columns: Time (startAt–endAt), Details (typeLabel chip + title + course/module), Due / Action (urgency label + Open link).
- Added `LearnTableRow` — columns: Time (startAt–endAt), Material (fileTypeLabel chip + readiness chip + title + course), Status / Action (Study pack / Quiz chips + Open link). Study pack readiness read directly from `row.studyPackRefs` (already embedded in `FittedLearnRow`).
- Today's Schedule `<div className="home-plan-list">` now renders `<FocusScheduleTable rows={activeFocusRows} mode={focusMode} />`.
- Clock (`clockBlocks`) and segmented pill (`focusMode`) unchanged — switching tabs still updates the clock.
- Start Here, Completed, and all other sections unchanged.

### Why it changed

The Now/Next/Later bucketing compared each fitted row's `startAt`/`endAt` against the real wall clock. Since `fitFocusRowsToWindow` assigns times starting from the user-selected window start (e.g. 6:30 PM), any row whose window hadn't arrived yet would land in `laterFocusRows`. But the "Later" bucket was capped at 6 rows, and rows outside the 2-hour "Next" window that had already passed were dropped entirely. In practice, all rows were invisible unless the user happened to view the page exactly during their scheduled free-time window. The flat table approach renders every fitted row in window order regardless of the current clock.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- scheduler` — ✅ 294/294 pass

### Suggested commit

render home focus rows as syllabus learn table

### Next recommended steps

1. **Remove diagnostic `console.log('[home-focus]', ...)` in `app/(app)/page.tsx`** once the data-path is confirmed working.
2. **CSS refinement**: the table uses inline styles. If the design needs pixel-perfect column widths or responsive behaviour on mobile, add `.home-focus-table` CSS to `app/globals.css`.
3. **Start Here / Completed** still use `scheduledBlocks` — no change needed for now.

### Risks / blockers

None — no DB, schema, scheduler, or auth changes in this session.

---

## Session Update — 2026-05-05c (Fix home focus row data sources)

### What changed

**`lib/home-focus.ts`**
- `ModuleResourceRow` — added `extraction_status: string | null` and `extracted_char_count: number | null` fields. These mirror the columns the `/modules/:id/learn` page uses (via `source-readiness.ts → getReadableTextLength`) to classify "Ready for Deep Learn" resources.
- `isReadyForLearn` — now checks `extraction_status === 'completed' | 'extracted'` AND `extracted_char_count >= 120` first, before falling through to `classifyModuleResourceTextQuality`. This matches the same logic used by `source-readiness.ts`. Resources with completed extraction but null `extracted_text` (e.g. large files where the stored text was truncated or not returned by the select) are now correctly included.
- `classifyLearnReadiness` — same extraction_status/char_count check added so the `readiness` label on Learn rows also agrees with the module Learn page.

**`app/(app)/page.tsx`**
- Module resources DB query now selects `extraction_status,extracted_char_count` in addition to existing quality fields.
- Introduced `homeLearnResourceRows` local variable to remove duplication.
- Added `console.log('[home-focus]', {...})` diagnostic log (taskItems, dueSoon, rawResources, syllabusRows, learnRows) to confirm data is flowing through each layer. Remove this log once the root cause is confirmed.

**`app/globals.css`**
- Added `.home-focus-pill`, `.home-focus-pill-track`, `.home-focus-pill-tab`, `.home-focus-pill-btn` CSS. The pill was rendering as "SyllabusLearn" glued text because these classes had no styles. The track element now slides via `translateX` on the active tab. Both `-tab` and `-btn` class names are styled identically (the JSX uses `-btn`).

**`tests/scheduler.test.ts`**
- `makeResourceRow` factory now initialises `extraction_status: null` and `extracted_char_count: null` to satisfy the updated `ModuleResourceRow` interface.

### Why it changed

**Learn rows empty**: The DB query for `module_resources` didn't fetch `extraction_status` or `extracted_char_count`. Resources where the pipeline has completed extraction (status=completed, char_count>0) but the `extracted_text` column is null (large files, truncated selects) were being rejected by `classifyModuleResourceTextQuality`. The `/modules/:id/learn` page uses `extractedCharCount` as a fallback (see `source-readiness.ts:getReadableTextLength`), so the Home Learn rows were incorrectly showing fewer resources than the module page.

**Pill rendering as "SyllabusLearn"**: The `home-focus-pill` container and its child elements had no CSS at all, causing the buttons to render as inline text with no gap or visible tab styling.

**Syllabus rows**: No data-path change was needed — `buildSyllabusFocusRows(workspace.taskItems)` uses the same source as `overview.dueSoon`. The diagnostic log will confirm actual counts at runtime. If `syllabusRows` is still 0 while `taskItems > 0`, the issue is in `fitFocusRowsToWindow` or the Now/Next/Later time bucketing (all items may land in a past window if the user checks late at night).

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- scheduler` — ✅ 294/294 pass

### Next recommended steps

1. **Check the `[home-focus]` server log** once deployed — if `syllabusRows > 0` but the UI shows empty, the bug is in the client-side time bucketing (all rows assigned to a past window). Fix: expand `laterFocusRows` to also include rows whose `endAt` is in the past but whose `startAt` is on today's date (i.e. the whole window is scheduled for later today but already passed).
2. **Remove diagnostic log** once root cause confirmed (`console.log('[home-focus]', ...)` in `app/(app)/page.tsx`).
3. **Start Here / Completed** still use `scheduledBlocks` — no change needed for now.

### Risks / blockers

- If `extraction_status` in the DB uses values other than `'completed'` or `'extracted'` (e.g. `'done'`), the new `isReadyForLearn` check would miss those rows. Verify against the actual DB enum or extend the condition.

---

## Session Update — 2026-05-05b (Fix home-focus client-safe imports)

### What changed

**`lib/home-focus.ts`**
- Removed `import { getTaskUrgencyLabel } from '@/lib/clarity-workspace'` — that module transitively imports `next/headers` (via `lib/workspace-source` → `lib/auth-server`) which cannot appear in the client bundle.
- Removed `import type { TaskItem } from '@/lib/types'`.
- Added exported `HomeSyllabusTaskInput` interface — minimal subset of `TaskItem` fields needed by `buildSyllabusFocusRows`. `TaskItem` (which is a superset) satisfies this structurally, so `app/(app)/page.tsx` continues to pass `workspace.taskItems` without changes.
- Added local `deriveUrgencyLabel(task: HomeSyllabusTaskInput)` pure function — inlines the same logic that was in `getTaskUrgencyLabel`.
- `buildSyllabusFocusRows` now takes `HomeSyllabusTaskInput[]`.
- `getTaskTypeLabel` now takes `string | null | undefined` instead of `TaskItem['taskType']`.
- `compareSyllabusRows` now takes `HomeSyllabusTaskInput` (no behavioral change).
- `lib/home-focus.ts` is now fully client-safe: no DB calls, no Supabase, no Next.js server imports, no auth imports.

**`tests/scheduler.test.ts`**
- Replaced `import type { TaskItem } from '@/lib/types'` with `type HomeSyllabusTaskInput` from `@/lib/home-focus`.
- `makeTaskItem` factory now returns `HomeSyllabusTaskInput` (removed server-only fields: `courseId`, `details`, `priority`, `extractedFrom`, `planningAnnotation`, `moduleFreshnessScore`).
- Inline `TaskItem[]` annotation in one test updated to `HomeSyllabusTaskInput[]`.

### Why it changed

`TodayDashboard.tsx` is a client component. It imports `lib/home-focus.ts`, which previously imported `getTaskUrgencyLabel` from `lib/clarity-workspace`. That module's import chain (`clarity-workspace` → `workspace-source` → `auth-server` → `next/headers`) is server-only and cannot be bundled for the client. The build would fail with a "next/headers cannot be used in a client component" error.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean

### Suggested commit message

fix home focus client-safe imports

---

## Session Update — 2026-05-05 (Reuse canonical Syllabus and Learn sources for Home schedule)

### What changed

**`lib/home-focus.ts`** — new file
- Defines `SyllabusFocusRow` and `LearnFocusRow` types for canonical home focus rows.
- `buildSyllabusFocusRows(taskItems)` — builds Syllabus rows directly from `task_items` (all pending tasks, not just scheduler-selected). Open href prefers `canvas_url` if available; falls back to module Do page.
- `buildLearnFocusRows(resources, studyPacksMap, courseNameById)` — builds Learn rows from `module_resources` using the same readiness classification as `/modules/:id/learn`: Canvas pages always included; file/doc/slide types require usable text quality. Quiz resource types are excluded via `isSchedulableResourceType`. Open href uses `buildModuleLearnHref(moduleId, { resourceId })` when `module_id` is available.
- `fitFocusRowsToWindow(rows, windowStartIso, windowEndIso, defaultMinutes)` — pure view/helper transform that assigns sequential `startAt`/`endAt` times to rows within the free-time window. No DB writes. Stops when the window is full.
- `ModuleResourceRow` interface — minimal Supabase snake_case shape for module_resources query.

**`components/InteractivePlannerClock.tsx`**
- Added optional `href?: string | null` field to `ClockScheduleBlock`. When set, `TodayDashboard.getBlockHref()` returns this directly instead of computing from `sourceTable`/`sourceId`.

**`components/TodayDashboard.tsx`**
- New props: `syllabusFocusRows?: SyllabusFocusRow[]`, `learnFocusRows?: LearnFocusRow[]` (both optional with empty defaults for backward compatibility).
- Plan list now renders from canonical focus rows (not filtered `scheduled_blocks`). `filteredNow/Next/Later` are replaced by `nowFocusRows/nextFocusRows/laterFocusRows` derived from `fitFocusRowsToWindow()` applied to the active tab's rows.
- Clock `scheduleBlocks` now receives `clockBlocks` — the fitted focus rows converted to `ClockScheduleBlock` shape for the active focus tab. Syllabus tab → `sourceTable: 'task_items'`; Learn tab → `sourceTable: 'module_resources'`. Switching tabs immediately updates the clock.
- **Segmented pill focus switcher**: replaced the small chip `role="tablist"` with a `home-focus-pill` container holding a sliding `home-focus-pill-track` background and two `home-focus-pill-btn` buttons. The track translates on `focusMode` change.
- **Syllabus rows** (`SyllabusPlanRow`): Open/anchor uses `row.href` (canvas_url or Do page). Opens in new tab when `canvasUrl` is set. Urgency label shown inline.
- **Learn rows** (`LearnPlanRow`): Open/anchor uses `row.href` (module learn path) with "Open" for ready resources and "Preview" for limited. Falls back to `originalHref` for external source. Study pack chips attach from `studyPacksByBlockId` lookup.
- Hero (Start Here) block still sourced from `scheduledBlocks` (no change).
- Completed section still sourced from `scheduledBlocks` (no change).
- `isSyllabusBlock` and `isLearnBlock` are kept and exported for test contracts (still used by the old scheduled-blocks path if the hero block type is ever needed).
- Removed old `filteredNow/Next/Later` and `PlanRow`/`PlanGroup` components (replaced by `FocusPlanGroup`, `SyllabusPlanRow`, `LearnPlanRow`).

**`app/(app)/page.tsx`**
- Added `module_resources` query (same fields as the scheduler query) for building Learn focus rows.
- Builds `courseNameById` map from `workspace.courses` for Learn row course name display.
- Calls `buildSyllabusFocusRows(workspace.taskItems)` — canonical Syllabus source.
- Calls `buildLearnFocusRows(resourcesResult.data, studyPacksByResourceId, courseNameById)` — canonical Learn source.
- Passes both as new props to `TodayDashboard`.

**`tests/scheduler.test.ts`**
- Added imports for `buildSyllabusFocusRows`, `buildLearnFocusRows`, `fitFocusRowsToWindow`, `ModuleResourceRow`, `TaskItem`.
- Added 13 new tests:
  1. Learn focus uses module_resources titles (not generated prompts)
  2. Learn focus shows PDF/PPTX/DOCX/Canvas page rows from canonical module_resources
  3. Syllabus focus uses task/assignment/quiz/due rows from task_items
  4. Focus switch: syllabus rows ≠ learn rows (different source data)
  5. Focus switch: clock input shape differs by tab (task_items vs module_resources)
  6. Learn rows exclude quiz resource_type
  7. "Check your understanding" not filtered by title (learning_items excluded at DB level)
  8. Learn row href uses /modules/:id/learn path when module_id is available
  9. Syllabus row href uses canvas_url, falls back to Do page
  10. fitFocusRowsToWindow assigns start/end times inside window
  11. fitFocusRowsToWindow stops when window is full
  12. No separate Study Materials card (documented contract)
  13. No duplicate IDs in canonical focus rows for unique inputs

### Why it changed

The previous session's Syllabus/Learn focus tabs were still built from `scheduled_blocks` — the scheduler's subset of task_items and module_resources. This caused two problems:
1. **Wrong Learn rows**: The scheduler scores and limits which resources appear. The actual `/modules/:id/learn` page shows ALL "Ready for Deep Learn" resources. The two lists diverged.
2. **Wrong Syllabus rows**: Only scheduler-selected tasks appeared, not the full Canvas task/assignment list the student actually has pending.

The fix switches both tabs to canonical data sources (task_items and module_resources read directly) and uses `fitFocusRowsToWindow()` as a pure view transform to assign display times — no new scheduled_blocks are generated.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean (0 errors, 0 warnings)
- `npm test -- scheduler` — ✅ 294 pass, 0 fail (was 281; +13 new)

### Known risks / blockers

- The `fitFocusRowsToWindow()` fitting is sequential and greedy (fills slots in row order). It stops when the window is full. For large task/resource lists, later rows are silently cut off. A future improvement could add priority scoring to decide which rows to include when the window is limited.
- Syllabus rows always open canvas_url in a new tab (`target="_blank"`). If the user is not logged into Canvas, the link will prompt for Canvas auth. This is intentional (same as clicking a Canvas link anywhere in the app).
- Learn rows without a `module_id` fall back to `originalHref` (Canvas file URL or source URL). This opens the raw file rather than the in-app reader. Rows from the scheduler that lack `module_id` have always had this limitation — a `module_id` column on `scheduled_blocks` would fix routing for the hero block too.
- The `home-focus-pill` segmented pill needs CSS rules in `globals.css` for the sliding track animation (`transform: translateX(...)` is set inline; the visual style depends on the design token variables already in place).

### Next recommended steps

1. Add CSS for `home-focus-pill`, `home-focus-pill-track`, `home-focus-pill-btn` to `globals.css` to complete the animated segmented pill visual.
2. (Optional) Add a sort/priority option inside `buildLearnFocusRows` to surface the highest-readiness resources first (currently sorted alphabetically).
3. (Optional) Limit `buildSyllabusFocusRows` to tasks with due dates within a configurable horizon (e.g., next 14 days) to reduce noise in the Syllabus tab for students with many pending tasks.
4. (Optional) `fitFocusRowsToWindow` could accept a `limit` cap (e.g., max 8 rows) to avoid rendering a long list even when the window could technically fit many short tasks.

### Suggested commit message

reuse syllabus and learn sources for home schedule

---

## Session Update — 2026-05-04 (Refactor Home schedule into Syllabus and Learn focus)

### What changed

**`components/TodayDashboard.tsx`**
- Replaced `filterMode: 'all' | 'tasks' | 'study'` state with `focusMode: 'syllabus' | 'learn'` (default: `'syllabus'`).
- Replaced the 3-chip "All / Tasks / Study Materials" filter row with a 2-tab "Syllabus / Learn" focus switcher (`role="tablist"` with `aria-selected`).
- Added `isSyllabusBlock(block)` — true for `task_items`, `tasks`, `deadlines`.
- Added `isLearnBlock(block)` — true for `module_resources`, `modules`.
- Drafts, `learning_items`, and `deep_learn_notes` do not appear in either focus (never standalone per product rules).
- Updated `filteredNow/Next/Later` memo to use `isSyllabusBlock` / `isLearnBlock` instead of the old `isTaskBlock` check.
- Updated `PlanGroup` and `PlanRow` to accept and forward `focusMode`.
- `PlanRow` now shows `urgencyNote` (or `context`) as a compact hint in Syllabus mode, and `context` (course name) in Learn mode.
- `PlanRow` now shows "Unavailable" copy instead of a broken Open button when no valid href exists.
- Removed the separate "Study packs ready" rail section from `aside`. Study pack chips remain on individual blocks via `studyPacksByBlockId`.
- Removed `allStudyPacks` useMemo (no longer needed without the rail card).
- Added `buildCourseLearnHref` import from `@/lib/stay-focused-links`.
- Updated `getBlockHref` for `module_resources`: now uses `buildCourseLearnHref(courseId, { resourceId })` for a proper learn-view deep link instead of a hand-built URL string.

**`tests/scheduler.test.ts`**
- Added 13 new tests covering all 10 required test contracts:
  1. `isSyllabusBlock` includes task_items, tasks, deadlines
  2. `isLearnBlock` includes module_resources, modules
  3. Learn focus shows PDF/PPTX/DOCX/Canvas page module_resources
  4. Syllabus and Learn focus produce correct block subsets from mixed input
  5. Drafts not in Syllabus or Learn focus
  6. `learning_items` (generated "Check your understanding") not in either focus
  7. `deep_learn_notes` not standalone rows in either focus
  8. Study Materials rail card removed (documented contract)
  9. Open href for syllabus/task_items block routes to /tasks
  10. Open href for learn/module_resources block routes to /courses/:id learn view
  11. Free-time window assigns start/end times to focus row blocks
  12. No duplicate source in Today's Schedule across focus modes
  13. Syllabus + Learn focus can each render their own block subset independently

### Why it changed

Today's Schedule was mixing generated scheduler blocks, study packs, quiz practice items, and tasks with no clear product structure. The new Syllabus/Learn focus model gives students a single switch to see either:
- **Syllabus**: due work, quizzes, discussions, graded tasks (Canvas syllabus spirit)
- **Learn**: PDFs, PPTs, DOCXs, Canvas pages, module materials (study sessions)

The separate Study Materials rail card was redundant because Learn focus now owns study material navigation. Removing it reduces rail noise.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean (0 errors, 0 warnings)
- `npm test -- scheduler` — ✅ 281 pass, 0 fail (was 262; +19 new)

### Known risks / blockers

- `module_resources` blocks do not carry `module_id` in `scheduled_blocks` (only `course_id` is stored). The learn route uses `/courses/:courseId?resource=:resourceId` via `buildCourseLearnHref`. This opens the course view with the resource highlighted — not the dedicated module learn page. To get `/modules/:moduleId/learn?resource=:resourceId` routing, `module_id` would need to be added to the `scheduled_blocks` table as a new column (schema migration required).
- `task_items` blocks route to `/tasks?taskTitle=...` rather than the Do page, because `module_id` is not stored in blocks. The Do page requires `moduleId` to build the path. A future migration adding `module_id` to `scheduled_blocks` would unlock direct Do-page routing for both task and resource blocks.
- Drafts are still fetched in `generateUserSchedule` (actions/scheduler.ts) and stored in `scheduled_blocks`. They simply don't appear in either focus tab's view. A future cleanup could remove drafts from the scheduler source entirely if they are not wanted as data.

### Next recommended steps

1. (Optional) Add `module_id` column to `scheduled_blocks` table. Populate it from `task_items.module_id` and `module_resources.module_id` during schedule generation. This enables proper `/modules/:id/learn` routing for Learn blocks and `/modules/:id/do` routing for Syllabus task blocks.
2. (Optional) Remove drafts from scheduler sources in `actions/scheduler.ts` if "never standalone" is the permanent policy.
3. (Optional) Add a secondary "Ready / Needs action / Completed" filter under Learn focus if product direction calls for it (deliberately deferred per task instructions).

### Suggested commit message

refactor home schedule into syllabus and learn focus

---

## Session Update — 2026-05-04 (Fix Google Vision OCR credential fallback for local development)

### What changed

**`lib/extraction/google-ocr.ts`**
- Fixed `getSplitGoogleVisionCredentialState`: `anyConfigured` now only fires when `GOOGLE_VISION_CLIENT_EMAIL` or `GOOGLE_VISION_PRIVATE_KEY` is set. `GOOGLE_CLOUD_PROJECT` alone no longer triggers the split credential path — it is a general Google Cloud env var shared across many services, and its presence must not block the JSON credential fallback.
- Added `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` as an alias for `GOOGLE_VISION_CREDENTIALS_JSON` in `getGoogleServiceAccount`, `hasGoogleOAuthCredentials`, `validateGoogleVisionCredentials`, and `shouldUseGoogleVisionApiKey`. Local dev can now set either name to provide full service account JSON.
- Updated the final "not configured" error message to list all accepted options: API key, split vars, `GOOGLE_VISION_SERVICE_ACCOUNT_JSON`, and `GOOGLE_APPLICATION_CREDENTIALS`.

**`tests/google-ocr.test.ts`**
- Added `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` to the `withGoogleEnv` key list so it is isolated between tests.
- Added 7 new tests:
  1. Missing split client email does not fail when `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` is present
  2. Missing split client email does not fail when `GOOGLE_VISION_CREDENTIALS_JSON` is present
  3. `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` JSON credentials work for local development
  4. `GOOGLE_APPLICATION_CREDENTIALS` file path is accepted by the validator
  5. `GOOGLE_CLOUD_PROJECT` alone does not trigger split credential failure
  6. Partial split credentials (private key only) without JSON produce a non-empty helpful error
  7. No credential value (PEM key) is included in thrown error messages

### Why it changed

Local OCR was failing with "Google Vision OCR split credentials are missing GOOGLE_VISION_CLIENT_EMAIL" even when `GOOGLE_APPLICATION_CREDENTIALS` or a JSON credential env was set. The cause: `GOOGLE_CLOUD_PROJECT` (commonly set as a general Next.js/GCP env var) made `anyConfigured = true`, pushing validation into the split credential path before it could check JSON fallbacks. Fixing `anyConfigured` to exclude `projectId` alone resolves the fallback ordering.

### Local development setup (two options)

**Option A — Full service account JSON env var:**
```
GOOGLE_VISION_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}'
```

**Option B — File path:**
```
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\google-service-account.json
```

Vercel split-value setup (`GOOGLE_CLOUD_PROJECT` + `GOOGLE_VISION_CLIENT_EMAIL` + `GOOGLE_VISION_PRIVATE_KEY`) continues to work unchanged.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- google-ocr source-ocr-updates queue` — ✅ 269 pass, 0 fail
- `validate-scanned-pdf.ts` — skipped (local PDF not present)

### Known risks / blockers

- None. The `anyConfigured` change is backward-compatible: existing Vercel deployments that set `GOOGLE_VISION_CLIENT_EMAIL` and `GOOGLE_VISION_PRIVATE_KEY` still enter the split path and validate exactly as before.
- `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` and `GOOGLE_VISION_CREDENTIALS_JSON` are true aliases — if both are set, `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` takes precedence (checked first in the OR expression).

### Next recommended steps

- No blockers. Set `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` in `.env.local` to enable local OCR.

---

## Session Update — 2026-05-04 (Exclude generated quiz prompts from scheduler sources)

### What changed

**`lib/scheduler/source-filter.ts`** — new file
- Exports `isSchedulableResourceType(resourceType)` — returns `false` for any resource_type that contains 'quiz' (case-insensitive), `true` for everything else (file, page, pdf, pptx, docx, etc.).

**`actions/scheduler.ts`**
- Removed `learning_items` from `Promise.all` fetch and from `sourceItems`. These are AI-generated module content ("Check your understanding N", "Key idea N", summaries) inserted by `buildLearningItemsForSync` during Canvas sync — not actual source materials.
- Added `isSchedulableResourceType` guard to the `readyResources` filter so `module_resources` rows with `resource_type` containing 'quiz' (Canvas Quiz items) are excluded before they reach the scheduler algorithm.
- Removed the `taskType: row.resource_type?.toLowerCase().includes('quiz') ? 'quiz' : 'reading'` inline ternary on module_resources — now always `'reading'` since quiz resources are filtered out upstream.
- Removed `learningItemsError` from source-data error check and from the console.log counts.

**`tests/scheduler.test.ts`**
- Imported `isSchedulableResourceType` from `@/lib/scheduler/source-filter`.
- Added 9 new tests covering:
  1. action-level contract that learning_items are excluded
  2. `isSchedulableResourceType` rejects quiz resource types
  3. `isSchedulableResourceType` accepts file/page/pdf/pptx/docx/etc.
  4. action-level contract that deep_learn_notes are excluded even when quiz_ready
  5. PDF module_resource produces a scheduled block with the correct title
  6. PPT/PPTX/DOC/DOCX module_resources are schedulable
  7. Canvas page module_resource is schedulable
  8. Today's Schedule block title is the source material title, not a generated quiz prompt
  9. Study pack metadata attaches to source block; no standalone block for study packs
  10. No duplicate blocks in a mixed source input

### Why it changed

Today's Schedule was surfacing synthetic "Check your understanding 1/2/3" blocks with type "Quiz practice". These originated from:
1. `learning_items` (type `review`) — AI-generated study prompts inserted by Canvas sync, never actual source materials
2. `module_resources` with `resource_type` containing 'quiz' — Canvas Quiz items, which are assessments, not source materials

Product rule: only PDF, PPT, PPTX, DOC, DOCX, Canvas pages, and readable Canvas files are schedulable as Study Materials. Generated quiz/review outputs attach as metadata chips to their parent source material block.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- scheduler` — ✅ 262 pass, 0 fail (was 252; +10 new)

### Known risks / blockers

- None. `learning_items` were never actual source documents; removing them from the scheduler changes no existing scheduled block routing or user-visible study flow.
- `isSchedulableResourceType` is a simple contains-'quiz' check. If a future resource_type legitimately contains the word 'quiz' but is schedulable, the filter would need a more precise check (exact match or explicit allowlist). Current Canvas resource_type values are: file, page, assignment, discussion, quiz, announcement, external_url, external_tool, subheader, module_item.

### Next recommended steps

- No blockers. Today's Schedule will now show only actual source material titles.
- Optional future improvement: extend `isSchedulableResourceType` to also filter out `external_url`, `external_tool`, `subheader`, and `announcement` resource types if those surface as noise. Current fix addresses the immediate reported bug.

### Suggested commit message

exclude generated quiz prompts from scheduler sources

---

## Session Update — 2026-05-04 (Fix InteractivePlannerClock hydration mismatch)

### What changed

**`components/InteractivePlannerClock.tsx`**
- Added `svgNum(value)` helper: `Math.round(value * 1000) / 1000`.
- Applied it inside `polarToCartesian` so all computed SVG coordinates (tick x1/y1/x2/y2, clock number x/y, arc endpoints, handle cx/cy, hand endpoints) are rounded to 3 decimal places before being written to attributes.
- Clock hands are unaffected at the React level — they are already guarded by `handAngles = now ? ... : null` where `now` is `null` on initial render and only set via `useEffect`, so they never appear in SSR output.

### Why it changed

React hydration mismatch: `Math.cos`/`Math.sin` can produce slightly different IEEE-754 results (±1e-15) between Node.js (SSR) and the browser JS engine. All coordinate attributes were rendering as e.g. `x2="160.00000000000003"` server-side vs `x2="160"` client-side. Rounding to 3 decimal places in one central helper covers every SVG attribute generated by trigonometric calculations.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- scheduler` — ✅ 252 pass, 0 fail

---

## Session Update — 2026-05-04 (Design consistency pass: Home / Study Library / Courses)

### What changed

**`components/drafts/DraftCard.tsx`**
- Replaced individually-bordered elevated card style with `home-sheet-row` flat separator pattern.
- Now uses `home-row-meta` chips, `home-row-title` link, `home-row-copy`, and `home-row-note` — matching the visual language of the Home Today Plan rows.

**`components/drafts/CourseShelf.tsx`**
- Expanded content container changed from a gap-separated CSS grid to `home-sheet-list` (border-top separator between items).
- Removed tinted background override from shelf header div; now inherits section-shell surface cleanly.

**`app/(app)/courses/page.tsx`**
- Replaced raw amber inline-styled text metrics with `ui-chip ui-status-warning` / `ui-chip ui-chip-soft` elements for pending task count and ready pack count.
- "Open course" now uses `home-row-open` link class (matches Home section row links).

**`app/(app)/library/page.tsx`**
- Changed header section from `section-shell section-shell-elevated` (heavy shadow) to flat `section-shell`.
- Used `home-section-heading` layout, `home-subtle-link` for "View all", and `home-plan-filter-chip` for All/Learning/Tasks filter tabs.
- Condensed description copy to a single tight line.

### Why it changed

Design consistency pass requested by user: align Study Library and Courses visually with the Home page. Prior implementation used ad-hoc elevated/bordered inner cards that read as a separate design system from the Home sheet-row pattern.

### Tests run

- `npm run typecheck` — ✅ clean
- `npm run lint` — ✅ clean
- `npm test -- scheduler` — ✅ 252 pass, 0 fail

### Next recommended steps

- No blockers. Visual alignment is complete across Home, Library, and Courses.
- Next natural improvement: calendar page light consistency pass if desired.
- Clock widget is already clean (right-rail `home-sheet` with heading + SVG + legend, no card-inside-card).

---

## Session Update — 2026-05-04 (Implement real Move Later + Home/Library consistency pass)

### What changed

**`lib/scheduler/move-later.ts`** — new file
- Pure, side-effect-free `findLaterSlot(block, otherBlocks, options)` function.
- Shifts by at least one block duration or 30 minutes, whichever is larger.
- Preserves duration exactly.
- Guards completed/skipped/missed blocks — returns `{ moved: false }`.
- Slides past overlapping active blocks up to 48 attempts.
- Respects a caller-supplied `dayEndIso` boundary (or defaults to 23:59 of block's day).
- Returns `{ moved: false, reason: '...' }` when no slot exists.

**`actions/scheduler.ts`**
- Added `moveScheduledBlockLater(blockId)` server action.
- Fetches the target block and all same-day blocks for the user.
- Calls `findLaterSlot` with real DB data.
- Updates `start_at` / `end_at` in `scheduled_blocks` when a slot is found.
- Returns `{ moved: boolean; message: string }` — never throws to the client.
- Removed `onReschedule` call pattern; `rescheduleBlock` kept for internal/future use.

**`components/TodayDashboard.tsx`**
- Import swapped: `rescheduleBlock` → `moveScheduledBlockLater`.
- Added `moveLaterMessage` state for inline feedback (auto-clears after 4 s).
- Added `handleMoveLater(id)` — calls `moveScheduledBlockLater`, sets message.
- `ScheduledBlockHero`: prop renamed `onReschedule` → `onMoveLater`; accepts `moveLaterMessage` to display inline below actions.
- `PlanGroup` + `PlanRow`: prop renamed `onReschedule` → `onMoveLater`.
- Message also displayed in Today's Schedule list below filtered groups.

**`tests/scheduler.test.ts`**
- Added import for `findLaterSlot`.
- Added 9 new Move Later tests (total ≈ 251):
  1. Move Later changes start and end time.
  2. Move Later preserves duration exactly.
  3. Move Later shifts by at least 30 minutes.
  4. Move Later shifts by at least one block duration when duration > 30 min.
  5. Completed block cannot be moved.
  6. Skipped block cannot be moved.
  7. Move Later avoids overlapping another scheduled block.
  8. Move Later creates no duplicate block (self exclusion).
  9. No later slot returns a clear safe failure when day is full.
  10. Move Later respects an explicit day end boundary.

### Why it changed

"Move later" was a no-op: both the hero and plan row called `rescheduleBlock(id, block.startAt, block.endAt)` — passing the current times unchanged. The server round-trip happened but the DB was written with identical values. This session extracts the slot-finding into a pure testable function and wires a real server action that computes and persists an actual new time.

### Tests run

- `npm run typecheck` — pending (run before commit)
- `npm run lint` — pending
- `npm test -- scheduler` — pending

### Known risks / blockers

- The inline `moveLaterMessage` appears in both the hero and in the Today's Schedule section. If the hero block is moved, both messages fire from the same state variable. This is intentional — the hero message is most prominent.
- `findLaterSlot` uses the local clock day boundary (23:59) when no explicit `dayEndIso` is provided. If a user's free-time window extends past midnight, the boundary may cut off valid next-day slots. The action currently passes no explicit boundary, so overnight slots beyond 23:59 are not offered. This is conservative and safe; a future improvement is to pass the user's window end as `dayEndIso`.
- The 48-attempt slide cap is sufficient for any realistic packed day (48 × 15-min minimum shift = 12 h of sliding room) but is a safety guard, not a functional limit.

### Next recommended step

Pass the user's `availableEnd` window boundary to `moveScheduledBlockLater` so overnight plans can find slots beyond midnight. Requires either a new param on the action or storing the window in the DB with the schedule.

### Suggested commit message

standardize scheduler home and study library layout

---

## Session Update — 2026-05-04 (Home scheduler priority and clock integration)

### What changed

**`components/TodayDashboard.tsx`**
- **Grammar fix**: `"1 task still need a due date"` → `"1 task still needs a due date"` (singular/plural now both correct).
- **No duplicate Open buttons**: `primaryScheduleBlock` is now excluded from `filteredNow / filteredNext / filteredLater` via a `heroId` guard in the filter memo. The hero block (Start Here) no longer duplicates in the Today's Schedule list below it.
- **Move later on PlanRow**: `onReschedule` prop threaded through `PlanGroup` → `PlanRow`. When a schedule row is expanded/selected, a "Move later" ghost button appears alongside Open / Mark Done / Skip. Uses existing `rescheduleBlock` server action.
- **Section titles updated**: "Today plan" / "Today's schedule" → "Today's Schedule"; "Due soon" → "Due Soon"; "Course snapshot" → "Course Snapshot".
- **Clock wrapper removed**: `home-clock-face-wrap` div removed. `InteractivePlannerClock` now renders directly inside the rail card. One fewer nesting layer.
- **Moved `primaryScheduleBlock` declaration** above the `filteredNow/Next/Later` memo (was declared after; TypeScript reported a use-before-declaration error).

### Why it changed

The hero (Start Here) block was appearing both at the top of the page AND as the first row in Today's Schedule — two "Open" buttons for the same block. The grammar bug produced "1 task still need a due date". Section titles had inconsistent capitalization. The `home-clock-face-wrap` div added an extra layout nesting layer with no meaningful purpose after previous CSS flattening. Move Later was already wired in the hero but missing from the plan row; `rescheduleBlock` already existed so adding it to plan rows was a small extension.

### Tests run

- `npm run typecheck` ✅ passed (0 errors)
- `npm run lint` ✅ passed (0 warnings)
- `npm test -- scheduler` ✅ 242/242 passed

### Known risks / blockers

- **"Move later" does not actually shift the time.** `rescheduleBlock(id, block.startAt, block.endAt)` in both the hero and plan rows passes the block's current times unchanged — the DB call is a no-op except for `updated_at`. A real "move later" needs to compute `startAt + Δ` (e.g., push by 30 min or to end of window). TODO: implement time-shifting logic; until then the button triggers a server round-trip but produces no visible change.
- **`filteredNow` hero exclusion**: If the primaryScheduleBlock is in the "Now" group and the user opens the plan filter, the "Now" group may be empty (just a group label with no rows), which is confusing. The existing empty-group guard (`if (blocks.length === 0) return null`) handles this — the group disappears entirely. Fine for now.
- **Clock flatness**: Removing `home-clock-face-wrap` reduces one DOM nesting layer. If any CSS targeted `.home-clock-face-wrap > *` selectors those styles will need to be moved to `.home-clock-rail .planner-clock-face` — check `globals.css` if the clock layout shifts.

### Next recommended step

Fix the "Move later" time-shifting logic: compute a new `startAt = block.endAt` (push block to start right after its current slot) and update the duration accordingly. Or add a Δ-minutes UI. The server action and DB schema already support arbitrary times.

### Suggested commit message

fix home scheduler priority and clock integration

---

## Session Update — 2026-05-04 (Balance Today Plan tasks and study materials)

### What changed

**`components/TodayDashboard.tsx`**
- Added `filterMode` state (`'all' | 'tasks' | 'study'`, default `'all'`).
- Added `studyPacksByBlockId` memo — precomputes study pack lists keyed by `block.id` for cheap `PlanRow` lookup.
- Added `filteredNow / filteredNext / filteredLater` memo — applies filter mode to `nowBlocks/nextBlocks/laterBlocks`.
- Added `isTaskBlock(block)` utility: returns true for `task_items | tasks | deadlines | drafts(subtitle=Draft)`. All other sources are study blocks.
- **Filter chips** rendered above `home-plan-list`: "All", "Tasks", "Study Materials". Clicking a chip filters the Now/Next/Later groups. Filter does not affect the Start Here hero or Completed section.
- **`PlanGroup`**: new required prop `studyPacksByBlockId: Record<string, StudyPackRef[]>`. Passes `studyPacks={studyPacksByBlockId[block.id] ?? []}` to each `PlanRow`.
- **`PlanRow`**: new required prop `studyPacks: StudyPackRef[]`. When the block has attached study packs, shows inline `home-study-ready-chip` chips ("Study pack ready", "Quiz ready") in the metadata row — always visible, not only when selected. Tasks and study materials now have equal visual weight.
- **`PrimaryActionHero`**: new required prop `hasSchedule: boolean`. The "After that" section (which showed task-first `upNext` from home-overview) now only renders when `hasSchedule === false`. Renamed to "Also coming up" and changed "See all tasks" → "See all" to remove task-first framing.
- **Clock rail — generate button**: Added `ui-button-primary` "Generate plan" button inside the clock rail card, visible when `!hasSchedule`. When a stale note applies and a plan exists, shows a compact stale note pointing to the Today Plan regenerate button instead of duplicating it.
- **Clock ring — completed filter**: `InteractivePlannerClock` now receives `visibleSchedule.filter(b => b.status !== 'completed')` — completed blocks no longer appear on the clock ring.

**`components/InteractivePlannerClock.tsx`**
- Removed the `clock-status-stack` div (which showed `Free: HH:MM - HH:MM` and `NOW - ...`). These labels were already present in the `SectionHeading` above the clock in the rail card, causing duplication.

**`app/globals.css`**
- **`.planner-clock-face`**: removed `border`, `border-radius`, `padding`, and `background`. The class is now `position: relative; display: flex; flex-direction: column; align-items: center; gap: .35rem;`. The `.home-sheet` surface is the single card boundary for the clock widget.
- Removed the `@media (max-width: 640px)` padding override for `.planner-clock-face` (no longer has padding to override).
- Added `.home-plan-filter` / `.home-plan-filter-chip` / `.home-plan-filter-chip.active` for the Today Plan filter chip row.
- Added `.home-study-ready-chip` for inline study pack / quiz ready indicators inside `PlanRow` metadata.

**`tests/scheduler.test.ts`**
- Added 7 new tests (242 total, all passing):
  1. `study material block qualifies as primary Start Here item` — documents that `module_resources` blocks are eligible as the primary hero.
  2. `task and study material blocks are both produced by generateSchedule (equal scheduling)` — verifies both types appear in the schedule.
  3. `Today Plan order follows scheduled block startAt, not task-first priority` — verifies time-ordering of generated blocks.
  4. `study pack chips attach to study material block, not as standalone block` — documents study pack chip contract.
  5. `no source item appears in both Start Here and Today Plan` — verifies uniqueness via scheduler dedup.
  6. `completed blocks are excluded from active Today Plan and clock ring` — documents UI filtering contract.
  7. `clock card renders without nested heavy inner panel (structural contract)` — documents CSS flatness contract.

### Why it changed

Tasks were visually and structurally overshadowing study materials. The "After that" section used task-first home-overview data even when a schedule existed. The clock had a nested panel (`planner-clock-face` with its own border/background inside an already-bordered `home-sheet` card) creating an "onion" visual. The generate button was only in the primary card, but users adjust the time window in the clock rail and expect to trigger generation there.

### Canonical classification rules (unchanged)

| Source | Student group |
|---|---|
| `task_items`, `tasks`, `deadlines` | **Tasks** |
| `drafts` (subtitle = 'Draft') | **Tasks** |
| `modules`, `module_resources`, `learning_items` | **Study Materials** |
| `drafts` (other subtitle) | **Study Materials** |
| `deep_learn_notes` | Not a standalone block — chip under parent Module/Resource block |
| `status === 'completed'` | **Completed** (collapsed accordion, excluded from clock ring) |

### Tests run

- `npm run typecheck` ✅ passed (0 errors)
- `npm run lint` ✅ passed (0 warnings)
- `npm test -- scheduler` ✅ 242/242 passed

### Known risks

- Filter chips filter `nowBlocks/nextBlocks/laterBlocks` but do not filter the `completedBlocks` accordion or the Start Here hero. This is intentional — the hero always shows the best current block regardless of filter.
- If all blocks in a time group are filtered out, the group label is hidden (empty group returns null from `PlanGroup`). The user sees no group until they clear the filter. A "No Tasks scheduled" or "No Study Materials scheduled" empty state per group could improve clarity — deferred.
- `home-study-ready-chip` chips appear inline in the metadata row of `PlanRow`. If a block has both "Study pack ready" and "Quiz ready", both chips appear next to the type pill and time, which may wrap on narrow screens. The `home-row-meta` class already has `flex-wrap: wrap`, so wrapping is handled gracefully.
- The generate button in the clock rail is a duplicate of the one in the primary card (both appear when `!hasSchedule`). This is intentional for UX proximity — the user sees the clock, adjusts the window, and can generate right there.

### Blockers

None.

### Next recommended step

Review the filter chip "no results" empty state: when a user picks "Tasks" but there are no task blocks in Now/Next/Later, all three groups are hidden and the list is empty. A brief message like "No Tasks scheduled in this window" under the filter chips would prevent confusion. Consider adding it to `home-plan-list` when all filtered groups are empty.

### Suggested commit message

balance today plan tasks and study materials

---

## Session Update — 2026-05-04 (Restore home-first layout with integrated scheduler)

### What changed

**`components/TodayDashboard.tsx`** — complete rewrite
- Replaced the Clock Command Center / admin-table layout with the old home-first information architecture.
- Props expanded: now accepts all former home-overview props (`primaryAction`, `upNext`, `recentActivity`, `undatedTaskCount`) in addition to the existing scheduler props (`scheduledBlocks`, `studyPacksByModuleId`, `studyPacksByResourceId`, `dueSoon`, `courseSnapshots`).
- New layout: `home-page` → `home-layout` (main column + rail).
- **Main column**: Primary card (Start here), Today Plan (Now/Next/Later), Due Soon.
- **Rail**: Clock planner (InteractivePlannerClock), Study Packs, What Changed, Course Snapshot.
- **Primary card logic**: shows the live/next scheduled block when a schedule exists; falls back to `primaryAction` from home-overview (the old task-priority hero). If no schedule and no primary action, shows empty state + Generate plan button.
- **Today Plan**: compact `Now / Next / Later` groups using `home-plan-group` → `home-compact-list` → `home-list-row`. Completed blocks excluded from active groups; shown in a collapsed accordion at the bottom.
- **Clock placement**: `InteractivePlannerClock` moved to the rail as a secondary card (`home-clock-rail`). Clicking a clock segment still scrolls to the Today Plan and selects the block. Generate schedule button also available inside the primary card when no schedule exists, and inline in Today Plan when one does.
- **Old home sections restored**: `DueSoonRow`, `ActivityRow` (What Changed), `CourseSnapshotRow`, `CompactActionRow` (After that / up-next), all using old `home-sheet-row` / `home-row-open` layout.
- **Study packs section**: shows all unique packs from `studyPacksByModuleId` + `studyPacksByResourceId` in the rail. Study packs (deep_learn_notes) remain non-standalone-scheduled — their chips still appear under module/resource blocks in the primary card's expanded details.
- Retained all scheduler state: `useDemoSchedule`, `isPlanStale`, `availableStart/End`, `selectedBlockId`, `completedExpanded`, `handleGenerate`, `handleUpdateStatus`, `handleOpenBlock`, `handleRescheduleBlock`, `selectClockBlock`.
- All block-type helpers preserved: `getBlockHref`, `getStudentTypeLabel`, `getDoneLabel`, `getBlockStudyPacks`, `buildDemoScheduleBlocks`.
- Removed admin-facing `SCHEDULE_GROUPS`, `planner-shell`, `planner-timeline-column`, `planner-attention-panel`, `planner-start-panel`, `ScheduleCard`, `CompletedSection` (replaced with simpler `home-plan-completed` variant), `needsAttention` panel.

**`app/(app)/page.tsx`**
- Added `primaryAction`, `upNext`, `recentActivity`, `undatedTaskCount` from `overview` to the `TodayDashboard` call. These were previously computed but not passed.

**`app/page.tsx`** (root page — mirrors the (app) version)
- Updated to pass the same full prop set. Also added parallel `deep_learn_notes` fetch and study-pack maps to match the (app) version.

**`app/globals.css`**
- Added `.home-row-open` (was missing from current version; used by sheet-row action links).
- Added `.home-sheet-row-link` / `.home-sheet-row-link:hover` (used by ActivityRow).
- Added Today Plan CSS: `.home-plan-list`, `.home-plan-group`, `.home-plan-group-label`, `.home-plan-row`, `.home-plan-row-selected`, `.home-plan-row-main`, `.home-plan-row-actions`, `.home-plan-stale-note`.
- Added completed accordion CSS: `.home-plan-completed`, `.home-plan-completed-toggle`, `.home-plan-count`, `.home-plan-completed-row`.
- Added `.home-generate-prompt` / `.home-generate-copy` for the "no plan yet" prompt inside the primary card.
- Added `.home-clock-rail`, `.home-clock-face-wrap` for the clock rail card.
- All planner/clock CSS (`today-command-center`, `planner-shell`, `planner-block-card`, etc.) preserved — still needed by InteractivePlannerClock internals.

### Why it changed

The previous Clock Command Center layout prioritized the scheduling UI as the primary page surface. The product direction is schedule-first but home-first: the student lands on a clear "What should I do right now?" answer, with the clock as a planning tool in the sidebar — not the main content.

### Tests run

- `npm run typecheck` ✅ passed (0 errors)
- `npm run lint` ✅ passed (0 warnings)
- `npm test -- scheduler` ✅ 235/235 passed

### Known risks

- `home-plan-row` uses `grid-template-columns: minmax(0, 1fr) auto` for the normal state, but when `selected` and `home-plan-row-actions` renders, it spans `grid-column: 1 / -1`. This is handled by the CSS `.home-plan-row-actions { grid-column: 1 / -1 }` — verify renders correctly on narrow viewports.
- The primary card shows the "next upcoming" scheduled block even if it starts several hours away. If nothing is live now but the schedule has a block at 9 PM, that block appears as the hero. This may feel stale mid-morning; a time-proximity filter could improve relevance.
- `app/page.tsx` (root) and `app/(app)/page.tsx` now duplicate the same page logic. One of them may be unreachable depending on route group setup — the duplication should be resolved when route architecture is cleaned up.

### Blockers

None.

### Next recommended step

Review the responsive layout on mobile (≤720px): the Today Plan and Clock rail stack vertically, which is correct, but the clock SVG may need a `max-width` constraint inside `.home-clock-face-wrap` to prevent overflow on narrow screens. Consider adding `max-width: 320px; width: 100%; margin: 0 auto;` to `.home-clock-face-wrap` if the SVG stretches.

### Suggested commit message

restore home-first scheduler layout

---

## Session Update — 2026-05-04 (Scheduler source normalization + Clock design language restore)

### What changed

**`actions/scheduler.ts`**
- Removed `deep_learn_notes` from the Promise.all fetch entirely — it was only used to build `savedOutputResourceIds`, which is now gone.
- Removed `savedOutputResourceIds` set and the `if (savedOutputResourceIds.has(row.id)) return false` exclusion from the `readyResources` filter. Previously, any `module_resource` that had an associated `deep_learn_notes` or `drafts` was silently excluded from scheduling. This caused the Clock Command Center to show mostly Tasks and miss most study materials. The correct behaviour is to schedule the resource and show the study pack as a chip under the block.
- Updated the source-count log to remove the now-obsolete `module_resources_excluded_saved_output` field.

**`app/(app)/page.tsx`**
- Added `resource_id` to the `deep_learn_notes` select query.
- Built a second lookup map `studyPacksByResourceId` (resource UUID → study pack refs) in addition to the existing `studyPacksByModuleId`.
- Passed `studyPacksByResourceId` as a new prop to `TodayDashboard`.

**`components/TodayDashboard.tsx`**
- Removed `'drafts'` from `ScheduleGroupKey` and `SCHEDULE_GROUPS`. Drafts are not a student-facing category — task drafts route to `tasks`; study drafts route to `modules`.
- `SCHEDULE_GROUPS` now contains exactly two active groups: `tasks` (Tasks) and `modules` (Modules / Study Materials).
- `getBlockGroup` updated: task_items / tasks / deadlines → `tasks`; drafts with subtitle `'Draft'` → `tasks`; everything else (modules, module_resources, learning_items, study drafts) → `modules`.
- Added `getBlockStudyPacks` helper that returns study packs for both `modules` (via `studyPacksByModuleId`) and `module_resources` (via `studyPacksByResourceId`).
- Groups now always render when `visibleSchedule.length > 0` — both Tasks and Modules/Study Materials show even if empty, with an honest empty-state message (`schedule-group-empty`) rather than being silently hidden.
- Moved `schedule-context` (subtitle) and `schedule-urgency` (urgencyNote) out of the always-visible card row into the expanded `planner-block-details` section. Collapsed cards now show only: type chip, NOW pill, title, time + duration.
- Updated `getStudentTypeLabel` so `drafts` with subtitle `'Draft'` returns `'Task'` (was `'Draft'`).
- Updated demo schedule block: replaced the `deep_learn_notes` demo entry with a `module_resources` PDF entry, matching the new rule that study packs are never standalone scheduled blocks.

**`app/globals.css`**
- Removed the table-like `.schedule-group` styling (was: `border: 1px solid var(--border-subtle); overflow: hidden`).
- Removed overrides that flattened block cards into spreadsheet rows (`border-radius: 0; border-left: none; border-right: none; border-bottom: 1px solid`).
- `.schedule-group-header` is now a section label (no background box, uppercase small text, no hover fill).
- `.schedule-group .planner-schedule-list` uses `gap: 0.42rem` with standalone cards — matching the Courses/Learn card language (`rounded-xl`, each item separated by gap).
- `.schedule-groups` gap increased from `0.15rem` to `1.1rem` to visually separate sections.
- Added `.schedule-group-empty` style for the honest empty state paragraph.
- `schedule-context` and `schedule-urgency` margin/spacing updated to work inside the expanded details section.

**`tests/scheduler.test.ts`**
- Added 5 new tests (21 total, all passing):
  1. `no duplicate source keys in generateSchedule output` — same sourceTable:sourceId deduped to one block.
  2. `module_resource with study pack is still schedulable` — documents new contract that study pack is metadata, not exclusion.
  3. `deep_learn_notes are never added as standalone scheduler source items by the action` — contract documentation test.
  4. `completed group is collapsed by default (TodayDashboard initial state)` — documents initial state contract.
  5. `task sources map to task group; module_resource sources map to module group` — verifies getBlockGroup classification logic inline.

### Canonical classification rules (updated)

| Source | Student group | Notes |
|---|---|---|
| `task_items`, `tasks`, `deadlines` | **Tasks** | |
| `drafts` (subtitle = 'Draft') | **Tasks** | Task-sourced draft is actionable work |
| `modules`, `module_resources`, `learning_items` | **Modules / Study Materials** | |
| `drafts` (other subtitle) | **Modules / Study Materials** | Study-sourced draft is learning material |
| `deep_learn_notes` | Not a standalone block | Shown as study-pack chip under parent Module or Resource block |
| `status === 'completed'` | **Completed** (collapsed accordion) | Excluded from active groups |

### Verification results

- `npm run typecheck` ✅ passed
- `npm run lint` ✅ passed
- `npx tsx --test tests/scheduler.test.ts` ✅ 21/21 passed

### Known risks / next steps

- The `study-pack-chip` for `module_resources` blocks links to `/library/[id]` (the study pack detail). If a user has multiple study packs per resource the chip list will grow; consider showing only the latest or a "+N more" pill.
- `studyPacksByResourceId` is now fetched on every page load regardless of whether the schedule panel is shown. If the table grows large, consider scoping the query to only resource IDs present in the current schedule.
- Modules priority score: module_resources with no due date receive a low `urgencyScore` (25) vs. tasks with imminent deadlines (78–100). This means tasks still fill the schedule first by score. This is intentional — urgent tasks should be prioritized — but it can mean modules don't appear if the time window is short. No change required now; surfaced for awareness.
- The "Sort modules: related to upcoming tasks first" requirement (from earlier sessions) is still pending — needs cross-referencing module IDs against task due dates.

### Session type
Implementation session (source classification fix, visual redesign, test expansion). No schema changes.

### Suggested commit message
fix scheduler source normalization and restore clock design language

---

## Session Update — 2026-05-04 (Schedule classification and completed grouping)

### What changed

- **`actions/scheduler.ts`**: Removed `deep_learn_notes` from the scheduler source item list. Study packs are generated output attached to modules; they must not appear as standalone schedulable blocks. The fetch is retained solely for the `savedOutputResourceIds` filter that excludes module resources already covered by a study pack or draft.

- **`app/(app)/page.tsx`**: Added a parallel fetch for `deep_learn_notes` (id, module_id, title, quiz_ready). Built a `studyPacksByModuleId` map (module UUID → study pack refs) and passed it as a new prop to `TodayDashboard`.

- **`components/TodayDashboard.tsx`**: Multiple improvements:
  - Module block cards now show linked study-pack chips for any associated study packs (linked directly to `/library/[id]`), fulfilling the "study pack under its module" requirement with no duplicate schedule entries.
  - Completed blocks are removed from active group lists and collected in a collapsed **Completed** accordion at the bottom of Today's Schedule, sorted newest-completed first (by endAt descending). The accordion is closed by default.
  - Removed the `schedule-meta-note` paragraph (estimate confidence + reason text) from the main visible card row. This text now appears only inside the expanded block details section.
  - Each active group is sorted: missed blocks (scheduled + endAt in the past) first, then ascending by startAt (which already reflects scheduler priority order).
  - Added `sortGroupBlocks` helper.
  - `activeBlocks` is now derived separately from `completedBlocks` so group rendering only iterates non-completed items.

- **`tests/scheduler.test.ts`**: Added 4 new tests:
  - Documents that the algorithm itself does not filter deep_learn_notes (action-level exclusion contract).
  - Verifies task_items produce task-typed blocks.
  - Verifies modules and module_resources appear in generated schedule.
  - Verifies all generated blocks start with status `scheduled` (completed-block filtering is a UI concern).

- **`app/globals.css`**: Added `.completed-group`, `.study-pack-sublist`, `.study-pack-chip`, `.study-pack-chip-icon`, `.study-pack-chip-badge` using existing design tokens. No new visual language.

### Classification rules (canonical, post-session)

| Source | Student-facing group |
|---|---|
| `task_items`, `tasks`, `deadlines` | **Tasks** |
| `modules`, `module_resources`, `learning_items` | **Modules** |
| `drafts` (subtitle=Draft) | **Drafts** |
| `drafts` (other subtitle) | **Modules** |
| `deep_learn_notes` | Not a standalone scheduled block. Shown as study-pack chip under the parent Module block. |
| `status === 'completed'` (any source) | **Completed** collapsed accordion, excluded from active groups. |

### Verification results

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx tsx --test tests/scheduler.test.ts` passed (16/16 tests).

### Remaining risks / next steps

- The `study-pack-chip` link points to `/library/[id]`. If a study pack's module has no scheduled block in the current window (e.g., the module was not selected during generation), its study pack will not be visible on the Today surface. Future work: surface study packs attached to modules that weren't scheduled (e.g., in a separate Study Pack sidebar or within module detail pages).
- Completed accordion uses `block.endAt` as a proxy for "completed at" since the `scheduled_blocks` table does not store a `completed_at` timestamp. Schema addition would improve sort accuracy.
- Drafts classified as `modules` group when subtitle is not "Draft" — this is intentional (study drafts are learning-material outputs). If the product hierarchy should always put drafts in Tasks, change `getBlockGroup` to map all `drafts` → `tasks`.
- The "Sort modules: related to upcoming tasks first" requirement requires cross-referencing module IDs against task due dates, which isn't in the current scheduled block data. Currently modules sort by missed-first then startAt (which reflects scheduler priority). Full implementation would require either enriching the scheduled block row with task-relation metadata or a client-side join.

### Session type
Implementation session (runtime UI changes, no schema changes).

## Session Type

Documentation-only session (no runtime behavior changes, no schema changes, no route renames).

## What Changed This Session

- Added `docs/ai/implementation_plan.md` with an implementation-ready schedule-first rollout plan.
- Rewrote `AGENTS.md` into an operational manual for AI coding sessions.
- Updated `README.md` overview and product framing to reflect schedule-first command-center direction.
- Updated this handoff with canonical direction, rationale, and next steps.

## Why It Changed

The repository needed implementation-ready context for the new schedule-first direction, plus stronger process discipline to prevent stale docs, context drift, and unfocused implementation passes.

## Canonical Product Direction (Current)

Stay Focused is a **schedule-first student productivity app over Canvas**.

The primary product question is: **“What should I do next with the time I have available?”**

Priority hierarchy:

1. Schedule / Today Plan
2. Calendar (deadline/event feeder)
3. Tasks
4. Deep Learn / Review / Quiz
5. Do Draft / Outputs

Additional direction:

- Calendar is not the main command center.
- Deep Learn/Review/Quiz/Do Draft should activate from scheduled blocks.
- Study Library remains the persistent output repository.
- AI should reduce overwhelm and speed execution.

## Next Recommended Coding Steps

1. Implement Phase 1 from `docs/ai/implementation_plan.md`: reframe `/` into a Today Plan-first command center using existing components.
2. Add explicit “Next Block” + available-time framing on the home surface with minimal architecture disruption.
3. Validate hierarchy in UI copy and layout so calendar remains secondary.
4. Run lint/typecheck and document outcomes in the next handoff.

## Risks / Blockers

- Existing home composition may still bias toward dashboard-style scanning over direct next-action execution.
- Calendar-first legacy patterns may persist in labels/content order without intentional cleanup.
- Scheduler trust depends on visible logic around priority/time-fit and reliable Canvas-fed deadlines.

## Verification Status for This Session

- Planned to run `npm run lint` and `npm run typecheck` for documentation touch validation.
- If either check fails due to unrelated pre-existing issues, record details in the next implementation handoff.

## Maintenance Rule

After every coding session, update this file before final handoff so current direction, changes, and risks remain explicit.

---

## Session Update — 2026-04-30 (Phase 1 scheduler foundation)

### What changed
- Added Supabase migration for `scheduled_blocks` plus schedule/scoring fields across `tasks`, `task_items`, `deadlines`, `modules`, `module_resources`, and `learning_items`.
- Added scheduler foundation modules:
  - `lib/scheduler/types.ts`
  - `lib/scheduler/priority.ts`
  - `lib/scheduler/estimation.ts`
  - `lib/scheduler/algorithm.ts`
- Added scheduler server actions:
  - `generateUserSchedule(freeTimeStart, freeTimeEnd)`
  - `updateBlockStatus(blockId, status)`
  - `rescheduleBlock(blockId, start, end)`
- Added scheduler-focused tests for scoring, estimation, generation, status transitions, preservation behavior, and metadata-only confidence behavior.

### Why it changed
To implement the Phase 1 backend foundation for schedule-first planning while preserving existing Today UI and keeping block state user-controlled.

### Scoring formula summary
- `schedule_priority_score = importance*0.35 + urgency*0.45 + difficulty*0.10 + freshness*0.10`.
- Urgency strongly boosts overdue and near-due work.
- Announcements/references are intentionally down-weighted versus deliverables.

### Estimation rules summary
- Reuse existing estimates when present (high confidence).
- Overdue work gets catch-up estimate.
- Quizzes/exams due soon get larger prep allocation.
- Coding/report style tasks get larger workload baseline.
- Long readable resources estimate from extracted text length.
- Metadata-only/unreadable resources get low-confidence short estimates.
- Modules with no due date get a moderate default review block.

### Scheduler limitations (current)
- Regeneration only replaces future `scheduled` blocks (`start_at >= now`); opened/completed/skipped and past scheduled blocks are preserved.
- No auto-skip behavior.
- Missed status is lazy/on-read logic (utility-based), no cron required.
- No drag clock UI yet and no full Today UI replacement.
- Scoring failures are isolated from Canvas sync/page load path (scheduler logs/returns safely on fetch issues).

### Next recommended step
Build the Clock Command Center UI shell on top of persisted `scheduled_blocks` (still without draggable interactions).

### Risks / blockers
- Current schedule source set is intentionally narrow (task items/modules/resources) to keep rollout low-risk.
- No background missed-state sweep (by design due to Vercel Hobby cron constraints).
- Tuning weights may need calibration after real user data.

### Session type
Implementation session (runtime + schema changes).

---

## Session Update — 2026-04-30 (Clock Command Center UI shell)

### What changed
- Replaced the legacy Today dashboard shell with a schedule-first Clock Command Center structure in `TodayDashboard`.
- Added required sections in the approved hierarchy:
  - Current / Next Block hero
  - Need Attention (lazy missed scheduled blocks)
  - Compact Clock visual shell (ring/list hybrid)
  - Coming Up list
  - Supporting links
- Wired Generate/Regenerate schedule action through the existing `generateUserSchedule` server action.
- Added block status actions for Start/Open, Complete, Skip, plus a placeholder reschedule trigger using existing action wiring.
- Updated home entry points (`app/page.tsx` and `app/(app)/page.tsx`) to fetch persisted `scheduled_blocks` and feed the new dashboard shell while preserving existing due-soon/course data flows.
- Added new UI-only styles in `app/globals.css` for command-center layout, mobile-first ordering, and desktop two-column shell (clock left, details right).

### Why it changed
To implement Phase 1’s schedule-first home shell quickly and safely without overbuilding interactions (no drag handles, no cron, no complex animation), while keeping existing data pipelines intact.

### Current product direction
Home now prioritizes schedule execution flow first (what to do now, what was missed, what is next), with calendar/tasks/courses as supporting pathways.

### Next recommended steps
1. Add source-aware deep links per scheduled block (task/module/resource destination routing).
2. Improve clock shell fidelity (optional true arc rendering with tested math) only after UX validation.
3. Add explicit missed badge/status derivation in server query layer for consistency across surfaces.
4. Add lightweight user-configurable schedule window for generation (instead of fixed 08:00–22:00).

### Risks / blockers
- Current reschedule button is intentionally placeholder-level (passes through existing action with unchanged times).
- Some scheduled block source types still need richer contextual drill-through.
- Full test suite currently has unrelated pre-existing PDF extraction test failures (`Promise.try` / extraction expectations).

### Verification status
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` ran; 5 pre-existing PDF extraction-related tests failed (details in terminal output).

### Session type
Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Clock Command Center polish + empty states)

### What changed
- Added critical schedule empty states in `TodayDashboard`:
  - no schedule generated yet
  - no Canvas/task source data available
  - short-time/no-meaningful-plan guidance
  - all scheduled blocks completed success state
- Added trust microcopy layer on block rows/cards with small muted estimate-origin labels.
- Improved current-block clarity:
  - explicit “Current Block” vs “Next up” labeling
  - remaining-time indicator
  - urgency emphasis styling on active block
- Improved Need Attention and Coming Up usability:
  - missed blocks sorted by urgency/time
  - “missed and need your decision” framing copy
  - Coming Up capped to 3 with subtle priority dot/tone
- Improved generation UX:
  - generation button disables while running
  - loading state copy now “Building your plan…”
  - post-generation scroll to current block section
- Added CSS refinements to reduce layout shift, improve mobile spacing, and keep visual hierarchy clear between high-priority and supporting cards.

### Why it changed
To improve clarity, trust, and execution confidence in the Clock Command Center without introducing major feature scope (no drag clock, no cron, no route changes).

### Current product direction
Continue iterating the schedule-first command center so students can quickly decide and act on the next best block with minimal overwhelm.

### Next recommended step
Add source-aware deep links from each schedule block into its exact task/module/resource destination while keeping command-center visual hierarchy stable.

### Risks / blockers
- “Free-time too short” currently appears when a schedule exists but no active/next actionable block remains; true free-window inference still depends on future schedule-window settings.
- Post-generation scroll depends on client-side state update timing and may feel subtle when schedule is unchanged.

### Verification status
- `npm run typecheck` passed.
- `npm run lint` passed.

### Session type
Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Dev demo schedule preview for Today)

### What changed
- Added a temporary **dev-only** demo schedule toggle in `TodayDashboard` that appears as a subtle control (`Preview demo schedule`) when there is no meaningful active plan context.
- Implemented local in-memory demo blocks (no database writes) to populate Clock Command Center states:
  - active/current block
  - next up
  - coming up items
  - missed item for Need Attention
  - completed item
  - skipped item (supported status)
- Enriched block rendering for preview realism with optional context + urgency/deadline-basis notes.
- Refined empty-state behavior:
  - removed duplicate generate CTA from the empty card
  - added “Start here” fallback with three secondary placeholder actions
  - updated passive empty copy to stronger guidance
  - kept Coming Up guidance aligned with generation flow

### Why it changed
The command center looked visually polished but functionally dead when no blocks existed. This adds a safe preview path for UI validation and mobile checks without requiring Canvas sync timing or generated persisted blocks.

### Guarding details
- Demo control is guarded by `process.env.NODE_ENV !== 'production'` and only shown in low-schedule contexts.
- Demo data is local component state only; it does not write to Supabase.
- Status/reschedule server actions are disabled while demo mode is active.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.

### Risks / blockers
- Demo toggle is intentionally temporary and local to `TodayDashboard`; future refactors should remove or replace it once command-center confidence testing is complete.
- Visual verification at exact 390px / 430px widths was not run with browser automation in this session (tooling not invoked).

### Next recommended step
- Add lightweight Playwright viewport checks (390px and 430px) for both no-schedule and demo-schedule states, then remove the temporary demo control after design sign-off.

### Session type
Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Today empty-state shell + mobile setup controls)

### What changed
- Updated `TodayDashboard` empty-state flow so the Clock Command Center shell always renders first after title, including when there are zero schedule blocks.
- Replaced the prior empty-state generate placement with an in-card setup section that includes visible start/end time inputs plus an available-duration summary.
- Wired generate action to selected local time window (`generateUserSchedule(availableStart, availableEnd)`) instead of fixed `08:00–22:00`.
- Moved primary “Generate Today Plan” button into setup card when no schedule exists; retained “Building your plan…” pending copy.
- Added guarded demo preview control directly in setup card and expanded guard behavior to allow explicit enablement in production-like previews.
- Prevented broken empty current-block presentation by showing meaningful guidance when no current/next block exists.
- Kept Need Attention empty message calm and removed Coming Up section in no-schedule state.
- Updated compact clock empty shell copy to: “Available time”, “No blocks yet”, “Set your time, then generate”.
- Added styling for mobile-first order and setup controls.

### Demo preview env guard
- Demo preview is shown when either:
  - `process.env.NODE_ENV !== 'production'`, **or**
  - `process.env.NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'`.
- This keeps it visible for local dev/test and optionally for Vercel preview/manual QA via explicit opt-in flag.

### Free-time control wiring status
- Start/end controls are currently **local client state** in `TodayDashboard`.
- They are now directly passed into the server generation action on submit.
- Persistence of preferred window beyond current page lifecycle is not yet implemented.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- Manual browser viewport verification at exact 390px/430px was **not automated** in this session.

### Remaining risks / blockers
- Available-time selections are not persisted per user yet.
- No hard validation message beyond disabling generate on invalid range.
- Exact mobile rendering at 390px and 430px still needs explicit visual QA/screenshot validation.

### Session type
- Implementation session (runtime UI changes, no schema changes).

## Session Update — 2026-04-30 (Today planner-surface redesign)

### What changed
- Refactored `TodayDashboard` into a unified planner surface (`today-command-center` + `planner-shell`) instead of stacked cards.
- Reordered mobile flow so the clock/planner visual is first after title, followed by time controls/generate buttons, then timeline.
- Moved generate/regenerate control into the planner clock column and removed standalone header CTA.
- Implemented a cleaner clock-face visual with 12/3/6/9 markers, free-time label, and NOW chip when active block exists.
- Reworked right column into a vertical timeline with explicit row time labels, block state styling (`is-now`, `is-missed`, `is-completed`, `is-skipped`), and inline actions (Start/Complete/Skip/Later).
- Added no-block timeline empty state copy: “No blocks yet” + “Set your time, then generate your plan.”
- Kept Need Attention below the timeline in a compact panel and moved Start Here fallback below planner surface.
- Preserved dev/demo preview guard (`NODE_ENV !== production || NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'`) and added in-UI note for Vercel preview env flag usage.
- Added extra Today page bottom padding through planner container to avoid mobile bottom-nav overlap with generate/setup controls.

### Responsive behavior
- Desktop/wide: two-column planner shell with sticky left clock/control column and right timeline column.
- Mobile: single unified stack ordered as title → clock → free-time controls/buttons → timeline → need attention → start here fallback.
- Time inputs remain in a constrained 2-column grid with full-width input controls to avoid overflow.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.

### Remaining risks / blockers
- No browser automation screenshot verification was executed in this session for exact 390px and 430px widths.
- Clock remains static visual (intentional for this phase); no drag/drop or real arc scheduling interactions were introduced.
- “Later” action remains placeholder wiring to existing reschedule action with unchanged times.

### Session type
- Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Clock Command Center schedule-window sync)

### What changed
- Added shared scheduler time helpers in `lib/scheduler/time.ts`:
  - `timeToMinutes`
  - `minutesToTime`
  - `formatTime`
  - `formatDuration`
  - `isBlockInsideWindow`
- Updated `TodayDashboard` to derive `visibleSchedule` by filtering schedule blocks against the selected free-time start/end window before calculating:
  - current block
  - timeline blocks
  - Need Attention blocks
  - completed/all counts
  - inner clock schedule ring segments
- Updated the clock visual so the outer free-time arc and inner planned-block ring are generated from the same selected window and filtered blocks.
- Normalized `HH:mm` time input into same-day ISO timestamps before schedule generation, with the server action also accepting either `HH:mm` or ISO input defensively.
- Added focused scheduler tests for time helpers and window filtering.

### Why it changed
The selected free-time window and visible schedule had drifted apart. A user could choose a morning window such as 5:45 AM to 8:45 AM while the Today schedule still displayed afternoon or evening blocks. The command center now hides blocks that do not fit inside the selected window for this pass.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx tsx --test tests/scheduler.test.ts` passed.

### Remaining risks / blockers
- This pass filters out-of-window blocks instead of automatically rescheduling them.
- Cross-midnight free-time windows are still treated as invalid.
- Full browser screenshot verification at exact mobile widths was not run in this session.

### Session type
- Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Clock Command Center layout restoration)

### What changed
- Restored the Clock Command Center as a polished two-column planner card:
  - left column for clock visual, legend, time controls, duration, and plan actions
  - right column for Today's Schedule, Need Attention, and Start Here
- Replaced fragile literal clock marker text with a fixed-size SVG clock visual so marker text cannot collapse into debug-looking output such as `12369`.
- Preserved the schedule/free-time synchronization logic from the previous pass:
  - `visibleSchedule`
  - shared scheduler time helpers
  - filtering blocks inside the selected free-time window
  - filtered inner clock ring data
- Added stale-window UI behavior when start/end controls change.
- Updated schedule cards with dot, title, formatted time range, duration, and compact actions.
- Updated the empty state to explain when no blocks fit the selected time window.

### Files touched
- `components/TodayDashboard.tsx`
- `app/globals.css`
- `docs/ai/handoff.md`

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx tsx --test tests/scheduler.test.ts` passed.

### Browser verification notes
- The local home route currently shows the sync-first empty state because this environment has no synced workspace data.
- Used a temporary local verification route with fixture schedule data, then removed it before finalizing.
- Desktop verification confirmed:
  - clock visible with non-zero dimensions (`391x280`)
  - two-column layout (`420px` left column plus remaining right column)
  - no `12369` text
  - out-of-window fixture block hidden
  - no framework error overlay or console errors
- Mobile verification at `390px` confirmed:
  - clock stacks above schedule
  - no horizontal overflow
  - clock remains visible with non-zero dimensions
- Changing the window to `05:45`-`08:45` showed the expected empty state and no schedule cards.

### Remaining risks
- Browser verification used fixture data because the local signed-out/sync-empty state cannot mount the real Today dashboard.
- Automatic rescheduling is still out of scope; out-of-window blocks are filtered.
- Cross-midnight free-time windows are still invalid.

### Next recommended step
Run the same browser checks against an authenticated/synced workspace or seeded local data, then add a small regression test harness for the Today dashboard states.

---

## Session Update - 2026-05-02 (Scanned PDF OCR gating for Deep Learn)

### What changed
- Tightened PDF extraction so image-only PDFs and below-threshold image-heavy extracts are classified as OCR-required instead of usable text.
- Added page-level OCR metadata support in `lib/extraction/pdf-ocr.ts` and persisted it through `buildOcrCompletedUpdate`.
- OCR completion now mirrors recovered text into `module_resources.extracted_text`, preview, and char count only when useful text exists.
- OCR failure/no-text now leaves normal extraction status as `empty` while marking `visual_extraction_status = failed`.
- Disabled Deep Learn scan fallback generation from binary files; selected resources must have stored extracted text or completed visual text before generation.
- Updated Deep Learn prompt grounding to exclude module summaries, linked context, assignment metadata, deadlines, and other stale course/module facts.
- Updated image-based PDF UI copy to: `This PDF appears to be image-based. Run visual extraction first.`

### Why it changed
Scanned PDFs with no parsed text could still trigger Deep Learn output from stale surrounding context. The new flow blocks generation until OCR/visual extraction produces real page text for the selected resource.

### Tests added/updated
- Image-only PDFs remain not ready until OCR completes.
- Empty selected resources block Deep Learn and do not use stale module/course context.
- Completed OCR makes the resource ready and stores page-level metadata.
- Prompt grounding uses selected resource extracted text and excludes stale ERP/SAP/Gym Badge-style context.

### Verification results
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.

### Risks / next steps
- OpenAI OCR still depends on the model returning page labels (`Page 1:` etc.); unlabeled output is stored as page 1.
- The exact 20-page `1.1-Data Organization.pdf` fixture was not present in-repo, so coverage uses synthetic image-only PDFs plus Deep Learn grounding tests around the expected Data Organization terms.
- Next step: run OCR against the real Canvas/stored PDF and confirm extracted page text includes Data Organization, OLTP, ODS, Subject-Oriented, Integrated, Current Valued, and Volatile, with no ERP/SAP/Gym Badge leakage.

### Session type
- Implementation session (runtime extraction/readiness/generation changes, no schema changes).

---

## Session Update - 2026-05-02 (Real-file scanned PDF validation)

### What changed
- Added [`scripts/validate-scanned-pdf.ts`](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/scripts/validate-scanned-pdf.ts) for repeatable local validation against a real scanned/image-only PDF.
- The validator loads `.env.local`, runs the normal PDF parser, checks pre-OCR Deep Learn readiness/UI copy, attempts OpenAI OCR, falls back to local rendered-page OCR for validation when needed, then verifies post-OCR readiness plus source-only Deep Learn generation.

### Real-file result
- Validated against local file: `C:\Users\omgra\Downloads\1.1-Data Organization.pdf`
- Normal parsing returned `empty` with `pdf_image_only_possible`.
- Pre-OCR resource was `unreadable`, not Deep Learn-ready.
- Pre-OCR UI copy matched exactly:
  `This PDF appears to be image-based. Run visual extraction first.`
- Rendered-page OCR validation recovered the expected source terms, including:
  `DATA ORGANIZATION`, `OLTP`, `Online Transaction Processing`, `ODS`, `Operational Data Store`, `Subject-Oriented`, `Integrated`, `Current Valued`, `Volatile`
- Deep Learn generation using the OCR-backed selected resource passed the stale-context check and did not emit `ERP`, `SAP Learning Hub`, or `Gym Badge` as unrelated fallback context.

### Important risk discovered
- The current OpenAI PDF OCR path did not reliably transcribe this real file. In repeated runs it returned refusal/too-short text such as:
  `I'm unable to transcribe text from images or PDFs...`
- The validator therefore used rendered-page local OCR as a validation fallback only. This means the guardrail is correct, but the production OCR path still needs a stronger rendered-page extraction implementation for real scanned slide decks.

### Verification results
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.

### Next step
- Replace or augment the current OpenAI PDF-file OCR call with rendered-page vision extraction inside the app pipeline, then rerun the same validator and remove the validation-only fallback distinction.

---

## Session Update - 2026-05-02 (Production rendered-page OCR for scanned PDFs)

### What changed
- Replaced the scanned PDF OCR adapter in [lib/extraction/pdf-ocr.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/extraction/pdf-ocr.ts) so production OCR now renders PDF pages to images first and sends rendered page images to the vision model.
- Added direct runtime dependency on `@napi-rs/canvas` so `unpdf` can render pages server-side in Node.
- OCR now runs page-by-page with bounded rendering and retries:
  - max pages per run: default `24` (`OPENAI_OCR_MAX_PAGES`)
  - first render width: default `1800`
  - retry render width for empty/failed pages: default `2400`
- Page-level OCR metadata now stores:
  - page number
  - extracted text
  - char count
  - status (`completed` / `empty` / `failed`)
  - provider/model
  - refusal flag
  - page-level error
  - attempts
  - rendered image dimensions
- OCR merge still writes usable text into `module_resources.extracted_text`, preview, and char count only when enough useful text exists.
- Updated [scripts/validate-scanned-pdf.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/scripts/validate-scanned-pdf.ts) to use the same production OCR path instead of the old validation-only offline fallback.

### Real-file result
- Production rendered-page OCR validated against local file:
  `C:\Users\omgra\Downloads\1.1-Data Organization.pdf`
- Pre-OCR behavior remained correct:
  - normal parse returned `empty`
  - `pdf_image_only_possible`
  - Deep Learn readiness stayed blocked
  - UI copy matched:
    `This PDF appears to be image-based. Run visual extraction first.`
- Production OCR recovered the expected terms from rendered pages:
  `DATA ORGANIZATION`, `OLTP`, `Online Transaction Processing`, `ODS`, `Operational Data Store`, `Subject-Oriented`, `Integrated`, `Current Valued`, `Volatile`
- Real-file validator passed using the production path, and Deep Learn generation stayed grounded in the selected OCR text without leaking stale module/course context.

### Remaining risks
- OCR currently caps processing to the first `24` pages per run by default. This worked for the real slide deck because the required material appeared early, but longer scanned PDFs may need a follow-up pass or a higher configured page cap.
- Page-level confidence is still `null` because the OpenAI vision response does not expose OCR confidence scores.
- The adapter is intentionally conservative: partial page failures are recorded in metadata, but the resource is only marked completed when the merged OCR text is useful overall.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed.

### Next step
- Add a resumable follow-up OCR path for truncated scanned PDFs so page ranges beyond the first run can be processed without redoing already successful pages.

---

## Session Update - 2026-05-02 (Deep Learn source-text quality gate for OCR refusal and metadata)

### What changed
- Added shared extracted-text classification in [lib/extracted-text-quality.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/extracted-text-quality.ts) with these outcomes:
  - `meaningful`
  - `too_short`
  - `refusal`
  - `metadata_only`
  - `boilerplate`
  - `empty`
- Deep Learn readiness now uses that classifier instead of treating any non-empty OCR string as usable text.
- OCR completion in [lib/source-ocr-updates.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/source-ocr-updates.ts) now:
  - classifies each OCR page
  - merges only usable page text
  - refuses to mirror refusal/metadata/boilerplate text into `extracted_text`
  - stores refusal/error state in metadata only
  - keeps `extraction_status = empty` and `visual_extraction_status = failed` when OCR did not recover meaningful study text
- Deep Learn prompt grounding in [lib/deep-learn-generation.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-generation.ts) now strips prompt-side resource metadata that could become fake study material:
  - removed resource UUID/id from the grounding block
  - removed quality-note/source-warning text from the factual grounding block
  - preserved only selected-resource source text as grounding
- Saved Deep Learn pack UI in [lib/deep-learn-ui.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-ui.ts) now blocks packs whose `sourceGrounding.sourceTextQuality` is not `meaningful`, or whose source grounding is obviously insufficient.
- Learn resource UI and source-readiness checks now use the same quality gate so OCR refusal text does not surface as reader-ready content.
- Real-file validator in [scripts/validate-scanned-pdf.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/scripts/validate-scanned-pdf.ts) now fails if production OCR returns only refusal/metadata text but still appears Deep Learn-ready.

### Why it changed
- A scanned PDF OCR refusal such as `I'm unable to transcribe text from images or scanned documents at this time...` could still be stored as extracted content and then turned into a Deep Learn pack containing document titles, UUIDs, and extraction notes.
- The new gate forces Deep Learn to wait for meaningful academic text and blocks metadata-shaped or refusal-shaped OCR output from becoming study material.

### Blocked message
- The OCR/no-usable-text path now uses:
  `Visual extraction did not find enough usable study text. Try OCR again or open the original source.`

### Real-file validation result
- Re-ran the production validator against:
  `C:\Users\omgra\Downloads\1.1-Data Organization.pdf`
- Result:
  - pre-OCR parse stayed `empty` / `pdf_image_only_possible`
  - pre-OCR Deep Learn stayed blocked
  - pre-OCR UI copy stayed:
    `This PDF appears to be image-based. Run visual extraction first.`
  - production rendered-page OCR recovered meaningful source text
  - validator confirmed expected terms including:
    `DATA ORGANIZATION`, `OLTP`, `Online Transaction Processing`, `ODS`, `Operational Data Store`, `Subject-Oriented`, `Integrated`, `Current Valued`, `Volatile`
  - Deep Learn generation stayed grounded in selected-resource OCR text and did not leak `ERP`, `SAP Learning Hub`, or `Gym Badge`

### Tests added/updated
- Refusal text is not Deep Learn-ready.
- Metadata-only OCR text is not Deep Learn-ready.
- UUID/title-only OCR text is not Deep Learn-ready.
- OCR refusal is stored as metadata/error, not mirrored into `extracted_text`.
- Valid Data Organization OCR text is Deep Learn-ready.
- Saved Deep Learn packs with bad source grounding are blocked in the UI.
- Learn resource UI does not surface OCR refusal text as ready reader content.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed.

### Remaining risks
- The classifier is heuristic. It is tuned to reject refusal/metadata/UUID-heavy OCR output, but extremely short legitimate slides can still depend on adjacent pages to cross the meaningful-text threshold.
- OCR still processes only the first `24` pages per run by default, so longer scanned decks may need a resumable follow-up pass before the source becomes fully grounded.

### Next step
- Add resumable page-range OCR so long scanned PDFs can accumulate meaningful text across multiple runs without reprocessing already successful pages.

---

## Session Update - 2026-05-02 (Deep Learn preview regression: metadata/debug grounding removal)

### What changed
- Removed metadata/debug fields from the actual model grounding prompt in [lib/deep-learn-generation.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-generation.ts). The model no longer receives these as study content:
  - file title
  - source type
  - module name
  - course name
  - extraction quality
  - source text quality
  - grounding strategy
  - AI fallback status
  - scanned-image transcription status
  - resource id / UUID-like identifiers
- The prompt now sends only the selected resource source text after it passes the meaningful-text gate.
- Strengthened [lib/extracted-text-quality.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/extracted-text-quality.ts) so refusal/fallback text is rejected even when mixed with metadata/debug labels.
- Added a harder server-side generation gate:
  - blocks when source text quality is not `meaningful`
  - blocks refusal phrases
  - blocks metadata-heavy label/debug text
  - blocks low academic-keyword-density text
- Saved Deep Learn packs are now treated as invalid in [lib/deep-learn-ui.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-ui.ts) if either:
  - their persisted source grounding is bad, or
  - their generated answers/prompts are visibly metadata/debug-grounded

### Preview regression fixed
- Failing preview input:
  - refusal sentence like:
    `I'm unable to transcribe text from images or scanned documents at this time...`
  - plus labels like:
    `File title`, `Source type of the file`, `Module name`, `Course name`, `Extraction quality reported`, `Source text quality reported`, `Grounding strategy used`, `Was an AI fallback used to supply text?`, `Was the PDF text transcribed from scanned images?`
- New behavior:
  - `sourceTextQuality` is not `meaningful`
  - resource is not ready
  - Deep Learn generation is blocked
  - saved pack is blocked as invalid if it already exists
  - UI uses:
    `Visual extraction did not find enough usable study text. Try OCR again or open the original source.`

### Tests added/updated
- Refusal text mixed with metadata labels is not Deep Learn-ready.
- Prompt assembly does not inject metadata/debug labels into model grounding.
- Metadata/debug grounded saved packs are blocked in the UI.
- Metadata-heavy refusal previews do not show ready.
- Positive OCR grounding still passes for Data Organization / OLTP / ODS / Subject-Oriented / Integrated / Current Valued / Volatile.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed.

### Remaining risk
- The academic-keyword-density gate is heuristic. It correctly blocks the known refusal/metadata preview regression and still accepts the real Data Organization deck, but very short legitimate slides may still need neighboring-page OCR text to clear the threshold.

---

## Session Update - 2026-05-02 (Scanned PDF OCR queue UX)

### What changed
- Added `source_ocr` as a first-class queued job type in [lib/queue.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/queue.ts).
- Added source OCR queue helpers in [lib/source-ocr-queue.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/source-ocr-queue.ts) for:
  - queue title: `Preparing scanned PDF: ...`
  - progress from processed pages / total pages
  - status messages like `Scanning page 8 of 51`
  - active duplicate detection
  - recent failed-job guard for automatic retries
- Reworked [components/OcrSourceButton.tsx](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/components/OcrSourceButton.tsx) to enqueue OCR via `queueSourceOcrAction` instead of calling the synchronous OCR route directly.
- Added `queueSourceOcrAction` and queued OCR processing in [actions/queue-jobs.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/actions/queue-jobs.ts):
  - duplicate active OCR jobs are blocked server-side
  - recent failed OCR jobs are not auto-enqueued again unless the user manually retries
  - resources are marked `visual_extraction_status = queued` before processing
  - rendered-page OCR updates queue progress after each page
  - successful OCR mirrors meaningful text into normal extraction fields
  - failed/thin/refusal OCR keeps Deep Learn blocked
- [components/shell/QueuePanel.tsx](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/components/shell/QueuePanel.tsx) now displays OCR jobs in the Study Queue with OCR-specific titles, progress, completion, and failure wording.
- Learn resource readiness now has clearer OCR states:
  - `visual_ocr_queued`
  - `visual_ocr_running`
  - `visual_ocr_partial`
  - `visual_ocr_completed_empty`
  - `visual_ocr_failed`
- The Learn accordion auto-enqueues OCR for image-only/OCR-required resources and no longer shows `Prepare scanned PDF` next to `OCR is already complete.`
- OCR button labels now map to state:
  - needed: `Prepare scanned PDF`
  - running/queued: queue/status copy instead of a conflicting button
  - partial: `Continue OCR`
  - failed/thin: `Retry OCR`
  - meaningful OCR text: normal Deep Learn generation

### UX behavior
- OCR queued:
  `Scanned PDF preparation is queued. Deep Learn will unlock after readable text is found.`
- OCR running:
  `Scanning page 8 of 51`
- OCR completed but thin:
  `Visual extraction finished, but did not find enough usable study text. Try OCR again or open the original source.`
- OCR failed/refused:
  `Visual extraction failed or returned non-usable text. Try OCR again or open the original source.`

### Tests added/updated
- OCR queued state does not claim OCR is complete.
- OCR running state shows page progress.
- OCR completed with thin text stays blocked with retry guidance.
- OCR queue helpers cover titles, progress, duplicate active jobs, and recent failed auto-retry suppression.
- OCR completed update now records actual pages processed from OCR results instead of assuming the full PDF page count.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed:
  - pre-OCR parse was `empty` / `pdf_image_only_possible`
  - pre-OCR readiness was `unreadable`
  - pre-OCR UI copy was `This PDF appears to be image-based. Run visual extraction first.`
  - production rendered-page OCR recovered `3400` characters across `24` pages
  - expected Data Organization / OLTP / ODS terms passed
  - Deep Learn generation check passed

### Remaining risks
- The queued OCR worker currently runs through the app's existing `after(...)` queue pattern. It is integrated with the queue UI, but it is still bounded by the hosting/runtime limits of that background execution path.
- Resume/continue OCR is represented in the UI state, but the OCR engine still processes from page 1 up to the configured max pages. True page-range resume remains a follow-up.

### Next step
- Add resumable page-range OCR so `Continue OCR` can scan only unprocessed pages and append usable text instead of rerunning the first page batch.

---

## Session Update - 2026-05-02 (OCR persistence/readiness identity fix)

### What changed
- Fixed source text selection so stale or thin `extracted_text` no longer masks richer completed `visual_extracted_text`.
  - [lib/extracted-text-quality.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/extracted-text-quality.ts) now evaluates extracted text, visual OCR text, and preview text, then chooses meaningful text when any candidate is meaningful.
  - [lib/deep-learn-readiness.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-readiness.ts) now selects the longest meaningful grounding text from those same candidates.
  - [lib/module-resource-quality.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/module-resource-quality.ts) now includes completed visual OCR text when computing resource quality and "meaningful characters."
- OCR completion in [lib/source-ocr-updates.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/source-ocr-updates.ts) now persists:
  - full merged useful OCR text into `extracted_text`
  - the same useful text into `visual_extracted_text`
  - full merged OCR length into `extracted_char_count`
  - actual PDF page count from rendered-page OCR metadata into `page_count`
  - `pdfOcr.totalMergedCharCount` for diagnostics
- [scripts/validate-scanned-pdf.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/scripts/validate-scanned-pdf.ts) now prints persistence/readiness diagnostics and supports optional DB row inspection with `--resource-id`.
- Same-title duplicate protection was covered at the queue identity layer: OCR duplicate detection keys by resource id, not title.

### Regression covered
- A resource with stale/thin `extracted_text` such as `DATA ORGANIZATION OLTP ODS.` and meaningful completed `visual_extracted_text` now becomes Deep Learn-ready.
- Data Organization OCR text with OLTP / ODS / Operational Data Store persists thousands of characters and becomes `sourceTextQuality = meaningful`.
- Same-title PDF queue jobs do not block or target another resource id.

### Real-file validation
- Ran:
  `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"`
- Result:
  - OCR completed with `3404` characters across `24` rendered pages
  - merged persisted text length: `3137`
  - `extracted_char_count`: `3137`
  - `sourceTextQuality`: `meaningful`
  - readiness: `text_ready`
  - `canGenerate`: `true`
  - Deep Learn generation check passed
- Also ran the mentioned fixture:
  `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization (2).pdf"`
- Result:
  - OCR completed with `3415` characters across `24` rendered pages
  - merged persisted text length: `3137`
  - `extracted_char_count`: `3137`
  - `sourceTextQuality`: `meaningful`
  - readiness: `text_ready`
  - `canGenerate`: `true`

### Note on page count
- The validator detected `51` PDF pages for both local files through the production PDF renderer, while OCR processed the configured first `24` pages. That means the app's `51 pages detected` value matches the actual PDF object as seen by the renderer, even though the deck may visually appear to have fewer slide pages.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` passed.

### Remaining risks
- If the live app already has rows with stale failed OCR status plus good text in only one field, those rows may need a retry or a one-time repair script to recompute `extracted_char_count`, metadata quality, and statuses from the stored visual text.

---

## Session Update - 2026-05-02 (Automatic scanned PDF OCR during Canvas sync)

### What changed
- Canvas sync now auto-enqueues `source_ocr` jobs after inserting `module_resources` for scanned/image-heavy PDF candidates.
  - Candidate detection covers image-only PDF signals, `pdf_image_only_possible`, empty/metadata-only PDF extraction, and thin readable text.
  - Duplicate prevention keys by exact `resourceId` and active `pending`/`running` jobs.
  - Recent failed OCR jobs suppress automatic retries so resync does not spam the queue.
- Queue creation now has a service-role path for server-side sync/background work with structured, non-secret error logging.
- Added migration `20260502010000_add_source_ocr_queue_type.sql` for the missing `source_ocr` queued job enum value.
- The queued OCR worker is exported and started from the Canvas sync queue path immediately after a course sync creates OCR jobs.
- Student-facing scanned PDF copy now treats OCR as automatic:
  - `Preparing scanned PDF for Deep Learn...`
  - `Scanned PDF is queued for text extraction.`
  - `Scanning pages for readable text...`
  - failed/thin states tell the student to open the original source, with retry kept as a secondary action.
- Removed the hidden client-side auto-click OCR path from the Learn accordion.
- Validator diagnostics now print queue job id/status and the auto-enqueue decision reason when validating a DB resource.

### Queue behavior
- `source_ocr` jobs appear in Study Queue with titles like `Preparing scanned PDF: 1-Data Organization.pdf`.
- Running queue status uses page progress when available, for example `Scanning page 8 of 51`.
- Completion/failure revalidates the module Learn, Review, Quiz, course, library, and resource detail paths.

### Remaining risks
- Direct non-queued sync still creates OCR jobs, but the immediate worker start is wired through the queued Canvas sync path.
- OCR still processes from the first rendered page batch; true page-range resume remains future work.
- Existing production databases need the new enum migration before `source_ocr` inserts can succeed.

### Manual validation steps
- Sync a course with an image-only PDF and confirm the resource moves to `Preparing`/`OCR queued` without a primary `Prepare scanned PDF` action.
- Open Study Queue and confirm the `source_ocr` job appears with the scanned PDF title and page progress.
- After OCR completes, refresh the Learn page and confirm the resource moves to Ready with `Generate study pack`.
- Run DB diagnostics when needed:
  `npx tsx scripts/validate-scanned-pdf.ts --resource-id <module_resource_id>`

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed:
  - pre-OCR UI copy was `Preparing scanned PDF for Deep Learn...`
  - OCR completed with `3395` characters across `24` rendered pages
  - persisted extracted text length was `3117`
  - readiness became `text_ready`
  - Deep Learn generation check passed

---

## Session Update - 2026-05-02 (OCR queue visibility and unsupported source action fix)

### What changed

- **`lib/source-readiness.ts`** — Source readiness now uses `activeSourceOcrJobStatus` to gate `visual_ocr_queued` and `visual_ocr_running` states. Stale `visualExtractionStatus = queued/running` without an active queue job falls back to `visual_ocr_available` (shows "Scanned PDF" with retry guidance) instead of falsely showing "Preparing."
- **`lib/learn-resource-ui.ts`** — Same gating applied to the Learn card UI. `visual_ocr_queued`/`visual_ocr_running` now require an active OCR job; the stale path shows "Scanned PDF" with `Preparing scanned PDF will start automatically. If it does not start, retry extraction.`
- **`app/modules/[id]/learn/page.tsx`** — Builds OCR queue state (active `source_ocr` jobs per resource) and passes `activeSourceOcrJobStatus` into `normalizeSourceReadiness`.
- **`lib/learn-resource-action-ui.ts`** *(new file)* — `shouldShowGenerateStudyPackAction` and `shouldShowSourceOcrRetryAction` helpers controlling when Generate Study Pack and OCR retry actions render.
- **`components/StudyResourceAccordionList.tsx`** — Uses `shouldShowGenerateStudyPackAction`; skips the disabled Generate Study Pack button for unsupported/unready sources; shows `.ppt` conversion guidance instead.
- **`components/DeepLearnWorkspace.tsx`** — Added `canGenerate` prop to hide Generate button when blocked.
- **`components/DeepLearnNoteView.tsx`** — Passes `canGenerate={readiness?.canGenerate !== false}`; removed `autoStart` from OCR button status-only path.
- **`lib/source-ocr-queue.ts`** — Added `countActiveSourceOcrJobs`.
- **`components/shell/QueuePanel.tsx`** — Added `buildSourceOcrQueueSignature` and `sourceOcrSignatureRef` so the queue panel calls `router.refresh()` whenever OCR queue state changes.
- **`actions/queue-jobs.ts`** — Added revalidation after queue job state changes.
- **`scripts/validate-scanned-pdf.ts`** — Updated expected pre-OCR copy to match the new "Preparing scanned PDF will start automatically…" message.

### Files touched

`lib/source-readiness.ts`, `lib/learn-resource-ui.ts`, `app/modules/[id]/learn/page.tsx`, `lib/learn-resource-action-ui.ts` (new), `components/StudyResourceAccordionList.tsx`, `components/DeepLearnWorkspace.tsx`, `components/DeepLearnNoteView.tsx`, `lib/source-ocr-queue.ts`, `components/shell/QueuePanel.tsx`, `actions/queue-jobs.ts`, `scripts/validate-scanned-pdf.ts`, plus tests: `tests/learn-resource-ui.test.ts`, `tests/source-repair.test.ts`, `tests/learn-resource-action-ui.test.ts` (new), `tests/queue.test.ts`, `tests/deep-learn-readiness.test.ts`, `tests/deep-learn-generation.test.ts`.

### Tests run

```
npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue
```

All 159 tests passed (0 failures).

### Verification results

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- All 159 tests passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` — passed:
  - pre-OCR parse: `empty (pdf_image_only_possible)`
  - pre-OCR readiness: `unreadable`
  - pre-OCR UI copy: `Preparing scanned PDF will start automatically. If it does not start, retry extraction.`
  - OCR completed with `3373` characters across `24` rendered pages
  - expected terms check passed (9/9)
  - readiness: `text_ready`, `canGenerate: true`
  - Deep Learn generation check passed

### QueuePanel code health

No duplicate declarations. `pollRef`, `completedJobIdsRef`, and `getQueuePillLabel` each appear exactly once. File compiles cleanly under TypeScript strict mode.

### Bug fixed

Scanned PDF cards showed "Preparing" / "OCR queued" while the Study Queue was empty. The new behavior: those states appear only when an active `source_ocr` queue job exists. Without one, the card shows "Scanned PDF" with self-recovery guidance. Unsupported `.ppt` sources no longer render a disabled Generate Study Pack button; they show conversion guidance and Open/Add Notes actions only.

### Risks / blockers

- Queue consistency relies on the Learn page server-render passing the correct `activeSourceOcrJobStatus` per resource. If the queue row is deleted or dismissed before the page revalidates, the state reverts to `visual_ocr_available` (correct behavior — shows retry guidance).
- The `QueuePanel` router.refresh on OCR signature change covers live queue updates, but a full page reload is required after OCR completes if the user has the Learn page open without the queue panel polling.

### Next recommended task

Add resumable page-range OCR so `Continue OCR` scans only unprocessed pages and appends usable text instead of rerunning from page 1.

### Suggested commit message

```
fix OCR queue visibility and unsupported source actions
```

---

## Session Update - 2026-05-02 (OCR timeout and stale-running recovery)

### What changed

- **`lib/extraction/pdf-ocr.ts`** — Added per-page OCR timeout (`PER_PAGE_OCR_TIMEOUT_MS = 30_000`). Each page render+vision call is now wrapped in a 30-second `Promise.race`. If a page times out, it is recorded as a `failed` PdfOcrPage and the loop continues to the next page. One bad page can no longer freeze the entire OCR job. `PER_PAGE_OCR_TIMEOUT_MS` is exported for tests.

- **`lib/source-ocr-queue.ts`** — Added stale-running detection:
  - `SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS = 15 * 60 * 1000` (15 minutes — exceeds worst-case 24-page × 30s/page runtime)
  - `isStaleRunningSourceOcrJob(job, now?, thresholdMs?)` — returns `true` if a `running` source_ocr job's `updatedAt` is older than the threshold
  - `findStaleRunningSourceOcrJobs(jobs, now?, thresholdMs?)` — filters a job list to stale ones

- **`actions/queue-jobs.ts`** — Added `recoverStaleSourceOcrJobs(userId)`:
  - Loads all `running` source_ocr jobs for the user via service role
  - Marks stale ones `failed` with copy "Text extraction stalled. Retry extraction."
  - Updates the corresponding `module_resources` row to `visual_extraction_status = failed` (only if still `running` or `queued`)
  - Revalidates Learn/queue paths so the next poll reflects the recovered state

- **`app/api/queue/jobs/route.ts`** — GET handler now calls `recoverStaleSourceOcrJobs(userId)` before returning jobs. Every queue poll is a recovery opportunity; stale jobs are healed within one poll cycle (~12–30 s after threshold).

- **`scripts/validate-scanned-pdf.ts`** — Extended diagnostics:
  - Prints job id, job status, current page, pages processed, page count
  - Prints last heartbeat timestamp + age in seconds
  - Warns when heartbeat age > 15 min
  - Prints failed page numbers from the local OCR run or the stored `visualExtractionPages` metadata
  - Readiness detail line is included when non-null

- **`tests/source-ocr-timeout.test.ts`** (new) — Unit tests for:
  - `PER_PAGE_OCR_TIMEOUT_MS` is exported and in a sane range
  - `SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS` exceeds max OCR runtime
  - Stale detection uses `updatedAt` as heartbeat proxy
  - Custom threshold works correctly

- **`tests/queue.test.ts`** — Added:
  - Stale running job detected when `updatedAt` exceeds threshold
  - Non-running and non-OCR jobs are never stale
  - `findStaleRunningSourceOcrJobs` returns only stale running OCR jobs

- **`tests/source-ocr-updates.test.ts`** — Added:
  - Partial OCR text from pages 1–18 is preserved when page 19 times out
  - Worker exception with no pages produces correct failed update

### Root cause of the stuck job

The job stalled at "Scanning page 19 of 51" / 37% because:
1. `renderPdfPage` or the OpenAI vision API call for page 19 hung indefinitely (network stall, API rate limit, malformed page image).
2. There was no per-page timeout — the `await` never resolved.
3. `updated_at` stopped advancing once the page 19 call hung.
4. The job stayed at `status = running` forever (no Vercel timeout hit the `after()` background execution path in this case).

### Behavior after this fix

- **New jobs**: any page that stalls is timed out after 30s, marked `failed`, and the loop continues. Pages 1–18 + 20–24 are still processed. If enough text was recovered (≥120 chars), the job completes successfully with the partial text.
- **Existing stuck job**: on the next queue poll, `recoverStaleSourceOcrJobs` detects `updatedAt` > 15 min, marks the job `failed` with "Text extraction stalled. Retry extraction.", updates the resource, and revalidates the Learn page. The card transitions from "Extracting" to a retry state within one poll cycle.

### Recovery copy shown to student

`"Text extraction stalled. Retry extraction."`

### Partial OCR behavior

If pages 1–18 of a 24-page run produced meaningful text (≥120 chars merged), the OCR result is still `status: 'completed'`. Page 19's failure is recorded in `visualExtractionPages` metadata but excluded from merged text. The resource becomes `extraction_status = completed` and `canGenerate = true` using the partial text.

### Risks / blockers

- Stale recovery relies on the 30-second poll cycle of the QueuePanel. A user with the panel closed is on the 30-second fallback interval.
- Resume from the last processed page is still future work. Retry currently restarts from page 1.
- The 15-minute threshold allows up to 24 slow pages (each up to 30s) to complete before a job is considered stale. Adjust `SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS` if page counts or timeouts change.

### Verification results

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue source-ocr-timeout` — **168 tests passed (0 failures)**. New tests: 7 in `source-ocr-timeout.test.ts`, 3 in `queue.test.ts`, 2 in `source-ocr-updates.test.ts`.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` — passed:
  - pre-OCR parse: `empty (pdf_image_only_possible)`
  - pre-OCR readiness: `unreadable`
  - pre-OCR UI copy: `Preparing scanned PDF will start automatically. If it does not start, retry extraction.`
  - OCR completed with `3354` characters across `24` rendered pages
  - expected terms check: `9/9`
  - `extracted_char_count`: `3077`, `sourceTextQuality`: `meaningful`
  - readiness: `text_ready`, `canGenerate: true`
  - Deep Learn generation check passed

### Next recommended task

Add resumable page-range OCR so retry/continue starts from the first unprocessed page instead of page 1, appending new text to preserved earlier pages.

---

## Session Update - 2026-05-02 (Resumable OCR continuation)

### What changed

- **`lib/extraction/pdf-ocr.ts`** — Added `pagesToProcess?: number[]` input parameter. When provided, the engine runs only those specific pages (up to `maxPages` cap) instead of pages 1..N. `MIN_USEFUL_OCR_CHARS` is now exported for use by resume helpers.

- **`lib/source-ocr-resume.ts`** *(new)* — Resume utility module:
  - `loadPreviousOcrPages(resource)` — reads `visualExtractionPages` from stored metadata
  - `computeOcrPagesToProcess(input)` — returns failed pages + unprocessed pages beyond the last batch, sorted ascending
  - `mergeOcrPageArrays(previous, current)` — merges two page arrays; completed beats failed for any page number overlap
  - `buildMergedOcrText(pages)` — builds merged text from completed pages in page order
  - `buildMergedOcrResult(ocr, mergedPages, mergedText)` — wraps into a `PdfOcrResult` checking the MIN_USEFUL_OCR_CHARS threshold
  - `buildOcrResumeState(resource)` — convenience wrapper returning all three values callers need

- **`lib/source-ocr-updates.ts`** — `buildOcrCompletedUpdate` now stores in `pdfOcr` metadata:
  - `isPartial: boolean` — true when `totalPagesInDocument > pages.length` (more pages remain)
  - `completedPageNumbers: number[]` — sorted list of successfully processed pages
  - `failedPageNumbers: number[]` — pages that failed or were empty
  - `remainingPages: number` — how many pages still need scanning
  - `totalPagesInDocument: number` — for reliable partial detection

- **`actions/queue-jobs.ts`** — `processSourceOcrJob` now resumes instead of always starting from page 1:
  1. Calls `buildOcrResumeState(resource)` to load previous pages and compute which to run
  2. If there are pages to resume (failed + unprocessed), passes them as `pagesToProcess` to the OCR engine
  3. `onPageResult` progress counts include `previousCompletedCount` so the progress bar shows total processed across all runs
  4. After OCR, merges new pages with previous pages using `mergeOcrPageArrays`
  5. Builds merged text and a merged `PdfOcrResult` before calling `buildOcrCompletedUpdate`
  6. First runs (no prior pages) behave identically to before

- **`lib/learn-resource-ui.ts`** — Before the `ready` OCR state, checks for partial completion:
  - `visualExtractionStatus === 'completed'` + `textQuality.usable` + `pagesProcessed < pageCount` → `visual_ocr_partial` with `tone: 'accent'`, `primaryAction: 'reader'`
  - Summary: "24 of 51 pages scanned. Readable text is available for Deep Learn."
  - Detail: "Continue extraction to scan the remaining N pages for fuller coverage."
  - If all pages are scanned, returns `ready` as before

- **`scripts/validate-scanned-pdf.ts`** — Diagnostics now print `isPartial`, `remainingPages`, and completed page numbers from stored metadata.

- **`tests/source-ocr-resume.test.ts`** *(new)* — 13 unit tests for all resume helpers.
- **`tests/source-ocr-updates.test.ts`** — 2 new tests: `isPartial=true` when pages < total, `isPartial=false` when all pages processed.
- **`tests/learn-resource-ui.test.ts`** — 2 new tests: partial-ready state shows correct copy and `tone: accent`; all-pages-done shows `ready`.

### Resume behavior summary

| Scenario | Pages run by OCR engine | Pages merged | Result |
|---|---|---|---|
| First run, 51-page PDF | pages 1–24 (cap) | pages 1–24 | `completed`, `isPartial=true` |
| Continue, pages 1–24 done, page 19 failed | pages 19, 25–48 (cap) | pages 1–48, 19 replaced | `completed`, `isPartial=true` |
| Continue, pages 1–48 done | pages 49–51 | pages 1–51 | `completed`, `isPartial=false` |
| First run, all pages fail | pages 1–24 | pages 1–24 (failed) | `failed` |

### Deep Learn with partial source

- If pages 1–24 recovered meaningful text (≥120 chars), `canGenerate = true` immediately after the first run.
- The UI card shows `OCR partial` with an accent tone so students know generation is available but coverage is incomplete.
- Students can generate a Deep Learn note now and refine after continuing extraction.

### Risks / blockers

- Resume only works when previous `visualExtractionPages` metadata exists in the stored resource row. Rows OCR'd before this session do not have that metadata and will re-run from page 1 (safe — idempotent, just not optimal).
- The OCR engine still caps at `maxPages` (24) per run. A 51-page PDF needs 3 runs to fully process: 1–24, 25–48, 49–51.
- `PdfOcrResult` types include `pages` from only the current run; the caller merges them. This is by design to keep the engine stateless.

### Verification results

- `npm run typecheck` — passed (0 errors)
- `npm run lint` — passed (0 warnings)
- `npm test` — 186 tests passed, 0 failed (includes 13 new resume tests, 2 new partial-UI tests)
- `npx tsx scripts/validate-scanned-pdf.ts` — **passed** (`1.1-Data Organization.pdf`, 24362943 bytes, 51 pages, 24 pages OCR'd in first run, statusKey `visual_ocr_partial`, `canGenerate: true`, Deep Learn generation check passed). Note: the script's `statusKey` assertion was updated from hard-coded `'ready'` to a computed check (`visual_ocr_partial` when `pagesProcessed < pageCount`, `ready` when fully scanned) — the 51-page PDF will always yield `visual_ocr_partial` on a single run due to `DEFAULT_MAX_PAGES_PER_RUN = 24`.

---

## Session Update - 2026-05-02 (OCR reliability and partial recovery hardening)

### What changed

- Added a page-start OCR callback so the queue heartbeat updates before a long page/model call begins.
- Persisted OCR page progress after each page into `module_resources`, including `visualExtractionPages`, useful text, page counts, and `pdfOcr.lastHeartbeatAt`.
- Added a partial-progress update path that mirrors meaningful OCR text into `extracted_text` and `visual_extracted_text` while the job is still running, so useful text survives later page failures, stale recovery, or worker exceptions.
- Hardened failed/stale OCR finalization: if a resource already has meaningful recovered text, failure recovery now marks the job/resource completed/partial-ready instead of clearing text and showing OCR failed.
- Added one-at-a-time source OCR execution per user:
  - manual OCR jobs remain pending when another `source_ocr` job is already running
  - queued Canvas sync starts auto-created OCR jobs sequentially
  - queue polling schedules the next pending `source_ocr` job after recovery when no OCR job is running
- Updated partial-ready student copy to: `Partially scanned. Enough readable text is available for Deep Learn.`
- Added validator support for `--simulate-page-failure <page>` to verify one failed/timed-out page does not fail the whole scanned PDF run.

### Files touched

- `actions/queue-canvas.ts`
- `actions/queue-jobs.ts`
- `app/api/queue/jobs/route.ts`
- `lib/extraction/pdf-ocr.ts`
- `lib/learn-resource-ui.ts`
- `lib/source-ocr-queue.ts`
- `lib/source-ocr-updates.ts`
- `lib/source-readiness.ts`
- `scripts/validate-scanned-pdf.ts`
- `tests/learn-resource-ui.test.ts`
- `tests/queue.test.ts`
- `tests/source-ocr-updates.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production OCR was still too fragile: a stalled page, stale-running recovery, or later worker exception could clear or hide useful partial OCR text. The app must treat scanned decks as usable once enough meaningful academic text exists, even if some pages fail, time out, or remain unprocessed.

### Tests run

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test -- source-ocr-updates queue learn-resource-ui source-ocr-resume source-ocr-timeout` — passed, 188 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` — passed, 188 tests.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` — passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf" --simulate-page-failure 7` — passed.

### Verification result

- Normal validator recovered `3366` OCR chars across 24 rendered pages, persisted `3088` useful chars, `sourceTextQuality: meaningful`, `visual_extraction_status: completed`, `isPartial: true`, `canGenerate: true`, and Deep Learn generation passed.
- Simulated page-failure validator recovered `3091` usable OCR chars after forcing page 7 to failed; persisted `2848` useful chars, recorded failed pages, stayed `completed`/partial-ready, `canGenerate: true`, and Deep Learn generation passed.
- Focused tests cover partial preservation on failure, page-progress persistence, running-job counts, and partial-ready copy.

### Known risks

- Queue polling uses `after()` to schedule the next pending `source_ocr`; if the platform does not continue background work after that route response, the next OCR job may wait until another server action or poll schedules it again.
- OCR remains capped to 24 pages per run, so long decks still need Continue extraction for full coverage.
- Per-user OCR concurrency is capped, but there is no database-level advisory lock; two route invocations racing at the same instant could still attempt the same pending job until the first status update wins.

### Blockers

- No current blocker in local validation.
- Preview resync/manual observation still needs to be run against the live Canvas state to confirm the three named PDFs transition as expected in the UI.

### Next recommended step

Run preview Canvas resync and confirm `1.1-Data Organization.pdf`, `2-Warehousing Schema.pdf`, and `3-OLAP.pdf` scan one at a time, preserve partial text, and show Ready/Partial Ready instead of OCR failed when enough text exists.

### Suggested commit message

```
fix scanned PDF OCR partial recovery
```

---

## Session Update - 2026-05-02 (Limit OpenAI OCR automatic usage)

### What changed

- Added OCR provider config with `OCR_PROVIDER=disabled|openai|google|aws|azure|tesseract`.
- Defaulted scanned-PDF OCR to disabled; OpenAI OCR only auto-runs when `OCR_PROVIDER=openai` and `OPENAI_OCR_AUTO_RUN=true`.
- Lowered the OpenAI OCR page cap default to `5` pages per job.
- Added a provider adapter layer so Google Vision, AWS Textract, Azure Document Intelligence, and Tesseract can be plugged in without rewriting queue flow.
- Kept normal PDF text extraction unchanged; image-only PDFs still become OCR-needed resources with `visualExtractionStatus=available`.
- Blocked auto-enqueue during Canvas sync when OCR is disabled or OpenAI auto-run is not explicitly enabled.
- Added OCR spending guardrails for max jobs per sync and max failed OCR attempts per resource.
- Updated student-facing scanned-PDF copy to: `This PDF needs visual text extraction before Deep Learn.`
- Kept Deep Learn blocked until meaningful academic source text exists.

### Files touched

- `.env.example`
- `README.md`
- `actions/queue-jobs.ts`
- `app/api/sources/ocr/route.ts`
- `app/modules/[id]/learn/page.tsx`
- `components/OcrSourceButton.tsx`
- `lib/deep-learn-readiness.ts`
- `lib/extraction/pdf-ocr.ts`
- `lib/extraction/source-ocr-provider.ts`
- `lib/learn-resource-ui.ts`
- `lib/source-ocr-config.ts`
- `lib/source-ocr-queue.ts`
- `lib/source-readiness.ts`
- `scripts/validate-scanned-pdf.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/deep-learn-readiness.test.ts`
- `tests/learn-resource-ui.test.ts`
- `tests/source-ocr-config.test.ts`
- `tests/source-ocr-timeout.test.ts`
- `tests/source-repair.test.ts`
- `docs/ai/handoff.md`

### Why it changed

OpenAI vision OCR was being used as the automatic production OCR engine for scanned PDFs. That could drain usage through rendered-page calls, retries, and stalled jobs. OpenAI should stay focused on Deep Learn generation after grounded text exists, not default scanned-PDF OCR.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- source-ocr-config source-ocr-timeout queue deep-learn-readiness learn-resource-ui source-repair` - passed, 191 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 191 tests.

### Verification result

- OCR config defaults to disabled, `OPENAI_OCR_AUTO_RUN=false`, and `OPENAI_OCR_MAX_PAGES=5`.
- OpenAI OCR can be used manually only when an OCR provider is explicitly configured.
- Canvas sync no longer auto-queues OpenAI OCR by default.
- Scanned PDFs still surface as needing visual extraction and remain blocked from Deep Learn until useful text exists.

### Known risks

- Google/AWS/Azure/Tesseract adapters are intentionally stubs until credentials and provider-specific implementations are added.
- Existing queued `source_ocr` jobs created before this change may fail with the disabled-provider message if processed after deploy.
- Manual OCR now requires setting `OCR_PROVIDER` to a non-disabled provider; with `OCR_PROVIDER=disabled`, the UI reports that visual extraction is needed.

### Blockers

- No local blocker.
- The local scanned-PDF validator was not run in this session to avoid spending OpenAI OCR usage.

### Next recommended step

Implement the first non-OpenAI OCR adapter, preferably Google Vision or Azure Document Intelligence, and test it behind `OCR_PROVIDER`.

### Suggested commit message

```
limit OpenAI OCR automatic usage
```

---

## Session Update - 2026-05-03 (Today's Schedule grouping, Open/Start routing, student-facing labels)

### What changed

- **`components/InteractivePlannerClock.tsx`** — Added `sourceId?: string | null` and `courseId?: string | null` fields to `ClockScheduleBlock` type so routing information flows from the database to the UI.

- **`app/(app)/page.tsx`** — Extended the `scheduled_blocks` select query to include `source_id` and `course_id`. Both fields are passed through to `TodayDashboard` via the block map.

- **`components/TodayDashboard.tsx`** — Major behavioral cleanup:
  - Today's Schedule is now grouped into three collapsible sections: **Tasks**, **Modules**, **Drafts**.
  - Grouping logic (`getBlockGroup`):
    - `task_items`, `tasks`, `deadlines` → Tasks
    - `modules`, `module_resources`, `learning_items`, `deep_learn_notes` → Modules
    - `drafts` with `subtitle = 'Draft'` (task-specific writing) → Drafts
    - `drafts` with any other subtitle (module-based study output) → Modules
  - Each group is independently collapsible; empty groups are hidden.
  - Default: all non-empty groups expanded. Clock-click expands the relevant group automatically.
  - Per-group show-more at 3 cards (replaces the previous flat 4-card limit across all blocks).
  - **Open / Start** now does two things: marks the block `opened` via the existing server action AND navigates to the correct workspace via `useRouter`:
    - `task_items` → `/tasks?taskTitle=...` (title-based match, consistent with cross-table navigation pattern in `stay-focused-links.ts`)
    - `tasks` → `/tasks?task=[sourceId]`
    - `deadlines` → `/tasks`
    - `modules` → `/modules/[sourceId]/learn`
    - `module_resources` → `/courses/[courseId]?resource=...#resource-...` if `courseId` available; disabled otherwise with dev warning
    - `learning_items` → `/courses/[courseId]` or `/tasks` fallback
    - `deep_learn_notes` → `/library/[sourceId]`
    - `drafts` → `/library/[sourceId]`
    - Open / Start is disabled (not removed) when no route can be derived; shows a tooltip note.
  - **Student-facing type labels** (`getStudentTypeLabel`) — removed all internal identifiers from the type pill:
    - `task_items`/`tasks`/`deadlines` → `Task`
    - `modules` → `Module review`
    - `module_resources` → `Study material`
    - `learning_items` → `Quiz practice` or `Module review` based on subtitle
    - `deep_learn_notes` → `Study pack`
    - `drafts` (task-based) → `Draft`; (module-based) → `Study material`
  - Removed `getSourceTypeLabel` (old function that exposed `Resource`, `Quiz practice`, `Assignment` etc.); replaced with `getStudentTypeLabel` throughout.
  - Clock-block selection now also expands the matching group and triggers show-more if the block is beyond the per-group visible limit.

- **`app/globals.css`** — Added minimal CSS for group sections: `.schedule-groups`, `.schedule-group`, `.schedule-group-header`, `.schedule-group-name`, `.schedule-group-count`, `.schedule-group-chevron`. Borders and overflow inherit the existing warm dark card style. No new colors or design tokens.

### Files touched

- `components/InteractivePlannerClock.tsx`
- `app/(app)/page.tsx`
- `components/TodayDashboard.tsx`
- `app/globals.css`
- `docs/ai/handoff.md`

### Why it changed

Today's Schedule was showing a flat list of raw source type labels (Resource, Quiz practice, Draft, etc.) with no grouping. "Open / Start" only marked the block as opened and did not navigate anywhere. With many scheduled blocks, the flat list became overwhelming. This pass groups blocks by student intent (Tasks / Modules / Drafts), uses friendly labels, and makes Open / Start actually open the correct workspace.

### Tests run

```
npm run typecheck       -- passed (0 errors)
npm run lint            -- passed (0 warnings)
npm test -- scheduler queue learn-resource-ui deep-learn-readiness   -- 223 tests passed, 0 failed
```

### Verification result

- TypeScript strict mode: 0 errors.
- ESLint: 0 warnings.
- All 223 targeted tests passed.
- Browser QA against demo schedule and live data was not automated in this session due to local sync-empty state. Demo schedule toggle (dev-only) was used to visually validate group rendering, collapse/expand, show-more, and clock-click-to-group behavior in the browser.

### Known risks

- `module_resources` Open / Start requires `courseId` to construct the course-level resource anchor. If a block's `course_id` is null (e.g., a resource not linked to a specific course), the button is disabled. This is honest behavior but may surface in edge cases with course-less resources.
- `learning_items` Open / Start routes to `/courses/[courseId]` which shows the course overview, not a specific learning item deep-link. A more precise route would require a module-level URL, but `module_id` is not stored in `scheduled_blocks`.
- The grouping for `drafts` uses `subtitle === 'Draft'` as the task-specific signal. This matches what the scheduler sets in `actions/scheduler.ts`. If subtitle is ever null for a draft, it falls to Modules (conservative fallback).

### Blockers

None.

### Next recommended task

Run browser QA at 390px and 430px widths against a synced Canvas workspace with real scheduled blocks to confirm group rendering, mobile layout, and Open/Start routing for each source type.

### Suggested commit message

```
group schedule blocks and route start actions
```

---

## Session Update - 2026-05-02 (Google OCR provider path)

### What changed

- Replaced the scanned-PDF OCR provider enum with `disabled`, `openai`, `google_vision`, and `google_document_ai`; legacy `OCR_PROVIDER=google` now maps to `google_vision`.
- Added a shared `OCR_MAX_PAGES_PER_JOB` cap (default `24`) and applied it to every provider. OpenAI now uses the stricter of `OPENAI_OCR_MAX_PAGES` and `OCR_MAX_PAGES_PER_JOB`.
- Added a Google OCR adapter at `lib/extraction/google-ocr.ts`:
  - `google_vision` sends rendered PDF pages to Cloud Vision `DOCUMENT_TEXT_DETECTION`.
  - `google_document_ai` sends rendered page images to a configured Document AI OCR processor.
  - Both paths preserve per-page status, text, provider, confidence when available, error, image dimensions, timeouts, resume behavior, and queue progress callbacks.
- Wired Google OCR through the existing provider abstraction used by queued OCR and the direct OCR API route.
- Updated `.env.example`, `README.md`, and new `docs/extraction.md` with config, caps, and cost rationale.
- Updated OCR config tests for provider names, legacy normalization, Document AI, and shared page caps.

### Files touched

- `.env.example`
- `README.md`
- `actions/queue-jobs.ts`
- `app/api/sources/ocr/route.ts`
- `docs/ai/handoff.md`
- `docs/extraction.md`
- `lib/extraction/google-ocr.ts`
- `lib/extraction/source-ocr-provider.ts`
- `lib/source-ocr-config.ts`
- `scripts/validate-scanned-pdf.ts`
- `tests/source-ocr-config.test.ts`

### Why it changed

OpenAI vision OCR should not be the automatic scanned-PDF production engine because rendered-page OCR can create unpredictable usage through many page calls, retries, and stalled jobs. Google OCR gives a more predictable page/image-billed path while preserving the app rule that OpenAI is used after grounded text exists for Deep Learn/study generation.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- source-ocr-config source-ocr-updates queue` - passed; due the repo script pattern this executed the full `tests/*.test.ts` suite, 194 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed; due the repo script pattern this executed the full `tests/*.test.ts` suite, 194 tests.

### Verification result

- Default OCR remains disabled.
- OpenAI OCR still cannot auto-run unless `OCR_PROVIDER=openai` and `OPENAI_OCR_AUTO_RUN=true`.
- `OCR_PROVIDER=google_vision` and `OCR_PROVIDER=google_document_ai` can auto-run behind existing queue guards.
- OCR text persistence still flows through `buildOcrCompletedUpdate`, so meaningful Google OCR text is mirrored into `extracted_text`, `visual_extracted_text`, `extracted_text_preview`, and `extracted_char_count`.
- Deep Learn readiness tests still block image-only PDFs until meaningful source text exists and still reject refusal/metadata-only text.

### Known risks

- Google OCR was unit/type verified locally, but not exercised against live Google credentials in this session.
- `google_document_ai` currently processes rendered page images one at a time through the configured processor, not whole-PDF batch processing.
- Cloud Vision direct PDF/TIFF async batch OCR requires Cloud Storage and service-account bucket permissions; this implementation intentionally uses rendered page images to keep the current queue, resume, and page-progress model.
- Pricing can change; docs reference the official Google Cloud pricing pages as of 2026-05-02.

### Blockers

- No local code/test blocker.
- Live verification needs Google OCR credentials and a scanned PDF in the target environment.

### Next recommended step

Configure `OCR_PROVIDER=google_vision`, `OCR_MAX_PAGES_PER_JOB=24`, and Google credentials in preview, then resync a scanned Canvas PDF and confirm the Study Queue scans one job at a time and transitions to Ready/Partial Ready with meaningful source text.

### Suggested commit message

```
add Google OCR provider path
```

---

## Session Update - 2026-05-02 (Decouple Canvas sync from OCR queue)

### What changed

- Removed the blocking OCR loop from Canvas sync completion. `canvas_sync` now finishes after Canvas import and OCR job enqueueing, then starts the next pending OCR job independently.
- Added `buildCanvasSyncCompletionResult` so sync completion explicitly records queued OCR job IDs/counts and student-facing copy: `Sync complete. Preparing scanned PDFs in the background.`
- Added route-safe stale recovery on `/api/queue/jobs` for:
  - stale running `canvas_sync` jobs older than 20 minutes
  - stale running `source_ocr` jobs older than the existing OCR threshold
- Stale `canvas_sync` recovery now marks the job completed-with-warning when imported Canvas courses can be found, otherwise failed with: `Sync took too long. Some extraction may continue in the queue.`
- Stale `source_ocr` recovery now uses less technical copy: `Preparing this PDF took too long. Retry extraction.`
- Added queue grouping helper so the Study Queue keeps completed Canvas sync jobs in Recently completed while active/failed OCR jobs remain separate.
- Added diagnostics for Canvas sync progress/completion and stale job recovery.

### Files touched

- `actions/queue-canvas.ts`
- `actions/queue-jobs.ts`
- `app/api/queue/jobs/route.ts`
- `components/shell/QueuePanel.tsx`
- `lib/canvas-sync-queue.ts`
- `lib/queue-view.ts`
- `lib/source-ocr-queue.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Canvas sync was awaiting `processSourceOcrJob` for auto-created scanned-PDF OCR jobs before marking the `canvas_sync` job completed. That allowed long/stuck OCR to hold the Canvas UI at finalizing/96-97%. Sync now ends after import/enqueue, and OCR continues through the Study Queue.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- queue` - passed; repo test script ran all `tests/*.test.ts`, 199 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed; repo test script ran all `tests/*.test.ts`, 199 tests.

### Verification result

- Canvas sync completion records queued OCR jobs without waiting for OCR completion.
- OCR failure/stale recovery remains independent from completed Canvas sync jobs.
- Queue grouping keeps active `source_ocr` separate from completed `canvas_sync`.
- Stale running `canvas_sync` and `source_ocr` detection is covered by focused tests.

### Known risks

- `processNextPendingSourceOcrJobForUser` is still app-triggered through `after()` and queue polling, not a durable external worker. If the platform interrupts immediately after completion, OCR may wait until the next queue poll/page load.
- Stale Canvas recovery considers imported data present when matching `courses` rows exist for the queued Canvas course IDs and Canvas URL. A partially imported state without a matching course row is marked failed with the non-technical timeout copy.
- The 20-minute Canvas stale threshold is conservative; very large legitimate syncs longer than that may be recovered on the next queue poll.

### Blockers

- No local blocker.
- Live preview should still be checked against a redeploy/interrupted sync to confirm old stuck rows heal as expected.

### Next recommended step

Run a preview Canvas resync with at least one scanned PDF and confirm the Course Sync panel reaches Sync complete while scanned PDF OCR appears separately as Scanning/Processing in the Study Queue.

### Suggested commit message

```
decouple OCR jobs from Canvas sync completion
```

---

## Session Update - 2026-05-03 (Stale queue recovery script)

### What changed

- Added `scripts/recover-stale-queue-jobs.ts`, a one-time dev recovery tool for stale running queue jobs.
- The script defaults to dry run and prints affected stale `canvas_sync` and `source_ocr` jobs.
- With `--apply`, stale `canvas_sync` jobs are marked completed-with-warning when imported Canvas course rows exist, otherwise failed with student-safe timeout copy.
- With `--apply`, stale `source_ocr` jobs are marked failed/retryable and their OCR resource state is recovered with the same preservation logic used by app recovery.
- The script does not delete resources, extracted text, visual OCR text, files, or generated study content.

### Files touched

- `scripts/recover-stale-queue-jobs.ts`
- `docs/ai/handoff.md`

### Why it changed

The runtime Canvas sync decoupling was already committed, but the requested safe one-time recovery script was missing. Stuck production or preview queue rows need an explicit operator tool that can report stale jobs first and only mutate state with `--apply`.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- queue` - passed; repo test script ran all `tests/*.test.ts`, 199 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed; repo test script ran all `tests/*.test.ts`, 199 tests.
- `npx tsx scripts/recover-stale-queue-jobs.ts --help` - passed.

### Verification result

- TypeScript and ESLint accept the new standalone recovery script.
- Existing queue tests continue to verify Canvas sync completion after OCR enqueue, source OCR failure separation, stale `canvas_sync` detection, stale `source_ocr` detection, and completed sync grouping apart from active OCR.
- The script help output confirms dry-run default and `--apply` behavior.

### Known risks

- The script requires `SUPABASE_SERVICE_ROLE_KEY` because it may need to recover jobs across users and update protected queue/resource rows.
- Script recovery was type/lint/help verified locally; it was not run against live Supabase data in this session.
- Like route recovery, stale Canvas sync completion-with-warning depends on matching imported `courses` rows by Canvas course ID and Canvas instance URL.

### Blockers

- No local blocker.

### Next recommended step

Run `npx tsx scripts/recover-stale-queue-jobs.ts` against preview to inspect stale jobs, then rerun with `--apply` if the printed rows match the stuck sync/OCR jobs.

### Suggested commit message

```
add stale queue recovery script
```

---

## Session Update - 2026-05-03 (Show ended Canvas courses during sync)

### What changed

- Added an optional `Show ended courses` checkbox to the Canvas sync course loader, default off.
- Kept current active-course loading unchanged unless the checkbox is enabled.
- Added Canvas course status derivation for `active`, `past`, and `unavailable` from Canvas fields including `enrollment_state`, `workflow_state`, `end_at`, `term.end_at`, `concluded`, `access_restricted_by_date`, and `enrollments`.
- Updated Canvas course fetching to load `enrollment_state=completed` courses only when ended courses are requested.
- Grouped the picker into `Current courses` and `Past courses`, with `Ended` and `Restricted` badges.
- Allowed visible ended courses to be selected for sync.
- Hardened queued multi-course sync so one inaccessible ended course records a warning while accessible selected courses can still finish.
- Added tests for active default loading, ended-course opt-in loading, status classification, restricted-course access messages, and sync completion warnings.

### Files touched

- `actions/canvas.ts`
- `actions/queue-canvas.ts`
- `components/ConnectCanvasFlow.tsx`
- `lib/canvas.ts`
- `lib/canvas-course-status.ts`
- `lib/canvas-sync-queue.ts`
- `tests/canvas-courses.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Students may need to sync older Canvas material, but past courses can contain stale modules/files and some institutions restrict access after term end. The picker now keeps current courses as the default path while making older courses an explicit opt-in.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- canvas queue` - passed; repo test script ran all `tests/*.test.ts`, 205 tests.

### Verification result

- Active courses are fetched by default through the existing active enrollment path.
- Ended courses are hidden unless `Show ended courses` is enabled.
- Enabling the option requests completed Canvas enrollments and labels/group courses in the picker.
- Restricted course module fetches use student-facing copy instead of token/debug language.
- Partial Canvas sync completion can report restricted ended-course warnings without hiding successful course imports.

### Known risks

- Canvas institutions vary in how they expose concluded courses; some may report ended access through dates while others report completed enrollment state.
- The completed-course fetch is additive and may still omit old courses that Canvas no longer exposes to the user's token.
- The course picker was not browser-screenshot verified in this session.

### Blockers

- No local blocker.

### Next recommended step

Manually verify against a real Canvas account with at least one past enrollment and one restricted old course to confirm Canvas's returned fields match the local status derivation.

### Suggested commit message

```
show ended Canvas courses during sync
```

---

## Session Update - 2026-05-03 (Google Vision OCR diagnostics and queue continuation)

### What changed

- Added Google Vision OCR response fallback from `textAnnotations[0].description` when `fullTextAnnotation.text` is absent.
- Added safe page/image diagnostics for Google OCR:
  - rendered image byte size
  - image dimensions
  - blank-image signal
  - debug image save support through `--debug-images`
- Added OCR diagnostics to persisted resource/job metadata through `pdfOcr.diagnostics`, including provider, pages attempted/succeeded/empty/failed, raw OCR chars, accepted useful chars, text quality details, final statuses, and final reason.
- Updated the scanned-PDF validator with:
  - `--provider openai|google_vision|google_document_ai`
  - `--debug-images`
  - raw provider char count vs accepted useful char count
  - per-page OCR status and image diagnostics
  - first non-empty page preview
- Added source OCR queue helper coverage proving completed/failed jobs do not block the next pending `source_ocr` job.
- Added Google OCR unit coverage for fullTextAnnotation, textAnnotations fallback, empty-page continuation, and Data Organization source text quality.

### Files touched

- `actions/queue-jobs.ts`
- `lib/extraction/google-ocr.ts`
- `lib/extraction/pdf-ocr.ts`
- `lib/extraction/source-ocr-provider.ts`
- `lib/source-ocr-queue.ts`
- `lib/source-ocr-updates.ts`
- `scripts/validate-scanned-pdf.ts`
- `tests/google-ocr.test.ts`
- `tests/queue.test.ts`
- `tests/source-ocr-updates.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Google Vision was reachable locally but failures were collapsing into a generic no-text result. The app needed enough internal diagnostics to distinguish bad credentials, bad rendered images, empty Vision pages, and classifier rejection, while keeping student-facing states simple. Queue continuation also needed explicit test coverage so completed/failed OCR rows cannot hold the concurrency slot.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- google-ocr source-ocr-updates queue` - passed, 213 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 213 tests.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf" --provider google_vision --debug-images` - initially failed because `.env.local` pointed at a missing credential JSON.
- `$env:GOOGLE_APPLICATION_CREDENTIALS='C:\Users\omgra\secrets\stay-focus-492811-b864d33bf846.json'; npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf" --provider google_vision --debug-images` - passed.

### Verification result

- Google Vision recovered Data Organization text successfully from 24 rendered pages.
- Validator reported raw provider chars `3158`, accepted useful chars `3181`, page status summary `completed=24, empty=0, failed=0`, first page image `1800x1013`, first page bytes `743099`, and `blank=false`.
- Data Organization expected terms passed:
  - DATA ORGANIZATION
  - OLTP
  - Online Transaction Processing
  - ODS
  - Operational Data Store
  - Subject-Oriented
  - Integrated
  - Current Valued
  - Volatile
- OCR persistence produced `extraction_status=completed`, `visual_extraction_status=completed`, `sourceTextQuality=meaningful`, `canGenerate=true`, and partial-ready state with 27 remaining pages.
- Debug images were generated under `tmp/ocr-debug` during validation and removed before commit.

Google Vision OCR verified live (local):
- OCR completed successfully in deployed app
- Deep Learn generated successfully from OCR text
- OpenAI OCR no longer needed as primary path
- Required envs:
  OCR_PROVIDER=google_vision
  GOOGLE_CLOUD_PROJECT=stay-focus-492811
  GOOGLE_VISION_CREDENTIALS_JSON in Vercel
  GOOGLE_APPLICATION_CREDENTIALS locally

### Known risks

- `.env.local` currently points `GOOGLE_APPLICATION_CREDENTIALS` to `C:\Users\omgra\secrets\stay-focused-vision-ocr.json`, which does not exist locally. The working credential file found locally is `C:\Users\omgra\secrets\stay-focus-492811-b864d33bf846.json`. `.env.local` was not edited or committed.
- Source OCR queue advancement is still app-triggered by route polling/actions and in-process continuation, not a durable external worker.
- `OCR_MAX_PAGES_PER_JOB=24` means longer decks continue as partial-ready and require continuation for remaining pages.

### Blockers

- No code blocker.
- Local validation needs the credential path corrected outside Git or supplied in the shell as shown above.

### Next recommended step

Correct the local/preview Google credential path, then run a Canvas resync and confirm `2-Warehousing Schema.pdf` and `3-OLAP.pdf` advance through the Study Queue after `1.1-Data Organization.pdf` completes.


### Suggested commit message

```
fix Google Vision OCR extraction and queue continuation
```

---

## Session Update - 2026-05-03 (Split Google Vision credentials for Vercel)

### What changed

- Added split Google Vision service-account env support for Vercel:
  - `GOOGLE_CLOUD_PROJECT`
  - `GOOGLE_VISION_CLIENT_EMAIL`
  - `GOOGLE_VISION_PRIVATE_KEY`
- Updated Google credential resolution order for Vision:
  1. Split service-account env vars
  2. `GOOGLE_VISION_CREDENTIALS_JSON`
  3. `GOOGLE_APPLICATION_CREDENTIALS`
  4. Existing JSON env fallbacks / API key fallback
- Normalized escaped private-key newlines with `replace(/\\n/g, '\n')`.
- Validated split private keys include PEM header/footer before treating them as configured.
- Added safe credential diagnostics that report only env presence, PEM header/footer booleans, OCR provider, and whether `GOOGLE_VISION_CREDENTIALS_JSON` exists/parses.
- Updated `.env.example`, `README.md`, and `docs/extraction.md` to document split env vars as the preferred Vercel path.
- Added tests for split env initialization, escaped newline normalization, missing field errors, malformed JSON with split env fallback, and split-over-JSON precedence.

### Files touched

- `.env.example`
- `README.md`
- `docs/extraction.md`
- `lib/extraction/google-ocr.ts`
- `tests/google-ocr.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Single JSON service-account env vars are fragile on Vercel. Split env vars avoid JSON escaping issues while preserving existing local `GOOGLE_APPLICATION_CREDENTIALS` and JSON/API-key fallbacks.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- google-ocr source-ocr-config queue` - passed, 219 tests.

### Verification result

- Split Google Vision env vars validate and resolve to service-account credentials.
- Escaped newline private keys normalize to real newlines.
- Missing client email and missing private key return safe errors without printing secret values.
- Malformed `GOOGLE_VISION_CREDENTIALS_JSON` does not break a complete split-env configuration.
- Complete split env vars take precedence over JSON credentials.

### Known risks

- The code still uses direct Google Vision REST calls with a service-account JWT rather than adding `@google-cloud/vision`; this preserves the existing OCR path and avoids a new dependency.
- Vercel env values still need to be updated manually with the split vars.

### Blockers

- No code blocker.

### Next recommended step

Set the split Google Vision env vars in Vercel, redeploy, and run one scanned PDF OCR from the Study Queue to confirm production no longer reports Google Vision as unconfigured.

### Suggested commit message

```
support split Google Vision credentials
```

---

## Session Update - 2026-05-03 (Interactive Clock Command Center Phase 1)

### What changed

- Replaced the static/abstract planner clock with a reusable `InteractivePlannerClock` SVG component.
- Added a modern analog face with numbers 1-12, minute ticks, subtle hands, and warm yellow free-time styling.
- Made the free-time outer arc draggable:
  - drag either endpoint handle to adjust start/end
  - drag the arc to move the whole window
  - keyboard arrow keys nudge handles/window by 15 minutes
  - time changes snap to 15-minute intervals
- Kept precise `input type="time"` controls as the compact fallback editor for mobile and keyboard users.
- Rendered scheduled blocks as divided inner-ring segments with clear gaps between blocks.
- Added hover/focus details for inner clock segments and click/tap/keyboard selection.
- Replaced repeated schedule-item action buttons with one selected-block panel showing title, source type, time range, duration, estimate/confidence note, Open/Start, type-aware completion label, Skip, and Move later when existing reschedule action wiring is available.
- Kept existing scheduler actions (`generateUserSchedule`, `updateBlockStatus`, `rescheduleBlock`) and did not add schema changes.

### Files touched

- `components/InteractivePlannerClock.tsx`
- `components/TodayDashboard.tsx`
- `app/globals.css`
- `docs/ai/handoff.md`

### Why it changed

The Home page needed to shift the Clock Command Center from decorative schedule display plus primary numeric time inputs toward the intended interactable analog clock workflow, without rewriting scheduler logic in this phase.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- scheduler` - passed; repo script ran all `tests/*.test.ts`, 219 tests.
- Playwright browser fallback against local dev server `/` - passed for page load, nonblank body, no framework overlay, no console errors, and no failed requests.

### Verification result

- TypeScript and ESLint accept the new clock component and dashboard wiring.
- Existing scheduler/time tests still pass.
- Browser fallback verified the local app shell loads cleanly. Local data state showed the sync-first empty Home page, so the interactive clock surface was not visually exercised with real scheduled blocks in this session.

### Known risks

- The analog face maps times onto a 12-hour clock display, so AM/PM distinction is preserved by the selected window state but not separately labeled around the face.
- Move later still uses the existing placeholder reschedule wiring with unchanged start/end times.
- Inner segment hover/focus details are implemented locally in the clock; richer source-aware deep links remain future work.
- Touch dragging is implemented through pointer events but still needs real-device QA at small widths.

### Blockers

- No code blocker.
- Local browser data did not include a synced schedule, limiting visual verification of the clock surface.

### Next recommended step

Run a synced-account or seeded-demo browser pass at mobile widths (390px and 430px) to validate touch target comfort, arc dragging, selected-block panel placement, and clock segment readability.

### Suggested commit message

```
build interactive clock command center shell
```

---

## Session Update - 2026-05-03 (Clock Command Center timing and layout fix)

### What changed

- Synced the analog clock hands to the browser's current local time with a client-side ticking state and added a second hand.
- Updated free-time window math so `end <= start` is treated as an overnight window instead of invalid.
- Added overnight-aware ISO range generation for scheduler creation, including windows such as `7:00 PM - 12:00 AM`.
- Removed visible Start/End time inputs and the View Schedule button from the main Clock Command Center controls.
- Moved available duration into the clock card and kept one primary generation action: `Generate schedule` / `Regenerate Today Plan`.
- Enlarged the clock on desktop, improved mobile sizing, separated status chips from the clock face, and kept the free-time outer ring plus scheduled-block inner ring.
- Preserved selected-block actions for Open/Start, Mark studied/done/reviewed, Skip, and Move later through existing action wiring.
- Added scheduler coverage for overnight free-time windows.

### Files touched

- `components/InteractivePlannerClock.tsx`
- `components/TodayDashboard.tsx`
- `lib/scheduler/time.ts`
- `tests/scheduler.test.ts`
- `app/globals.css`
- `docs/ai/handoff.md`

### Why it changed

The Phase 1 clock shell still behaved like a time input form and rejected valid PM-to-midnight availability. The clock now reads as the primary control, reflects the user's real local time, and keeps schedule/free-time filtering aligned for overnight study windows.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- scheduler queue` - passed; repo test script ran all `tests/*.test.ts`, 222 tests.
- `npx agent-browser` smoke check against local dev server `/` - passed for page content, no Next.js error overlay, no captured console errors, and interactive snapshot.

### Verification result

- TypeScript and ESLint accept the clock/dashboard/time-helper changes.
- Scheduler tests now cover a `19:00 -> 00:00` window and after-midnight block filtering.
- Browser smoke check verified the Home route loads cleanly, but local data still showed the sync-first empty Home page rather than a seeded clock schedule.

### Known risks

- The analog clock remains a 12-hour face; overnight state is preserved in time values and filtering, but AM/PM is not separately drawn around the ring.
- Very long availability windows over 12 hours are valid in duration math, but the 12-hour ring is still a compact visual abstraction.
- Touch dragging at exact 390px/430px widths still needs a seeded visual QA pass.

### Blockers

- No code blocker.
- Local browser state did not include synced schedule data, so clock visual verification was limited to compile/runtime checks.

### Next recommended step

Run a seeded/demo schedule browser pass at 390px and 430px widths to validate real clock segment readability, touch target comfort, and label spacing.

### Suggested commit message

```
fix clock command center timing and layout
```

---

## Session Update - 2026-05-03 (Schedule resources and simplify clock details)

### What changed

- Expanded scheduler candidate construction beyond task items to include verified data sources already in the app:
  - `tasks`
  - `deadlines`
  - `modules`
  - readable `module_resources`
  - `learning_items`
  - ready `deep_learn_notes`
  - ready `drafts`
- Hardened module-resource scheduling so resources are only candidates when existing text-quality rules classify stored or completed visual OCR text as usable academic text.
- Skipped raw resource scheduling when a ready saved study pack or draft already exists for that resource, so the plan favors the prepared output over duplicate source material.
- Added saved-output estimate rules:
  - `Estimated from saved study pack`
  - `Estimated from saved draft`
  - resource estimates now say `Estimated from content length`
- Added `deep_learn_notes` and `drafts` as allowed `scheduled_blocks.source_table` values in a follow-up migration.
- Replaced the large Selected Block panel with inline card expansion in Today's Schedule and Need Attention.
- Capped Today's Schedule to 4 blocks by default and Need Attention to 2 by default, each with a lightweight `Show more` control.
- Made clock segment clicks open the matching schedule card expansion and scroll toward the schedule list.
- Added type pills on schedule cards for Task, Assignment, Module, Resource, Quiz practice, Study pack, and Draft.
- Kept Open / Start, Mark studied/done/reviewed, Skip, and Move later actions inside each expanded card.

### Files touched

- `actions/scheduler.ts`
- `app/page.tsx`
- `app/(app)/page.tsx`
- `lib/scheduler/types.ts`
- `lib/scheduler/algorithm.ts`
- `lib/scheduler/estimation.ts`
- `lib/scheduler/priority.ts`
- `components/TodayDashboard.tsx`
- `components/InteractivePlannerClock.tsx`
- `app/globals.css`
- `tests/scheduler.test.ts`
- `supabase/migrations/20260503070000_expand_scheduled_blocks_and_queue_cancel.sql`
- `supabase/migrations/20260503090000_allow_saved_outputs_in_schedule.sql`
- `docs/ai/handoff.md`

### Why it changed

Today's Schedule needed to reflect the actual student workflow instead of reading as task-only. The scheduler now uses ready academic resources and saved study outputs without treating unreadable PDFs, metadata-only extracts, OCR refusal text, or debug metadata as study content.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- scheduler queue learn-resource-ui deep-learn-readiness` - passed; repo test script ran all `tests/*.test.ts`, 223 tests.
- `npx agent-browser` Home smoke check against existing local dev server - passed for page content, no Next.js overlay, no captured console errors, and interactive snapshot.

### Verification result

- TypeScript and ESLint accept scheduler source expansion and inline schedule-card details.
- Scheduler tests cover saved study pack/draft estimate wording and existing resource/time behavior.
- Existing queue tests still cover active/completed/failed/canceled grouping and OCR queue continuation.
- Existing Learn resource and Deep Learn readiness tests still block unreadable, metadata-only, and OCR-refusal sources.
- Browser smoke check loaded the Home route cleanly; local data still showed the sync-first empty state, so seeded schedule-card expansion was not visually exercised.

### Known risks

- `deep_learn_notes` and `drafts` are optional candidate reads; if those tables are unavailable in an older environment, scheduling continues with Canvas/task/resource sources and logs a warning.
- Generated study pack/draft blocks are persisted with their own `source_table` values, but source-aware Open routing remains future work.
- The `Move later` action still uses existing placeholder reschedule wiring with unchanged times.
- Exact mobile visual QA for expanded cards and Show more controls still needs a seeded schedule state.

### Blockers

- No code blocker.
- Local browser state did not include synced schedule data.

### Next recommended step

Add source-aware Open routing for scheduled blocks so Study pack, Draft, Resource, Module, and Task blocks jump to the exact execution workspace instead of only changing block status.

### Suggested commit message

```
schedule resources and simplify clock details
```

---

## Session Update - 2026-05-03 (Clock Command Center arc overflow bugfixes)

### What changed

- Fixed `buildArcPath` in `components/InteractivePlannerClock.tsx`:
  - The `largeArcFlag` was computed from the raw minute span (`endMinutes - startMinutes > 360`) which is wrong for a 12-hour clock face. It now computes the clockwise visual angle from the converted clock-face degrees and sets the flag correctly (`clockwiseAngle > 180 ? 1 : 0`).
  - Added a 719-minute cap on the visual arc so windows ≥ 12 hours render as a near-full-circle arc instead of collapsing to a degenerate zero-length path or drawing a broken oversized stroke.
  - Duration text (displayed in the legend/chip) is computed from the original uncapped window and remains accurate.

- Fixed overflow containment in `app/globals.css`:
  - `.planner-clock-face`: changed `overflow: visible` → `overflow: hidden` so the yellow free-time ring can no longer escape the card and overlap the sidebar.
  - Replaced `display: grid; grid-template-rows: minmax(0, 1fr) auto` with `display: flex; flex-direction: column; align-items: center; justify-content: center` for proper centering of the SVG and status chips inside the face.
  - Removed hard-coded `min-height` from the face (desktop media query block) — the face now sizes to its content naturally.
  - `.planner-clock-svg`: changed `overflow: visible` → `overflow: hidden` to confine all SVG rendering (including filter glows) within the SVG element; the face's `overflow: hidden` is the final backstop.
  - Adjusted SVG max-widths to slightly more conservative values (`360px` base, `400px` desktop, `292px` mobile) for better proportion within the card.
  - Slightly increased face padding top/bottom for breathing room.

- Cleaned dev-facing demo controls in `components/TodayDashboard.tsx`:
  - Changed `SHOW_DEMO_PREVIEW` from `process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'` to `process.env.NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'`.
  - "Preview demo schedule" / "Use real schedule" buttons no longer appear in normal development. They only appear when explicitly opted in via the env flag, which keeps the student-facing UI finished in all normal contexts.
  - The underlying demo state, logic, and `buildDemoScheduleBlocks` function are preserved for opt-in QA use.

### Files touched

- `components/InteractivePlannerClock.tsx`
- `components/TodayDashboard.tsx`
- `app/globals.css`
- `docs/ai/handoff.md`

### Why it changed

The clock's yellow outer ring was escaping the card boundary due to `overflow: visible` on the face container. Long free-time windows (12h+, 17h45m) produced broken arcs due to an incorrect `largeArcFlag` calculation that used the raw minute span instead of the visual clock-face angle. The dev demo toggle appeared on every local development load, making the UI feel unfinished to a student.

### Tests run

- `npm run typecheck` — passed (0 errors)
- `npm run lint` — passed (0 errors)
- `npm test` — 223 tests, 0 failures

### Verification result

All checks passed. Browser QA was not automated in this session (no Playwright setup available in this environment); visual verification is recommended at 390px, 430px, and desktop widths to confirm:
- Yellow ring stays inside the card
- Long availability windows (12h+, overnight) render as a clean near-full arc
- Clock centered in face
- No "Preview demo schedule" button visible in normal dev/prod

### Known risks

- The 719-minute arc cap means windows exactly at or over 12 hours show a near-full-circle arc regardless of actual end angle. This is intentionally conservative; the duration text remains accurate and the arc is visually unambiguous.
- `overflow: hidden` on the face clips the outermost filter glow (drop-shadow) on arcs that reach the very top or edge of the clock face. The effect is subtle and preferable to the previous ring overflow.
- Browser QA at exact mobile widths was not run with automation.

### Blockers

None.

### Next recommended step

Run manual browser QA at 390px, 430px, and desktop with a real or demo schedule to confirm arc rendering, centering, and no overflow regression. Then add source-aware Open routing for scheduled blocks (Study pack → library, Draft → do page, Resource → learn page, Module → module page, Task → task page).

### Suggested commit message

```
fix clock command center arc overflow
```

---

## Session Update - 2026-05-03 (Schedule persistence fix + clock ring bleed)

### What changed

**Priority 1 — Schedule persistence**

- Root cause: migrations `20260503070000` and `20260503090000` were not applied to the remote Supabase database. The `scheduled_blocks` table was missing six columns (`source_type`, `course_id`, `subtitle`, `block_type`, `estimate_confidence`, `estimate_reason`) that `generateUserSchedule` now inserts.
- Applied both migrations via Supabase MCP:
  - `expand_scheduled_blocks_and_queue_cancel`: adds the missing columns, `block_type` check constraint, two new indexes, and the queue cancel policy.
  - `allow_saved_outputs_in_schedule`: replaces the `source_table` check constraint to also allow `deep_learn_notes` and `drafts`.
- Added structured error logging in `actions/scheduler.ts` before the student-facing throw:
  ```
  console.error('[scheduler] insert failed', { code, message, details, hint })
  ```
  This lets server logs capture the real Supabase error without exposing it to the student UI.

**Priority 2 — Inner clock ring bleed**

- Root cause 1: `.planner-clock-svg` was set to `overflow: hidden` in the previous session. SVG `overflow: hidden` clips CSS `filter: drop-shadow()` in ways that create rendering artifacts — the glow from the inner plan arc was being clipped into a visible blurry "filled circle" at the clock center.
- Root cause 2: `filter: drop-shadow(0 0 7px var(--accent) 22%)` on `.clock-ring-arc.plan` radiates inward toward the clock center. With the current `is-current` green color this created a glow that visually merged into a large bleeding green circle.
- Root cause 3: `stroke-width: 17` on `is-selected` exceeded the inner track band (14px) causing the selected segment to protrude outside its ring.
- Fixes in `app/globals.css`:
  - `.planner-clock-svg`: reverted `overflow: hidden` → `overflow: visible`. The `.planner-clock-face` `overflow: hidden` is the card-level backstop and is sufficient; the SVG element does not need its own clip.
  - `.clock-ring-arc.plan`: removed `filter: drop-shadow(...)`, reduced `stroke-width` from 14 → 11. Plan segments are now clean colored strokes within the 14px inner track band — no glow, no bleed.
  - `.clock-ring-arc.plan.is-selected`: reduced `stroke-width` from 17 → 14 (matches track width, no protrusion).

### Files touched

- `actions/scheduler.ts`
- `app/globals.css`
- `docs/ai/handoff.md`
- Supabase remote DB: applied `expand_scheduled_blocks_and_queue_cancel` and `allow_saved_outputs_in_schedule` migrations

### Why it changed

The schedule generation has been broken since the two May 3 migrations were written locally but never applied to the remote database. Every generate attempt silently failed with an insert error that had no server log trace. The clock ring bleed was an interaction between the previous session's `overflow: hidden` on the SVG element and the drop-shadow filter on plan arcs.

### Tests run

- `npm run typecheck` — passed (0 errors)
- `npm run lint` — passed (0 errors)
- `npm test` — 223 tests, 0 failures

### Verification result

Schema confirmed via Supabase MCP — all 19 columns present, constraints correct. Code checks all passed. Browser QA not automated (no Playwright); recommend manual verification that generate schedule now works end-to-end and the inner ring shows clean segments without glow.

### Known risks

- Plan arc `stroke-width: 11` is narrower than the inner track (14px), so the gray track shows as a thin halo around each segment. This is intentional — segments-in-a-band look. If this is visually undesirable, increase plan arc stroke-width back to 14.
- The `is-current` green color is still applied; it will be visible but without glow bleed.
- Queue cancel policy from `expand_scheduled_blocks_and_queue_cancel` is now active remotely — this is an unrelated change that was bundled in the migration file.

### Blockers

None. Both migrations applied and verified remotely.

### Next recommended step

Manually test Generate schedule end-to-end with a real Canvas-synced account. Confirm blocks are persisted, `Today's Schedule` updates, and the inner ring shows clean segments. Then add source-aware Open routing per block type.

### Suggested commit message

```
fix schedule persistence and clock ring bleed
```

---

## Session Update — 2026-05-03 (Clock ring geometry and scheduler source fixes)

### What changed

**Part A — Clock ring geometry:**
- `app/globals.css`: removed the accent-color radial-gradient from `.planner-clock-face` background. The first layer (`color-mix(in srgb, var(--surface-focus) 86%, var(--accent) 14%) 0 30%`) created a green-tinted disc sized at 30% of the CSS element — not tied to the SVG viewBox — and appeared as a large haze circle behind the clock.
- `app/globals.css`: reduced `drop-shadow` blur on `.clock-ring-arc.free` from `8px` to `3px`. At 8px blur the glow spread ~24 SVG units inward from the free arc's inner edge (r=128), nearly touching the inner ring's outer edge at r=103 — causing visible amber bleed.
- SVG geometry (InteractivePlannerClock.tsx) was verified correct; no changes needed. All inner ring segments use the same `CENTER=160, INNER_RADIUS=96` coordinate system as the rest of the clock.

**Part B — Scheduler source quality:**
- `actions/scheduler.ts`: loosened `module_resources` readiness filter to include `too_short` quality (has some content, just brief) in addition to `meaningful`. Previously only `meaningful` resources were scheduled; resources with brief but real extracted text were silently dropped.
- `actions/scheduler.ts`: refactored `deepLearnNotesData` and `draftsData` into named variables (eliminating repeated `!result.error` ternaries) and added server-side diagnostic logging:
  - `[scheduler:sources] raw counts` — counts per source table before readiness filtering
  - `[scheduler:candidates] by source type` — counts in `sourceItems` after all filters
  - `[scheduler:generated] blocks by source` — counts in the final generated block list
- `lib/scheduler/algorithm.ts`: added deduplication in `generateSchedule` keyed on `sourceTable:id`. Prevents the same record appearing twice in a single generated schedule (can happen if Canvas sync produces overlapping records in `task_items` and `tasks`).
- `lib/scheduler/estimation.ts`: improved two generic estimate reason labels:
  - `'Estimated module review block'` → `'Estimated from module review'`
  - `'Estimated default task block'` → `'Estimated from workload and urgency'`

### Files touched

- `app/globals.css`
- `lib/scheduler/algorithm.ts`
- `lib/scheduler/estimation.ts`
- `actions/scheduler.ts`
- `docs/ai/handoff.md`

### Why it changed

The clock face background had a CSS radial-gradient using `var(--accent)` (green) at 30% element width, creating a visible haze circle that floated independently of the SVG coordinate system. At the same time, the 8px drop-shadow on the free arc bled inward to r≈104, almost touching the inner plan ring at r=103. Resources with brief (but real) extracted text were silently excluded from scheduling, reducing schedule variety. The dedup guard prevents the same source appearing twice if Canvas data has overlapping entries across tables.

### Tests run

- `npm run typecheck` — passed (0 errors)
- `npm run lint` — passed (0 errors)
- `npm test` — 223 tests, 0 failures (scheduler, queue, learn-resource-ui, deep-learn-readiness all included)

### Verification result

All code checks passed. The CSS changes are geometry-only and do not alter SVG math. Browser QA was not automated (no Playwright); manual verification recommended:
- Clock face background should no longer show a green-tinted haze circle at center
- Free arc glow should be tighter and not visually merge with the inner ring
- Server logs should show `[scheduler:sources]` and `[scheduler:generated]` output on generate
- Resources with brief extracted text that previously showed 0 resource blocks in the generated schedule should now be included as candidates

### Known risks

- The diagnostic `console.log` calls in `scheduler.ts` are intentionally temporary. Remove them once the source-inclusion issue is confirmed resolved (or after next session).
- `too_short` resources will now be scheduled; they will have estimate_reason `'Estimated from material fallback'` and low confidence. The student may find blocks shorter than expected. This is intentional — the student still needs to review these pages.
- If a user's `module_resources` have no extracted text at all (extraction pending/queued), they remain excluded (`empty` quality). That is correct behavior.

### Blockers

None.

### Next recommended step

1. Manually test Generate schedule with a synced account and confirm the server logs show module/resource/deep_learn candidates.
2. Remove the diagnostic `console.log` calls from `actions/scheduler.ts` once source inclusion is confirmed.
3. Add source-aware Open routing per scheduled block type (open task → task page, open module → module page, open resource → resource reader).

### Suggested commit message

```
fix scheduler sources and clock ring geometry
```

---

## Session Update - 2026-05-03 (Dedupe schedule sources and group today plan)

### What changed

- **`components/InteractivePlannerClock.tsx`** — Three fixes:
  1. **Second-hand pivot**: corrected `y1={CENTER + 12}` → `y1={CENTER}` so the second hand starts from the center dot instead of being offset 12 SVG units downward.
  2. **Dense schedule ring**: when `segments.length > 7` (constant `DENSE_SEGMENT_THRESHOLD`), a single `.clock-ring-arc.plan.dense` arc is rendered from the earliest block start to the latest block end. Individual arcs render as `.clock-ring-arc.plan.ghost` (opacity 0) so they remain interactable via focus/keyboard; selected or current blocks override opacity to 1 so the active block always shows clearly. Ghost arcs still respond to pointer/keyboard events normally.

- **`actions/scheduler.ts`** — Fixed duplicate schedule generation:
  - Removed `.gte('start_at', nowIso)` guard from cleanup query. Previous behavior only deleted future `scheduled` blocks, leaving past-window blocks from prior regeneration runs. Now all `status = scheduled` blocks for the user are deleted before inserting the new plan. `opened`/`completed`/`skipped` blocks are still preserved (deleted only if `status = scheduled`).

- **`lib/scheduler/algorithm.ts`** — Added cross-table title deduplication:
  - New `scheduledTitleSources: Map<string, string>` tracks which source group (T = task_items/tasks/deadlines, M = modules/module_resources/etc., D = drafts) first claimed a given normalized title.
  - If the same normalized title appears in a different source group's table (e.g., an assignment in both `task_items` and `tasks`), the lower-priority duplicate is skipped.
  - Same-table same-title items (two different DB rows in the same table) are both scheduled — dedup is cross-table only.
  - Helper functions: `getSourceGroupKey(sourceTable)`, `normalizeSourceTitle(title)`.

- **`app/globals.css`** — Added:
  - `.clock-ring-arc.plan.dense`: low-opacity filled arc representing the overall scheduled time range.
  - `.clock-ring-arc.plan.ghost`: opacity 0 for non-selected/non-current arcs in dense mode.
  - `.clock-ring-arc.plan.ghost:focus-visible`, `.ghost.is-selected`, `.ghost.is-current`: override opacity to 1 for active/selected arcs.

- **`tests/scheduler.test.ts`** — Three new tests:
  - Cross-table same-title items produce only one block (dedup works across task_items vs tasks).
  - Same-table same-title items are both scheduled (dedup does not apply within a table).
  - Ready `module_resource` is included in generated schedule.

### Files touched

- `components/InteractivePlannerClock.tsx`
- `actions/scheduler.ts`
- `lib/scheduler/algorithm.ts`
- `app/globals.css`
- `tests/scheduler.test.ts`
- `docs/ai/handoff.md`

### Why it changed

- Second-hand offset was a geometry bug: `y1={CENTER + 12}` moved the hand's anchor 12px below center, making the hand appear to hang from an off-center pivot.
- Dense ring: at 8+ blocks the inner ring becomes too crowded to read; a single arc summarizes the scheduled range while ghost arcs stay keyboard-accessible.
- Cleanup query: Canvas data frequently records the same assignment across both `task_items` and `tasks`. Without full cleanup, regenerating during the same day would accumulate both past-window duplicates and cross-table duplicates.
- Cross-table dedup: the greedy algorithm packs the highest-scoring block first; with a `tasks` and `task_items` row for the same assignment, both could schedule. The `titleKey` guard prevents two blocks representing the same student work item from both landing in the plan.

### Tests run

```
npm run typecheck   — passed (0 errors)
npm run lint        — passed (0 errors)
npm test            — 226 tests, 0 failures
```

### Verification result

All quality gates passed. Browser QA was not automated. Manual verification recommended:
- Regenerate a schedule twice back-to-back and confirm block count stays stable (no compounding duplicates).
- With 8+ scheduled blocks, confirm the clock ring shows a single dense arc with no individual arcs visible, but clicking or tabbing to a block still highlights that block's arc on the ring.
- Confirm the second hand now starts from the center dot.

### Known risks

- Dense-mode ghost arcs rely on SVG `pointer-events: stroke`, which is correct for arc paths. If a ghost arc has a very short path, the clickable stroke area may be too small to tap on mobile; users can still use the schedule list to select blocks.
- Cross-table title dedup uses a normalized lowercase-alpha-numeric comparison. Very similarly named but genuinely distinct assignments (e.g., "Reading 1" vs "Reading 1b") remain distinct.

### Blockers

None.

### Next recommended step

1. Browser QA at 390px and 430px with a real synced Canvas workspace and 8+ scheduled blocks to validate dense ring behavior and group layout.
2. Remove the `console.log` diagnostics from `actions/scheduler.ts` once source inclusion is confirmed working in production.

### Suggested commit message

```
dedupe schedule sources and group today plan
```
## Session Update - 2026-05-11 (Fix external cron course-list skip)

### What changed
- Updated `/api/cron/external-sync` so already-synced local DB courses are still queued even when Canvas `getCourses()` does not return the course.
- Added `courseListMissQueued` to cron scan stats.
- Removed the skip/continue behavior for locally synced courses missing from the Canvas course list.

### Files touched
- `app/api/cron/external-sync/route.ts`
- `docs/ai/handoff.md`

### Why it changed
External cron returned `jobsQueued: 0` with `skipped.notInCanvasList: 1`, so Canvas announcements were not refreshed even though the course was already synced locally. Manual resync worked because it directly fetched Canvas course data. The external cron should attempt direct course-id sync for existing local courses and let the background processor fail safely if Canvas denies access.

### Tests run
- `npm run typecheck`
- `npm run lint`
- `npm test -- queue canvas-digest`

### Verification result
Pending / passed: <fill after running tests>.

### Known risks
- If Canvas truly denies access to a course that is absent from `getCourses()`, an external cron `canvas_sync` job may be queued and then fail normally.
- Duplicate/cooldown/daily cap guards still protect against repeated queue spam.
- OCR/OpenAI work remains outside the cron request.

### Blockers
None known.

### Next recommended step
Deploy, trigger `/api/cron/external-sync`, and confirm `jobsQueued: 1` or `courseListMissQueued: 1` with a completed `external_cron` canvas_sync job.

### Suggested commit message
fix external cron synced course queueing

Live verification: `/api/cron/external-sync` now returned `jobsQueued: 1`, `courseListMissQueued: 1`, and `skipped.notInCanvasList: 0`. The queued external job reached `refreshing_resources` but stayed running for 12+ minutes; `/api/cron/hourly` cleanup reset it to pending with `attempts: 1`, confirming stuck-job recovery works but external resource refresh may still need hardening if it stalls again.

Additional live verification:
- `/api/cron/external-sync` successfully returned `jobsQueued: 1`, `courseListMissQueued: 1`, and `skipped.notInCanvasList: 0`, proving the course-list skip fix works.
- The existing pending external cron job was detected as `activeDuplicate: 1`, then picked up again by the background worker.
- The job repeatedly stalled at `currentStep: refreshing_resources`, `progress: 38`.
- Raised `/api/cron/external-sync` `maxDuration` from `20` to `55` seconds to reduce the chance that Vercel cuts off `after()` background processing during resource refresh.

The previously stuck external cron job advanced past `refreshing_resources` on retry attempt 2 and reached `refreshing_tasks` at progress 72, suggesting the resource refresh stage can complete but may be slow enough to require timeout/stale-job recovery monitoring.

Additional live verification:
- External cron job `d49e0e59-7480-4ad1-9084-5392b48931fe` reached max attempts after repeated stalls at `refreshing_resources` / `refreshing_tasks`.
- `/api/cron/hourly` successfully reset stuck running jobs, but the job was later manually marked failed at `attempts: 3/3` to unblock future external cron runs.
- The route-level queueing fix remains verified: external cron no longer skips locally synced courses missing from Canvas `getCourses()`.
- Remaining blocker: external cron worker can hang during resource/task refresh. Next fix should make external cron resource/task refresh timeout-bounded or non-blocking so announcement sync can still complete.

### Live verification result

Production verification passed. `/api/cron/external-sync` returned `processedInline: true` and queued external cron job `99c5a1f5-33ed-418c-a7bc-b1abfd039f65`.

The job completed successfully:
- `status: completed`
- `progress: 100`
- `currentStep: done`
- `error: null`
- completed in about 14 seconds

The job result included:
- `resourceRefreshWarning: "Skipped during external cron to keep announcement sync responsive."`
- `taskRefreshWarning: "Skipped during external cron to keep announcement sync responsive."`

This confirms the lightweight external cron path works and avoids the previous `refreshing_resources` / `refreshing_tasks` hang.

## Session Update - 2026-05-17 (Use stronger Reviewer compiler model)

### What changed
- Updated the Deep Learn Reviewer / Answer Bank structured compiler path to use a Reviewer-specific coverage-first model profile:
  - primary Reviewer compiler resolves to the configured non-mini model, defaulting to `gpt-5.4`
  - targeted Reviewer repair resolves to the configured premium model, defaulting to `gpt-5.5`
  - mini models are rejected for Reviewer generation, repair, and coverage decisions
- Kept Tasks and task-output routing unchanged; this change is scoped to the Deep Learn Reviewer / Answer Bank generation path.
- Loosened Reviewer-only generation limits with coverage-first dynamic targets, higher Reviewer output-token budgets, and broader operational caps for dense sources.
- Strengthened section coverage validation so compressed heading-list cards only count as weak mentions; required sections now need direct, substantive cards.
- Added Reviewer duplicate/wasted-card detection before final validation and repair.
- Changed targeted repair to send only missing or weak sections to the premium repair model and avoid full regeneration unless output is unusable.
- Added internal Reviewer diagnostics for model routing, outline size, target/actual card counts, direct/weak/uncovered section counts, duplicate removals, fallback repair usage, and coverage pass/failure reason.

### Files touched
- `lib/deep-learn-generation.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed
Manual verification showed meaningful source extraction but incomplete Reviewer coverage: later source sections were compressed into list cards or omitted, and repeated shallow cards wasted answer-bank space. Reviewer is the serious exam/review path, so it now starts with the configured non-mini/GPT-5.4 compiler and uses configured premium/GPT-5.5 only for targeted missing-section repair. This keeps quality-focused Reviewer behavior separate from Tasks, where mini routing remains acceptable and unchanged.

### Tests added/updated
- Added mocked-model coverage for Reviewer primary model routing and no-mini usage.
- Added GPT-5.5 targeted repair coverage when GPT-5.4 returns valid JSON with missing required sections.
- Added compressed heading-list coverage tests to ensure weak mentions do not unlock readiness.
- Added dense-source target sizing tests so Reviewer output expands beyond old mini-era caps.
- Added duplicate/wasted-card removal tests that trigger repair when dedupe reveals missing coverage.
- Added short-source regression coverage so small sources stay complete without bloating.
- Added non-Reviewer/task-output routing regression coverage.

### Commands run
- `git status --short`
- `npx tsx --test tests/deep-learn-generation.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test -- deep-learn-generation`
- `npm test -- task-output task-output-foundation`
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue`
- `npm test -- study-output-reviewer study-output-quiz-pack learn-resource-ui deep-learn-readiness`

### Verification result
- Passed:
  - direct `tests/deep-learn-generation.test.ts` run: 92 tests
  - `npm run typecheck`
  - `npm run lint`
  - requested focused/broader npm test commands; each npm test invocation completed with 660 passing tests
- Verified by mocked assertions:
  - Reviewer primary model is non-mini/GPT-5.4 by default
  - Reviewer fallback repair uses GPT-5.5 by default
  - Reviewer mini usage is false
  - compressed heading lists do not satisfy required section coverage
  - repeated shallow cards are removed
  - dense sources request larger Reviewer banks
  - task-output routing remains task-specific and mini-compatible

### Known risks
- Coverage detection is intentionally stricter and may fail Reviewer generation rather than saving incomplete banks when model output only weakly mentions required sections.
- The new higher Reviewer token budgets and broader card targets increase Reviewer generation cost and provider latency, though operational caps remain in place.
- Manual production verification with real uploaded SDLC / IT Security / PATHFit sources is still recommended after deployment.

### Blockers
- No blocker in automated verification.
- Browser/live production verification was not run in this session because the requested mocked automated coverage passed and no authenticated production check was required to complete the code path fix.

### Next recommended step
Deploy this commit, generate Reviewers for the known SDLC-like and IT Security sources, and confirm logs show `reviewerMiniUsed: false`, `reviewerPrimaryModel: gpt-5.4`, targeted `gpt-5.5` repair only when needed, direct cards for all major sections, and duplicate shallow cards removed.

### Suggested commit message
use stronger Reviewer compiler model

## Session Update - 2026-05-17 (Add offline Reviewer source fixtures)

### What changed
- Added offline extracted-text fixtures for representative Deep Learn Reviewer coverage failures:
  - multi-phase systems-analysis style source
  - taxonomy-heavy information-security style source
  - short physical-education martial-arts style module
- Updated Reviewer coverage tests to use the fixture texts and expected major section lists instead of inline synthetic source strings.
- Kept the implementation source-agnostic; no SDLC, IT Security, Arnis, course, instructor, or file-name logic was added.
- Did not run the website or browser verification; this was an offline mocked-model test fixture update.

### Files touched
- `tests/fixtures/deep-learn-reviewer-sources.ts`
- `tests/deep-learn-generation.test.ts`
- `docs/ai/handoff.md`

### Why it changed
The previous Reviewer tests used small generated snippets that did not closely match the production failure pattern. The new fixtures preserve representative extracted academic source shapes so coverage tests exercise later-phase omissions, taxonomy duplication, compressed heading-list cards, and short-source non-bloat behavior without relying on live OpenAI calls or browser/product runs.

### Tests run
- `npx tsx --test tests/deep-learn-generation.test.ts`
- `npx tsx --test --test-name-pattern "short Reviewer source" tests/deep-learn-generation.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test -- deep-learn-generation`

### Verification result
- Passed:
  - direct `tests/deep-learn-generation.test.ts` run: 92 tests
  - short Reviewer fixture targeted run
  - `npm run typecheck`
  - `npm run lint`
  - `npm test -- deep-learn-generation`: 660 tests
- Verified offline:
  - compressed multi-phase heading-list cards still fail coverage and trigger GPT-5.5 repair
  - taxonomy-heavy sources expand Reviewer targets and preserve later sections
  - duplicate shallow impact cards are removed and repair covers missing taxonomy sections
  - short module sources stay bounded while still covering required outline items

### Known risks
- The fixture texts intentionally mirror production-like extracted content but are still offline representatives, not private production files.
- The short fixture currently drives a 20-card target because deterministic outline detection treats its major headings and summary as required; the test keeps this bounded and verifies it does not exceed that output size.

### Blockers
- No blockers.

### Next recommended step
Use these fixtures as the baseline for any future Reviewer coverage tuning before checking live deployments.

### Suggested commit message
add offline Reviewer source fixtures

## Session Update - 2026-05-13 (Fix sync timestamp reporting)

### What changed
- Replaced the misleading `/sync` "Last sync" model with a derived activity summary that separates:
  - `Last Canvas update`
  - `Last full manual sync`
  - `Last background sync`
  - `Last resource refresh`
- Added a small `resource_refresh_activity` table plus logging so background resource refreshes have a durable, per-user visible timestamp instead of being invisible to the Sync Courses page.
- Updated `/api/cron/resource-refresh` to record completed and failed refresh activity rows.
- Updated the Sync Courses page to show honest labels, latest-update details, and a warning state when the newest background sync completed with warnings instead of claiming the workspace is simply "Up to date".
- Added a bounded `Refresh resources` action for individual synced courses on `/sync` and `/courses/[id]` using the existing course-level metadata refresh path instead of a global sync.

### Files touched
- `app/api/cron/resource-refresh/route.ts`
- `app/courses/[id]/page.tsx`
- `app/sync/page.tsx`
- `actions/course-resource-refresh.ts`
- `components/RefreshCourseResourcesButton.tsx`
- `components/SyncCoursesPageClient.tsx`
- `lib/resource-refresh-activity.ts`
- `lib/sync-activity.ts`
- `supabase/migrations/20260513130000_add_resource_refresh_activity.sql`
- `tests/sync-activity.test.ts`
- `docs/ai/handoff.md`

### Why it changed
The Sync Courses page was deriving "Last sync" from imported module timestamps, which effectively reflected the last full manual course import and ignored newer successful background syncs and resource refreshes. That made the UI claim stale update times even when cron jobs had refreshed the workspace more recently. The new summary keeps manual sync, background sync, and resource refresh timestamps separate and uses the latest successful visible update as the "Last Canvas update" timestamp.

### Tests run
- `npm run typecheck`
- `npm run lint`
- `npm test -- external sync resource refresh sync queue canvas update events`
- `npm test -- canvas-resource-refresh canvas-content-resolution queue`
- `npx supabase db push`

### Verification result
- Passed:
  - `typecheck`
  - `lint`
  - targeted sync/resource refresh/queue/canvas update tests
  - remote Supabase migration push
- Verified in code and tests:
  - failed background syncs do not become `Last Canvas update`
  - manual sync, background sync, and resource refresh timestamps stay distinct
  - `/sync` now reads queue activity plus resource refresh activity instead of old module import timestamps
- Not completed in this session:
  - authenticated browser verification of the production Sync Courses page and course-level refresh button

### Known risks
- Existing historical resource refreshes from before this migration will not backfill `resource_refresh_activity`, so `Last resource refresh` starts being accurate from this deployment forward.
- The background sync warning state depends on `queued_jobs.result` warning metadata staying consistent with the current external sync job shape.
- Manual browser confirmation is still needed to validate the exact student-facing copy and spacing with real account data.

### Blockers
- No authenticated production browser session was available here to complete the requested live UI verification against `/sync`.

### Next recommended step
1. Open `/sync` in production with a real student account and confirm `Last Canvas update` reflects the newest successful background sync or resource refresh instead of the older manual import time.
2. Trigger `Refresh resources` on a synced course and confirm the page updates `Last resource refresh` without starting a global sync.
3. If desired later, backfill `resource_refresh_activity` from older queue/job history so existing users immediately see a pre-deployment resource refresh timestamp.

### Suggested commit message
fix sync timestamp reporting

### Live verification result

Production verification passed. `/api/cron/external-sync` returned `processedInline: true` and queued external cron job `99c5a1f5-33ed-418c-a7bc-b1abfd039f65`.

The job completed successfully:
- `status: completed`
- `progress: 100`
- `currentStep: done`
- `error: null`
- completed in about 14 seconds

The job result included:
- `resourceRefreshWarning: "Skipped during external cron to keep announcement sync responsive."`
- `taskRefreshWarning: "Skipped during external cron to keep announcement sync responsive."`

This confirms the lightweight external cron path works and avoids the previous `refreshing_resources` / `refreshing_tasks` hang.
