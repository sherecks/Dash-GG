import { join } from 'path';
import { searchDealsCount, rangeBounds } from './hubspot.js';
import { KPI_SOURCES, DIRETORIAS, DEFAULT_DIRETORIA, BRAND_PROPERTY, FI_ID, contatosProp } from './kpiMap.js';
import { db, toCard, toGroup, pgIntArray } from './db.js';

const PORT = process.env.PORT || 3000;
const DIST = join(import.meta.dir, '..', 'dist');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Data de hoje (YYYY-MM-DD) em horário de São Paulo.
function todaySP() {
  const sp = new Date(Date.now() - 3 * 3600 * 1000);
  return sp.toISOString().slice(0, 10);
}

// Chave de diretoria válida (default se vier inválida). É o valor guardado na
// coluna `brand` de cards/groups e o escopo dos KPIs.
const dirKey = (k) => (DIRETORIAS[k] ? k : DEFAULT_DIRETORIA);

// Soma os KPIs de uma diretoria (todas as marcas dela juntas).
async function getKpis(dir, startDate, endDate) {
  const { start, end } = rangeBounds(startDate, endDate);
  const brands = DIRETORIAS[dir].brands;
  const between = (prop) => ({ propertyName: prop, operator: 'BETWEEN', value: start, highValue: end });
  const marcaIn = (list) => ({ propertyName: BRAND_PROPERTY, operator: 'IN', values: list });
  const kpis = {};
  console.log(`\n[KPIs] ${startDate} -> ${endDate}  | diretoria: ${DIRETORIAS[dir].label} (${brands.length} marcas)`);

  // KPIs simples: 1 grupo (dateProperty + marca IN + pipeline opcional)
  for (const src of KPI_SOURCES) {
    const filters = [between(src.dateProperty), marcaIn(brands)];
    if (src.pipelineId) filters.push({ propertyName: 'pipeline', operator: 'EQ', value: String(src.pipelineId) });
    kpis[src.kpiId] = await searchDealsCount([filters]);
    console.log(`  ${src.kpiId.padEnd(9)} = ${String(kpis[src.kpiId]).padStart(5)}`);
    await sleep(250);
  }

  // contatos: agrupa as marcas por propriedade de 1ª resposta e soma (OR entre grupos)
  const porProp = {};
  for (const m of brands) (porProp[contatosProp(m)] ||= []).push(m);
  const grupos = Object.entries(porProp).map(([prop, list]) => [between(prop), marcaIn(list)]);
  kpis.contatos = await searchDealsCount(grupos);
  console.log(`  contatos  = ${String(kpis.contatos).padStart(5)}  (${grupos.length} grupo(s) de propriedade)`);
  await sleep(250);

  return { diretoria: dir, start: startDate, end: endDate, kpis };
}

// ── CARDS (quadro de testes) ───────────────────────────────────────────────────
async function handleCards(req, url) {
  if (!db) return Response.json({ error: 'DATABASE_URL não configurada no .env' }, { status: 503 });
  const method = req.method;
  const idMatch = url.pathname.match(/^\/api\/cards\/(\d+)$/);
  const brand = dirKey(url.searchParams.get('brand'));
  try {
    if (method === 'GET' && url.pathname === '/api/cards') {
      const rows = await db`select * from cards where brand=${brand} order by position, id`;
      return Response.json(rows.map(toCard));
    }
    if (method === 'POST' && url.pathname === '/api/cards') {
      const b = await req.json();
      const [row] = await db`
        insert into cards (brand, title, stage, owner, start_date, due_date, hyp, result, tags)
        values (${brand}, ${b.title}, ${b.stage || 'backlog'}, ${b.owner || ''},
                ${b.date || null}, ${b.due || null}, ${b.hyp || ''}, ${b.result || ''},
                ${JSON.stringify(b.tags || [])}::jsonb)
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
          tags=${JSON.stringify(b.tags || [])}::jsonb, updated_at=now()
        where id=${Number(idMatch[1])} returning *`;
      return row ? Response.json(toCard(row)) : new Response('Not found', { status: 404 });
    }
    if (method === 'DELETE' && idMatch) {
      const cid = Number(idMatch[1]);
      await db`delete from cards where id=${cid}`;
      // tira o card dos grupos e dissolve grupos que ficaram com menos de 2 membros
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
  const brand = dirKey(url.searchParams.get('brand'));
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

    // ── API ──
    if (url.pathname === '/api/kpis') {
      const brand = dirKey(url.searchParams.get('brand'));
      const start = url.searchParams.get('start');
      const end = url.searchParams.get('end');
      const s = isDate(start) ? start : todaySP();
      const e = isDate(end) ? end : s;
      try {
        return Response.json(await getKpis(brand, s, e));
      } catch (err) {
        console.error('Erro /api/kpis:', err.message);
        return Response.json({ error: String(err.message) }, { status: 500 });
      }
    }

    // ── Cards (quadro de testes) ──
    if (url.pathname === '/api/cards' || url.pathname.startsWith('/api/cards/')) {
      return handleCards(req, url);
    }

    // ── Grupos (pilha recolhível) ──
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

    // Fallback para index.html (rotas do front)
    const index = Bun.file(join(DIST, 'index.html'));
    if (await index.exists()) return new Response(index, { headers: { 'Content-Type': CT['.html'] } });

    return new Response('Not found', { status: 404 });
  },
});

console.log(`API Bun rodando em http://localhost:${PORT}`);
