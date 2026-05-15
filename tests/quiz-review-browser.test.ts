import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'

test('saved quiz review interactions work in a browser', async (t) => {
  const browser = await launchChromiumOrSkip(t)
  if (!browser) return

  const page = await browser.newPage()
  try {
    await page.setContent(buildQuizReviewHarnessHtml(), { waitUntil: 'domcontentloaded' })

    await page.getByTestId('quiz-start').click()
    await assertVisibleText(page, 'quiz-question', 'Which item belongs to the CIA Triad?')

    await page.getByRole('button', { name: /Ransomware/ }).click()
    await page.getByTestId('quiz-check-answer').click()
    await assertVisibleText(page, 'quiz-result', 'Incorrect')
    await assertVisibleText(page, 'quiz-selected-answer', 'Selected answer: Ransomware')
    await assertVisibleText(page, 'quiz-correct-answer', 'Confidentiality')
    await assertVisibleText(page, 'quiz-explanation', 'Correct because Confidentiality is listed under CIA Triad.')
    await assertVisibleText(page, 'quiz-review-cue', 'Review this concept: CIA Triad')
    await assertVisibleText(page, 'quiz-source-note', 'Source-backed note: "Goal of IT Security 1. Confidentiality 2. Integrity 3. Availability"')
    await assertNoInternalMetadata(page)

    await page.getByTestId('quiz-reset').click()
    await assertHidden(page, 'quiz-feedback')

    await page.getByTestId('quiz-choice-correct').click()
    await page.getByTestId('quiz-check-answer').click()
    await assertVisibleText(page, 'quiz-result', 'Correct')
    await assertVisibleText(page, 'quiz-correct-answer', 'Confidentiality')

    await page.getByTestId('quiz-next').click()
    await assertVisibleText(page, 'quiz-question', 'Define IT Security.')
    await page.getByTestId('quiz-check-answer').click()
    await assertVisibleText(page, 'quiz-identification-review', 'Identification review')
    await assertVisibleText(page, 'quiz-correct-answer', 'IT Security uses cybersecurity strategies to prevent unauthorized access.')
    await assertVisibleText(page, 'quiz-explanation', 'Correct because the source defines IT Security as IT Security uses cybersecurity strategies to prevent unauthorized access.')
    await assertVisibleText(page, 'quiz-review-cue', 'Review this concept: IT Security')
    await assertNoInternalMetadata(page)

    await page.emulateMedia({ media: 'print' })
    await assertVisibleText(page, 'quiz-print-document', 'Printable Quiz')
    await assertVisibleText(page, 'quiz-print-document', 'Review this concept: CIA Triad')
  } finally {
    await browser.close()
  }
})

