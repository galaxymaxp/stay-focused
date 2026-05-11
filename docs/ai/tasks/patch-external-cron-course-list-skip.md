Edit actions/canvas.ts only.

Find the external_cron flow in runExternalCanvasSyncJob.

Make resource refresh and/or refreshExternalCanvasTaskStatus timeout-bounded for external_cron mode only.

If task refresh times out:
- log/save warning
- continue with tasksUpdated = 0
- still finish canvas_update_events insertion
- still rebuild module raw_content
- mark job completed if the main sync succeeded

Do not change manual selected_courses sync.
Do not edit /api/cron/hourly.
Do not add OCR/OpenAI work to cron.