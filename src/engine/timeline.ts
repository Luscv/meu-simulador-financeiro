import { addMonths, monthDistance, monthKey } from "./calendar";
import type {
  Change,
  ChangeAction,
  ChangeTarget,
  EntityKind,
  Expense,
  Extra,
  Invoice,
  Loan,
  Obligation,
  PlanDocument,
  SettingsKey,
  Simulation,
} from "./types";

export const SETTINGS_KEYS: SettingsKey[] = [
  "mode",
  "salary",
  "stages",
  "daily",
  "initialBalance",
  "annualRate",
  "include13",
  "includeVacation",
  "fgts",
  "horizon",
  "home",
  "emergencyMonths",
  "projectionStart",
];
export const COLLECTIONS = {
  expense: "expenses",
  extra: "extras",
  loan: "loans",
  invoice: "invoices",
} as const;
export const uid = () => crypto.randomUUID();
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equal(v, b[i]))
    );
  const old = a as Record<string, unknown>,
    next = b as Record<string, unknown>;
  const keys = Object.keys(old);
  return (
    keys.length === Object.keys(next).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(next, key) &&
        equal(old[key], next[key]),
    )
  );
}
const clone = <T>(value: T): T => structuredClone(value);
const isEntity = (target: ChangeTarget): target is EntityKind =>
  target in COLLECTIONS;

