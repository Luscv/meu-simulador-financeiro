import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import {
  createDocument,
  exportData,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
} from "./data";
import { defaults } from "./legacy";
import { addMonths, monthDate, monthKey } from "./engine/calendar";
import { changeEntity, obligations, snapshotAt } from "./engine/timeline";
import { project } from "./engine/calculate";
import type { PlanDocument } from "./engine/types";

const current = monthKey();
const stored = (): PlanDocument =>
  JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const currentState = () => snapshotAt(stored(), current);
beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("fluxos completos do novo planejamento", () => {
  it("digitar várias vezes gera prévia; salvar confirma uma edição completa e descartar não altera os dados", async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = localStorage.getItem(STORAGE_KEY);
    for (const value of ["6", "60", "600", "6500"])
      fireEvent.change(screen.getByLabelText("Salário bruto mensal"), {
        target: { value },
      });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(
      (
        screen.getByRole("button", {
          name: "Exportar dados",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Aplicar alterações" }),
    );
    expect(currentState().salary.gross).toBe(6500);
    expect(stored().history.filter((c) => c.target === "salary")).toHaveLength(
      1,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Exportar dados",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    const confirmed = localStorage.getItem(STORAGE_KEY);
    fireEvent.change(screen.getByLabelText("Máximo planejado por dia"), {
      target: { value: "99" },
    });
    await user.click(screen.getByRole("button", { name: "Descartar prévia" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(confirmed);
  });
  it("uma edição salarial futura respeita a validade após recarregar", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    fireEvent.change(screen.getByLabelText("Salário bruto mensal"), {
      target: { value: "10000" },
    });
    fireEvent.change(screen.getByLabelText("Alterações válidas a partir de"), {
      target: { value: addMonths(current, 2) },
    });
    await user.click(
      screen.getByRole("button", { name: "Aplicar alterações" }),
    );
    expect(currentState().salary.gross).toBe(6000);
    expect(project(stored(), 3, monthDate(current))[2].payroll.gross).toBe(
      10000,
    );
    view.unmount();
    render(<App />);
    expect(currentState().salary.gross).toBe(6000);
    expect(snapshotAt(stored(), addMonths(current, 2)).salary.gross).toBe(
      10000,
    );
  });
  it("cadastra despesa com uma mensalidade e mostra a data final no mesmo card", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await user.type(screen.getByLabelText("Nome da despesa"), "Pós-graduação");
    fireEvent.change(screen.getByLabelText("Valor mensal"), {
      target: { value: "500" },
    });
    await user.click(screen.getByRole("button", { name: "Com prazo" }));
    fireEvent.change(screen.getByLabelText("Primeira cobrança a considerar"), {
      target: { value: current },
    });
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));
    const expense = currentState().expenses.find(
      (e) => e.name === "Pós-graduação",
    )!;
    expect(expense.term).toEqual({
      firstMonth: current,
      months: 1,
      endMonth: current,
    });
    const result = project(stored(), 2, monthDate(current));
    expect(result[0].fixed - result[1].fixed).toBe(500);
    expect(screen.getByText("Pós-graduação")).toBeTruthy();
  });
  it("emprestimo: confirma pagamento sem outro desembolso, persiste e mantém a soma pendente correta", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Adicionar empréstimo" }),
    );
    await user.type(
      screen.getByLabelText("Nome do empréstimo"),
      "Consignado conhecido",
    );
    fireEvent.change(screen.getByLabelText("Valor fixo da parcela"), {
      target: { value: "200" },
    });
    fireEvent.change(
      screen.getByLabelText("Parcelas restantes, incluindo a primeira"),
      { target: { value: "1" } },
    );
    await user.click(screen.getByRole("button", { name: "Salvar empréstimo" }));
    expect(
      project(stored(), 2, monthDate(current)).map((m) => m.loans),
    ).toEqual([200, 0]);
    const before = project(stored(), 12, monthDate(current));
    await user.click(screen.getByText("Parcelas e pagamentos (1 pendentes)"));
    await user.click(screen.getByRole("button", { name: "Marcar paga" }));
    expect(obligations(stored())[0].paid).toBe(true);
    expect(project(stored(), 12, monthDate(current))).toEqual(before);
    expect(
      screen.getByText("Parcelas e pagamentos (0 pendentes)"),
    ).toBeTruthy();
    expect(stored().history.at(-1)?.action).toBe("payment");
  });
  it("faturas vencidas ficam pendentes e o reagendamento move só aquela fatura", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Adicionar fatura" }));
    await user.selectOptions(
      screen.getByLabelText("Identificação do cartão"),
      "Nubank",
    );
    fireEvent.change(screen.getByLabelText("Competência da fatura"), {
      target: { value: addMonths(current, -1) },
    });
    fireEvent.change(screen.getByLabelText("Valor da fatura"), {
      target: { value: "450" },
    });
    await user.click(screen.getByRole("button", { name: "Salvar fatura" }));
    expect(screen.getByText("Vencida · pendente")).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: `Reagendar Nubank ${addMonths(current, -1)}`,
      }),
    );
    fireEvent.change(screen.getByLabelText("Nova competência"), {
      target: { value: addMonths(current, 1) },
    });
    await user.click(
      screen.getByRole("button", { name: "Confirmar reagendamento" }),
    );
    expect(
      project(stored(), 3, monthDate(current)).map((m) => m.invoices),
    ).toEqual([0, 450, 0]);
    expect(stored().history.at(-1)?.action).toBe("reschedule");
    await user.click(screen.getByRole("button", { name: "Marcar paga" }));
    expect(
      project(stored(), 3, monthDate(current)).map((m) => m.invoices),
    ).toEqual([0, 450, 0]);
  });
  it("não aceita segunda fatura do mesmo cartão/competência", async () => {
    const user = userEvent.setup();
    const doc = changeEntity(
      createDocument(defaults),
      "invoice",
      { id: "i", card: "Nubank", month: current, amount: 100, status: "open" },
      current,
      "Nubank",
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Adicionar fatura" }));
    await user.selectOptions(
      screen.getByLabelText("Identificação do cartão"),
      "Nubank",
    );
    await user.click(screen.getByRole("button", { name: "Salvar fatura" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("alert").textContent,
    ).toContain("Já existe uma fatura");
    expect(currentState().invoices).toHaveLength(1);
  });
  it("preserva a identificação antiga ao editar somente o valor da fatura", async () => {
    const user = userEvent.setup();
    const doc = changeEntity(
      createDocument(defaults),
      "invoice",
      {
        id: "old",
        card: "Meu cartão antigo",
        month: current,
        amount: 100,
        status: "open",
      },
      current,
      "Meu cartão antigo",
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    render(<App />);
    await user.click(
      screen.getByRole("button", {
        name: `Editar fatura Meu cartão antigo ${current}`,
      }),
    );
    expect(
      (screen.getByLabelText("Identificação do cartão") as HTMLSelectElement)
        .value,
    ).toBe("Meu cartão antigo");
    fireEvent.change(screen.getByLabelText("Valor da fatura"), {
      target: { value: "150" },
    });
    await user.click(screen.getByRole("button", { name: "Salvar fatura" }));
    expect(currentState().invoices![0]).toMatchObject({
      id: "old",
      card: "Meu cartão antigo",
      amount: 150,
    });
    expect(
      stored()
        .history.at(-1)!
        .fields.map((f) => f.field),
    ).toEqual(["amount"]);
  });
  it("migra v1 sem descartar a cópia antiga e registra somente o estado inicial conhecido", () => {
    const legacy = {
      ...structuredClone(defaults),
      salary: { gross: 7777, regime: "PJ" },
    };
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    render(<App />);
    expect(currentState().salary.gross).toBe(7777);
    expect(stored().history).toHaveLength(1);
    expect(stored().history[0].action).toBe("migration");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(
      JSON.stringify(legacy),
    );
  });
  it("meta selecionada persiste sem alterar os aportes", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    const before = project(stored(), 12, monthDate(current));
    const toggle = screen.getByRole("group", {
      name: "Meses de reserva de emergência",
    });
    await user.click(within(toggle).getByRole("button", { name: "8 meses" }));
    expect(currentState().emergencyMonths).toBe(8);
    expect(project(stored(), 12, monthDate(current))).toEqual(before);
    view.unmount();
    render(<App />);
    expect(
      within(
        screen.getByRole("group", { name: "Meses de reserva de emergência" }),
      )
        .getByRole("button", { name: "8 meses" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("transferência por JSON", () => {
  it("mostra resumo e só substitui os dados depois da confirmação explícita", async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = localStorage.getItem(STORAGE_KEY);
    const incoming = createDocument({
      ...structuredClone(defaults),
      daily: 75,
      emergencyMonths: 12,
    });
    const file = new File([exportData(incoming)], "backup.json", {
      type: "application/json",
    });
    await user.upload(
      screen.getByLabelText("Arquivo JSON para importar"),
      file,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Conferir importação",
    });
    expect(dialog.textContent).toContain("Registros de histórico");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    await user.upload(
      screen.getByLabelText("Arquivo JSON para importar"),
      file,
    );
    const confirmedDialog = await screen.findByRole("dialog", {
      name: "Conferir importação",
    });
    await user.click(
      within(confirmedDialog).getByRole("button", { name: "Substituir dados" }),
    );
    expect(currentState().daily).toBe(75);
    expect(currentState().emergencyMonths).toBe(12);
    expect(stored().history.slice(0, -1)).toEqual(incoming.history);
    expect(stored().history.at(-1)?.action).toBe("import");
    expect(
      (screen.getByLabelText("Máximo planejado por dia") as HTMLInputElement)
        .value,
    ).toBe("75");
  });
  it.each([
    "{quebrado",
    JSON.stringify({ format: "meu-simulador-financeiro", version: 999 }),
  ])(
    "JSON inválido mantém integralmente os dados existentes: %s",
    async (content) => {
      const user = userEvent.setup();
      render(<App />);
      const before = localStorage.getItem(STORAGE_KEY);
      await user.upload(
        screen.getByLabelText("Arquivo JSON para importar"),
        new File([content], "invalido.json", { type: "application/json" }),
      );
      expect((await screen.findByRole("alert")).textContent).toContain(
        "preservados",
      );
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
  it("exporta JSON contendo o documento inteiro, sem alterar o estado", async () => {
    const user = userEvent.setup();
    render(<App />);
    const blobUrls: Blob[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        blobUrls.push(blob);
        return "blob:backup";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const before = localStorage.getItem(STORAGE_KEY);
    await user.click(screen.getByRole("button", { name: "Exportar dados" }));
    expect(click).toHaveBeenCalledTimes(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobUrls[0]);
    });
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(2);
    expect(parsed.document).toEqual(stored());
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}/);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});
