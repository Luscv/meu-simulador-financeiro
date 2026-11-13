import { RULES } from "./rules";
import type {
  Home,
  Month,
  Payroll,
  Salary,
  Simulation,
  PlanDocument,
} from "./types";
import { monthDistance, monthKey } from "./calendar";
import { activeExpenses, obligations, snapshotAt } from "./timeline";

export const money = (value: number) =>
  (Math.sign(value) *
    Math.round(
      (Math.abs(value) + Number.EPSILON * Math.max(1, Math.abs(value))) * 100,
    )) /
  100;
export const positive = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export function inss(gross: number) {
  let previous = 0,
    tax = 0;
  for (const [ceiling, rate] of RULES.inss) {
    tax += Math.max(0, Math.min(gross, ceiling) - previous) * rate;
    previous = ceiling;
  }
  return money(tax);
}

export function irrf(gross: number, deduction: number) {
  const base = Math.max(
    0,
    gross - Math.max(deduction, RULES.simplifiedDeduction),
  );
  const [, rate, deduct] = RULES.ir.find(([ceiling]) => base <= ceiling)!;
  const beforeReduction = Math.max(0, base * rate - deduct);
  const r = RULES.irReduction;
  const reduction =
    gross <= r.exempt
      ? r.maximum
      : gross <= r.ceiling
        ? Math.max(0, r.intercept - r.slope * gross)
        : 0;
  return money(Math.max(0, beforeReduction - reduction));
}

function cltNet(gross: number) {
  const social = inss(gross);
  return money(gross - social - irrf(gross, social));
}

export function payroll(salary: Salary): Payroll {
  const gross = positive(salary.gross);
  const p: Payroll = {
    ...salary,
    gross,
    inss: 0,
    irrf: 0,
    das: 0,
    dividendTax: 0,
    proLabore: 0,
    provision13: 0,
    provisionVacation: 0,
    available: 0,
    fgtsBase: 0,
    benefit13: 0,
    benefitVacation: 0,
    supported: true,
  };
  if (salary.regime === "CLT") {
    p.inss = inss(gross);
    p.irrf = irrf(gross, p.inss);
    p.available = money(gross - p.inss - p.irrf);
    p.fgtsBase = money(gross * RULES.fgtsRate);
    p.benefit13 = p.available / 12;
    // Incremental net of one month's vacation + one third, over the normal monthly net.
    p.benefitVacation = Math.max(0, cltNet((gross * 4) / 3) - p.available) / 12;
  } else if (gross > 0) {
    p.supported = gross <= RULES.pj.maxMonthly;
    if (!p.supported) return p;
    const annualized = gross * 12;
    const [, rate, deduct] = RULES.pj.brackets.find(
      ([ceiling]) => annualized <= ceiling,
    )!;
    p.das = money((gross * (annualized * rate - deduct)) / annualized);
    p.proLabore = Math.max(RULES.minimumWage, gross * RULES.pj.proLaboreRate);
    p.inss = money(
      Math.min(p.proLabore, RULES.inss.at(-1)![0]) * RULES.pj.inssRate,
    );
    p.irrf = irrf(p.proLabore, p.inss);
    const profit = Math.max(0, gross - p.das - p.proLabore);
    p.dividendTax =
      profit > RULES.pj.dividendThreshold
        ? money(profit * RULES.pj.dividendRate)
        : 0;
    p.provision13 = money(gross / 12);
    p.provisionVacation = money(gross / 36);
    p.available = money(
      gross -
        p.das -
        p.inss -
        p.irrf -
        p.dividendTax -
        p.provision13 -
        p.provisionVacation,
    );
  }
  return p;
}

export function salaryAt(s: Simulation, index: number): Salary {
  if (s.mode === "current" || s.stages.length === 0) return s.salary;
  let end = 0;
  for (const stage of s.stages) {
    end +=
      Math.max(1, Math.round(stage.duration)) *
      (stage.unit === "years" ? 12 : 1);
    if (index < end) return stage;
  }
  return s.stages.at(-1)!;
}

