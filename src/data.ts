import { defaults, restore } from "./legacy";
import { addMonths, monthKey, validMonth } from "./engine/calendar";
import {
  appendChange,
  COLLECTIONS,
  SETTINGS_KEYS,
  snapshotAt,
  uid,
} from "./engine/timeline";
import { CATEGORIES } from "./engine/types";
import type { ChangeTarget, PlanDocument, Simulation } from "./engine/types";

export const FORMAT = "meu-simulador-financeiro";
export const VERSION = 2;
export const STORAGE_KEY = "meu-simulador-financeiro:v2";
export const LEGACY_STORAGE_KEY = "meu-simulador-financeiro:v1";
export const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
function invalid(message: string): never {
  throw new Error(`Arquivo inválido: ${message}`);
}
function object(
  x: unknown,
  label: string,
): asserts x is Record<string, unknown> {
  if (!record(x)) invalid(label);
}
function text(x: unknown, label: string, max = 256): asserts x is string {
  if (typeof x !== "string" || !x.trim() || x.length > max) invalid(label);
}
function number(
  x: unknown,
  label: string,
  min = 0,
  max = 1e9,
  integer = false,
): asserts x is number {
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    x < min ||
    x > max ||
    (integer && !Number.isInteger(x))
  )
    invalid(label);
}
function boolean(x: unknown, label: string) {
  if (typeof x !== "boolean") invalid(label);
}
function oneOf(x: unknown, options: readonly unknown[], label: string) {
  if (!options.includes(x)) invalid(label);
}
function array(x: unknown, label: string, max = 20000): asserts x is unknown[] {
  if (!Array.isArray(x) || x.length > max) invalid(label);
}
function month(x: unknown) {
  if (!validMonth(x)) invalid("competência deve estar no formato AAAA-MM");
}
function date(x: unknown) {
  if (
    typeof x !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(x) ||
    !Number.isFinite(Date.parse(x)) ||
    new Date(x).toISOString() !== x
  )
    invalid("data e hora");
}
function salary(x: unknown) {
  object(x, "salário");
  number(x.gross, "salário bruto");
  oneOf(x.regime, ["CLT", "PJ"], "regime");
}
function validateEntity(target: string, x: unknown) {
  object(x, target);
  text(x.id, "identificador");
  number(x.amount, "valor");
  if (target === "invoice") {
    text(x.card, "identificação do cartão", 120);
    month(x.month);
    oneOf(x.status, ["open", "paid"], "situação da fatura");
    return;
  }
  text(x.name, "nome", 120);
  if (target === "expense") {
    oneOf(x.category, CATEGORIES, "categoria");
    if (x.term !== undefined) {
      object(x.term, "prazo da despesa");
      month(x.term.firstMonth);
      month(x.term.endMonth);
      number(x.term.months, "mensalidades", 1, 600, true);
      if (
        x.term.endMonth !==
        addMonths(x.term.firstMonth as string, (x.term.months as number) - 1)
      )
        invalid("fim da despesa incompatível com as mensalidades");
    }
  } else if (target === "loan") {
    oneOf(x.type, ["payroll", "personal"], "tipo do empréstimo");
    month(x.firstMonth);
    month(x.endMonth);
    number(x.installments, "parcelas", 1, 600, true);
    if (
      x.endMonth !==
      addMonths(x.firstMonth as string, (x.installments as number) - 1)
    )
      invalid("fim do empréstimo incompatível com as parcelas");
  } else if (target === "extra") {
    oneOf(
      x.recurrence,
      ["monthly", "semiannual", "annual", "once"],
      "recorrência",
    );
    if (x.recurrence === "once" || x.month !== undefined) month(x.month);
  }
}
function validateValue(target: ChangeTarget, x: unknown) {
  if (target in COLLECTIONS) {
    if (x !== null) validateEntity(target, x);
    return;
  }
  if (target === "document") {
    if (x !== null && !record(x)) invalid("registro de origem/importação");
    return;
  }
  if (target === "payment") {
    object(x, "pagamento");
    boolean(x.paid, "situação de pagamento");
    return;
  }
  if (target === "reschedule" || target === "projectionStart") {
    month(x);
    return;
  }
  if (target === "salary") {
    salary(x);
    return;
  }
  if (target === "stages") {
    array(x, "etapas", 1000);
    if (!x.length) invalid("ao menos uma etapa");
    const ids = new Set();
    for (const stage of x) {
      object(stage, "etapa");
      salary(stage);
      text(stage.id, "identificador da etapa");
      if (ids.has(stage.id)) invalid("etapas com identificador repetido");
      ids.add(stage.id);
      number(stage.duration, "duração", 1, 600, true);
      oneOf(stage.unit, ["months", "years"], "unidade");
    }
    return;
  }
  if (target === "home") {
    object(x, "imóvel");
    oneOf(x.mode, ["mcmv", "standard"], "modalidade do imóvel");
    for (const key of ["price", "cash", "gross"])
      number(x[key], `imóvel: ${key}`);
    return;
  }
  if (target === "mode") {
    oneOf(x, ["current", "projection"], "modo salarial");
    return;
  }
  if (target === "include13" || target === "includeVacation") {
    boolean(x, target);
    return;
  }
  if (target === "horizon") {
    oneOf(x, [6, 12, 24, 36, 60], "horizonte");
    return;
  }
  if (target === "emergencyMonths") {
    oneOf(x, [6, 8, 12], "meses da reserva de emergência");
    return;
  }
  number(
    x,
    target,
    target === "annualRate" ? -99 : 0,
    target === "annualRate" ? 1000 : 1e9,
  );
}

