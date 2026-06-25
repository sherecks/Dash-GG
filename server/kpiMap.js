// ── Referência: pipelines e suas etapas (dealstages) no Hubspot ─────────────────
// Puxado da API (GET /crm/v3/pipelines/deals). Use como dicionário ao montar os KPIs.
export const PIPELINES = {
  'Funil Inovação [300F]': {
    id: '45750866',
    stages: {
      'Lead Novo': '146245997',
      'Convidado Webinar': '94056028',
      'Inscrito Webinar': '94056029',
      'Conferencia Agendada': '94144432',
      'Conferencia Realizada': '94144433',
      'Venda': '94144435',
      'Pré - Vendas': '94056027',
    },
  },
  'Mentoria | Vendas [300F]': {
    id: '857963188',
    stages: {
      'Lead': '1281866837',
      'Sessão Agendada': '1281866839',
      'Sessão Realizada': '1281866840',
      'Validação Mentoria': '1281866841',
      'Venda': '1281866842',
      'Pré Vendas': '1281866844',
    },
  },
  // Funil da IA — mapeado por completo.
  'Funil de Vendas [300F]': {
    id: '904455827',
    stages: {
      'Aguardando Atendimento IA': '1368373685',
      'Lead Novo': '1368373683',
      'Retorno': '1368373684',
      '1° Dia': '1368373686',
      '2° Dia': '1368373687',
      '3° Dia': '1368373688',
      'Não Atendido': '1368373689',
      'Apresentação Agendada': '1368373760',
      'Apresentação Realizada': '1368373761',
      'Fechamento Agendado': '1368373762',
      'Fechamento Realizado': '1368373763',
      'Validação': '1368373764',
      'Mentoria': '1368373765',
      'Venda': '1368373766',
      'Contato Futuro': '1368373767',
      'Indicação': '1368373768',
      'Desqualificado': '1368373769',
      'Pré - Vendas': '1368373770',
      'Negociação Perdida': '1368373771',
    },
  },
};

// Marca da operação. TODA busca é restrita a ela (o funil tem deals de várias marcas).
export const BRAND = { property: 'marca_associada', value: 'Shelf 2' };

const FV = PIPELINES['Funil de Vendas [300F]'];
const stage = (nome) => FV.stages[nome];

// ── Mapeamento: KPI do dashboard → contagem no Hubspot ──────────────────────────
// Modelo "etapa atual" (igual ao gráfico do Hubspot): conta deals CRIADOS no
// período (createdate) cuja ETAPA ATUAL (dealstage) é a indicada por `stageId`.
// Sem `stageId`, conta só pela `dateProperty` no período. `pipelineId` restringe
// ao funil. Toda busca é filtrada pela marca (ver index.js).
export const KPI_SOURCES = [
  // VOLUME
  { kpiId: 'leads',    dateProperty: 'createdate',                     pipelineId: FV.id, label: 'Leads Trabalhados — criados no período' },
  { kpiId: 'contatos', dateProperty: 'data_da_1_resposta_de_whatsapp', pipelineId: FV.id, label: 'Contatos Iniciados — 1ª resposta WhatsApp' },
  { kpiId: 'qualif',   dateProperty: 'createdate', stageId: stage('Aguardando Atendimento IA'), label: 'Pré Qualificados — etapa atual: Aguardando Atendimento IA' },
  { kpiId: 'followup', dateProperty: 'createdate', stageId: stage('Apresentação Agendada'),     label: 'Qualificados — etapa atual: Apresentação Agendada' },

  // ⏳ CONVERSÃO / RECEITA — aguardando sua definição (provisório p/ teste)
  { kpiId: 'reunioes', dateProperty: 'createdate', stageId: stage('Apresentação Realizada'), label: 'Reuniões — etapa atual: Apresentação Realizada' },
  { kpiId: 'vendas',   dateProperty: 'createdate', stageId: stage('Venda'),                  label: 'Vendas — etapa atual: Venda' },
];
