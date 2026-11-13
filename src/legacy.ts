import { CATEGORIES } from "./engine/types";
import type { Simulation } from "./engine/types";

export const STORAGE_KEY = "meu-simulador-financeiro:v1";
export const HORIZONS = [
  { value: 6, label: "6 meses" },
  { value: 12, label: "1 ano" },
  { value: 24, label: "2 anos" },
  { value: 36, label: "3 anos" },
  { value: 60, label: "5 anos" },
];
export const defaults: Simulation = {
  mode: "current",
  salary: { gross: 6000, regime: "CLT" },
  stages: [
    { id: "stage-1", gross: 4000, regime: "CLT", duration: 1, unit: "years" },
    { id: "stage-2", gross: 6000, regime: "CLT", duration: 2, unit: "years" },
  ],
  expenses: [
    {
      id: "rent",
      name: "Aluguel e condomínio",
      category: "Moradia",
      amount: 1400,
    },
    {
      id: "internet",
      name: "Internet e celular",
      category: "Internet e telefone",
      amount: 150,
    },
    { id: "gym", name: "Academia", category: "Academia e saúde", amount: 100 },
    {
      id: "streaming",
      name: "Streaming",
      category: "Assinaturas — entretenimento",
      amount: 50,
    },
    {
      id: "groceries",
      name: "Supermercado",
      category: "Alimentação",
      amount: 600,
    },
  ],
  daily: 30,
  initialBalance: 10000,
  annualRate: 10,
  include13: true,
  includeVacation: true,
  extras: [],
  fgts: 5000,
  horizon: 12,
  home: { mode: "mcmv", price: 300000, cash: 50000, gross: 8000 },
};

const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const n = (x: unknown, fallback: number, min = 0, max = 1e9) =>
  typeof x === "number" && Number.isFinite(x)
    ? Math.max(min, Math.min(max, x))
    : fallback;
const str = (x: unknown, fallback: string) =>
  typeof x === "string" ? x.slice(0, 120) : fallback;

// Restore only validated known fields; old, malformed or unavailable storage cannot break the app.
export function restore(raw: string | null): Simulation {
  try {
    const x: unknown = JSON.parse(raw ?? "null");
    if (!object(x)) return structuredClone(defaults);
    const salary = object(x.salary) ? x.salary : {};
    const home = object(x.home) ? x.home : {};
    const stages = Array.isArray(x.stages)
      ? x.stages.filter(object).map((s, i) => ({
          id: str(s.id, `stage-${i}`),
          gross: n(s.gross, 4000),
          regime: s.regime === "PJ" ? ("PJ" as const) : ("CLT" as const),
          duration: Math.round(n(s.duration, 1, 1, 600)),
          unit: s.unit === "years" ? ("years" as const) : ("months" as const),
        }))
      : defaults.stages;
    return {
      mode: x.mode === "projection" ? "projection" : "current",
      salary: {
        gross: n(salary.gross, defaults.salary.gross),
        regime: salary.regime === "PJ" ? "PJ" : "CLT",
      },
      stages: stages.length ? stages : structuredClone(defaults.stages),
      expenses: Array.isArray(x.expenses)
        ? x.expenses.filter(object).map((e, i) => ({
            id: str(e.id, `expense-${i}`),
            name: str(e.name, "Despesa"),
            category: CATEGORIES.includes(
              e.category as (typeof CATEGORIES)[number],
            )
              ? String(e.category)
              : "Outros",
            amount: n(e.amount, 0),
          }))
        : structuredClone(defaults.expenses),
      daily: n(x.daily, defaults.daily),
      initialBalance: n(x.initialBalance, defaults.initialBalance),
      annualRate: n(x.annualRate, defaults.annualRate, -99, 1000),
      include13: typeof x.include13 === "boolean" ? x.include13 : true,
      includeVacation:
        typeof x.includeVacation === "boolean" ? x.includeVacation : true,
      extras: Array.isArray(x.extras)
        ? x.extras.filter(object).map((e, i) => ({
            id: str(e.id, `extra-${i}`),
            name: str(e.name, "Receita extra"),
            amount: n(e.amount, 0),
            recurrence:
              e.recurrence === "semiannual"
                ? "semiannual"
                : e.recurrence === "annual"
                  ? "annual"
                  : "monthly",
          }))
        : [],
      fgts: n(x.fgts, defaults.fgts),
      horizon: HORIZONS.some((h) => h.value === x.horizon)
        ? Number(x.horizon)
        : 12,
      home: {
        mode: home.mode === "standard" ? "standard" : "mcmv",
        price: n(home.price, defaults.home.price),
        cash: n(home.cash, defaults.home.cash),
        gross: n(home.gross, defaults.home.gross),
      },
    };
  } catch {
    return structuredClone(defaults);
  }
}
