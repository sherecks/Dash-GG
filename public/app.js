// ── KPI ───────────────────────────────────────────────────────────────────────
const kpiDefs = {
  vol:  [
    { id:'leads',    label:'Leads trabalhados',        fmt:'n' },
    { id:'contatos', label:'Contatos iniciados',       fmt:'n' },
    { id:'qualif',   label:'Convidado Webinar',        fmt:'n' },
    { id:'followup', label:'Conferencia Agendada',     fmt:'n' },
  ],
  conv: [
    { id:'txresp',   label:'Taxa de resposta',         fmt:'%' },
    { id:'txqual',   label:'Taxa de qualificação',     fmt:'%' },
  ],
  rec:  [
    { id:'opps',     label:'Oportunidades geradas',    fmt:'n' },
    { id:'receita',  label:'Receita gerada',           fmt:'R$'},
  ],
};

// KPIs por marca da diretoria: { [marca]: { [kpiId]: { val, prev } } }
let kpiByBrand = {};

// ── MARCAS ──────────────────────────────────────────────────────────────────────
// pill = selo fixo da empresa; label = nome da marca (botão do seletor + subtítulo).
// A chave (shelf2, maria, ...) precisa bater com a do servidor (kpiMap.js).
const PILL = '300';
// Diretorias e as marcas de cada uma (as marcas viram TAGS nos cards do kanban).
// A chave (fenix, camaleoes, furia) precisa bater com a do servidor (kpiMap.js).
const DIRETORIAS = {
  fenix: { label: 'Guardiões', brands: ['4Beach', 'Ecoville', 'Fast Tennis', 'Suav', 'Maria Lavadeira', 'Mestre de Obra', 'Mestre das Tintas', 'Agilihome'] },
  furia: { label: 'Furia',     brands: ['Locar-x', 'Brumed', 'Saude Livre Vacinas', 'Doctor Fit', 'Airlocker', 'La Bolaria', 'Shelf'] },
};
// currentBrand guarda a CHAVE da diretoria (mantém o nome por compatibilidade).
const currentBrand = DIRETORIAS[new URLSearchParams(location.search).get('brand')] ? new URLSearchParams(location.search).get('brand') : 'fenix';
const brandsDaDiretoria = DIRETORIAS[currentBrand].brands;

function renderBrandSwitcher() {
  const el = document.getElementById('brand-switcher');
  if (!el) return;
  el.innerHTML = '<span class="brand-switcher-label">Diretoria</span>' +
    Object.entries(DIRETORIAS).map(([key, d]) =>
      `<button class="brand-btn${key === currentBrand ? ' active' : ''}" onclick="switchBrand('${key}')">${d.label}</button>`
    ).join('');
}

// Namespace de armazenamento por marca (cache de KPIs, histórico, intervalo).
const STORE = currentBrand + '_';
window.__STORE = STORE;

function switchBrand(key) {
  const url = new URL(location.href);
  url.searchParams.set('brand', key);
  location.href = url.toString();
}

// Filtro por intervalo de datas (ciclo). { start, end } em 'YYYY-MM-DD'.
let currentRange = { start: today(), end: today() };

// Cache local dos últimos KPIs buscados (fallback enquanto o Hubspot carrega).
function saveKPIToStorage() {
  localStorage.setItem(STORE + 'kpi', JSON.stringify({ range: currentRange, byBrand: kpiByBrand }));
}

function trendHTML(diff) {
  if (diff > 0) return `<span class="trend up"><svg viewBox="0 0 12 12" fill="none"><path d="M2 9L10 3M10 3H5M10 3V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>+${Math.abs(diff)}</span>`;
  if (diff < 0) return `<span class="trend down"><svg viewBox="0 0 12 12" fill="none"><path d="M2 3L10 9M10 9H5M10 9V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>-${Math.abs(diff)}</span>`;
  return `<span class="trend flat">—</span>`;
}


// ── KANBAN ────────────────────────────────────────────────────────────────────
let cards = [];
let editingId = null;
let dragId = null;
let histFilter = 'all';

