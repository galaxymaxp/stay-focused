# Extraction And OCR

Stay Focused always runs normal PDF text extraction first. OCR is only for PDFs that appear scanned or image-only after the normal extractor cannot find meaningful selectable academic text.

## OCR Provider Config

Set `OCR_PROVIDER` to one of:

- `disabled` - default; no automatic visual OCR.
- `google_vision` - preferred automatic scanned-PDF OCR path.
- `google_document_ai` - Google Document AI OCR processor path.
- `openai` - explicit opt-in only; reserved for manual/testing fallback, not default production OCR.

Legacy `OCR_PROVIDER=google` is normalized to `google_vision`.

Cost guardrails:

- `OCR_MAX_PAGES_PER_JOB` defaults to `24`.
- `OCR_MAX_JOBS_PER_SYNC` defaults to `1`.
- `OCR_MAX_RETRIES_PER_RESOURCE` defaults to `1`.
- `OPENAI_OCR_AUTO_RUN` defaults to `false`.
- `OPENAI_OCR_MAX_PAGES` defaults to `5`, and OpenAI uses the stricter of that value and `OCR_MAX_PAGES_PER_JOB`.

## Google OCR Setup

For Google Vision:

- Set `OCR_PROVIDER=google_vision`.
- Preferred on Vercel: set split service-account env vars:
  - `GOOGLE_CLOUD_PROJECT`
  - `GOOGLE_VISION_CLIENT_EMAIL`
  - `GOOGLE_VISION_PRIVATE_KEY`
- `GOOGLE_VISION_PRIVATE_KEY` may contain escaped newlines; the app normalizes `\n` into real newlines and requires `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`.
- Fallbacks are supported through `GOOGLE_VISION_CREDENTIALS_JSON`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_CREDENTIALS_JSON`, `GOOGLE_OCR_CREDENTIALS_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`, or `GOOGLE_VISION_API_KEY`.
- Safe credential diagnostics report only whether required env vars exist, whether the private key has PEM header/footer, and whether `GOOGLE_VISION_CREDENTIALS_JSON` exists/parses. Secret values are never logged.

For Google Document AI:

- Set `OCR_PROVIDER=google_document_ai`.
- Set `GOOGLE_DOCUMENT_AI_PROCESSOR_NAME=projects/<project>/locations/<location>/processors/<processor>`.
- Provide OAuth-capable Google service account credentials with one of the credential env vars above.

Both Google providers currently render capped PDF pages to images and OCR each page. That preserves the existing page-level queue progress, retry/resume behavior, and per-page metadata.

## Persistence Contract

When OCR produces meaningful academic text, the app mirrors it into:

- `extracted_text`
- `visual_extracted_text`
- `extracted_text_preview`
- `extracted_char_count`

The app also stores page-level OCR metadata under `metadata.visualExtractionPages`, including:

- page number
- provider
- text
- confidence when available
- status/error

Refusal text, metadata, file titles, debug labels, UUIDs, and extraction quality notes must not count as study content. Deep Learn remains blocked unless `sourceTextQuality` is meaningful.

## Cost Rationale

OpenAI vision OCR is intentionally not the automatic production path. Scanned PDFs can create many rendered-page calls, retries, and stalled background jobs. OpenAI usage should be reserved for Deep Learn and study generation after grounded source text exists.

Google Vision and Google Document AI have page/image-based OCR pricing that is easier to cap and reason about. As of the checked Google Cloud docs on 2026-05-02:

- Cloud Vision bills per image/page; Document Text Detection has a free first 1,000 units/month tier, then listed per-1,000-unit rates.
- Vision PDF/TIFF OCR is priced at the `DOCUMENT_TEXT_DETECTION` or `TEXT_DETECTION` rate.
- Document AI Enterprise Document OCR is listed per 1,000 pages, with lower pricing above 5,000,000 pages/month.

Pricing references:

- https://cloud.google.com/vision/pricing
- https://docs.cloud.google.com/vision/docs/pdf
- https://cloud.google.com/document-ai/pricing
