import { describe, expect, it } from "vitest";
import {
  housing,
  inss,
  irrf,
  money,
  payroll,
  project,
  projectionMonths,
  salaryAt,
} from "./calculate";
import { defaults } from "../state";
import type { Simulation } from "./types";

const start = new Date(2026, 10, 13);
function scenario(overrides: Partial<Simulation> = {}): Simulation {
  return {
    ...structuredClone(defaults),
    expenses: [],
    daily: 0,
    initialBalance: 0,
    fgts: 0,
    annualRate: 0,
    include13: false,
    includeVacation: false,
    ...overrides,
  };
}

describe("INSS e IRRF de 2026", () => {
  it.each([
    [0, 0],
    [1621, 121.58],
    [2902.84, 236.94],
    [4354.27, 411.11],
    [6000, 641.51],
    [8475.55, 988.09],
    [30000, 988.09],
  ])("INSS progressivo de %s = %s", (gross, expected) => {
    expect(inss(gross)).toBe(expected);
  });
  it("aplica desconto simplificado e zera o IR até R$ 5 mil", () => {
    expect(irrf(4000, 373.41)).toBe(0);
    expect(irrf(5000, 509.6)).toBe(0);
    expect(irrf(5001, 509.74)).toBeGreaterThan(0);
  });
  it("reproduz o exemplo oficial de R$ 6 mil com dedução de R$ 649,60", () => {
    expect(irrf(6000, 649.6)).toBe(382.88);
  });
  it("retira a redução pela renda bruta e escolhe a dedução mais favorável", () => {
    expect(irrf(7607.2, 0)).toBe(1016.27);
    expect(irrf(6000, 641.51)).toBe(385.1);
    expect(irrf(7350, 0)).toBe(945.54);
    expect(irrf(7350.01, 0)).toBe(945.54);
  });
  it("não desconta FGTS do líquido CLT", () => {
    const p = payroll({ gross: 6000, regime: "CLT" });
    expect(p.fgtsBase).toBe(480);
    expect(p.available).toBe(4973.39);
    expect(money(p.gross - p.inss - p.irrf)).toBe(p.available);
  });
  it("trata um salário zero sem benefícios ou depósitos", () => {
    const p = payroll({ gross: 0, regime: "CLT" });
    expect(p.available + p.benefit13 + p.benefitVacation + p.fgtsBase).toBe(0);
  });
});

describe("cenário PJ", () => {
  it("deduz tributos, INSS, IR e somente duas provisões próprias", () => {
    const p = payroll({ gross: 6000, regime: "PJ" });
    expect(p.das).toBe(360);
    expect(p.proLabore).toBeCloseTo(1680);
    expect(p.inss).toBe(184.8);
    expect(p.irrf).toBe(0);
    expect(p.provision13).toBe(500);
    expect(p.provisionVacation).toBe(166.67);
    expect(p.available).toBe(4788.53);
    expect(p.fgtsBase + p.benefit13 + p.benefitVacation).toBe(0);
  });
  it("usa alíquota efetiva, respeitando a parcela a deduzir do Anexo III", () => {
    const p = payroll({ gross: 20000, regime: "PJ" });
    expect(p.das).toBe(1460); // (240k × 11.2% − 9360) ÷ 12.
    expect(p.irrf).toBeGreaterThan(0);
  });
  it("considera retenção de dividendos acima de R$ 50 mil", () => {
    const p = payroll({ gross: 100000, regime: "PJ" });
    expect(p.dividendTax).toBe(5897);
    expect(p.inss).toBe(932.31);
  });
  it("não presume enquadramento válido acima do sublimite", () => {
    expect(payroll({ gross: 300000, regime: "PJ" }).supported).toBe(true);
    expect(payroll({ gross: 300000.01, regime: "PJ" }).supported).toBe(false);
  });
  it("zero de faturamento não gera cobranças nem provisões", () => {
    const p = payroll({ gross: 0, regime: "PJ" });
    expect(
      p.available + p.das + p.inss + p.provision13 + p.provisionVacation,
    ).toBe(0);
  });
});