// Grupos (pilha recolhível) — só no localStorage, não vão para o banco.
let groups = [];
let selectMode = false;
let selectedIds = new Set();

function today() { return new Date().toISOString().split('T')[0]; }

// Persistência dos cards no banco (servidor Bun → Supabase).
async function loadCards() {
  try {
    const res = await fetch('/api/cards?brand=' + currentBrand);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    cards = await res.json();
  } catch (e) {
    console.error('Falha ao carregar cards:', e);
    cards = [];
  }
  renderKanban();
}
async function persistCard(card) {
  const res = await fetch('/api/cards/' + card.id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Limite WIP da coluna "Em teste" (máximo de cards simultâneos).
const WIP_LIMIT = 10;

const stageLabel = { backlog:'Backlog', teste:'Em teste', validado:'Validado', descartado:'Descartado' };
const prevStage  = { teste:'backlog', validado:'teste', descartado:'validado' };
const nextSt     = { backlog:'teste', teste:'validado', validado:'descartado' };

function fmtDate(d) {
  if (!d) return '';
  const [y,m,dy] = d.split('-');
  return `${dy}/${m}/${y}`;
}

function isDueOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date(today());
}

// renderCard and renderKanban defined in BRAND FLAG section below

// Initial render handled by applyBrand() at bottom of script

async function moveCard(id, toStage) {
  if (toStage === 'teste' && cards.filter(c => c.stage === 'teste').length >= WIP_LIMIT) {
    alert('Limite WIP atingido: máximo ' + WIP_LIMIT + ' cards em teste simultâneos.');
    return;
  }
  const card = cards.find(c => c.id === id);
  if (!card) return;
  const fromStage = card.stage;
  if (toStage === 'teste' && !card.date) card.date = today();
  card.stage = toStage;
  renderKanban();
  addHist('move', `Card movido: <strong>${card.title}</strong> — ${stageLabel[fromStage]} → <strong>${stageLabel[toStage]}</strong>`);
  showToast('Card movido para ' + stageLabel[toStage]);
  try { await persistCard(card); } catch (e) { showToast('Erro ao salvar no banco'); }
}

async function deleteCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card || !confirm('Remover este card?')) return;
  addHist('delete', `Card removido: <strong>${card.title}</strong> (estava em ${stageLabel[card.stage]})`);
  cards = cards.filter(c => c.id !== id);
  renderKanban();
  try {
    const res = await fetch('/api/cards/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await loadGroups();   // servidor removeu o card dos grupos / dissolveu grupos órfãos
  } catch (e) { showToast('Erro ao remover no banco'); }
}

