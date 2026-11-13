// Official sources reviewed on 13 November 2026. Keep known rules fixed in future years.
export const RULES = {
  reference: "13/11/2026",
  minimumWage: 1621,
  inss: [
    [1621, 0.075],
    [2902.84, 0.09],
    [4354.27, 0.12],
    [8475.55, 0.14],
  ],
  ir: [
    [2428.8, 0, 0],
    [2826.65, 0.075, 182.16],
    [3751.05, 0.15, 394.16],
    [4664.68, 0.225, 675.49],
    [Infinity, 0.275, 908.73],
  ],
  simplifiedDeduction: 607.2,
  irReduction: {
    exempt: 5000,
    ceiling: 7350,
    maximum: 312.89,
    intercept: 978.62,
    slope: 0.133145,
  },
  fgtsRate: 0.08,
  pj: {
    proLaboreRate: 0.28,
    inssRate: 0.11,
    maxMonthly: 300000,
    dividendThreshold: 50000,
    dividendRate: 0.1,
    // Simples Nacional Annex III; RBT12 = current monthly revenue × 12.
    brackets: [
      [180000, 0.06, 0],
      [360000, 0.112, 9360],
      [720000, 0.135, 17640],
      [1800000, 0.16, 35640],
      [3600000, 0.21, 125640],
    ],
  },
  housing: {
    months: 420,
    standardEffectiveRate: 0.1099,
    standardLtv: 0.8,
    sfhLimit: 2250000,
    grossCommitment: 0.3,
    fgtsPropertyLimit: 2250000,
    // Southeast, FGTS account holder. Nominal annual rates converted to effective.
    mcmvRates: [
      [2160, 0.0425],
      [2850, 0.045],
      [3200, 0.0475],
      [3500, 0.05],
      [4000, 0.055],
      [5000, 0.065],
      [9600, 0.0766],
      [13000, 0.1],
    ],
    lowIncome: 5000,
    faixa3Income: 9600,
    maxIncome: 13000,
    // Common conservative local ceiling: Contagem (255k); BH's ordinary ceiling is 270k.
    // Above it, use the nationwide 400k non-subsidized option in art. 20 §5, Resolution 702.
    lowPropertyLimit: 255000,
    lowIncomeExtendedNominalRate: 0.0766,
    faixa3PropertyLimit: 400000,
    middlePropertyLimit: 600000,
    mcmvLtv: 0.8,
    middleUsedLtv: 0.6,
  },
} as const;

export const SOURCES = [
  {
    label: "INSS · tabela de contribuição de 2026",
    url: "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal",
  },
  {
    label: "Receita Federal · IRPF de 2026",
    url: "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026",
  },
  {
    label: "Simples Nacional · LC 123, Anexo III",
    url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm",
  },
  {
    label: "INSS sobre pró-labore · IN RFB 2.110",
    url: "https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=126687",
  },
  {
    label: "Receita Federal · dividendos em 2026",
    url: "https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2025/dezembro/receita-federal-atualiza-normas-relativas-ao-imposto-sobre-a-renda-das-pessoas-fisicas",
  },
  {
    label: "FGTS · Lei 8.036, art. 15",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l8036consol.htm",
  },
  {
    label: "Ministério das Cidades · taxas e faixas do MCMV",
    url: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/programa-minha-casa-minha-vida/mcmv-fgts",
  },
  {
    label: "MCMV · cota de usados em 2026 (IN 45)",
    url: "https://www.in.gov.br/web/dou/-/instrucao-normativa-mcid-n-45-de-26-de-dezembro-de-2025-678113375",
  },
  {
    label: "MCMV · limites locais e opção sem subsídio (Res. 702)",
    url: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/institucional/base-juridica/resolucoes/fgts/Res_CCFGTS_2012_702_Compilada.pdf",
  },
  {
    label: "MCMV · juros de usados e prazos (IN 48)",
    url: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/institucional/base-juridica/instrucoes-normativas/ate-2022/IN_48_de_19.12.22__compilada_em_09.04.2026_.pdf",
  },
  {
    label: "Caixa · referência SBPE de 10,99% a.a.",
    url: "https://caixanoticias.caixa.gov.br/Paginas/Not%C3%ADcias/2025/12-DEZEMBRO/CAIXA-volta-a-permitir-mais-de-um-financiamento--imobiliario-pelo-SBPE.aspx",
  },
] as const;
