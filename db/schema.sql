-- Kanban de gestão de projeto. Rode no Supabase: SQL Editor → New query → cole → Run.
-- `brand` guarda a DEMANDA (id) dona do card/grupo.

-- Demandas principais (projetos) — criáveis pela tela.
create table if not exists demandas (
  id         bigint generated always as identity primary key,
  name       text not null,
  created_at timestamptz default now()
);

create table if not exists cards (
  id          bigint generated always as identity primary key,
  brand       text not null default '',          -- id da demanda dona do card
  title       text not null,
  stage       text not null default 'backlog',   -- backlog | teste | validado | descartado
  owner       text default '',
  start_date  date,
  due_date    date,
  hyp         text default '',                   -- Descrição
  result      text default '',                   -- Entregável / Evidência
  fase        text default '',                   -- Fase do ciclo Verra/Guardian
  tags        jsonb not null default '[]',       -- metodologias (VM0033, VM0007)
  position    int  default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Se a tabela cards já existir sem a coluna fase/tags:
-- alter table cards add column if not exists fase text default '';
-- alter table cards add column if not exists tags jsonb not null default '[]';

-- Grupos do quadro (pilha recolhível): nome + lista de ids de cards.
create table if not exists groups (
  id          bigint generated always as identity primary key,
  brand       text not null default '',          -- id da demanda dona do grupo
  name        text not null,
  card_ids    bigint[] not null default '{}',    -- ids da tabela cards
  collapsed   boolean not null default true,
  created_at  timestamptz default now()
);
