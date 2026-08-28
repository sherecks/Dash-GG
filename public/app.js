// ── DEMANDAS (projetos) + metodologias ──────────────────────────────────────────
const PILL = 'KG';
// Metodologias Verra usadas como TAGS nos cards.
const METODOLOGIAS = ['VM0033', 'VM0007'];
// Fases do ciclo de vida (Guardian) — campo "Fase do ciclo" no card.
const FASES = ['Registro/Elegibilidade', 'Baseline', 'Monitoramento', 'Cálculo/Verificação', 'Emissão'];

// Demandas carregadas de /api/demandas; currentBrand = id da demanda ativa (?brand=).
let demandas = [];
let currentBrand = new URLSearchParams(location.search).get('brand') || '';
// Tags disponíveis no modal do card = metodologias.
const brandsDaDiretoria = METODOLOGIAS;

function switchBrand(id) {
  const url = new URL(location.href);
  url.searchParams.set('brand', id);
  location.href = url.toString();
}

async function loadDemandas() {
  try {
    const res = await fetch('/api/demandas');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    demandas = await res.json();
  } catch (e) { console.error('Falha ao carregar demandas:', e); demandas = []; }
  // se a demanda da URL não existe, cai na primeira disponível
  if (!demandas.some(d => String(d.id) === String(currentBrand))) {
    currentBrand = demandas.length ? String(demandas[0].id) : '';
  }
  window.__STORE = 'dem' + currentBrand + '_';   // namespace do histórico local
  renderBrandSwitcher();
}

async function novaDemanda() {
  const name = (prompt('Nome da nova demanda principal:') || '').trim();
  if (!name) return;
  try {
    const res = await fetch('/api/demandas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    switchBrand((await res.json()).id);   // recarrega já na nova demanda
  } catch (e) { alert('Erro ao criar demanda'); }
}
async function renomearDemanda() {
  const d = demandas.find(x => String(x.id) === String(currentBrand));
  if (!d) return;
  const name = (prompt('Renomear demanda:', d.name) || '').trim();
  if (!name || name === d.name) return;
  try {
    await fetch('/api/demandas/' + d.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    location.reload();
  } catch (e) { alert('Erro ao renomear'); }
}
async function excluirDemanda() {
  const d = demandas.find(x => String(x.id) === String(currentBrand));
  if (!d) return;
  if (!confirm(`Excluir a demanda "${d.name}" e TODOS os cards dela? Não dá pra desfazer.`)) return;
  try {
    await fetch('/api/demandas/' + d.id, { method: 'DELETE' });
    const url = new URL(location.href); url.searchParams.delete('brand'); location.href = url.toString();
  } catch (e) { alert('Erro ao excluir'); }
}

function renderBrandSwitcher() {
  const el = document.getElementById('brand-switcher');
  if (!el) return;
  const btns = demandas.map(d =>
    `<button class="brand-btn${String(d.id) === String(currentBrand) ? ' active' : ''}" onclick="switchBrand('${d.id}')">${d.name}</button>`
  ).join('');
  const manage = currentBrand
    ? `<button class="brand-btn dm-mini" title="Renomear" onclick="renomearDemanda()">✎</button><button class="brand-btn dm-mini dm-del" title="Excluir" onclick="excluirDemanda()">✕</button>`
    : '';
  el.innerHTML = '<span class="brand-switcher-label">Demanda</span>' + btns +
    `<button class="brand-btn dm-new" onclick="novaDemanda()">+ Nova</button>` + manage;
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

// Limite WIP da coluna "Em Execução" (máximo de cards simultâneos).
const WIP_LIMIT = 10;

const stageLabel = { backlog:'A Fazer', teste:'Em Execução', validado:'Em Validação', descartado:'Concluído' };
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
    alert('Limite WIP atingido: máximo ' + WIP_LIMIT + ' cards em execução simultâneos.');
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
    alert('Limite WIP atingido: máximo ' + WIP_LIMIT + ' cards em execução simultâneos.');
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
  document.getElementById('modal-title').textContent = 'Novo card';
  document.getElementById('m-title').value = '';
  document.getElementById('m-stage').value = stage;
  document.getElementById('m-owner').value = '';
  document.getElementById('m-date').value = '';
  document.getElementById('m-due').value = '';
  document.getElementById('m-fase').value = '';
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
  document.getElementById('m-fase').value = card.fase || '';
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
    if (count >= WIP_LIMIT) { alert('Limite WIP: máximo ' + WIP_LIMIT + ' cards em execução.'); return; }
  }
  const data = {
    title, stage,
    owner: document.getElementById('m-owner').value.trim(),
    date: document.getElementById('m-date').value,
    due: document.getElementById('m-due').value,
    fase: document.getElementById('m-fase').value,
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
  // Cards/grupos já persistem no banco a cada ação; aqui salvamos só o histórico local.
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
      ${card.fase  ? `<span class="kcard-chip fase-chip">🔄 ${card.fase}</span>` : ''}
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
  const done = members.filter(m => m.stage === 'descartado').length;
  const head = `<div class="group-head" onclick="toggleGroup(${g.id})">
      <span class="group-toggle">${g.collapsed ? '▸' : '▾'}</span>
      <span class="group-name">📦 ${g.name}</span>
      <span class="group-count">${members.length}</span>
      <span class="group-prog">${done}/${members.length} concluído</span>
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
(async function init() {
  document.getElementById('brand-pill').textContent = PILL;

  // Carrega as demandas, resolve a demanda ativa e monta o seletor
  await loadDemandas();
  const d = demandas.find(x => String(x.id) === String(currentBrand));
  document.title = 'Kanban' + (d ? ' - ' + d.name : '');

  
  // Sem demanda selecionada (ou nenhuma criada): quadro vazio, convida a criar
  renderKanban();
  if (!currentBrand) return;

  // Carrega grupos e cards da demanda
  loadGroups();
  loadCards();

  // Histórico local (por demanda)
  const histSaved = localStorage.getItem((window.__STORE || 'dash_') + 'hist');
  if (histSaved) history = JSON.parse(histSaved);
  updateHistBadge();
})();
