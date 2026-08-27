import { join } from 'path';
import { db, toCard, toGroup, pgIntArray } from './db.js';

const PORT = process.env.PORT || 3000;
const DIST = join(import.meta.dir, '..', 'dist');

// `brand` é a coluna/param que guarda a DEMANDA (id) dona do card/grupo.
const demandaOf = (url) => url.searchParams.get('brand') || '';

// ── DEMANDAS (projetos — no lugar das antigas diretorias) ───────────────────────
async function handleDemandas(req, url) {
  if (!db) return Response.json({ error: 'DATABASE_URL não configurada no .env' }, { status: 503 });
  const method = req.method;
  const idMatch = url.pathname.match(/^\/api\/demandas\/(\d+)$/);
  try {
    if (method === 'GET' && url.pathname === '/api/demandas') {
      const rows = await db`select id, name from demandas order by id`;
      return Response.json(rows.map((r) => ({ id: Number(r.id), name: r.name })));
    }
    if (method === 'POST' && url.pathname === '/api/demandas') {
      const b = await req.json();
      const name = (b.name || '').trim();
      if (!name) return Response.json({ error: 'Nome obrigatório' }, { status: 400 });
      const [row] = await db`insert into demandas (name) values (${name}) returning id, name`;
      return Response.json({ id: Number(row.id), name: row.name });
    }
    if (method === 'PUT' && idMatch) {
      const b = await req.json();
      const [row] = await db`update demandas set name=${(b.name || '').trim()} where id=${Number(idMatch[1])} returning id, name`;
      return row ? Response.json({ id: Number(row.id), name: row.name }) : new Response('Not found', { status: 404 });
    }
    if (method === 'DELETE' && idMatch) {
      const id = String(Number(idMatch[1]));
      await db`delete from groups where brand=${id}`;
      await db`delete from cards where brand=${id}`;
      await db`delete from demandas where id=${Number(id)}`;
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    console.error('Erro /api/demandas:', e.message);
    return Response.json({ error: String(e.message) }, { status: 500 });
  }
}

// ── CARDS (kanban) ──────────────────────────────────────────────────────────────
async function handleCards(req, url) {
  if (!db) return Response.json({ error: 'DATABASE_URL não configurada no .env' }, { status: 503 });
  const method = req.method;
  const idMatch = url.pathname.match(/^\/api\/cards\/(\d+)$/);
  const brand = demandaOf(url);
  try {
    if (method === 'GET' && url.pathname === '/api/cards') {
      const rows = await db`select * from cards where brand=${brand} order by position, id`;
      return Response.json(rows.map(toCard));
    }
    if (method === 'POST' && url.pathname === '/api/cards') {
      const b = await req.json();
      const [row] = await db`
        insert into cards (brand, title, stage, owner, start_date, due_date, hyp, result, tags, fase)
        values (${brand}, ${b.title}, ${b.stage || 'backlog'}, ${b.owner || ''},
                ${b.date || null}, ${b.due || null}, ${b.hyp || ''}, ${b.result || ''},
                ${JSON.stringify(b.tags || [])}::jsonb, ${b.fase || ''})
        returning *`;
      return Response.json(toCard(row));
    }
    if (method === 'PUT' && idMatch) {
      const b = await req.json();
      const [row] = await db`
        update cards set
          title=${b.title}, stage=${b.stage}, owner=${b.owner || ''},
          start_date=${b.date || null}, due_date=${b.due || null},
          hyp=${b.hyp || ''}, result=${b.result || ''},
          tags=${JSON.stringify(b.tags || [])}::jsonb, fase=${b.fase || ''}, updated_at=now()
        where id=${Number(idMatch[1])} returning *`;
      return row ? Response.json(toCard(row)) : new Response('Not found', { status: 404 });
    }
    if (method === 'DELETE' && idMatch) {
      const cid = Number(idMatch[1]);
      await db`delete from cards where id=${cid}`;
      await db`update groups set card_ids = array_remove(card_ids, ${cid}::bigint) where ${cid}::bigint = any(card_ids)`;
      await db`delete from groups where coalesce(array_length(card_ids, 1), 0) < 2`;
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    console.error('Erro /api/cards:', e.message);
    return Response.json({ error: String(e.message) }, { status: 500 });
  }
}

// ── GRUPOS (pilha recolhível — nome + lista de card ids) ────────────────────────
async function handleGroups(req, url) {
  if (!db) return Response.json({ error: 'DATABASE_URL não configurada no .env' }, { status: 503 });
  const method = req.method;
  const idMatch = url.pathname.match(/^\/api\/groups\/(\d+)$/);
  const brand = demandaOf(url);
  try {
    if (method === 'GET' && url.pathname === '/api/groups') {
      const rows = await db`select * from groups where brand=${brand} order by id`;
      return Response.json(rows.map(toGroup));
    }
    if (method === 'POST' && url.pathname === '/api/groups') {
      const b = await req.json();
      const [row] = await db`
        insert into groups (brand, name, card_ids, collapsed)
        values (${brand}, ${b.name}, ${pgIntArray(b.cardIds)}::bigint[], ${b.collapsed ?? true})
        returning *`;
      return Response.json(toGroup(row));
    }
    if (method === 'PUT' && idMatch) {
      const b = await req.json();
      const [row] = await db`
        update groups set name=${b.name}, card_ids=${pgIntArray(b.cardIds)}::bigint[], collapsed=${b.collapsed}
        where id=${Number(idMatch[1])} returning *`;
      return row ? Response.json(toGroup(row)) : new Response('Not found', { status: 404 });
    }
    if (method === 'DELETE' && idMatch) {
      await db`delete from groups where id=${Number(idMatch[1])}`;
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    console.error('Erro /api/groups:', e.message);
    return Response.json({ error: String(e.message) }, { status: 500 });
  }
}

const CT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/api/demandas' || url.pathname.startsWith('/api/demandas/')) {
      return handleDemandas(req, url);
    }
    if (url.pathname === '/api/cards' || url.pathname.startsWith('/api/cards/')) {
      return handleCards(req, url);
    }
    if (url.pathname === '/api/groups' || url.pathname.startsWith('/api/groups/')) {
      return handleGroups(req, url);
    }

    // ── Estáticos (produção: serve o build do Vite em dist/) ──
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const file = Bun.file(join(DIST, rel));
    if (await file.exists()) {
      const ext = rel.slice(rel.lastIndexOf('.'));
      return new Response(file, { headers: CT[ext] ? { 'Content-Type': CT[ext] } : {} });
    }
    const index = Bun.file(join(DIST, 'index.html'));
    if (await index.exists()) return new Response(index, { headers: { 'Content-Type': CT['.html'] } });
    return new Response('Not found', { status: 404 });
  },
});

console.log(`API Bun rodando em http://localhost:${PORT}`);
