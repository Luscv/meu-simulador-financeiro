import { describe, expect, it } from "vitest";
import { defaults } from "../legacy";
import {
  createDocument,
  exportData,
  importDocument,
  loadDocument,
  parseImport,
  STORAGE_KEY,
} from "../data";
import { addMonths, monthDate } from "./calendar";
import { emergencyTarget, project } from "./calculate";
import {
  changeEntity,
  changeSettings,
  confirmPayment,
  entityAt,
  obligations,
  reschedule,
  snapshotAt,
} from "./timeline";
import type { Expense, Loan, PlanDocument, Simulation } from "./types";

const now = new Date("2026-11-13T12:00:00.000Z");
const origin = "2026-11";
function plan(overrides: Partial<Simulation> = {}) {
  return createDocument(
    {
      ...structuredClone(defaults),
      expenses: [],
      extras: [],
      daily: 0,
      annualRate: 0,
      initialBalance: 0,
      fgts: 0,
      include13: false,
      includeVacation: false,
      ...overrides,
    },
    now,
  );
}
function loan(firstMonth = origin, installments = 4): Loan {
  return {
    id: "loan",
    name: "Consignado",
    type: "payroll",
    amount: 100,
    firstMonth,
    installments,
    endMonth: addMonths(firstMonth, installments - 1),
  };
}
function addLoan(doc: PlanDocument, value = loan()) {
  return changeEntity(doc, "loan", value, value.firstMonth, value.name);
}
const rows = (doc: PlanDocument, count = 12, month = origin) =>
  project(doc, count, monthDate(month));

describe("meta de emergência", () => {
  it.each([6, 8, 12] as const)("usa 30 dias fixos e %s meses", (months) => {
    expect(emergencyTarget(500, 20, months)).toEqual({
      fixed: 500,
      variable: 600,
      reference: 1100,
      target: 1100 * months,
    });
  });
  it("usa apenas despesas ativas e não debita a meta dos investimentos", () => {
    const expenses: Expense[] = [
      {
        id: "one",
        name: "Uma vez",
        category: "Outros",
        amount: 300,
        term: { firstMonth: origin, months: 1, endMonth: origin },
      },
      {
        id: "future",
        name: "Futura",
        category: "Educação",
        amount: 500,
        term: { firstMonth: "2026-12", months: 1, endMonth: "2026-12" },
      },
    ];
    const doc = plan({ expenses, daily: 10 });
    expect(rows(doc)[0].fixed).toBe(300);
    expect(emergencyTarget(rows(doc)[0].fixed, 10, 8).target).toBe(4800);
    expect(rows(changeSettings(doc, { emergencyMonths: 12 }, null))).toEqual(
      rows(doc),
    );
  });
});

