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

export const BRAND_PROPERTY = 'marca_associada';

// ── Contatos: propriedade de "1ª resposta" por marca (varia por ferramenta) ─────
const CONTATOS_DEFAULT = 'data_da_1_resposta_de_whatsapp';        // WhatsApp (padrão)
const CONTATOS_POR_MARCA = {
  'Maria Lavadeira': 'consultia_data__resposta_do_lead',         // Consultia
  // As demais marcas usam o padrão (data_da_1_resposta_de_whatsapp). Algumas estão
  // zeradas por um erro de preenchimento no Hubspot — é o esperado até corrigirem lá.
};
export const contatosProp = (marca) => CONTATOS_POR_MARCA[marca] || CONTATOS_DEFAULT;

// ── Diretorias: cada uma agrega as marcas (marca_associada) abaixo ──────────────
// A chave (fenix, camaleoes, furia) precisa bater com a do front (app.js) e é o
// valor guardado na coluna `brand` de cards/groups.
export const DIRETORIAS = {
  fenix: { label: 'Guardiões', brands: ['4Beach', 'Ecoville', 'Fast Tennis', 'Suav', 'Maria Lavadeira', 'Mestre de Obra', 'Mestre das Tintas', 'Agilihome'] },
  furia: { label: 'Furia',     brands: ['Locar-x', 'Brumed', 'Saude Livre Vacinas', 'Doctor Fit', 'Airlocker', 'La Bolaria', 'Shelf'] },
};
export const DEFAULT_DIRETORIA = 'fenix';

// Operação no Funil Inovação [300F].
const FI = PIPELINES['Funil Inovação [300F]'];
export const FI_ID = FI.id;

// ── KPIs simples (uma dateProperty p/ todas as marcas) ──────────────────────────
// Contam deals cuja `dateProperty` cai no período (+ filtro de diretoria = marca IN).
// Os de etapa usam a DATA da etapa (movimentação somada). `contatos` é tratado à
// parte no index.js (a propriedade varia por marca — ver CONTATOS_POR_MARCA).
export const KPI_SOURCES = [
  { kpiId: 'leads',    dateProperty: 'createdate',                pipelineId: FI.id },
  { kpiId: 'qualif',   dateProperty: 'data___inscrito_webinar' },
  { kpiId: 'followup', dateProperty: 'data___conferencia_agendada' },
  { kpiId: 'opps',     dateProperty: 'conferencia_realizada' },
];
