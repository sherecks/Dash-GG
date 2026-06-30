-- Quadro de testes (kanban). Rode no Supabase: SQL Editor → New query → cole → Run.
create table if not exists cards (
  id          bigint generated always as identity primary key,
  brand       text not null default 'shelf2',    -- shelf2 | maria
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

-- Se a tabela já existir sem a coluna brand:
-- alter table cards add column if not exists brand text not null default 'shelf2';
