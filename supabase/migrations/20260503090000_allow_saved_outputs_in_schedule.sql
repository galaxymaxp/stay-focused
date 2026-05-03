alter table public.scheduled_blocks
  drop constraint if exists scheduled_blocks_source_table_check;

alter table public.scheduled_blocks
  add constraint scheduled_blocks_source_table_check
  check (source_table in (
    'task_items',
    'tasks',
    'deadlines',
    'modules',
    'module_resources',
    'learning_items',
    'deep_learn_notes',
    'drafts'
  ));

notify pgrst, 'reload schema';
