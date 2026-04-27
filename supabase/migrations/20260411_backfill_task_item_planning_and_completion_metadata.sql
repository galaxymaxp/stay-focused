update public.task_items as task_items
set completion_origin = tasks.completion_origin
from public.tasks as tasks
where task_items.completion_origin is null
  and tasks.completion_origin is not null
  and task_items.module_id = tasks.module_id
  and (
    (task_items.canvas_assignment_id is not null and task_items.canvas_assignment_id = tasks.canvas_assignment_id)
    or task_items.title = tasks.title
  );

update public.task_items as task_items
set planning_annotation = tasks.planning_annotation
from public.tasks as tasks
where task_items.planning_annotation is null
  and tasks.planning_annotation is not null
  and task_items.module_id = tasks.module_id
  and (
    (task_items.canvas_assignment_id is not null and task_items.canvas_assignment_id = tasks.canvas_assignment_id)
    or task_items.title = tasks.title
  );