describe("um único motor mensal", () => {
  it("inclui receita única somente na competência salva, sem reiniciar ao avançar o calendário", () => {
    const s = scenario({
      salary: { gross: 0, regime: "CLT" },
      extras: [
        {
          id: "one",
          name: "Venda",
          amount: 1000,
          recurrence: "once",
          month: "2026-12",
        },
        { id: "monthly", name: "Mensal", amount: 50, recurrence: "monthly" },
      ],
    });
    const result = project(s, 14, start);
    expect(result.map((m) => m.extras)).toEqual([
      50,
      1050,
      ...Array(12).fill(50),
    ]);
    expect(result.at(-1)!.totalExtras).toBe(1700);
    expect(result.at(-1)!.balance).toBe(1700);
    expect(project(s, 2, new Date(2027, 0, 1)).map((m) => m.extras)).toEqual([
      50, 50,
    ]);
  });
  it("seis empregos anuais geram 72 meses e seis marcações, mesmo sem mudança no salário", () => {
    const s = scenario({
      mode: "projection",
      projectionStart: "2026-11",
      stages: Array.from({ length: 6 }, (_, i) => ({
        id: `job-${i}`,
        gross: 6000,
        regime: "CLT",
        duration: 1,
        unit: "years",
      })),
    });
    expect(projectionMonths(s, "2026-11")).toBe(72);
    const result = project(s, undefined, start);
    expect(result).toHaveLength(72);
    expect(result.at(-1)!.date).toBe("2032-10-01");
    expect(
      result
        .filter((m) => m.salaryStageStart)
        .map((m) => [m.index, m.salaryStage]),
    ).toEqual([
      [0, 1],
      [12, 2],
      [24, 3],
      [36, 4],
      [48, 5],
      [60, 6],
    ]);
    expect(projectionMonths(s, "2027-11")).toBe(60);
    expect(project(s, undefined, new Date(2027, 10, 1))).toHaveLength(60);
  });
  it("combina durações em meses e anos e mantém o período manual no salário atual", () => {
    const s = scenario({
      mode: "projection",
      stages: [
        { id: "a", gross: 4000, regime: "CLT", duration: 1, unit: "months" },
        { id: "b", gross: 6000, regime: "PJ", duration: 1, unit: "years" },
        { id: "c", gross: 7000, regime: "CLT", duration: 2, unit: "months" },
      ],
    });
    const result = project(s, undefined, start);
    expect(result).toHaveLength(15);
    expect(
      result.filter((m) => m.salaryStageStart).map((m) => m.index),
    ).toEqual([0, 1, 13]);
    expect(result[1].income).toBe(payroll(s.stages[1]).available);
    const current = project(
      { ...s, mode: "current", horizon: 6 },
      undefined,
      start,
    );
    expect(current).toHaveLength(6);
    expect(
      current.every((m) => m.salaryStage === null && !m.salaryStageStart),
    ).toBe(true);
  });
  it("troca salário e regime no mês correto e mantém a última etapa", () => {
    const s = scenario({
      mode: "projection",
      stages: [
        { id: "a", gross: 4000, regime: "CLT", duration: 1, unit: "years" },
        { id: "b", gross: 6000, regime: "PJ", duration: 6, unit: "months" },
      ],
    });
    const rows = project(s, 24, start);
    expect(rows[11].payroll.gross).toBe(4000);
    expect(rows[12].payroll.gross).toBe(6000);
    expect(rows[12].payroll.regime).toBe("PJ");
    expect(rows[23].payroll.regime).toBe("PJ");
    expect(salaryAt(s, 120).gross).toBe(6000);
    expect(rows[12].contribution).toBe(4788.53);
    expect(rows[12].fgtsDeposit).toBe(0);
    expect(rows[23].fgts).toBe(rows[11].fgts);
  });
  it("mantém o salário atual constante mesmo havendo etapas", () => {
    const rows = project(scenario(), 60, start);
    expect(
      rows.every((m) => m.payroll.gross === 6000 && m.payroll.regime === "CLT"),
    ).toBe(true);
  });
  it("os próximos 12 meses usam todas as rendas, não o primeiro mês × 12", () => {
    const s = scenario({
      mode: "projection",
      daily: 10,
      stages: [
        { id: "a", gross: 4000, regime: "CLT", duration: 6, unit: "months" },
        { id: "b", gross: 6000, regime: "CLT", duration: 1, unit: "years" },
      ],
    });
    const rows = project(s, 12, start);
    const total = rows.reduce((sum, m) => sum + m.budget, 0);
    expect(total).toBeCloseTo(
      6 * payroll({ gross: 4000, regime: "CLT" }).available +
        6 * 4973.39 -
        3650,
    );
    expect(total).not.toBe(rows[0].budget * 12);
  });
  it("usa o mês atual completo e os dias reais, incluindo fevereiro bissexto", () => {
    const rows = project(scenario({ daily: 10 }), 4, new Date(2027, 10, 25));
    expect(rows.map((m) => m.days)).toEqual([30, 31, 31, 29]);
    expect(rows[0].date).toBe("2027-11-01");
    expect(rows[3].variable).toBe(290);
  });
  it("converte a taxa anual equivalente e faz aportes somente ao final do mês", () => {
    const s = scenario({
      initialBalance: 1000,
      annualRate: 12,
      salary: { gross: 0, regime: "CLT" },
      extras: [{ id: "e", name: "Extra", amount: 100, recurrence: "monthly" }],
    });
    const rows = project(s, 12, start);
    const rate = 1.12 ** (1 / 12) - 1;
    const expected = 1000 * 1.12 + (100 * (1.12 - 1)) / rate;
    expect(rows[0].interest).toBe(9.49);
    expect(rows[0].balance).toBe(1109.49);
    expect(rows[11].balance).toBeCloseTo(expected, 0);
  });
  it("retira déficits, não rende saldo negativo e informa o não coberto", () => {
    const rows = project(
      scenario({
        initialBalance: 150,
        salary: { gross: 0, regime: "PJ" },
        expenses: [{ id: "e", name: "Conta", category: "Outros", amount: 100 }],
      }),
      3,
      start,
    );
    expect(rows.map((m) => m.balance)).toEqual([50, 0, 0]);
    expect(rows.map((m) => m.uncovered)).toEqual([0, 50, 100]);
    expect(rows[2].totalWithdrawals).toBe(150);
    expect(rows[2].totalUncovered).toBe(150);
    expect(rows[2].interest).toBe(0);
  });
  it("faz a compensação com extras no fim do mesmo mês antes de declarar déficit não coberto", () => {
    const rows = project(
      scenario({
        salary: { gross: 0, regime: "PJ" },
        expenses: [{ id: "e", name: "Conta", category: "Outros", amount: 100 }],
        extras: [
          { id: "x", name: "Extra", amount: 120, recurrence: "monthly" },
        ],
      }),
      1,
      start,
    );
    expect(rows[0].balance).toBe(20);
    expect(rows[0].uncovered).toBe(0);
  });
  it("mantém patrimônios separados, sem rentabilidade de investimento no FGTS", () => {
    const rows = project(
      scenario({
        salary: { gross: 0, regime: "PJ" },
        initialBalance: 1000,
        fgts: 5000,
        annualRate: 10,
      }),
      12,
      start,
    );
    expect(rows[11].balance).toBeCloseTo(1100, 0);
    expect(rows[11].fgts).toBe(5000);
    expect(rows[11].wealth).toBe(money(rows[11].balance + 5000));
  });
  it("inclui as incidências CLT no FGTS exatamente uma vez, independente dos toggles", () => {
    const off = project(scenario(), 12, start).at(-1)!;
    const on = project(
      scenario({ include13: true, includeVacation: true }),
      12,
      start,
    ).at(-1)!;
    expect(off.fgts).toBe(6399.96); // 12 × 533.33, com arredondamento mensal.
    expect(on.fgts).toBe(off.fgts);
  });
  it("suporta rendimento negativo assumido sem juros sobre saldo negativo", () => {
    const rows = project(
      scenario({
        salary: { gross: 0, regime: "PJ" },
        initialBalance: 1000,
        annualRate: -50,
      }),
      12,
      start,
    );
    expect(rows[11].balance).toBeCloseTo(500, 0);
    expect(rows.every((m) => m.balance >= 0 && m.interest <= 0)).toBe(true);
  });
  it("reconcilia o saldo final com todos os fluxos", () => {
    const rows = project(
      { ...structuredClone(defaults), annualRate: 10, daily: 150 },
      60,
      start,
    );
    for (const m of rows)
      expect(m.balance).toBeCloseTo(
        defaults.initialBalance +
          m.totalContributions +
          m.totalExtras +
          m.totalInterest -
          m.totalWithdrawals,
        2,
      );
  });
});

