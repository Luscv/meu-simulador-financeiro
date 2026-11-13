import { describe, expect, it } from "vitest";
import {
  createDocument,
  exportData,
  LEGACY_STORAGE_KEY,
  loadDocument,
  parseImport,
  STORAGE_KEY,
  validateDocument,
} from "./data";
import { defaults } from "./legacy";
import { changeEntity, changeSettings, snapshotAt } from "./engine/timeline";

const now = new Date("2026-11-13T12:00:00.000Z");
const doc = () => createDocument(defaults, now);
describe("formato JSON validado e migração", () => {
  it("migra todos os dados antigos sem inventar alterações anteriores", () => {
    const legacy = {
      ...structuredClone(defaults),
      salary: { gross: 8000, regime: "PJ" as const },
      initialBalance: 12345,
      fgts: 2345,
    };
    const storage = {
      getItem: (key: string) =>
        key === LEGACY_STORAGE_KEY ? JSON.stringify(legacy) : null,
    };
    const migrated = loadDocument(storage, now);
    expect(migrated.baseline).toMatchObject(legacy);
    expect(migrated.version).toBe(2);
    expect(migrated.history).toHaveLength(1);
    expect(migrated.history[0].action).toBe("migration");
    expect(migrated.history[0].itemName).toContain("versão anterior");
    expect(migrated.history[0].before).toBeNull();
    expect(migrated.referenceMonth).toBe("2026-11");
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(JSON.stringify(legacy));
    validateDocument(migrated);
  });
  it("o arquivo inclui versão, data, referência inicial e todo o histórico", () => {
    const value = changeSettings(
      doc(),
      { daily: 99, emergencyMonths: 8 },
      "2027-01",
    );
    const file = JSON.parse(exportData(value, now));
    expect(file.version).toBe(2);
    expect(file.exportedAt).toBe(now.toISOString());
    expect(file.document).toEqual(value);
    expect(parseImport(JSON.stringify(file)).document).toEqual(value);
  });
  it.each([
    [
      "JSON quebrado",
      (f: Record<string, unknown>) => {
        f.document = null;
      },
    ],
    [
      "versão desconhecida",
      (f: Record<string, unknown>) => {
        f.version = 99;
      },
    ],
    [
      "nome de formato errado",
      (f: Record<string, unknown>) => {
        f.format = "outro";
      },
    ],
    [
      "data de exportação inválida",
      (f: Record<string, unknown>) => {
        f.exportedAt = "ontem";
      },
    ],
  ])("rejeita %s sem modificar o documento existente", (_, modify) => {
    const current = doc(),
      before = JSON.stringify(current),
      file = JSON.parse(exportData(current, now));
    modify(file);
    expect(() => parseImport(JSON.stringify(file))).toThrow("Arquivo inválido");
    expect(JSON.stringify(current)).toBe(before);
  });
  it.each([
    [
      "salário como texto",
      (d: ReturnType<typeof doc>) => {
        (d.baseline.salary as unknown as { gross: unknown }).gross = "6000";
      },
    ],
    [
      "meses inválidos",
      (d: ReturnType<typeof doc>) => {
        d.referenceMonth = "2026-13";
      },
    ],
    [
      "histórico ausente",
      (d: ReturnType<typeof doc>) => {
        delete (d as unknown as Record<string, unknown>).history;
      },
    ],
    [
      "taxa não numérica",
      (d: ReturnType<typeof doc>) => {
        (d.baseline as unknown as { annualRate: unknown }).annualRate = null;
      },
    ],
    [
      "meta fora das opções",
      (d: ReturnType<typeof doc>) => {
        (
          d.baseline as unknown as { emergencyMonths: unknown }
        ).emergencyMonths = 9;
      },
    ],
    [
      "ação desconhecida",
      (d: ReturnType<typeof doc>) => {
        (d.history[0] as unknown as { target: unknown }).target = "__proto__";
      },
    ],
    [
      "id de histórico repetido",
      (d: ReturnType<typeof doc>) => {
        d.history.push(structuredClone(d.history[0]));
      },
    ],
  ])("valida profundamente: %s", (_, modify) => {
    const value = doc();
    modify(value);
    expect(() =>
      parseImport(
        JSON.stringify({
          format: "meu-simulador-financeiro",
          version: 2,
          exportedAt: now.toISOString(),
          document: value,
        }),
      ),
    ).toThrow("Arquivo inválido");
  });
  it("rejeita fim incompatível com a contagem, números negativos e pagamentos inválidos", () => {
    const value = doc();
    value.baseline.loans = [
      {
        id: "x",
        name: "Empréstimo",
        type: "personal",
        amount: 100,
        firstMonth: "2026-11",
        installments: 1,
        endMonth: "2026-12",
      },
    ];
    expect(() => validateDocument(value)).toThrow("fim do empréstimo");
    value.baseline.loans[0].endMonth = "2026-11";
    value.baseline.loans[0].amount = -1;
    expect(() => validateDocument(value)).toThrow("valor");
  });
  it("rejeita faturas duplicadas por cartão/competência sem apagar a primeira", () => {
    const a = changeEntity(
      doc(),
      "invoice",
      {
        id: "a",
        card: "Meu cartão",
        month: "2026-11",
        amount: 200,
        status: "open",
      },
      "2026-11",
      "Meu cartão",
    );
    const b = changeEntity(
      a,
      "invoice",
      {
        id: "b",
        card: "MEU CARTÃO",
        month: "2026-11",
        amount: 300,
        status: "paid",
      },
      "2026-11",
      "Meu cartão",
    );
    expect(() => validateDocument(b)).toThrow("duas faturas");
    expect(snapshotAt(a, "2026-11").invoices).toHaveLength(1);
  });
  it("prioriza os dados v2 e mantém datas ao recarregar", () => {
    const value = changeSettings(
      doc(),
      { salary: { gross: 12000, regime: "PJ" } },
      "2027-02",
    );
    const loaded = loadDocument(
      {
        getItem: (key) =>
          key === STORAGE_KEY
            ? JSON.stringify(value)
            : JSON.stringify(defaults),
      },
      new Date(2027, 0, 1),
    );
    expect(loaded).toEqual(value);
    expect(snapshotAt(loaded, "2027-01").salary.gross).toBe(6000);
    expect(snapshotAt(loaded, "2027-02").salary.gross).toBe(12000);
  });
});
