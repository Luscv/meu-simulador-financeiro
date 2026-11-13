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
}