describe("benefícios e provisões sem duplicação", () => {
  it("PJ acumula fora da reserva e transfere apenas no 12º mês, sem nova tributação", () => {
    const rows = project(
      scenario({
        salary: { gross: 6000, regime: "PJ" },
        include13: true,
        includeVacation: true,
      }),
      12,
      start,
    );
    expect(rows[5].pendingPj13).toBe(3000);
    expect(rows[5].pendingPjVacation).toBe(1000.02);
    expect(rows[5].totalExtras).toBe(0);
    expect(rows[11].benefits).toBe(8000.04);
    expect(rows[11].pendingPj13 + rows[11].pendingPjVacation).toBe(0);
    expect(rows[11].balance).toBeCloseTo(12 * (6000 - 360 - 184.8), 2);
  });
  it("PJ desativado continua deduzindo provisões, destinadas ao uso pessoal", () => {
    const rows = project(
      scenario({ salary: { gross: 6000, regime: "PJ" } }),
      12,
      start,
    );
    expect(rows[11].benefits).toBe(0);
    expect(rows[11].pendingPj13 + rows[11].pendingPjVacation).toBe(0);
    expect(rows[11].balance).toBeCloseTo(12 * 4788.53, 2);
  });
  it("preserva provisões e frações CLT ao mudar de regime dentro do ciclo", () => {
    const s = scenario({
      mode: "projection",
      include13: true,
      includeVacation: true,
      stages: [
        { id: "a", gross: 6000, regime: "PJ", duration: 6, unit: "months" },
        { id: "b", gross: 4000, regime: "CLT", duration: 6, unit: "months" },
      ],
    });
    const rows = project(s, 12, start);
    const clt = payroll({ gross: 4000, regime: "CLT" });
    expect(rows[6].pendingPj13).toBe(3000);
    expect(rows[11].benefits).toBeCloseTo(
      4000.02 + 6 * (clt.benefit13 + clt.benefitVacation),
      1,
    );
    expect(rows[11].pending13 + rows[11].pendingPj13).toBe(0);
  });
  it("CLT não adiciona outro salário de férias inteiro", () => {
    const rows = project(
      scenario({
        salary: { gross: 3000, regime: "CLT" },
        include13: false,
        includeVacation: true,
      }),
      12,
      start,
    );
    const net3000 = payroll({ gross: 3000, regime: "CLT" }).available;
    const net4000 = payroll({ gross: 4000, regime: "CLT" }).available;
    expect(rows[11].benefits).toBeCloseTo(net4000 - net3000, 2);
    expect(rows[10].benefits).toBe(0);
  });
  it("aplica extras em semestres e anos relativos ao início da projeção", () => {
    const rows = project(
      scenario({
        extras: [
          { id: "a", name: "Mensal", amount: 10, recurrence: "monthly" },
          { id: "b", name: "Semestral", amount: 100, recurrence: "semiannual" },
          { id: "c", name: "Anual", amount: 1000, recurrence: "annual" },
        ],
      }),
      24,
      start,
    );
    expect(rows[4].extras).toBe(10);
    expect(rows[5].extras).toBe(110);
    expect(rows[11].extras).toBe(1110);
    expect(rows[17].extras).toBe(110);
    expect(rows[23].extras).toBe(1110);
  });
});

