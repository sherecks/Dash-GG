import { join } from 'path';
import { searchCountByDate, rangeBounds } from './hubspot.js';
import { KPI_SOURCES, BRANDS, BRAND_PROPERTY, DEFAULT_BRAND } from './kpiMap.js';
import { db, toCard } from './db.js';

const PORT = process.env.PORT || 3000;
const DIST = join(import.meta.dir, '..', 'dist');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Data de hoje (YYYY-MM-DD) em horário de São Paulo.
function todaySP() {
  const sp = new Date(Date.now() - 3 * 3600 * 1000);
  return sp.toISOString().slice(0, 10);
}

const brandKey = (k) => (BRANDS[k] ? k : DEFAULT_BRAND);

// Busca os KPIs em SEQUÊNCIA com intervalo, respeitando o rate limit do Hubspot
// (search: ~limite por segundo; 150 req / 10s no geral). Devolve { id: total }.
async function getKpis(brand, startDate, endDate) {
  const { start, end } = rangeBounds(startDate, endDate);
  const cfg = BRANDS[brand];
  const filter = { property: BRAND_PROPERTY, value: cfg.marca };
  const kpis = {};
  console.log(`\n[KPIs] ${startDate} -> ${endDate}  | marca: ${filter.value}`);
  for (const src of KPI_SOURCES) {
    // Permite sobrescrever a propriedade de data por marca (ex.: contatos da Maria).
    const dateProperty = (cfg.props && cfg.props[src.kpiId]) || src.dateProperty;
    const count = await searchCountByDate({
      dateProperty,
      pipelineId: src.pipelineId,
      stageId: src.stageId,
      brand: filter,
      start,
      end,
    });
    kpis[src.kpiId] = count;
    // id = valor + descrição, para conferir contra o Hubspot
    console.log(`  ${src.kpiId.padEnd(9)} = ${String(count).padStart(5)}   ${src.label}`);
    await sleep(250); // ~4 req/s
  }
  return { brand, start: startDate, end: endDate, kpis };
}

// ── CARDS (quadro de testes) ───────────────────────────────────────────────────
async function handleCards(req, url) {
  if (!db) return Response.json({ error: 'DATABASE_URL não configurada no .env' }, { status: 503 });
  const method = req.method;
  const idMatch = url.pathname.match(/^\/api\/cards\/(\d+)$/);
  const brand = brandKey(url.searchParams.get('brand'));
  try {
    if (method === 'GET' && url.pathname === '/api/cards') {
      const rows = await db`select * from cards where brand=${brand} order by position, id`;
      return Response.json(rows.map(toCard));
    }
    if (method === 'POST' && url.pathname === '/api/cards') {
      const b = await req.json();
      const [row] = await db`
        insert into cards (brand, title, stage, owner, start_date, due_date, hyp, result)
        values (${brand}, ${b.title}, ${b.stage || 'backlog'}, ${b.owner || ''},
                ${b.date || null}, ${b.due || null}, ${b.hyp || ''}, ${b.result || ''})
        returning *`;
      return Response.json(toCard(row));
    }
    if (method === 'PUT' && idMatch) {
      const b = await req.json();
      const [row] = await db`
        update cards set
          title=${b.title}, stage=${b.stage}, owner=${b.owner || ''},
          start_date=${b.date || null}, due_date=${b.due || null},
          hyp=${b.hyp || ''}, result=${b.result || ''}, updated_at=now()
        where id=${Number(idMatch[1])} returning *`;
      return row ? Response.json(toCard(row)) : new Response('Not found', { status: 404 });
    }
    if (method === 'DELETE' && idMatch) {
      await db`delete from cards where id=${Number(idMatch[1])}`;
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  } catch (e) {
    console.error('Erro /api/cards:', e.message);
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
      const brand = brandKey(url.searchParams.get('brand'));
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
