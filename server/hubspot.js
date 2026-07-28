// ── Integração Hubspot ─────────────────────────────────────────────────────────
// O token vem do .env (carregado automaticamente pelo Bun). Nunca exponha no front.
const TOKEN = process.env.HUBSPOT_TOKEN;
const SEARCH_URL = 'https://api.hubapi.com/crm/v3/objects/deals/search';

// Converte um intervalo de datas (YYYY-MM-DD, horário de São Paulo) em epoch (ms).
// 00:00 em SP equivale a 03:00 UTC. O fim é inclusivo (cobre o dia final inteiro).
function dayStartUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 3, 0, 0, 0); // 00:00 SP = 03:00 UTC
}

export function rangeBounds(startDate, endDate) {
  const start = dayStartUTC(startDate);
  const end = dayStartUTC(endDate) + 24 * 3600 * 1000; // inclui o dia final
  return { start, end };
}

// Conta deals que batem em QUALQUER um dos grupos de filtros (OR entre grupos,
// AND dentro de cada grupo). `groups` = array de arrays de filtros do Hubspot.
// Usado para somar contatos de várias marcas com propriedades de data diferentes.
export async function searchDealsCount(groups) {
  if (!TOKEN) throw new Error('HUBSPOT_TOKEN ausente — defina no arquivo .env');

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filterGroups: groups.map((filters) => ({ filters })), limit: 1 }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Hubspot ${res.status}: ${txt}`);
  }

  const data = await res.json();
  return data.total ?? 0;
}
