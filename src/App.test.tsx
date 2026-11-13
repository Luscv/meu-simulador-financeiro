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
import { defaults, restore, STORAGE_KEY } from "./state";

beforeEach(() => {
  localStorage.clear();
  // jsdom has no browser top-layer implementation. Native dialog remains used in production.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("interações e persistência", () => {
  it("atualiza os cálculos automaticamente e mantém o salário imobiliário independente", async () => {
    const user = userEvent.setup();
    render(<App />);
    const homeSalary = screen.getByLabelText(
      "Salário bruto na época da compra",
    ) as HTMLInputElement;
    expect(homeSalary.value).toBe("8000");
    fireEvent.change(screen.getByLabelText("Salário bruto mensal"), {
      target: { value: "10000" },
    });
    expect(homeSalary.value).toBe("8000");
    expect(screen.getAllByText(/7\.442,36/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Projeção salarial" }));
    fireEvent.change(screen.getByLabelText("Salário bruto · etapa 1"), {
      target: { value: "5000" },
    });
    expect(homeSalary.value).toBe("8000");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.stages[0].gross).toBe(5000);
    expect(saved.home.gross).toBe(8000);
    expect(saved.mode).toBe("projection");
  });
  it("adiciona, edita e exclui etapas salariais mantendo ao menos uma", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Projeção salarial" }));
    await user.click(screen.getByRole("button", { name: "Adicionar etapa" }));
    expect(screen.getByLabelText("Salário bruto · etapa 3")).toBeTruthy();
    const regime = screen.getByRole("group", { name: "Regime · etapa 3" });
    await user.click(within(regime).getByRole("button", { name: "PJ" }));
    expect(screen.getByLabelText("Faturamento PJ · etapa 3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remover etapa 2" }));
    await user.click(screen.getByRole("button", { name: "Remover etapa 2" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Remover etapa 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("cadastra, edita e exclui uma despesa e atualiza totais", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Nome da despesa"),
      "Curso de idiomas",
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Categoria"),
      "Educação",
    );
    fireEvent.change(within(dialog).getByLabelText("Valor mensal"), {
      target: { value: "250" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Salvar despesa" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Curso de idiomas")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Editar Curso de idiomas" }),
    );
    fireEvent.change(screen.getByLabelText("Valor mensal"), {
      target: { value: "300" },
    });
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).expenses.at(-1).amount,
    ).toBe(300);
    await user.click(
      screen.getByRole("button", { name: "Excluir Curso de idiomas" }),
    );
    expect(screen.queryByText("Curso de idiomas")).toBeNull();
  });
  it("adiciona e exclui receitas extras, altera opções e horizonte", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Adicionar receita" }));
    await user.type(screen.getByLabelText("Nome da receita"), "Projeto extra");
    fireEvent.change(screen.getByLabelText("Valor líquido"), {
      target: { value: "500" },
    });
    await user.selectOptions(
      screen.getByLabelText("Recorrência"),
      "semiannual",
    );
    await user.click(screen.getByRole("button", { name: "Salvar receita" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).extras[0].recurrence,
    ).toBe("semiannual");
    await user.click(screen.getByRole("switch", { name: "Investir 13º" }));
    await user.selectOptions(
      screen.getByLabelText("Horizonte da projeção"),
      "60",
    );
    expect(screen.getByText("60 meses")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).include13).toBe(
      false,
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir Projeto extra" }),
    );
    expect(screen.queryByText("Projeto extra")).toBeNull();
  });
  it("restaura as entradas após remontar a aplicação", () => {
    const saved = {
      ...structuredClone(defaults),
      salary: { gross: 8500, regime: "PJ" },
      home: { ...defaults.home, gross: 7500 },
      fgts: 2500,
      horizon: 6,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const firstRender = render(<App />);
    expect(
      (screen.getByLabelText("Faturamento mensal PJ") as HTMLInputElement)
        .value,
    ).toBe("8500");
    firstRender.unmount();
    render(<App />);
    expect(
      (
        screen.getByLabelText(
          "Salário bruto na época da compra",
        ) as HTMLInputElement
      ).value,
    ).toBe("7500");
    expect(
      (screen.getByLabelText("Horizonte da projeção") as HTMLSelectElement)
        .value,
    ).toBe("6");
    expect(
      (screen.getByLabelText("Saldo atual do FGTS") as HTMLInputElement).value,
    ).toBe("2500");
  });
  it("aumentar FGTS altera entrada do imóvel sem alterar salário ou reserva", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Saldo atual do FGTS"), {
      target: { value: "20000" },
    });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.home.gross).toBe(defaults.home.gross);
    expect(saved.initialBalance).toBe(defaults.initialBalance);
    fireEvent.change(screen.getByLabelText("Entrada em dinheiro"), {
      target: { value: "250000" },
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).initialBalance).toBe(
      defaults.initialBalance,
    );
  });
  it("segue funcional quando o navegador bloqueia localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<App />);
    expect(screen.getByText("Armazenamento indisponível")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Salário bruto mensal"), {
      target: { value: "3000" },
    });
    expect(
      (screen.getByLabelText("Salário bruto mensal") as HTMLInputElement).value,
    ).toBe("3000");
  });
});

describe("validação de estado salvo", () => {
  it("ignora JSON quebrado e estrutura inválida", () => {
    expect(restore("{oops")).toEqual(defaults);
    expect(restore("null")).toEqual(defaults);
    expect(restore("[]")).toEqual(defaults);
  });
  it("valida campos aninhados, números negativos, listas e horizonte", () => {
    const state = restore(
      JSON.stringify({
        salary: null,
        stages: [],
        home: false,
        horizon: 999,
        initialBalance: -100,
        expenses: [
          null,
          { id: "x", name: "<script>", category: "x", amount: -10 },
        ],
        extras: ["invalid", null],
      }),
    );
    expect(state.salary).toEqual(defaults.salary);
    expect(state.home).toEqual(defaults.home);
    expect(state.horizon).toBe(12);
    expect(state.initialBalance).toBe(0);
    expect(state.stages.length).toBe(2);
    expect(state.expenses[0].category).toBe("Outros");
    expect(state.expenses[0].amount).toBe(0);
    expect(state.extras).toEqual([]);
  });
});
