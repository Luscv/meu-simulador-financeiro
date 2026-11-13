export type Regime = "CLT" | "PJ";
export interface Salary {
  gross: number;
  regime: Regime;
}
export interface Stage extends Salary {
  id: string;
  duration: number;
  unit: "months" | "years";
}
export const CATEGORIES = [
  "Moradia",
  "Internet e telefone",
  "Academia e saúde",
  "Assinaturas — entretenimento",
  "Assinaturas — ferramentas",
  "Educação",
  "Alimentação",
  "Transporte",
  "Outros",
] as const;
export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  term?: Term;
}
export interface Term {
  firstMonth: string;
  months: number;
  endMonth: string;
}
export interface Loan {
  id: string;
  name: string;
  type: "payroll" | "personal";
  amount: number;
  firstMonth: string;
  installments: number;
  endMonth: string;
}
export interface Invoice {
  id: string;
  card: string;
  month: string;
  amount: number;
  status: "open" | "paid";
}
export interface Extra {
  id: string;
  name: string;
  amount: number;
  recurrence: "monthly" | "semiannual" | "annual";
}
export interface Home {
  mode: "mcmv" | "standard";
  price: number;
  cash: number;
  gross: number;
}
export interface Simulation {
  mode: "current" | "projection";
  salary: Salary;
  stages: Stage[];
  expenses: Expense[];
  daily: number;
  initialBalance: number;
  annualRate: number;
  include13: boolean;
  includeVacation: boolean;
  extras: Extra[];
  fgts: number;
  horizon: number;
  home: Home;
  loans?: Loan[];
  invoices?: Invoice[];
  emergencyMonths?: 6 | 8 | 12;
  projectionStart?: string;
}
export type SettingsKey = Exclude<
  keyof Simulation,
  "expenses" | "extras" | "loans" | "invoices"
>;
export type EntityKind = "expense" | "extra" | "loan" | "invoice";
export type ChangeTarget =
  | SettingsKey
  | EntityKind
  | "payment"
  | "reschedule"
  | "document";
export type ChangeAction =
  | "create"
  | "edit"
  | "close"
  | "payment"
  | "reschedule"
  | "import"
  | "migration"
  | "initial";
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}
export interface Change {
  id: string;
  recordedAt: string;
  action: ChangeAction;
  target: ChangeTarget;
  itemId: string;
  itemName: string;
  effectiveMonth: string | null;
  before: unknown;
  after: unknown;
  fields: FieldChange[];
}
export interface PlanDocument {
  version: 2;
  createdAt: string;
  referenceMonth: string;
  baseline: Simulation;
  history: Change[];
}
export interface Obligation {
  id: string;
  kind: "loan" | "invoice";
  itemId: string;
  name: string;
  originalMonth: string;
  month: string;
  amount: number;
  paid: boolean;
  installment?: number;
}
export interface Payroll extends Salary {
  inss: number;
  irrf: number;
  das: number;
  dividendTax: number;
  proLabore: number;
  provision13: number;
  provisionVacation: number;
  available: number;
  fgtsBase: number;
  benefit13: number;
  benefitVacation: number;
  supported: boolean;
}
export interface Month {
  index: number;
  date: string;
  days: number;
  payroll: Payroll;
  income: number;
  fixed: number;
  variable: number;
  daily: number;
  loans: number;
  invoices: number;
  spending: number;
  budget: number;
  extras: number;
  benefits: number;
  interest: number;
  contribution: number;
  withdrawal: number;
  uncovered: number;
  balance: number;
  fgtsDeposit: number;
  fgts: number;
  wealth: number;
  pending13: number;
  pendingVacation: number;
  pendingPj13: number;
  pendingPjVacation: number;
  totalContributions: number;
  totalExtras: number;
  totalInterest: number;
  totalWithdrawals: number;
  totalUncovered: number;
  openingBalance: number;
  openingFgts: number;
  balanceAdjustment: number;
  fgtsAdjustment: number;
  totalBalanceAdjustments: number;
}