function validateSimulation(value: unknown): asserts value is Simulation {
  object(value, "estado inicial");
  for (const key of SETTINGS_KEYS) validateValue(key, value[key]);
  for (const [kind, key] of Object.entries(COLLECTIONS)) {
    array(value[key], key, 2000);
    const ids = new Set();
    for (const entity of value[key] as unknown[]) {
      validateEntity(kind, entity);
      const id = (entity as { id: string }).id;
      if (ids.has(id)) invalid("identificador financeiro repetido");
      ids.add(id);
    }
  }
}

export function validateDocument(
  value: unknown,
): asserts value is PlanDocument {
  object(value, "documento");
  if (value.version !== VERSION) invalid("versão de dados não suportada");
  date(value.createdAt);
  month(value.referenceMonth);
  validateSimulation(value.baseline);
  array(value.history, "histórico");
  const targets = [
    ...SETTINGS_KEYS,
    ...Object.keys(COLLECTIONS),
    "payment",
    "reschedule",
    "document",
  ];
  const ids = new Set();
  for (const entry of value.history) {
    object(entry, "alteração");
    text(entry.id, "identificador da alteração");
    if (ids.has(entry.id)) invalid("identificador de histórico repetido");
    ids.add(entry.id);
    date(entry.recordedAt);
    oneOf(
      entry.action,
      [
        "create",
        "edit",
        "close",
        "payment",
        "reschedule",
        "import",
        "migration",
        "initial",
      ],
      "ação",
    );
    oneOf(entry.target, targets, "item alterado");
    text(entry.itemId, "identificador do item");
    text(entry.itemName, "nome do item");
    if (entry.effectiveMonth !== null) month(entry.effectiveMonth);
    else if (
      !["horizon", "emergencyMonths", "document"].includes(String(entry.target))
    )
      invalid("alteração financeira sem competência de validade");
    for (const key of ["before", "after"]) {
      if (!(key in entry)) invalid("valor anterior/novo ausente");
      if (entry[key] !== null)
        validateValue(entry.target as ChangeTarget, entry[key]);
      else if (
        !["document", ...Object.keys(COLLECTIONS)].includes(
          String(entry.target),
        )
      )
        invalid("valor de parâmetro ausente");
    }
    if (String(entry.target) in COLLECTIONS) {
      for (const key of ["before", "after"])
        if (
          entry[key] !== null &&
          (entry[key] as { id: string }).id !== entry.itemId
        )
          invalid("identificador da versão incompatível");
    }
    array(entry.fields, "campos alterados", 1000);
    for (const field of entry.fields) {
      object(field, "campo alterado");
      text(field.field, "nome do campo");
      if (!("before" in field) || !("after" in field))
        invalid("valores do campo ausentes");
    }
  }
  const invoices =
    snapshotAt(value as unknown as PlanDocument, value.referenceMonth as string)
      .invoices ?? [];
  const invoiceKeys = invoices.map(
    (i) => `${i.card.trim().toLocaleLowerCase("pt-BR")}|${i.month}`,
  );
  if (new Set(invoiceKeys).size !== invoiceKeys.length)
    invalid("há duas faturas do mesmo cartão na mesma competência");
}