export function fieldChanges(
  before: unknown,
  after: unknown,
  prefix = "",
): Change["fields"] {
  if (equal(before, after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const old = before as Record<string, unknown>,
      next = after as Record<string, unknown>;
    return [...new Set([...Object.keys(old), ...Object.keys(next)])].flatMap(
      (key) =>
        fieldChanges(
          old[key] ?? null,
          next[key] ?? null,
          prefix ? `${prefix}.${key}` : key,
        ),
    );
  }
  return [
    {
      field: prefix || "registro",
      before: before ?? null,
      after: after ?? null,
    },
  ];
}

export function snapshotAt(document: PlanDocument, month: string): Simulation {
  const result = clone(document.baseline);
  result.loans ??= [];
  result.invoices ??= [];
  result.emergencyMonths ??= 6;
  result.projectionStart ??= document.referenceMonth;
  // Temporal precedence is effective month, then confirmation order. A retroactive correction
  // never erases an already-confirmed future version with a later effective month.
  const ordered = document.history
    .map((change, order) => ({ change, order }))
    .filter(
      ({ change }) =>
        change.effectiveMonth !== null &&
        change.effectiveMonth <= month &&
        change.target !== "invoice",
    )
    .sort(
      (a, b) =>
        a.change.effectiveMonth!.localeCompare(b.change.effectiveMonth!) ||
        a.order - b.order,
    );
  for (const { change } of ordered) {
    if (isEntity(change.target)) {
      if (
        change.after !== null &&
        document.history.some(
          (close, closeIndex) =>
            close.target === change.target &&
            close.itemId === change.itemId &&
            close.after === null &&
            close.effectiveMonth !== null &&
            close.effectiveMonth <= month &&
            close.effectiveMonth <= change.effectiveMonth! &&
            closeIndex > document.history.indexOf(change),
        )
      )
        continue;
      const key = COLLECTIONS[change.target];
      const list = result[key] as Array<{ id: string }>;
      const index = list.findIndex((item) => item.id === change.itemId);
      if (change.after === null) {
        if (index >= 0) list.splice(index, 1);
      } else if (index >= 0)
        list[index] = clone(change.after) as { id: string };
      else list.push(clone(change.after) as { id: string });
    } else if (SETTINGS_KEYS.includes(change.target as SettingsKey)) {
      Object.assign(result, { [change.target]: clone(change.after) });
    }
  }
  // Horizon/emergency toggles are display choices, confirmed immediately, without a financial validity date.
  for (const change of document.history) {
    if (
      (change.target === "horizon" || change.target === "emergencyMonths") &&
      change.effectiveMonth === null
    )
      Object.assign(result, { [change.target]: clone(change.after) });
  }
  // Each invoice is one explicitly dated obligation. Correcting its date moves that single
  // obligation; the old version remains in history, rather than charging both dates.
  const invoices = new Map(
    (document.baseline.invoices ?? []).map((i) => [i.id, clone(i)]),
  );
  for (const change of document.history.filter((c) => c.target === "invoice")) {
    if (change.after === null) {
      const previous = invoices.get(change.itemId);
      if (previous && change.effectiveMonth! <= previous.month)
        invoices.delete(change.itemId);
    } else invoices.set(change.itemId, clone(change.after) as Invoice);
  }
  result.invoices = [...invoices.values()];
  // A one-off extra is one dated entry, including when its date is corrected.
  // Keep recurring versions by validity, but never count old and new dates twice.
  const uniqueExtras = new Map(
    document.baseline.extras
      .filter((e) => e.recurrence === "once")
      .map((e) => [e.id, e]),
  );
  for (const change of document.history.filter((c) => c.target === "extra")) {
    const extra = change.after as Extra | null;
    if (extra?.recurrence === "once") uniqueExtras.set(change.itemId, extra);
    else {
      const previous = uniqueExtras.get(change.itemId);
      if (previous?.month && change.effectiveMonth! <= previous.month)
        uniqueExtras.delete(change.itemId);
    }
  }
  result.extras = result.extras.flatMap((e) =>
    e.recurrence !== "once"
      ? [e]
      : uniqueExtras.has(e.id)
        ? [clone(uniqueExtras.get(e.id)!)]
        : [],
  );
  return result;
}

export function entityAt(
  document: PlanDocument,
  kind: EntityKind,
  id: string,
  month: string,
) {
  const list = snapshotAt(document, month)[COLLECTIONS[kind]] as Array<
    Expense | Extra | Loan | Invoice
  >;
  return list.find((item) => item.id === id) ?? null;
}

export function appendChange(
  document: PlanDocument,
  input: Omit<Change, "id" | "recordedAt" | "fields">,
  now = new Date(),
): PlanDocument {
  if (input.action !== "import" && equal(input.before, input.after))
    return document;
  const change: Change = {
    ...input,
    id: uid(),
    recordedAt: now.toISOString(),
    fields: fieldChanges(input.before, input.after),
  };
  return { ...document, history: [...document.history, clone(change)] };
}

export function changeEntity(
  document: PlanDocument,
  kind: EntityKind,
  value: Expense | Extra | Loan | Invoice | null,
  effectiveMonth: string,
  name: string,
  id = value?.id ?? "",
  action?: ChangeAction,
): PlanDocument {
  const before =
    entityAt(document, kind, id, effectiveMonth) ??
    (value === null ||
    (kind === "extra" && "recurrence" in value && value.recurrence === "once")
      ? (catalog(document, kind).find((item) => item.id === id) ?? null)
      : null);
  return appendChange(document, {
    target: kind,
    itemId: id,
    itemName: name,
    effectiveMonth,
    before,
    after: value,
    action:
      action ??
      (value === null ? "close" : before === null ? "create" : "edit"),
  });
}

export function changeSettings(
  document: PlanDocument,
  values: Partial<Simulation>,
  effectiveMonth: string | null,
): PlanDocument {
  let next = document;
  const current = snapshotAt(document, effectiveMonth ?? monthKey());
  const entries = { ...values };
  if (
    effectiveMonth &&
    (("stages" in values && !equal(values.stages, current.stages)) ||
      (values.mode === "projection" && current.mode !== "projection"))
  )
    entries.projectionStart = effectiveMonth;
  for (const key of SETTINGS_KEYS) {
    if (key in entries)
      next = appendChange(next, {
        target: key,
        itemId: key,
        itemName: SETTING_LABELS[key],
        action: "edit",
        effectiveMonth,
        before: current[key] ?? null,
        after: entries[key] ?? null,
      });
  }
  return next;
}

export const SETTING_LABELS: Record<SettingsKey, string> = {
  mode: "Modo salarial",
  salary: "Salário e regime",
  stages: "Etapas salariais",
  daily: "Gasto variável diário",
  initialBalance: "Saldo informado da reserva",
  annualRate: "Rendimento anual",
  include13: "Investimento do 13º",
  includeVacation: "Investimento do adicional de férias",
  fgts: "Saldo informado do FGTS",
  horizon: "Horizonte",
  home: "Simulação do imóvel",
  emergencyMonths: "Meses da reserva de emergência",
  projectionStart: "Início das etapas salariais",
};

export function catalog<T extends Expense | Extra | Loan | Invoice>(
  document: PlanDocument,
  kind: EntityKind,
): T[] {
  const items = new Map(
    (document.baseline[COLLECTIONS[kind]] ?? []).map((item) => [
      item.id,
      clone(item),
    ]),
  );
  for (const change of document.history.filter((c) => c.target === kind)) {
    if (change.after !== null)
      items.set(change.itemId, clone(change.after) as T);
  }
  return [...items.values()] as T[];
}

export function activeExpenses(simulation: Simulation, month: string) {
  return simulation.expenses.filter(
    (e) => !e.term || (month >= e.term.firstMonth && month <= e.term.endMonth),
  );
}

export function obligations(document: PlanDocument): Obligation[] {
  const result: Obligation[] = [];
  const snapshots = new Map<string, Simulation>();
  const at = (month: string) => {
    if (!snapshots.has(month))
      snapshots.set(month, snapshotAt(document, month));
    return snapshots.get(month)!;
  };
  const payments = new Map<string, boolean>(),
    reschedules = new Map<string, string>();
  for (const c of document.history) {
    if (c.target === "payment")
      payments.set(c.itemId, (c.after as { paid: boolean }).paid);
    if (c.target === "reschedule") reschedules.set(c.itemId, c.after as string);
  }
  for (const loan of catalog<Loan>(document, "loan")) {
    const versions = [
      document.baseline.loans?.find((l) => l.id === loan.id),
      ...document.history
        .filter(
          (c) =>
            c.target === "loan" && c.itemId === loan.id && c.after !== null,
        )
        .map((c) => c.after as Loan),
    ].filter((v): v is Loan => !!v);
    const candidates = new Set(
      versions.flatMap((v) =>
        Array.from({ length: v.installments }, (_, index) =>
          addMonths(v.firstMonth, index),
        ),
      ),
    );
    for (const originalMonth of [...candidates].sort()) {
      const version = at(originalMonth).loans?.find(
        (item) => item.id === loan.id,
      );
      if (
        !version ||
        originalMonth < version.firstMonth ||
        originalMonth > version.endMonth
      )
        continue;
      const id = `loan:${loan.id}:${originalMonth}`;
      result.push({
        id,
        kind: "loan",
        itemId: loan.id,
        name: version.name,
        originalMonth,
        month: reschedules.get(id) ?? originalMonth,
        amount: version.amount,
        paid: payments.get(id) ?? false,
        installment: monthDistance(version.firstMonth, originalMonth) + 1,
      });
    }
  }
  for (const invoice of at(document.referenceMonth).invoices ?? []) {
    result.push({
      id: `invoice:${invoice.id}`,
      kind: "invoice",
      itemId: invoice.id,
      name: invoice.card,
      originalMonth: invoice.month,
      month: invoice.month,
      amount: invoice.amount,
      paid: invoice.status === "paid",
    });
  }
  return result.sort(
    (a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id),
  );
}

export function confirmPayment(
  document: PlanDocument,
  obligation: Obligation,
  paid: boolean,
): PlanDocument {
  if (obligation.kind === "invoice") {
    const invoice = entityAt(
      document,
      "invoice",
      obligation.itemId,
      obligation.month,
    ) as Invoice;
    return changeEntity(
      document,
      "invoice",
      { ...invoice, status: paid ? "paid" : "open" },
      obligation.month,
      invoice.card,
      invoice.id,
      "payment",
    );
  }
  return appendChange(document, {
    action: "payment",
    target: "payment",
    itemId: obligation.id,
    itemName: `${obligation.name} · ${obligation.originalMonth}`,
    effectiveMonth: obligation.month,
    before: { paid: obligation.paid },
    after: { paid },
  });
}

export function reschedule(
  document: PlanDocument,
  obligation: Obligation,
  month: string,
): PlanDocument {
  if (obligation.paid || obligation.month === month) return document;
  if (obligation.kind === "invoice") {
    const invoice = entityAt(
      document,
      "invoice",
      obligation.itemId,
      obligation.month,
    ) as Invoice;
    return changeEntity(
      document,
      "invoice",
      { ...invoice, month },
      month,
      invoice.card,
      invoice.id,
      "reschedule",
    );
  }
  return appendChange(document, {
    action: "reschedule",
    target: "reschedule",
    itemId: obligation.id,
    itemName: `${obligation.name} · ${obligation.originalMonth}`,
    effectiveMonth: month,
    before: obligation.month,
    after: month,
  });
}