describe("cronogramas absolutos e pagamentos", () => {
  it("quatro parcelas em novembro terminam em fevereiro e liberam março", () => {
    const doc = addLoan(plan());
    expect(rows(doc, 5).map((m) => m.loans)).toEqual([100, 100, 100, 100, 0]);
    expect(rows(doc, 5)[4].budget - rows(doc, 5)[3].budget).toBe(100);
    expect(obligations(doc).map((o) => o.month)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
  it("uma mensalidade e uma parcela duram apenas a primeira competência", () => {
    const expense: Expense = {
      id: "e",
      name: "Pós",
      category: "Educação",
      amount: 500,
      term: { firstMonth: origin, months: 1, endMonth: origin },
    };
    const doc = addLoan(plan({ expenses: [expense] }), loan(origin, 1));
    expect(rows(doc, 2).map((m) => [m.fixed, m.loans])).toEqual([
      [500, 100],
      [0, 0],
    ]);
  });
  it("obrigações futuras começam no mês cadastrado", () => {
    const doc = addLoan(plan(), loan("2027-01", 1));
    expect(rows(doc, 4).map((m) => m.loans)).toEqual([0, 0, 100, 0]);
  });
  it("faturas diferentes não se repetem e vários cartões somam apenas sua competência", () => {
    let doc = plan();
    for (const invoice of [
      {
        id: "a",
        card: "Cartão A",
        month: origin,
        amount: 200,
        status: "open" as const,
      },
      {
        id: "b",
        card: "Cartão A",
        month: "2026-12",
        amount: 350,
        status: "paid" as const,
      },
      {
        id: "c",
        card: "Cartão B",
        month: "2026-12",
        amount: 100,
        status: "open" as const,
      },
    ])
      doc = changeEntity(doc, "invoice", invoice, invoice.month, invoice.card);
    expect(rows(doc, 3).map((m) => m.invoices)).toEqual([200, 450, 0]);
  });
  it("pagamento de parcela e fatura não apaga nem duplica sua despesa", () => {
    let doc = addLoan(plan());
    doc = changeEntity(
      doc,
      "invoice",
      { id: "i", card: "Cartão", month: origin, amount: 300, status: "open" },
      origin,
      "Cartão",
    );
    const before = rows(doc);
    for (const item of obligations(doc).filter((o) => o.month === origin))
      doc = confirmPayment(doc, item, true);
    expect(
      obligations(doc)
        .filter((o) => o.month === origin)
        .every((o) => o.paid),
    ).toBe(true);
    expect(rows(doc)).toEqual(before);
    expect(doc.history.filter((c) => c.action === "payment")).toHaveLength(2);
  });
  it("calendário não confirma pagamentos nem espalha pendências para meses seguintes", () => {
    const doc = addLoan(plan(), loan(origin, 1));
    expect(obligations(doc)[0].paid).toBe(false);
    expect(rows(doc, 3, "2027-03").every((m) => m.loans === 0)).toBe(true);
    expect(obligations(doc)).toHaveLength(1);
  });
  it("reagendar uma parcela move apenas aquela despesa e preserva a competência original", () => {
    let doc = addLoan(plan());
    const first = obligations(doc)[0];
    doc = reschedule(doc, first, "2027-03");
    expect(rows(doc, 5).map((m) => m.loans)).toEqual([0, 100, 100, 100, 100]);
    expect(obligations(doc).find((o) => o.id === first.id)?.originalMonth).toBe(
      origin,
    );
    expect(doc.history.at(-1)?.before).toBe(origin);
    expect(doc.history.at(-1)?.after).toBe("2027-03");
    expect(
      obligations(doc)
        .filter((o) => !o.paid)
        .reduce((sum, o) => sum + o.amount, 0),
    ).toBe(400);
  });
  it("reagendar fatura preserva uma única obrigação, com o mesmo identificador", () => {
    let doc = changeEntity(
      plan(),
      "invoice",
      { id: "i", card: "Cartão", month: origin, amount: 300, status: "open" },
      origin,
      "Cartão",
    );
    doc = reschedule(doc, obligations(doc)[0], "2026-12");
    expect(rows(doc, 3).map((m) => m.invoices)).toEqual([0, 300, 0]);
    expect(obligations(doc)).toHaveLength(1);
  });
  it("encerrar empréstimo mantém parcelas anteriores, inclusive pendentes", () => {
    let doc = addLoan(plan());
    doc = changeEntity(doc, "loan", null, "2027-01", "Consignado", "loan");
    expect(rows(doc, 4).map((m) => m.loans)).toEqual([100, 100, 0, 0]);
    expect(obligations(doc).filter((o) => !o.paid)).toHaveLength(2);
  });
  it("consignado aparece uma única vez, fora dos descontos tributários do salário", () => {
    const plain = rows(plan(), 1)[0],
      withLoan = rows(addLoan(plan()), 1)[0];
    expect(withLoan.income).toBe(plain.income);
    expect(plain.budget - withLoan.budget).toBe(100);
    expect(withLoan.payroll.inss).toBe(plain.payroll.inss);
  });
  it("dívidas geram déficit usando o mecanismo de reserva existente", () => {
    const doc = addLoan(
      plan({ salary: { gross: 0, regime: "PJ" }, initialBalance: 150 }),
    );
    const result = rows(doc, 3);
    expect(result.map((m) => m.balance)).toEqual([50, 0, 0]);
    expect(result.map((m) => m.uncovered)).toEqual([0, 50, 100]);
  });
});

describe("vigências, versões e datas de referência", () => {
  it("R$ 300 até fevereiro e R$ 400 a partir de março preservam o passado", () => {
    const initial: Expense = {
      id: "e",
      name: "Gasto",
      category: "Outros",
      amount: 300,
    };
    let doc = plan({ expenses: [initial] });
    doc = changeEntity(
      doc,
      "expense",
      { ...initial, amount: 400 },
      "2027-03",
      "Gasto",
    );
    expect(rows(doc, 6).map((m) => m.fixed)).toEqual([
      300, 300, 300, 300, 400, 400,
    ]);
    const annual = rows(doc).reduce((sum, m) => sum + m.fixed, 0);
    expect(annual).toBe(4 * 300 + 8 * 400);
  });
  it("correção retroativa não apaga uma versão anterior nem a futura", () => {
    const expense: Expense = {
      id: "e",
      name: "Gasto",
      category: "Outros",
      amount: 300,
    };
    let doc = changeEntity(
      plan({ expenses: [expense] }),
      "expense",
      { ...expense, amount: 400 },
      "2027-03",
      "Gasto",
    );
    doc = changeEntity(
      doc,
      "expense",
      { ...expense, amount: 350 },
      "2027-01",
      "Gasto",
    );
    expect(rows(doc, 6).map((m) => m.fixed)).toEqual([
      300, 300, 350, 350, 400, 400,
    ]);
    expect(doc.history[1].after).toEqual({ ...expense, amount: 400 });
    expect(doc.history[2].before).toEqual(expense);
    expect(doc.history[2].recordedAt).not.toBe(
      `${doc.history[2].effectiveMonth}-01`,
    );
  });
  it("encerramento preserva competências anteriores e cancela versões futuras já agendadas", () => {
    const expense: Expense = {
      id: "e",
      name: "Gasto",
      category: "Outros",
      amount: 300,
    };
    let doc = changeEntity(
      plan({ expenses: [expense] }),
      "expense",
      { ...expense, amount: 400 },
      "2027-03",
      "Gasto",
    );
    doc = changeEntity(doc, "expense", null, "2027-01", "Gasto", "e");
    expect(rows(doc, 6).map((m) => m.fixed)).toEqual([300, 300, 0, 0, 0, 0]);
    expect(entityAt(doc, "expense", "e", "2026-12")).toEqual(expense);
  });
  it("é possível cancelar hoje um compromisso que só começaria no futuro", () => {
    let doc = addLoan(plan(), loan("2027-03", 1));
    doc = changeEntity(doc, "loan", null, origin, "Consignado", "loan");
    expect(obligations(doc)).toHaveLength(0);
    expect(doc.history.at(-1)?.action).toBe("close");
  });
  it("uma pós-graduação dura oito competências e libera os aportes seguintes", () => {
    const expense: Expense = {
      id: "p",
      name: "Pós",
      category: "Educação",
      amount: 500,
      term: { firstMonth: origin, months: 8, endMonth: "2027-06" },
    };
    const result = rows(plan({ expenses: [expense] }), 9);
    expect(result.slice(0, 8).every((m) => m.fixed === 500)).toBe(true);
    expect(result[8].fixed).toBe(0);
    expect(result[8].contribution - result[7].contribution).toBe(500);
  });
  it("recarregar em janeiro não reinicia parcelas, mensalidades ou etapas salariais", () => {
    const expense: Expense = {
      id: "p",
      name: "Pós",
      category: "Educação",
      amount: 500,
      term: { firstMonth: origin, months: 4, endMonth: "2027-02" },
    };
    const doc = addLoan(
      plan({
        expenses: [expense],
        mode: "projection",
        stages: [
          { id: "a", gross: 4000, regime: "CLT", duration: 2, unit: "months" },
          { id: "b", gross: 6000, regime: "PJ", duration: 1, unit: "years" },
        ],
      }),
    );
    const restored = loadDocument(
      { getItem: (key) => (key === STORAGE_KEY ? JSON.stringify(doc) : null) },
      new Date(2027, 0, 1),
    );
    const result = rows(restored, 3, "2027-01");
    expect(result.map((m) => m.fixed)).toEqual([500, 500, 0]);
    expect(result.map((m) => m.loans)).toEqual([100, 100, 0]);
    expect(result[0].payroll.regime).toBe("PJ");
    expect(restored.referenceMonth).toBe(origin);
  });
  it("salário e rendimento futuros alimentam os mesmos resultados mensais", () => {
    let doc = plan({ initialBalance: 1000 });
    doc = changeSettings(
      doc,
      { salary: { gross: 9000, regime: "PJ" }, annualRate: 10, daily: 5 },
      "2027-01",
    );
    const result = rows(doc, 3);
    expect(result[0].payroll.regime).toBe("CLT");
    expect(result[2].payroll.regime).toBe("PJ");
    expect(result[0].variable).toBe(0);
    expect(result[2].variable).toBe(155);
    expect(result[0].interest).toBe(0);
    expect(result[2].interest).toBeGreaterThan(0);
    expect(snapshotAt(doc, origin).salary.gross).toBe(6000);
  });
  it("exportar/importar preserva dados, histórico, pagamentos e resultados", () => {
    let doc = addLoan(plan());
    doc = confirmPayment(doc, obligations(doc)[0], true);
    doc = reschedule(doc, obligations(doc)[1], "2027-03");
    const parsed = parseImport(exportData(doc, now));
    expect(parsed.document).toEqual(doc);
    const replaced = importDocument(plan({ daily: 20 }), parsed.document, now);
    expect(replaced.history.slice(0, -1)).toEqual(doc.history);
    expect(replaced.history.at(-1)?.action).toBe("import");
    expect(rows(replaced)).toEqual(rows(doc));
  });
  it("confirmar uma importação idêntica ainda registra o ato de importar", () => {
    const doc = plan();
    const imported = importDocument(doc, parseImport(exportData(doc)).document);
    expect(imported.history).toHaveLength(doc.history.length + 1);
    expect(imported.history.at(-1)?.action).toBe("import");
    expect(rows(imported)).toEqual(rows(doc));
  });
  it("salvar os mesmos dados, mesmo com propriedades em outra ordem, não gera alteração fictícia", () => {
    const e: Expense = {
      id: "e",
      name: "Gasto",
      category: "Outros",
      amount: 300,
    };
    const doc = plan({ expenses: [e] });
    const unchanged = changeEntity(
      doc,
      "expense",
      { amount: 300, category: "Outros", name: "Gasto", id: "e" },
      origin,
      "Gasto",
    );
    expect(unchanged).toBe(doc);
  });
  it("revisão futura de saldos é identificada como premissa, sem inflar aportes ou depósitos", () => {
    let doc = plan({
      salary: { gross: 0, regime: "PJ" },
      initialBalance: 1000,
      fgts: 100,
    });
    doc = changeSettings(doc, { initialBalance: 500, fgts: 2000 }, "2027-01");
    const result = rows(doc, 3);
    expect(result.map((m) => m.balance)).toEqual([1000, 1000, 500]);
    expect(result.map((m) => m.fgts)).toEqual([100, 100, 2000]);
    expect(result[2].balanceAdjustment).toBe(-500);
    expect(result[2].fgtsAdjustment).toBe(1900);
    expect(result[2].totalContributions).toBe(0);
    expect(result.every((m) => m.fgtsDeposit === 0)).toBe(true);
    expect(result[2].balance).toBe(
      result[0].openingBalance +
        result[2].totalContributions +
        result[2].totalExtras +
        result[2].totalInterest -
        result[2].totalWithdrawals +
        result[2].totalBalanceAdjustments,
    );
  });
  it("encerrar um registro de fatura em mês posterior preserva a despesa anterior", () => {
    let doc = changeEntity(
      plan(),
      "invoice",
      { id: "i", card: "Cartão", month: origin, amount: 150, status: "open" },
      origin,
      "Cartão",
    );
    doc = changeEntity(doc, "invoice", null, "2026-12", "Cartão", "i");
    expect(rows(doc, 2).map((m) => m.invoices)).toEqual([150, 0]);
  });
});