describe("imóvel independente e limites", () => {
  it("calcula SAC com taxa mensal equivalente e separa dinheiro de FGTS", () => {
    const result = housing(
      { mode: "standard", price: 300000, cash: 60000, gross: 10000 },
      20000,
    );
    const rate = 1.1099 ** (1 / 12) - 1;
    expect(result.financed).toBe(220000);
    expect(result.fgts).toBe(20000);
    expect(result.firstPayment).toBe(money(220000 / 420 + 220000 * rate));
    expect(result.effectiveRate).toBe(0.1099);
    expect(result.ratio).toBeCloseTo(
      (result.firstPayment / result.netReference) * 100,
    );
  });
  it("limita FGTS ao necessário e não cria financiamento negativo", () => {
    const result = housing(
      { mode: "mcmv", price: 100000, cash: 90000, gross: 4000 },
      50000,
    );
    expect(result.fgts).toBe(10000);
    expect(result.financed).toBe(0);
    expect(
      housing(
        { mode: "standard", price: 100000, cash: 200000, gross: 6000 },
        50000,
      ).fgts,
    ).toBe(0);
  });
  it("seleciona taxa MCMV do Sudeste cotista e converte nominal para efetiva", () => {
    const result = housing(
      { mode: "mcmv", price: 250000, cash: 80000, gross: 4000 },
      0,
    );
    expect(result.nominal).toBe(0.055);
    expect(result.effectiveRate).toBeCloseTo((1 + 0.055 / 12) ** 12 - 1);
    expect(
      housing({ mode: "mcmv", price: 400000, cash: 200000, gross: 9600 }, 0)
        .nominal,
    ).toBe(0.0766);
  });
  it("identifica renda fora do MCMV, imóvel acima do teto e entrada insuficiente", () => {
    const income = housing(
      { mode: "mcmv", price: 300000, cash: 200000, gross: 13001 },
      0,
    );
    expect(income.reasons.join()).toContain("R$ 13.000");
    expect(
      housing(
        { mode: "mcmv", price: 400001, cash: 200000, gross: 8000 },
        0,
      ).reasons.join(),
    ).toContain("teto");
    const middle = housing(
      { mode: "mcmv", price: 500000, cash: 100000, gross: 11000 },
      0,
    );
    expect(middle.ltv).toBe(0.6);
    expect(middle.shortfall).toBe(100000);
    expect(middle.eligible).toBe(false);
    expect(middle.reasons.join()).toContain("Entrada insuficiente");
    expect(
      housing({ mode: "mcmv", price: 500000, cash: 100000, gross: 9600 }, 0)
        .ltv,
    ).toBe(0.8);
  });
  it("usa a opção sem subsídio até R$ 400 mil para renda baixa acima do teto local comum", () => {
    const low = housing(
      { mode: "mcmv", price: 250000, cash: 100000, gross: 4000 },
      0,
    );
    const extended = housing(
      { mode: "mcmv", price: 300000, cash: 100000, gross: 4000 },
      0,
    );
    expect(low.nominal).toBe(0.055);
    expect(extended.extendedLowIncome).toBe(true);
    expect(extended.nominal).toBe(0.0766);
    expect(extended.propertyLimit).toBe(400000);
    expect(extended.reasons.join()).not.toContain("teto");
    expect(
      housing(
        { mode: "mcmv", price: 400001, cash: 300000, gross: 4000 },
        0,
      ).reasons.join(),
    ).toContain("teto");
  });
  it("salário do imóvel não acompanha a renda do orçamento e não muta a simulação", () => {
    const s = scenario();
    const before = structuredClone(s);
    const a = housing(s.home, project(s, 12, start).at(-1)!.fgts);
    const changed = { ...s, salary: { gross: 20000, regime: "PJ" as const } };
    const b = housing(changed.home, project(changed, 12, start).at(-1)!.fgts);
    expect(a.netReference).toBe(b.netReference);
    expect(s).toEqual(before);
    expect(changed.home.gross).toBe(8000);
  });
  it("não usa FGTS acima do limite do SFH e indica incompatibilidade", () => {
    const result = housing(
      { mode: "standard", price: 2500000, cash: 1000000, gross: 50000 },
      100000,
    );
    expect(result.fgts).toBe(0);
    expect(result.reasons.join()).toContain("teto");
  });
});
