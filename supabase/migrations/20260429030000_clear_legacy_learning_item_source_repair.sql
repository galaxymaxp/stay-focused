update public.learning_items
set
  source_label = 'Legacy generated item',
  source_repair_status = null,
  source_repair_note = null,
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('sourceState', 'legacy_generated')
where source_repair_status = 'needs_canvas'
  and source_resource_id is null
  and canonical_source_id is null
  and source_label = 'Unknown Canvas source'
  and source_type is null
  and (
    type in ('summary', 'concept', 'connection', 'review')
    or lower(title) = 'what this module is trying to teach'
    or lower(title) ~ '^key idea [0-9]+$'
    or lower(title) ~ '^check your understanding [0-9]+$'
  );

notify pgrst, 'reload schema';