// Drag & drop
function onDragStart(e, id) {
  dragId = id;
  setTimeout(() => { const el = document.getElementById('kc-' + id); if(el) el.classList.add('dragging'); }, 0);
}
function onDragEnd() {
  document.querySelectorAll('.kcard').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.kanban-cards').forEach(el => el.classList.remove('drag-over'));
}
function onDragOver(e, stage) { e.preventDefault(); document.getElementById('cards-' + stage).classList.add('drag-over'); }
function onDragLeave(e, stage) { document.getElementById('cards-' + stage).classList.remove('drag-over'); }
async function onDrop(e, stage) {
  e.preventDefault();
  document.querySelectorAll('.kanban-cards').forEach(el => el.classList.remove('drag-over'));
  if (dragId === null) return;
  const card = cards.find(c => c.id === dragId);
  if (!card || card.stage === stage) { dragId = null; return; }
  if (stage === 'teste' && cards.filter(c => c.stage === 'teste').length >= WIP_LIMIT) {
    alert('Limite WIP atingido: máximo ' + WIP_LIMIT + ' cards em teste simultâneos.');
    dragId = null; return;
  }
  const fromStage = card.stage;
  if (stage === 'teste' && !card.date) card.date = today();
  card.stage = stage;
  dragId = null;
  renderKanban();
  addHist('move', `Card movido: <strong>${card.title}</strong> — ${stageLabel[fromStage]} → <strong>${stageLabel[stage]}</strong>`);
  showToast('Card movido para ' + stageLabel[stage]);
  try { await persistCard(card); } catch (e) { showToast('Erro ao salvar no banco'); }
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
// Tags = marcas da diretoria atual (checkboxes no modal).
function renderTagOptions(selected) {
  const wrap = document.getElementById('m-tags');
  if (!wrap) return;
  const sel = new Set(selected || []);
  wrap.innerHTML = brandsDaDiretoria.map(b =>
    `<label class="tag-check${sel.has(b) ? ' on' : ''}"><input type="checkbox" value="${b}"${sel.has(b) ? ' checked' : ''} onchange="this.parentElement.classList.toggle('on',this.checked)"> ${b}</label>`
  ).join('');
}
function getSelectedTags() {
  return [...document.querySelectorAll('#m-tags input:checked')].map(c => c.value);
}

function openModal(stage) {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Novo card de teste';
  document.getElementById('m-title').value = '';
  document.getElementById('m-stage').value = stage;
  document.getElementById('m-owner').value = '';
  document.getElementById('m-date').value = '';
  document.getElementById('m-due').value = '';
  document.getElementById('m-hyp').value = '';
  document.getElementById('m-result').value = '';
  renderTagOptions([]);
  document.getElementById('modal').classList.add('open');
}
function openEditModal(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Editar card';
  document.getElementById('m-title').value = card.title;
  document.getElementById('m-stage').value = card.stage;
  document.getElementById('m-owner').value = card.owner || '';
  document.getElementById('m-date').value = card.date || '';
  document.getElementById('m-due').value = card.due || '';
  document.getElementById('m-hyp').value = card.hyp || '';
  document.getElementById('m-result').value = card.result || '';
  renderTagOptions(card.tags || []);
  document.getElementById('modal').classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); editingId = null; }
