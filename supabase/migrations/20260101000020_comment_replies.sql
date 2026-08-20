-- One level of threaded replies on comments — a reply is just another
-- comments row pointing at its parent, rendered inside the parent's
-- popover instead of getting its own pin on the model.

alter table comments add column if not exists parent_comment_id uuid references comments(id) on delete cascade;

create index if not exists comments_parent_comment_id_idx on comments(parent_comment_id);

notify pgrst, 'reload schema';