export function createDocument(
  simulation: Simulation = defaults,
  now = new Date(),
  migrated = false,
): PlanDocument {
  const referenceMonth = monthKey(now);
  const baseline: Simulation = {
    ...structuredClone(simulation),
    loans: simulation.loans ?? [],
    invoices: simulation.invoices ?? [],
    emergencyMonths: simulation.emergencyMonths ?? 6,
    projectionStart: simulation.projectionStart ?? referenceMonth,
  };
  const document: PlanDocument = {
    version: 2,
    createdAt: now.toISOString(),
    referenceMonth,
    baseline,
    history: [],
  };
  return appendChange(
    document,
    {
      action: migrated ? "migration" : "initial",
      target: "document",
      itemId: "initial",
      itemName: migrated
        ? "Estado inicial importado da versão anterior"
        : "Estado inicial de planejamento",
      effectiveMonth: referenceMonth,
      before: null,
      after: {
        sourceVersion: migrated ? 1 : 2,
        referenceMonth,
        state: baseline,
      },
    },
    now,
  );
}

export function exportData(document: PlanDocument, now = new Date()) {
  validateDocument(document);
  return JSON.stringify(
    {
      format: FORMAT,
      version: VERSION,
      exportedAt: now.toISOString(),
      document,
    },
    null,
    2,
  );
}

export function parseImport(text: string): {
  document: PlanDocument;
  exportedAt: string;
} {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return invalid("o conteúdo não é JSON válido");
  }
  object(value, "estrutura de exportação");
  if (value.format !== FORMAT || value.version !== VERSION)
    invalid("formato ou versão não suportada (esperado formato 2)");
  date(value.exportedAt);
  validateDocument(value.document);
  return {
    document: structuredClone(value.document),
    exportedAt: value.exportedAt as string,
  };
}

export function importDocument(
  current: PlanDocument,
  incoming: PlanDocument,
  now = new Date(),
) {
  validateDocument(incoming);
  const month = monthKey(now);
  return appendChange(
    structuredClone(incoming),
    {
      action: "import",
      target: "document",
      itemId: uid(),
      itemName: "Substituição dos dados deste navegador",
      effectiveMonth: month,
      before: {
        state: snapshotAt(current, month),
        referenceMonth: current.referenceMonth,
        historyCount: current.history.length,
      },
      after: {
        state: snapshotAt(incoming, month),
        referenceMonth: incoming.referenceMonth,
        historyCount: incoming.history.length,
      },
    },
    now,
  );
}

export function loadDocument(
  storage: Pick<Storage, "getItem">,
  now = new Date(),
) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw !== null) {
    const document: unknown = JSON.parse(raw);
    validateDocument(document);
    return document;
  }
  const legacy = storage.getItem(LEGACY_STORAGE_KEY);
  return createDocument(
    legacy === null ? defaults : restore(legacy),
    now,
    legacy !== null,
  );
}