export function project(
  source: Simulation | PlanDocument,
  count?: number,
  start = new Date(),
): Month[] {
  const document = "baseline" in source ? source : null;
  const firstSettings = document
    ? snapshotAt(document, monthKey(start))
    : (source as Simulation);
  count ??= firstSettings.horizon;
  const schedule = obligations(
    document ?? {
      version: 2,
      createdAt: start.toISOString(),
      referenceMonth: monthKey(start),
      baseline: firstSettings,
      history: [],
    },
  );
  const rows: Month[] = [];
  let balance = positive(firstSettings.initialBalance),
    fgts = positive(firstSettings.fgts);
  let previous = firstSettings;
  let totalBalanceAdjustments = 0;
  let pending13 = 0,
    pendingVacation = 0,
    pendingPj13 = 0,
    pendingPjVacation = 0;
  let totalContributions = 0,
    totalExtras = 0,
    totalInterest = 0,
    totalWithdrawals = 0,
    totalUncovered = 0;
  for (let index = 0; index < count; index++) {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const month = monthKey(date);
    const s = document ? snapshotAt(document, month) : firstSettings;
    const rate = Math.pow(1 + Math.max(-99, s.annualRate) / 100, 1 / 12) - 1;
    const balanceAdjustment =
      index > 0 && s.initialBalance !== previous.initialBalance
        ? money(s.initialBalance - balance)
        : 0;
    const fgtsAdjustment =
      index > 0 && s.fgts !== previous.fgts ? money(s.fgts - fgts) : 0;
    balance = money(balance + balanceAdjustment);
    fgts = money(fgts + fgtsAdjustment);
    totalBalanceAdjustments = money(
      totalBalanceAdjustments + balanceAdjustment,
    );
    const openingBalance = balance,
      openingFgts = fgts;
    const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const salaryIndex = s.projectionStart
      ? Math.max(0, monthDistance(s.projectionStart, month))
      : index;
    const p = payroll(salaryAt(s, salaryIndex));
    const fixed = money(
      activeExpenses(s, month).reduce(
        (total, e) => total + positive(e.amount),
        0,
      ),
    );
    // Confirmation of payment changes status only, never the dated planned expense.
    const loans = money(
      schedule
        .filter((o) => o.kind === "loan" && o.month === month)
        .reduce((sum, o) => sum + o.amount, 0),
    );
    const invoices = money(
      schedule
        .filter((o) => o.kind === "invoice" && o.month === month)
        .reduce((sum, o) => sum + o.amount, 0),
    );
    const variable = money(positive(s.daily) * days),
      spending = money(fixed + variable + loans + invoices);
    const budget = money(p.available - spending);
    pending13 += s.include13 ? p.benefit13 : 0;
    pendingVacation += s.includeVacation ? p.benefitVacation : 0;
    pendingPj13 = money(pendingPj13 + (s.include13 ? p.provision13 : 0));
    pendingPjVacation = money(
      pendingPjVacation + (s.includeVacation ? p.provisionVacation : 0),
    );
    let benefits = 0;
    if ((index + 1) % 12 === 0) {
      benefits = money(
        pending13 + pendingVacation + pendingPj13 + pendingPjVacation,
      );
      pending13 = pendingVacation = pendingPj13 = pendingPjVacation = 0;
    }
    const extras = money(
      s.extras.reduce(
        (sum, e) =>
          sum +
          (e.recurrence === "monthly" ||
          (index + 1) % (e.recurrence === "semiannual" ? 6 : 12) === 0
            ? positive(e.amount)
            : 0),
        0,
      ),
    );
    const interest = money(balance * rate);
    const contribution = Math.max(0, budget);
    // Month-end netting: extras/benefits can cover the deficit before an uncovered gap occurs.
    const available = money(
      balance + interest + contribution + extras + benefits,
    );
    const deficit = Math.max(0, -budget);
    const withdrawal = money(Math.min(available, deficit));
    const uncovered = money(Math.max(0, deficit - available));
    balance = money(Math.max(0, available - deficit));
    // Monthly accrual convention: salary + 1/12 of 13th + 1/36 of annual vacation salary.
    const fgtsDeposit =
      p.regime === "CLT"
        ? money(p.gross * RULES.fgtsRate * (1 + 1 / 12 + 1 / 36))
        : 0;
    fgts = money(fgts + fgtsDeposit);
    totalContributions = money(totalContributions + contribution);
    totalExtras = money(totalExtras + extras + benefits);
    totalInterest = money(totalInterest + interest);
    totalWithdrawals = money(totalWithdrawals + withdrawal);
    totalUncovered = money(totalUncovered + uncovered);
    rows.push({
      index,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`,
      days,
      payroll: p,
      income: p.available,
      fixed,
      variable,
      daily: positive(s.daily),
      loans,
      invoices,
      spending,
      budget,
      extras,
      benefits,
      interest,
      contribution,
      withdrawal,
      uncovered,
      balance,
      fgtsDeposit,
      fgts,
      wealth: money(balance + fgts),
      pending13: money(pending13),
      pendingVacation: money(pendingVacation),
      pendingPj13,
      pendingPjVacation,
      totalContributions,
      totalExtras,
      totalInterest,
      totalWithdrawals,
      totalUncovered,
      openingBalance,
      openingFgts,
      balanceAdjustment,
      fgtsAdjustment,
      totalBalanceAdjustments,
    });
    previous = s;
  }
  return rows;
}

export function emergencyTarget(
  fixed: number,
  daily: number,
  months: 6 | 8 | 12,
) {
  const variable = money(positive(daily) * 30);
  const reference = money(positive(fixed) + variable);
  return { fixed, variable, reference, target: money(reference * months) };
}

export function housing(h: Home, projectedFgts: number) {
  const r = RULES.housing;
  const gross = positive(h.gross),
    price = positive(h.price),
    cash = Math.min(price, positive(h.cash));
  const standard = h.mode === "standard";
  const extendedLowIncome =
    !standard && gross <= r.lowIncome && price > r.lowPropertyLimit;
  const nominal = extendedLowIncome
    ? r.lowIncomeExtendedNominalRate
    : (r.mcmvRates.find(([ceiling]) => gross <= ceiling)?.[1] ?? null);
  const monthlyRate = standard
    ? Math.pow(1 + r.standardEffectiveRate, 1 / 12) - 1
    : (nominal ?? 0) / 12;
  const effectiveRate = standard
    ? r.standardEffectiveRate
    : Math.pow(1 + monthlyRate, 12) - 1;
  const propertyLimit = standard
    ? r.sfhLimit
    : gross <= r.faixa3Income
      ? r.faixa3PropertyLimit
      : r.middlePropertyLimit;
  const ltv = standard
    ? r.standardLtv
    : gross <= r.faixa3Income
      ? r.mcmvLtv
      : r.middleUsedLtv;
  const fgts =
    price <= r.fgtsPropertyLimit
      ? money(Math.min(positive(projectedFgts), Math.max(0, price - cash)))
      : 0;
  const financed = money(Math.max(0, price - cash - fgts));
  const firstPayment = money(financed / r.months + financed * monthlyRate);
  const netReference = payroll({ gross, regime: "CLT" }).available;
  const shortfall = money(Math.max(0, financed - price * ltv));
  const reasons: string[] = [];
  if (price <= 0) reasons.push("Informe um valor de imóvel maior que zero.");
  if (gross <= 0) reasons.push("Informe o salário bruto previsto na compra.");
  if (!standard && gross > r.maxIncome)
    reasons.push("A renda ultrapassa o limite de R$ 13.000 do MCMV.");
  if (price > propertyLimit)
    reasons.push(
      `O imóvel supera o teto de ${propertyLimit.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} desta modalidade/faixa.`,
    );
  if (shortfall > 0)
    reasons.push(
      `Entrada insuficiente: faltam ${shortfall.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para respeitar a cota de ${(ltv * 100).toFixed(0)}%.`,
    );
  if (gross > 0 && firstPayment > gross * r.grossCommitment)
    reasons.push(
      "A primeira parcela supera 30% da renda bruta, referência de capacidade de pagamento.",
    );
  return {
    financed,
    fgts,
    cash,
    effectiveRate,
    monthlyRate,
    nominal,
    firstPayment,
    netReference,
    ratio: netReference > 0 ? (firstPayment / netReference) * 100 : null,
    shortfall,
    ltv,
    propertyLimit,
    reasons,
    extendedLowIncome,
    eligible: reasons.length === 0,
  };
}
