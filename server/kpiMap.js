// ── Referência: pipelines e suas etapas (dealstages) no Hubspot ─────────────────
// Puxado da API (GET /crm/v3/pipelines/deals). Use como dicionário ao montar os KPIs.
export const PIPELINES = {
  'Funil Inovação [300F]': {
    id: '45750866',
    stages: {
      'Lead Novo': '146245997',
      'Retorno': '106988147',
      'Retorno WhatsApp ou E-mail': '947321648',
      '1° Dia': '146245994',
      '2° Dia': '146245995',
      '3° Dia': '146245996',
      'Não Atendido': '146245998',
      'Convidado Webinar': '94056028',
      'Inscrito Webinar': '94056029',
      'Pós Webinar': '94144430',
      'Conferencia Agendada': '94144432',
      'Conferencia Realizada': '94144433',
      'Avaliação de Perfil': '94144434',
      'Validação': '94144436',
      'Venda': '94144435',
      'Mentoria': '1078283621',
      'Desqualificado': '146431629',
      'Pré - Vendas': '94056027',
      'Negociação Perdida': '112208905',
      'Contato Futuro': '106988148',
      'Indicação': '94144438',
      'Leads de [BASE]': '152086624',
      'Marketing - Lead Manual': '140364658',
      'BlackList 💀': '191318605',
      'Excluir 🗑️': '1002983223',
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

// Marcas da operação. TODA busca é restrita a uma marca (o funil é compartilhado).
// Shelf e Maria Lavadeira estão no MESMO funil (Funil de Vendas [300F]), então
// compartilham o mesmo mapeamento de etapas (KPI_SOURCES) — só muda o filtro.
export const BRAND_PROPERTY = 'marca_associada';
export const BRANDS = {
  shelf2: { marca: 'Shelf',           label: 'Shelf' },
  // `props` sobrescreve a dateProperty de um KPI só para esta marca.
  // Contatos da Maria usam a data de resposta do lead (Consultia), não o WhatsApp.
  maria:  { marca: 'Maria Lavadeira', label: 'Maria Lavadeira',
            props: { contatos: 'consultia_data__resposta_do_lead' } },
};
export const DEFAULT_BRAND = 'shelf2';

// Operação migrada para o Funil Inovação [300F] (deals saíram do Funil de Vendas).
const FI = PIPELINES['Funil Inovação [300F]'];
const stage = (nome) => FI.stages[nome];

// ── Mapeamento: KPI do dashboard → contagem no Hubspot ──────────────────────────
// Modelo "etapa atual" (igual ao gráfico do Hubspot): conta deals CRIADOS no
// período (createdate) cuja ETAPA ATUAL (dealstage) é a indicada por `stageId`.
// Sem `stageId`, conta só pela `dateProperty` no período. `pipelineId` restringe
// ao funil. Toda busca é filtrada pela marca (ver index.js).
export const KPI_SOURCES = [
  // VOLUME (Funil Inovação)
  { kpiId: 'leads',    dateProperty: 'createdate',                     pipelineId: FI.id, label: 'Leads Trabalhados — Lead Novo (criados no Funil Inovação)' },
  { kpiId: 'contatos', dateProperty: 'data_da_1_resposta_de_whatsapp', pipelineId: FI.id, label: 'Contatos Iniciados — 1ª resposta WhatsApp' },
  { kpiId: 'qualif',   dateProperty: 'createdate', stageId: stage('Convidado Webinar'),    label: 'Qualif — etapa atual: Convidado Webinar' },
  { kpiId: 'followup', dateProperty: 'createdate', stageId: stage('Conferencia Agendada'), label: 'Followup — etapa atual: Conferencia Agendada' },

  // RECEITA
  { kpiId: 'opps',     dateProperty: 'createdate', stageId: stage('Conferencia Realizada'), label: 'Oportunidades geradas — etapa atual: Conferencia Realizada' },
  // ⏳ receita — aguardando definição da propriedade de valor
];
