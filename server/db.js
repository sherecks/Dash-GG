// ── Conexão com o Postgres do Supabase ──────────────────────────────────────────
// Usa o cliente nativo do Bun (Bun.sql). A connection string vem do .env
// (DATABASE_URL) — nunca exposta no front. No Railway, cadastre a mesma variável.
import { SQL } from 'bun';

// Só cria o cliente se a connection string existir — assim o servidor sobe
// (e os KPIs funcionam) mesmo antes de configurar o banco.
export const db = process.env.DATABASE_URL ? new SQL(process.env.DATABASE_URL) : null;

// Formata uma data do banco como 'YYYY-MM-DD'. O Bun devolve coluna `date` como
// objeto Date (em UTC); usamos os componentes UTC para não deslocar o dia pelo fuso.
function ymd(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const y = String(d.getUTCFullYear()).padStart(4, '0');
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10); // já veio como string
}

// Converte a linha do banco para o formato que o kanban usa no front.
export function toCard(r) {
  return {
    id: Number(r.id),
    title: r.title,
    stage: r.stage,
    owner: r.owner || '',
    date: ymd(r.start_date),
    due: ymd(r.due_date),
    hyp: r.hyp || '',
    result: r.result || '',
    tags: Array.isArray(r.tags) ? r.tags : (r.tags ? JSON.parse(r.tags) : []),
  };
}

// Converte a linha de um grupo (pilha recolhível) para o formato do front.
// card_ids pode vir como array JS ou como literal Postgres ("{2,3}") — trata ambos.
export function toGroup(r) {
  let ids = r.card_ids;
  if (typeof ids === 'string') ids = ids.replace(/[{}]/g, '').split(',').filter(Boolean);
  return {
    id: Number(r.id),
    name: r.name,
    cardIds: (ids || []).map(Number),
    collapsed: r.collapsed,
  };
}

// Monta o literal de array do Postgres a partir de uma lista de ids. Ex.: [2,3] → "{2,3}"
export function pgIntArray(list) {
  return '{' + (list || []).map(Number).filter((n) => Number.isFinite(n)).join(',') + '}';
}
