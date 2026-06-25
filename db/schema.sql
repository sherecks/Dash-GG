-- Quadro de testes (kanban). Rode no Supabase: SQL Editor → New query → cole → Run.
create table if not exists cards (
  id          bigint generated always as identity primary key,
  title       text not null,
  stage       text not null default 'backlog',   -- backlog | teste | validado | descartado
  owner       text default '',
  start_date  date,
  due_date    date,
  hyp         text default '',
  result      text default '',
  position    int  default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