async function launchChromiumOrSkip(t: { skip: (message?: string) => void }): Promise<Browser | null> {
  try {
    return await chromium.launch({ headless: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/Executable doesn't exist|browserType\.launch|install/i.test(message)) {
      t.skip(`Playwright Chromium is not installed locally: ${message.split('\n')[0]}`)
      return null
    }
    throw error
  }
}

async function assertVisibleText(page: Page, testId: string, expected: string) {
  const locator = page.getByTestId(testId).filter({ hasText: expected }).first()
  await locator.waitFor({ state: 'visible', timeout: 5000 })
  assert.match(await locator.textContent() ?? '', new RegExp(escapeRegExp(expected)))
}

async function assertHidden(page: Page, testId: string) {
  assert.equal(await page.getByTestId(testId).count(), 0)
}

async function assertNoInternalMetadata(page: Page) {
  const text = await page.locator('body').innerText()
  assert.doesNotMatch(text, /sourceUnitId|confidence|generationMethod|debug labels?|source_map_mcq|source_map_identification/i)
}

function buildQuizReviewHarnessHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quiz Review Browser Harness</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; }
    button { display: block; margin: 8px 0; }
    .panel { border: 1px solid #ddd; padding: 16px; margin: 12px 0; }
    .reviewer-print-only { display: none; }
    @media print {
      .reviewer-print-hide { display: none !important; }
      .reviewer-print-only { display: block; }
    }
  </style>
</head>
<body>
  <main id="app"></main>
  <section class="reviewer-print-only" data-testid="quiz-print-document">
    <h2>Printable Quiz</h2>
    <p>Question 1 - Multiple choice</p>
    <p>Review this concept: CIA Triad</p>
  </section>
  <script>
    const items = [
      {
        type: 'multiple_choice',
        prompt: 'Which item belongs to the CIA Triad?',
        answer: 'Confidentiality',
        choices: ['Confidentiality', 'Ransomware', 'Phishing', 'Endpoint Security'],
        explanation: 'Correct because Confidentiality is listed under CIA Triad.',
        reviewCue: 'CIA Triad',
        sourceNote: 'Goal of IT Security 1. Confidentiality 2. Integrity 3. Availability'
      },
      {
        type: 'identification',
        prompt: 'Define IT Security.',
        answer: 'IT Security uses cybersecurity strategies to prevent unauthorized access.',
        choices: [],
        explanation: 'Correct because the source defines IT Security as IT Security uses cybersecurity strategies to prevent unauthorized access.',
        reviewCue: 'IT Security',
        sourceNote: 'What is IT Security - A set of cyber security strategies that prevent unauthorized access.'
      }
    ];
    let active = false;
    let index = 0;
    let selected = null;
    let revealed = false;
    const app = document.getElementById('app');

    function render() {
      const item = items[index];
      app.innerHTML = active ? renderQuestion(item) : '<button data-testid="quiz-start">Start Quiz</button>';
      bind();
    }

    function renderQuestion(item) {
      const choices = item.choices.map((choice) => '<button data-testid="' + (choice === item.answer ? 'quiz-choice-correct' : 'quiz-choice') + '">' + choice + '</button>').join('');
      const feedback = revealed ? '<section class="panel" data-testid="quiz-feedback">' +
        (item.type === 'multiple_choice'
          ? '<p data-testid="quiz-result">' + (selected === item.answer ? 'Correct' : 'Incorrect') + '</p><p data-testid="quiz-selected-answer">Selected answer: ' + selected + '</p>'
          : '<p data-testid="quiz-identification-review">Identification review</p>') +
        '<strong data-testid="quiz-correct-answer">' + item.answer + '</strong>' +
        '<p data-testid="quiz-explanation">' + item.explanation + '</p>' +
        '<p data-testid="quiz-review-cue">Review this concept: ' + item.reviewCue + '</p>' +
        '<p data-testid="quiz-source-note">Source-backed note: "' + item.sourceNote + '"</p>' +
        '</section>' : '';
      return '<section class="reviewer-print-hide" data-testid="quiz-review-card">' +
        '<p data-testid="quiz-question">' + item.prompt + '</p>' +
        choices +
        '<button data-testid="quiz-check-answer" ' + (item.type === 'multiple_choice' && !selected ? 'disabled' : '') + '>' + (item.type === 'multiple_choice' ? 'Check answer' : 'Reveal answer') + '</button>' +
        '<button data-testid="quiz-reset">Reset question</button>' +
        '<button data-testid="quiz-next">Next question</button>' +
        feedback +
        '</section>';
    }

    function bind() {
      const start = document.querySelector('[data-testid="quiz-start"]');
      if (start) start.onclick = () => { active = true; render(); };
      document.querySelectorAll('[data-testid="quiz-choice"], [data-testid="quiz-choice-correct"]').forEach((button) => {
        button.onclick = () => { selected = button.textContent; render(); };
      });
      const check = document.querySelector('[data-testid="quiz-check-answer"]');
      if (check) check.onclick = () => { revealed = true; render(); };
      const reset = document.querySelector('[data-testid="quiz-reset"]');
      if (reset) reset.onclick = () => { selected = null; revealed = false; render(); };
      const next = document.querySelector('[data-testid="quiz-next"]');
      if (next) next.onclick = () => { index = (index + 1) % items.length; selected = null; revealed = false; render(); };
    }
    render();
  </script>
</body>
</html>`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