document.getElementById('modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });

async function saveCard() {
  const title = document.getElementById('m-title').value.trim();
  if (!title) { alert('Informe o título do card.'); return; }
  const stage = document.getElementById('m-stage').value;
  if (stage === 'teste') {
    const count = cards.filter(c => c.stage === 'teste' && c.id !== editingId).length;
    if (count >= WIP_LIMIT) { alert('Limite WIP: máximo ' + WIP_LIMIT + ' cards em teste.'); return; }
  }
  const data = {
    title, stage,
    owner: document.getElementById('m-owner').value.trim(),
    date: document.getElementById('m-date').value,
    due: document.getElementById('m-due').value,
    hyp: document.getElementById('m-hyp').value.trim(),
    result: document.getElementById('m-result').value.trim(),
    tags: getSelectedTags(),
  };
  for (const [campo, rotulo] of [['date', 'início'], ['due', 'entrega']]) {
    const v = data[campo];
    if (v && Number(v.slice(0, 4)) < 2000) {
      alert(`Data de ${rotulo} inválida (ano). Verifique o campo.`);
      return;
    }
  }
  try {
    if (editingId !== null) {
      const updated = await persistCard({ id: editingId, ...data });
      const i = cards.findIndex(c => c.id === editingId);
      if (i >= 0) cards[i] = updated;
      addHist('edit', `Card editado: <strong>${title}</strong>${data.owner ? ' — responsável: '+data.owner : ''}${data.due ? ' — entrega: '+fmtDate(data.due) : ''}`);
      showToast('Card atualizado');
    } else {
      const res = await fetch('/api/cards?brand=' + currentBrand, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      cards.push(await res.json());
      addHist('card', `Novo card criado: <strong>${title}</strong> em ${stageLabel[stage]}${data.owner ? ' — responsável: '+data.owner : ''}${data.due ? ' — entrega: '+fmtDate(data.due) : ''}`);
      showToast('Card criado com sucesso');
    }
  } catch (e) {
    console.error('Falha ao salvar card:', e);
    showToast('Erro ao salvar no banco');
    return;
  }
  closeModal();
  renderKanban();
}

// ── HISTÓRICO ─────────────────────────────────────────────────────────────────
let history = [];

// Load happens in applyBrand() after namespace is known
function saveHist() { localStorage.setItem((window.__STORE||'dash_') + 'hist', JSON.stringify(history)); }

function addHist(type, desc) {
  const now = new Date();
  const time = now.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  history.unshift({ type, desc, time, ts: now.getTime() });
  if (history.length > 200) history = history.slice(0, 200);
  saveHist();
  updateHistBadge();
  if (document.getElementById('hist-drawer').classList.contains('open')) renderHist();
}

function updateHistBadge() {
  const badge = document.getElementById('hist-count-badge');
  if (history.length > 0) {
    badge.textContent = history.length > 99 ? '99+' : history.length;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

const typeBadge = {
  kpi:    ['hb-kpi',    'KPI'],
  card:   ['hb-card',   'Novo card'],
  move:   ['hb-move',   'Movimento'],
  delete: ['hb-delete', 'Exclusão'],
  edit:   ['hb-edit',   'Edição'],
};

function renderHist() {
  const list = document.getElementById('hist-list');
  const filtered = histFilter === 'all' ? history : history.filter(h => h.type === histFilter);
  if (filtered.length === 0) {
    list.innerHTML = `<div class="hist-empty">Nenhuma alteração registrada ainda.</div>`;
    return;
  }
  list.innerHTML = filtered.map(h => {
    const [cls, label] = typeBadge[h.type] || ['hb-card','Ação'];
    return `<div class="hist-item">
      <div><span class="hist-badge ${cls}">${label}</span></div>
      <div class="hist-item-top">
        <div class="hist-item-desc">${h.desc}</div>
        <div class="hist-item-time">${h.time}</div>
      </div>
    </div>`;
  }).join('');
}

function openHist() {
  document.getElementById('hist-backdrop').classList.add('open');
  document.getElementById('hist-drawer').classList.add('open');
  renderHist();
}
function closeHist() {
  document.getElementById('hist-backdrop').classList.remove('open');
  document.getElementById('hist-drawer').classList.remove('open');
}
function clearHist() {
  if (!confirm('Limpar todo o histórico?')) return;
  history = [];
  saveHist();
  updateHistBadge();
  renderHist();
}
function setFilter(f, btn) {
  histFilter = f;
  document.querySelectorAll('.hist-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHist();
}

// ── SAVE ALL ──────────────────────────────────────────────────────────────────
function saveAll() {
  // Cards já persistem no banco a cada ação; aqui salvamos só KPIs e histórico (locais).
  saveKPIToStorage();
  saveHist();
  addHist('edit', 'Dados salvos manualmente pelo usuário');
  showToast('Dados salvos com sucesso');
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── FILTRO POR INTERVALO DE DATAS ───────────────────────────────────────────────
function fmtDateBR(d) {
  if (!d) return '';
  const [y, m, dy] = d.split('-');
  return `${dy}/${m}/${y}`;
}

function updateHeaderDate() {
  const { start, end } = currentRange;
  document.getElementById('header-date').textContent =
    start === end ? fmtDateBR(start) : `${fmtDateBR(start)} → ${fmtDateBR(end)}`;
}

// Aplica o intervalo escolhido nos campos de data e busca os KPIs.
function applyRange() {
  const start = document.getElementById('dt-start').value;
  const end = document.getElementById('dt-end').value;
  if (!start || !end) { alert('Escolha as duas datas (de e até).'); return; }
  if (start > end) { alert('A data inicial não pode ser maior que a final.'); return; }
  currentRange = { start, end };
  localStorage.setItem(STORE + 'range', JSON.stringify(currentRange));
  updateHeaderDate();
  loadKPIsFromHubspot();
}

// ── TAXAS (derivadas dos contadores) ────────────────────────────────────────────
// Calculadas localmente a partir de leads/contatos/followup — sem buscas extras.
// Direção: parte de baixo do funil ÷ leads, resultando em 0–100%.
// Taxas derivadas (por marca). Direção: parte do funil ÷ leads → 0–100%.
function computeRates(st) {
  const v = (id) => (st[id] ? st[id].val : 0);
  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const setVal = (id, value) => {
    st[id] = st[id] || { val: 0, prev: 0 };
    st[id].prev = st[id].val;
    st[id].val = value;
  };
  setVal('txresp', pct(v('contatos'), v('leads')));   // contatos ÷ leads
  setVal('txqual', pct(v('qualif'), v('leads')));     // convidado webinar ÷ leads
}

// ── HUBSPOT ────────────────────────────────────────────────────────────────────
// Chama /api/kpis (diretoria) → { brands: [{ marca, kpis: {id: n} }] }.
// Cada marca vira um bloco próprio de Volume/Conversão/Receita.
async function loadKPIsFromHubspot() {
  try {
    const q = `?brand=${currentBrand}&start=${currentRange.start}&end=${currentRange.end}`;
    const res = await fetch('/api/kpis' + q);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    (data.brands || []).forEach(({ marca, kpis }) => {
      const st = kpiByBrand[marca] = kpiByBrand[marca] || {};
      Object.entries(kpis).forEach(([id, val]) => {
        st[id] = st[id] || { val: 0, prev: 0 };
        st[id].prev = st[id].val;
        st[id].val = Number(val) || 0;
      });
      computeRates(st);
    });
    renderKpiBrands();
    saveKPIToStorage();
    showToast('KPIs atualizados do Hubspot');
  } catch (e) {
    console.error('Falha ao buscar KPIs do Hubspot:', e);
    // Sem backend rodando (ex: abrindo o HTML solto), mantém os valores locais.
  }
}

// Renderiza um conjunto Volume/Conversão/Receita POR MARCA (empilhados).
function renderKpiBrands() {
  const host = document.getElementById('kpi-brands');
  if (!host) return;
  const fmtVal = (k, val) => (k.fmt === 'R$' ? 'R$ ' + val : (k.fmt === '%' ? val + '%' : val));
  const rows = (group, st) => kpiDefs[group].map(k => {
    const s = st[k.id] || { val: 0, prev: 0 };
    return `<div class="kpi-row">
      <span class="kpi-label">${k.label}</span>
      <div class="kpi-right">${trendHTML(s.val - s.prev)}<span class="kpi-val">${fmtVal(k, s.val)}</span></div>
    </div>`;
  }).join('');
  const card = (title, badgeCls, badge, group, st) => `
    <div class="kpi-card">
      <div class="kpi-card-head"><div class="kpi-card-title">${title}</div><span class="kpi-badge ${badgeCls}">${badge}</span></div>
      <div class="kpi-rows">${rows(group, st)}</div>
    </div>`;
  host.innerHTML = brandsDaDiretoria.map(marca => {
    const st = kpiByBrand[marca] || {};
    return `<div class="brand-kpi">
      <div class="brand-kpi-name">${marca}</div>
      <div class="kpi-grid">
        ${card('Volume', 'badge-vol', 'Vol', 'vol', st)}
        ${card('Conversão', 'badge-conv', 'Conv', 'conv', st)}
        ${card('Receita', 'badge-rec', 'R$', 'rec', st)}
      </div>
    </div>`;
  }).join('');
}

function renderCard(card) {
  const pStage = prevStage[card.stage];
  const nStage = nextSt[card.stage];
  const overdue = isDueOverdue(card.due);
  const check = selectMode
    ? `<input type="checkbox" class="kcard-check" ${selectedIds.has(card.id) ? 'checked' : ''} onclick="toggleSelect(${card.id},event)">`
    : '';
  return `<div class="kcard${selectMode ? ' selecting' : ''}" id="kc-${card.id}" draggable="${!selectMode}"
      ondragstart="onDragStart(event,${card.id})"
      ondragend="onDragEnd(event)">
    ${check}
    <div class="kcard-title">${card.title}</div>
    ${card.tags && card.tags.length ? `<div class="kcard-tags">${card.tags.map(t => `<span class="kcard-tag">${t}</span>`).join('')}</div>` : ''}
    ${card.hyp ? `<div class="kcard-hyp">"${card.hyp.length > 70 ? card.hyp.slice(0,70)+'…' : card.hyp}"</div>` : ''}
    ${card.result ? `<div class="kcard-result">✓ ${card.result.length > 60 ? card.result.slice(0,60)+'…' : card.result}</div>` : ''}
    <div class="kcard-meta">
      ${card.owner ? `<span class="kcard-chip owner-chip">👤 ${card.owner}</span>` : ''}
      ${card.due   ? `<span class="kcard-chip due-chip${overdue?' overdue':''}">🗓 Entrega: ${fmtDate(card.due)}${overdue?' ⚠️':''}</span>` : ''}
      ${card.date  ? `<span class="kcard-chip">▶ Início: ${fmtDate(card.date)}</span>` : ''}
    </div>
    <div class="kcard-actions">
      ${pStage ? `<button class="kcard-btn" onclick="moveCard(${card.id},'${pStage}')">← ${stageLabel[pStage]}</button>` : ''}
      ${nStage ? `<button class="kcard-btn" onclick="moveCard(${card.id},'${nStage}')">${stageLabel[nStage]} →</button>` : ''}
      <button class="kcard-btn edit-btn" onclick="openEditModal(${card.id})">Editar</button>
      <button class="kcard-btn del-btn" onclick="deleteCard(${card.id})">✕</button>
    </div>
  </div>`;
}

// ── GRUPOS (pilha recolhível, apenas localStorage) ──────────────────────────────
const stageOrder = ['backlog', 'teste', 'validado', 'descartado'];

async function loadGroups() {
  try {
    const res = await fetch('/api/groups?brand=' + currentBrand);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    groups = await res.json();
  } catch (e) {
    console.error('Falha ao carregar grupos:', e);
    groups = [];
  }
  renderKanban();
}
async function saveGroup(g) {
  const res = await fetch('/api/groups/' + g.id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(g),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function groupOf(cardId) { return groups.find(g => g.cardIds.includes(cardId)); }
function groupMembers(g) { return g.cardIds.map(id => cards.find(c => c.id === id)).filter(Boolean); }

// Coluna do grupo = etapa MENOS avançada entre os membros.
function groupStage(g) {
  const idxs = groupMembers(g).map(c => stageOrder.indexOf(c.stage));
  return idxs.length ? stageOrder[Math.min(...idxs)] : 'backlog';
}

async function toggleGroup(id) {
  const g = groups.find(x => x.id === id);
  if (!g) return;
  g.collapsed = !g.collapsed;
  renderKanban();
  try { await saveGroup(g); } catch (e) { showToast('Erro ao salvar grupo'); }
}
async function ungroup(id) {
  const g = groups.find(x => x.id === id);
  if (!g || !confirm('Desagrupar "' + g.name + '"? Os cards voltam soltos.')) return;
  groups = groups.filter(x => x.id !== id);
  renderKanban();
  try {
    const res = await fetch('/api/groups/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (e) { showToast('Erro ao desagrupar'); }
  showToast('Grupo desfeito');
}

// Modo de seleção
function toggleSelectMode() {
  selectMode = !selectMode;
  selectedIds.clear();
  document.getElementById('btn-group-mode').classList.toggle('active', selectMode);
  renderKanban();
  renderGroupBar();
}
function toggleSelect(id, e) {
  e.stopPropagation();
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  renderGroupBar();
}
function renderGroupBar() {
  const bar = document.getElementById('group-bar');
  if (!selectMode) { bar.classList.remove('open'); bar.innerHTML = ''; return; }
  bar.classList.add('open');
  bar.innerHTML = `<span>${selectedIds.size} selecionado(s)</span>
    <button class="btn-confirm" onclick="createGroupFromSelection()">Agrupar</button>
    <button class="btn-cancel" onclick="toggleSelectMode()">Cancelar</button>`;
}
async function createGroupFromSelection() {
  if (selectedIds.size < 2) { alert('Selecione ao menos 2 cards para agrupar.'); return; }
  const name = (prompt('Nome do grupo:') || '').trim();
  if (!name) return;
  try {
    const res = await fetch('/api/groups?brand=' + currentBrand, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cardIds: [...selectedIds], collapsed: true }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    groups.push(await res.json());
  } catch (e) {
    console.error('Falha ao criar grupo:', e);
    showToast('Erro ao criar grupo');
    return;
  }
  selectMode = false; selectedIds.clear();
  document.getElementById('btn-group-mode').classList.remove('active');
  renderKanban(); renderGroupBar();
  showToast('Grupo criado');
}

function renderGroup(g) {
  const members = groupMembers(g);
  const done = members.filter(m => m.stage === 'validado').length;
  const head = `<div class="group-head" onclick="toggleGroup(${g.id})">
      <span class="group-toggle">${g.collapsed ? '▸' : '▾'}</span>
      <span class="group-name">📦 ${g.name}</span>
      <span class="group-count">${members.length}</span>
      <span class="group-prog">${done}/${members.length} validado</span>
    </div>`;
  if (g.collapsed) return `<div class="kgroup">${head}</div>`;
  const rows = members.map(m => {
    const p = prevStage[m.stage], n = nextSt[m.stage];
    return `<div class="group-item">
      <span class="gi-stage st-${m.stage}">${stageLabel[m.stage]}</span>
      <span class="gi-title">${m.title}</span>
      <span class="gi-actions">
        ${p ? `<button class="kcard-btn" onclick="moveCard(${m.id},'${p}')">←</button>` : ''}
        ${n ? `<button class="kcard-btn" onclick="moveCard(${m.id},'${n}')">→</button>` : ''}
        <button class="kcard-btn edit-btn" onclick="openEditModal(${m.id})">✎</button>
      </span>
    </div>`;
  }).join('');
  return `<div class="kgroup open">${head}<div class="group-body">${rows}</div>
    <button class="group-ungroup" onclick="ungroup(${g.id})">Desagrupar</button></div>`;
}

function renderKanban() {
  stageOrder.forEach(stage => {
    const col = document.getElementById('cards-' + stage);
    const ungrouped = cards.filter(c => c.stage === stage && !groupOf(c.id));
    const groupsHere = groups.filter(g => groupMembers(g).length && groupStage(g) === stage);
    col.innerHTML = groupsHere.map(renderGroup).join('') + ungrouped.map(renderCard).join('');
    document.getElementById('cnt-' + stage).textContent = ungrouped.length + groupsHere.length;
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
(function init() {
  // Aplica a diretoria atual (pill fixo, título da aba e seletor)
  const dir = DIRETORIAS[currentBrand];
  document.getElementById('brand-pill').textContent = PILL;
  document.title = 'Dashboard de Gestão à Vista — ' + dir.label;
  renderBrandSwitcher();

  // Intervalo salvo (default: hoje → hoje)
  const savedRange = localStorage.getItem(STORE + 'range');
  if (savedRange) currentRange = JSON.parse(savedRange);
  document.getElementById('dt-start').value = currentRange.start;
  document.getElementById('dt-end').value = currentRange.end;

  // Carrega cache local dos KPIs (fallback até o Hubspot responder)
  const kpiSaved = localStorage.getItem(STORE + 'kpi');
  if (kpiSaved) {
    try { kpiByBrand = JSON.parse(kpiSaved).byBrand || {}; } catch {}
  }
  renderKpiBrands();
  updateHeaderDate();

  // Carrega grupos (local, por marca) e depois os cards do banco
  loadGroups();
  loadCards();

  // Carrega histórico
  const histSaved = localStorage.getItem(STORE + 'hist');
  if (histSaved) history = JSON.parse(histSaved);
  updateHistBadge();

  // Busca os KPIs do Hubspot ao abrir (silencioso se o backend não estiver no ar)
  loadKPIsFromHubspot();
})();
