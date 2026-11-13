import { useId, useMemo, useRef, useState } from "react";
import {
  Check,
  CreditCard,
  Download,
  History,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import {
  Assumptions,
  Donut,
  Modal,
  NumberField,
  Segment,
  SectionTitle,
} from "./components";
import { addMonths, monthKey } from "./engine/calendar";
import { emergencyTarget, money } from "./engine/calculate";
import {
  activeExpenses,
  catalog,
  changeEntity,
  confirmPayment,
  entityAt,
  obligations,
  reschedule,
  snapshotAt,
  uid,
} from "./engine/timeline";
import { exportData, parseImport } from "./data";
import { CATEGORIES } from "./engine/types";
import type {
  ChangeAction,
  EntityKind,
  Expense,
  Invoice,
  Loan,
  Obligation,
  PlanDocument,
} from "./engine/types";
import { brl, monthLabel } from "./format";

export const labelMonth = (month: string) => monthLabel(`${month}-01`);
export function MonthField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="month"
        required
        min="1900-01"
        max="9999-12"
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      />
    </div>
  );
}
export function ValidityNote({
  month,
  current,
}: {
  month: string;
  current: string;
}) {
  return (
    <p className={`small ${month < current ? "red-text" : "muted"}`}>
      {month < current
        ? "Correção retroativa: os meses afetados serão recalculados. As versões anteriores permanecem no histórico; projeções não são movimentações realizadas."
        : month > current
          ? "Esta mudança só entra nos cálculos a partir da competência escolhida."
          : "Válido a partir deste mês. As competências anteriores são preservadas."}
    </p>
  );
}
type Commit = (document: PlanDocument) => boolean;

function ExpenseForm({
  value,
  current,
  exists,
  onSave,
  onClose,
}: {
  value: Expense;
  current: string;
  exists: boolean;
  onSave: (e: Expense, month: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [limited, setLimited] = useState(!!value.term);
  const [firstMonth, setFirstMonth] = useState(
    value.term?.firstMonth ?? current,
  );
  const [months, setMonths] = useState(value.term?.months ?? 1);
  const [validFrom, setValidFrom] = useState(current);
  const validity = exists || !limited ? validFrom : firstMonth;
  const end = addMonths(firstMonth, months - 1);
  return (
    <Modal title={exists ? "Editar despesa" : "Nova despesa"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const next = { ...draft, name: draft.name.trim() };
          delete next.term;
          if (limited) next.term = { firstMonth, months, endMonth: end };
          if (next.name) onSave(next, validity);
        }}
      >
        <label className="field">
          Nome da despesa
          <input
            autoFocus
            required
            maxLength={80}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Ex.: Pós-graduação"
          />
        </label>
        <label className="field">
          Categoria
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <NumberField
          label="Valor mensal"
          value={draft.amount}
          onChange={(amount) => setDraft({ ...draft, amount })}
        />
        <Segment
          label="Prazo da despesa"
          value={limited ? "limited" : "unlimited"}
          options={[
            { value: "unlimited", label: "Sem prazo definido" },
            { value: "limited", label: "Com prazo" },
          ]}
          onChange={(v) => setLimited(v === "limited")}
        />
        {limited && (
          <div className="term-fields">
            <MonthField
              label="Primeira cobrança a considerar"
              value={firstMonth}
              onChange={setFirstMonth}
            />
            <NumberField
              label="Mensalidades restantes, incluindo a primeira"
              money={false}
              min={1}
              max={600}
              step="1"
              value={months}
              onChange={(v) => setMonths(Math.round(v))}
            />
            <p className="small">
              Última competência: <strong>{labelMonth(end)}</strong>. As datas
              cadastradas não reiniciam ao abrir o aplicativo.
            </p>
          </div>
        )}
        {(exists || !limited) && (
          <MonthField
            label="Alteração válida a partir de"
            value={validFrom}
            onChange={setValidFrom}
          />
        )}
        <ValidityNote month={validity} current={current} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" type="submit">
            <Check size={16} />
            Salvar despesa
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CloseForm({
  name,
  current,
  onClose,
  onConfirm,
}: {
  name: string;
  current: string;
  onClose: () => void;
  onConfirm: (month: string) => void;
}) {
  const [month, setMonth] = useState(current);
  return (
    <Modal title={`Encerrar ${name}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(month);
        }}
      >
        <MonthField
          label="Encerrar a partir de"
          value={month}
          onChange={setMonth}
        />
        <p className="small">
          A partir dessa competência, novas cobranças deste registro saem da
          projeção. As versões anteriores e os pagamentos continuam
          consultáveis; pendências anteriores não são quitadas automaticamente.
        </p>
        <ValidityNote month={month} current={current} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" type="submit">
            Confirmar encerramento
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ExpensesCard({
  document,
  current,
  fixed,
  annual,
  commit,
}: {
  document: PlanDocument;
  current: string;
  fixed: number;
  annual: number;
  commit: Commit;
}) {
  const [editing, setEditing] = useState<Expense | null>(null),
    [closing, setClosing] = useState<Expense | null>(null);
  const all = catalog<Expense>(document, "expense");
  const items = all.map((latest) => {
    const version = entityAt(
      document,
      "expense",
      latest.id,
      current,
    ) as Expense | null;
    const future = document.history.some(
      (c) =>
        c.target === "expense" &&
        c.itemId === latest.id &&
        c.effectiveMonth! > current &&
        c.after !== null &&
        entityAt(document, "expense", latest.id, c.effectiveMonth!) !== null,
    );
    const closure = [...document.history]
      .reverse()
      .find(
        (c) =>
          c.target === "expense" && c.itemId === latest.id && c.after === null,
      );
    return {
      closure,
      value: version ?? latest,
      ended:
        (!version && !future) ||
        !!(version?.term && version.term.endMonth < current),
      future:
        (!version && future) ||
        !!(version?.term && version.term.firstMonth > current),
    };
  });
  const renderItem = (item: (typeof items)[number]) => (
    <div className="expense-row" key={item.value.id}>
      <span className="expense-indicator" />
      <div>
        <strong>{item.value.name}</strong>
        <span>{item.value.category}</span>
        {item.value.term && (
          <small>
            {labelMonth(item.value.term.firstMonth)} a{" "}
            {labelMonth(item.value.term.endMonth)}
          </small>
        )}
        {item.ended && (
          <small className="status-badge">
            {item.closure
              ? `Encerrado a partir de ${labelMonth(item.closure.effectiveMonth!)}`
              : "Prazo encerrado · histórico preservado"}
          </small>
        )}
        {!item.ended &&
          item.closure?.effectiveMonth &&
          item.closure.effectiveMonth > current && (
            <small>
              Encerramento a partir de {labelMonth(item.closure.effectiveMonth)}
            </small>
          )}
        {item.future && <small className="status-badge">Início futuro</small>}
      </div>
      <strong>{brl(item.value.amount)}</strong>
      {!item.ended && (
        <div className="row-actions">
          <button
            className="icon-button"
            aria-label={`Editar ${item.value.name}`}
            onClick={() => setEditing(item.value)}
          >
            <Pencil size={14} />
          </button>
          <button
            className="icon-button"
            aria-label={`Encerrar ${item.value.name}`}
            onClick={() => setClosing(item.value)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
  return (
    <article className="card fixed-card">
      <div className="card-heading">
        <h3>
          <span className="soft-icon">
            <Wallet size={17} />
          </span>
          Gastos fixos
        </h3>
        <button
          className="button secondary small-button"
          onClick={() =>
            setEditing({ id: uid(), name: "", category: "Moradia", amount: 0 })
          }
        >
          <Plus size={15} />
          Adicionar
        </button>
      </div>
      <div className="fixed-totals">
        <strong>
          {brl(fixed)}
          <small>/ mês atual</small>
        </strong>
        <span>{brl(annual)} / próximos 12 meses</span>
      </div>
      <div className="expense-list">
        {items.filter((i) => !i.ended).map(renderItem)}
        {!items.some((i) => !i.ended) && (
          <p className="empty-state">Nenhuma despesa fixa ativa ou futura.</p>
        )}
      </div>
      {items.some((i) => i.ended) && (
        <details className="archived-records">
          <summary>
            Despesas encerradas ({items.filter((i) => i.ended).length})
          </summary>
          {items.filter((i) => i.ended).map(renderItem)}
        </details>
      )}
      <Donut
        expenses={activeExpenses(snapshotAt(document, current), current)}
      />
      {editing && (
        <ExpenseForm
          value={editing}
          current={current}
          exists={all.some((e) => e.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(expense, month) => {
            if (
              commit(
                changeEntity(document, "expense", expense, month, expense.name),
              )
            )
              setEditing(null);
          }}
        />
      )}
      {closing && (
        <CloseForm
          name={closing.name}
          current={current}
          onClose={() => setClosing(null)}
          onConfirm={(month) => {
            if (
              commit(
                changeEntity(
                  document,
                  "expense",
                  null,
                  month,
                  closing.name,
                  closing.id,
                ),
              )
            )
              setClosing(null);
          }}
        />
      )}
    </article>
  );
}

export function EmergencyCard({
  fixed,
  daily,
  months,
  current,
  onChange,
}: {
  fixed: number;
  daily: number;
  months: 6 | 8 | 12;
  current: string;
  onChange: (n: 6 | 8 | 12) => void;
}) {
  const result = emergencyTarget(fixed, daily, months);
  return (
    <article className="card emergency-card">
      <div className="card-heading">
        <h3>
          <span className="soft-icon">
            <ShieldCheck size={18} />
          </span>
          Reserva de emergência
        </h3>
      </div>
      <Segment
        label="Meses de reserva de emergência"
        value={String(months)}
        onChange={(v) => onChange(Number(v) as 6 | 8 | 12)}
        options={[6, 8, 12].map((n) => ({
          value: String(n),
          label: `${n} meses`,
        }))}
      />
      <div className="stat-list">
        <div>
          <span>Fixos ativos em {labelMonth(current)}</span>
          <strong>{brl(result.fixed)}</strong>
        </div>
        <div>
          <span>Variáveis · diário × 30 dias</span>
          <strong>{brl(result.variable)}</strong>
        </div>
        <div>
          <span>Custo mensal de referência</span>
          <strong>{brl(result.reference)}</strong>
        </div>
      </div>
      <div className="emergency-goal">
        <span>Meta para {months} meses</span>
        <strong>{brl(result.target)}</strong>
      </div>
      <p className="small muted">
        Meta sobre o patrimônio. Não cria despesa nem reduz novamente os
        aportes. Usa 30 dias fixos e não inclui dívidas.
      </p>
    </article>
  );
}

function LoanForm({
  value,
  current,
  exists,
  onClose,
  onSave,
}: {
  value: Loan;
  current: string;
  exists: boolean;
  onClose: () => void;
  onSave: (loan: Loan, month: string) => void;
}) {
  const [draft, setDraft] = useState(value),
    [validity, setValidity] = useState(current);
  const end = addMonths(draft.firstMonth, draft.installments - 1);
  return (
    <Modal
      title={exists ? "Editar empréstimo" : "Novo empréstimo"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.name.trim())
            onSave(
              { ...draft, name: draft.name.trim(), endMonth: end },
              exists ? validity : draft.firstMonth,
            );
        }}
      >
        <label className="field">
          Nome do empréstimo
          <input
            autoFocus
            required
            maxLength={80}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          Tipo de empréstimo
          <select
            value={draft.type}
            onChange={(e) =>
              setDraft({ ...draft, type: e.target.value as Loan["type"] })
            }
          >
            <option value="payroll">Consignado</option>
            <option value="personal">Pessoal</option>
          </select>
        </label>
        <NumberField
          label="Valor fixo da parcela"
          value={draft.amount}
          onChange={(amount) => setDraft({ ...draft, amount })}
        />
        <MonthField
          label="Primeira parcela a considerar"
          value={draft.firstMonth}
          onChange={(firstMonth) => setDraft({ ...draft, firstMonth })}
        />
        <NumberField
          label="Parcelas restantes, incluindo a primeira"
          money={false}
          min={1}
          max={600}
          step="1"
          value={draft.installments}
          onChange={(v) => setDraft({ ...draft, installments: Math.round(v) })}
        />
        <p className="small">
          Última competência: <strong>{labelMonth(end)}</strong>. O prazo
          cadastrado não reinicia com o calendário.
        </p>
        {exists && (
          <MonthField
            label="Alteração válida a partir de"
            value={validity}
            onChange={setValidity}
          />
        )}
        <ValidityNote
          month={exists ? validity : draft.firstMonth}
          current={current}
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary">
            Salvar empréstimo
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceForm({
  value,
  current,
  exists,
  error,
  onClose,
  onSave,
}: {
  error: string;
  value: Invoice;
  current: string;
  exists: boolean;
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Modal title={exists ? "Editar fatura" : "Nova fatura"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.card.trim()) onSave({ ...draft, card: draft.card.trim() });
        }}
      >
        <label className="field">
          Identificação do cartão
          <input
            autoFocus
            required
            maxLength={80}
            value={draft.card}
            onChange={(e) => setDraft({ ...draft, card: e.target.value })}
          />
        </label>
        <MonthField
          label="Competência da fatura"
          value={draft.month}
          onChange={(month) => setDraft({ ...draft, month })}
        />
        <NumberField
          label="Valor da fatura"
          value={draft.amount}
          onChange={(amount) => setDraft({ ...draft, amount })}
        />
        <label className="field">
          Situação
          <select
            value={draft.status}
            onChange={(e) =>
              setDraft({
                ...draft,
                status: e.target.value as Invoice["status"],
              })
            }
          >
            <option value="open">Em aberto</option>
            <option value="paid">Paga</option>
          </select>
        </label>
        <ValidityNote month={draft.month} current={current} />
        {error && (
          <p className="alert warning" role="alert">
            {error}
          </p>
        )}
        <p className="small muted">
          Esta fatura afeta apenas a competência escolhida. Marcar como paga não
          remove seu valor do orçamento.
        </p>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary">
            Salvar fatura
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RescheduleForm({
  obligation,
  current,
  onClose,
  onSave,
}: {
  obligation: Obligation;
  current: string;
  onClose: () => void;
  onSave: (month: string) => void;
}) {
  const [month, setMonth] = useState(current);
  return (
    <Modal title="Reagendar pendência" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(month);
        }}
      >
        <p className="small">
          {obligation.name} · {brl(obligation.amount)} · competência anterior:{" "}
          {labelMonth(obligation.month)}.
        </p>
        <MonthField
          label="Nova competência"
          value={month}
          onChange={setMonth}
        />
        <p className="small muted">
          A obrigação passa a afetar somente o novo mês. A alteração fica no
          histórico e não confirma um pagamento.
        </p>
        <ValidityNote month={month} current={current} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary">
            Confirmar reagendamento
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DebtsSection({
  document,
  current,
  commit,
  loanMonthly,
  invoiceMonthly,
}: {
  document: PlanDocument;
  current: string;
  commit: Commit;
  loanMonthly: number;
  invoiceMonthly: number;
}) {
  const { loans, invoices, schedule } = useMemo(
    () => ({
      loans: catalog<Loan>(document, "loan"),
      invoices: snapshotAt(document, current).invoices ?? [],
      schedule: obligations(document),
    }),
    [document, current],
  );
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null),
    [closing, setClosing] = useState<Loan | null>(null),
    [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null),
    [moving, setMoving] = useState<Obligation | null>(null);
  const [invoiceError, setInvoiceError] = useState("");
  const status = (o: Obligation) =>
    o.paid
      ? "Paga"
      : o.month < current
        ? "Vencida · pendente"
        : o.month === current
          ? "Pendente"
          : "A vencer · pendente";
  const obligationRow = (o: Obligation) => (
    <div className="obligation-row" key={o.id}>
      <div>
        <strong>{labelMonth(o.month)}</strong>
        {o.originalMonth !== o.month && (
          <small>Reagendada de {labelMonth(o.originalMonth)}</small>
        )}
        <span
          className={`status-badge ${!o.paid && o.month < current ? "overdue" : ""}`}
        >
          {status(o)}
        </span>
      </div>
      <strong>{brl(o.amount)}</strong>
      <div className="obligation-actions">
        <button
          className="button secondary small-button"
          onClick={() => commit(confirmPayment(document, o, !o.paid))}
        >
          {o.paid ? "Desfazer pagamento" : "Marcar paga"}
        </button>
        {!o.paid && (
          <button
            className="button text-button"
            aria-label={`Reagendar ${o.name} ${o.month}`}
            onClick={() => setMoving(o)}
          >
            Reagendar
          </button>
        )}
      </div>
    </div>
  );
  return (
    <section id="dividas" className="page-section">
      <SectionTitle
        number="02 / COMPROMISSOS"
        title="Dívidas, com começo e fim"
        description="Parcelas e faturas conhecidas, sem estimar juros ou compras futuras."
      />
      <div className="alert neutral">
        <CreditCard size={18} />
        <span>
          Cadastre aqui apenas valores que ainda não estejam nos gastos fixos ou
          variáveis. O consignado sai uma única vez do orçamento, depois do
          salário líquido.
        </span>
      </div>
      <div className="debt-summary">
        <div>
          <span>Parcelas neste mês</span>
          <strong>{brl(loanMonthly)}</strong>
        </div>
        <div>
          <span>Faturas neste mês</span>
          <strong>{brl(invoiceMonthly)}</strong>
        </div>
        <div>
          <span>Total das parcelas pendentes</span>
          <strong>
            {brl(
              money(
                schedule
                  .filter((o) => o.kind === "loan" && !o.paid)
                  .reduce((sum, o) => sum + o.amount, 0),
              ),
            )}
          </strong>
          <small>Soma cadastrada; não é valor de quitação antecipada.</small>
        </div>
      </div>
      <div className="debts-grid">
        <article className="card">
          <div className="card-heading">
            <h3>Empréstimos</h3>
            <button
              className="button secondary small-button"
              onClick={() =>
                setEditingLoan({
                  id: uid(),
                  name: "",
                  type: "payroll",
                  amount: 0,
                  firstMonth: current,
                  installments: 1,
                  endMonth: current,
                })
              }
            >
              <Plus size={15} />
              Adicionar empréstimo
            </button>
          </div>
          {!loans.length && (
            <p className="empty-state">Nenhum empréstimo cadastrado.</p>
          )}
          {loans.map((loan) => {
            const installments = schedule.filter(
              (o) => o.kind === "loan" && o.itemId === loan.id,
            );
            const active = entityAt(
              document,
              "loan",
              loan.id,
              current,
            ) as Loan | null;
            const closed =
              document.history.some(
                (c) =>
                  c.target === "loan" &&
                  c.itemId === loan.id &&
                  c.after === null &&
                  c.effectiveMonth! <= current,
              ) && !active;
            return (
              <div className="loan-record" key={loan.id}>
                <div className="loan-head">
                  <div>
                    <strong>{loan.name}</strong>
                    <small>
                      {loan.type === "payroll" ? "Consignado" : "Pessoal"} ·{" "}
                      {brl((active ?? loan).amount)} / parcela
                    </small>
                    <small>
                      Última competência:{" "}
                      {labelMonth(
                        installments
                          .map((o) => o.month)
                          .sort()
                          .at(-1) ?? loan.endMonth,
                      )}
                    </small>
                    {closed && (
                      <span className="status-badge">
                        Encerrado · histórico preservado
                      </span>
                    )}
                  </div>
                  <div className="row-actions">
                    {!closed && (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`Editar ${loan.name}`}
                          onClick={() => setEditingLoan(active ?? loan)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Encerrar ${loan.name}`}
                          onClick={() => setClosing(loan)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="small">
                  Total das parcelas pendentes:{" "}
                  <strong>
                    {brl(
                      money(
                        installments
                          .filter((o) => !o.paid)
                          .reduce((sum, o) => sum + o.amount, 0),
                      ),
                    )}
                  </strong>
                </p>
                <details className="installment-details">
                  <summary>
                    Parcelas e pagamentos (
                    {installments.filter((o) => !o.paid).length} pendentes)
                  </summary>
                  <div className="obligation-list">
                    {installments.map(obligationRow)}
                    {!installments.length && (
                      <p className="small muted">
                        Nenhuma parcela vigente. Consulte as versões no
                        histórico.
                      </p>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </article>
        <article className="card">
          <div className="card-heading">
            <h3>Faturas de cartão</h3>
            <button
              className="button secondary small-button"
              onClick={() => {
                setInvoiceError("");
                setEditingInvoice({
                  id: uid(),
                  card: "",
                  month: current,
                  amount: 0,
                  status: "open",
                });
              }}
            >
              <Plus size={15} />
              Adicionar fatura
            </button>
          </div>
          {!invoices.length && (
            <p className="empty-state">Nenhuma fatura cadastrada.</p>
          )}
          {invoices
            .sort((a, b) => a.month.localeCompare(b.month))
            .map((invoice) => (
              <div className="invoice-record" key={invoice.id}>
                <div className="loan-head">
                  <strong>{invoice.card}</strong>
                  <button
                    className="icon-button"
                    aria-label={`Editar fatura ${invoice.card} ${invoice.month}`}
                    onClick={() => {
                      setInvoiceError("");
                      setEditingInvoice(invoice);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                {obligationRow(
                  schedule.find((o) => o.id === `invoice:${invoice.id}`)!,
                )}
              </div>
            ))}
        </article>
      </div>
      <Assumptions>
        <p>
          Reserva mensal = renda disponível − fixos ativos − variáveis −
          parcelas − faturas. O vencimento de um mês não confirma pagamento.
          Pendências continuam identificadas, sem repetição automática nos meses
          seguintes. Marcar paga apenas altera a situação; reagendar desloca a
          única obrigação. Encerrar um empréstimo cancela novas parcelas a
          partir da competência escolhida, preservando as anteriores e suas
          pendências.
        </p>
        <p>
          Estes registros e projeções são planejamento local, não extratos nem
          movimentações financeiras realizadas.
        </p>
      </Assumptions>
      {editingLoan && (
        <LoanForm
          value={editingLoan}
          current={current}
          exists={loans.some((l) => l.id === editingLoan.id)}
          onClose={() => setEditingLoan(null)}
          onSave={(loan, month) => {
            if (commit(changeEntity(document, "loan", loan, month, loan.name)))
              setEditingLoan(null);
          }}
        />
      )}
      {closing && (
        <CloseForm
          name={closing.name}
          current={current}
          onClose={() => setClosing(null)}
          onConfirm={(month) => {
            if (
              commit(
                changeEntity(
                  document,
                  "loan",
                  null,
                  month,
                  closing.name,
                  closing.id,
                ),
              )
            )
              setClosing(null);
          }}
        />
      )}
      {editingInvoice && (
        <InvoiceForm
          error={invoiceError}
          value={editingInvoice}
          current={current}
          exists={invoices.some((i) => i.id === editingInvoice.id)}
          onClose={() => setEditingInvoice(null)}
          onSave={(invoice) => {
            if (
              invoices.some(
                (i) =>
                  i.id !== invoice.id &&
                  i.card.trim().toLocaleLowerCase("pt-BR") ===
                    invoice.card.trim().toLocaleLowerCase("pt-BR") &&
                  i.month === invoice.month,
              )
            ) {
              setInvoiceError(
                "Já existe uma fatura deste cartão nesta competência. Edite a fatura cadastrada.",
              );
              return;
            }
            if (
              commit(
                changeEntity(
                  document,
                  "invoice",
                  invoice,
                  invoice.month,
                  invoice.card,
                ),
              )
            )
              setEditingInvoice(null);
          }}
        />
      )}
      {moving && (
        <RescheduleForm
          obligation={moving}
          current={current}
          onClose={() => setMoving(null)}
          onSave={(month) => {
            if (commit(reschedule(document, moving, month))) setMoving(null);
          }}
        />
      )}
    </section>
  );
}

const ACTIONS: Record<ChangeAction, string> = {
  create: "Criação",
  edit: "Edição confirmada",
  close: "Encerramento",
  payment: "Pagamento / situação",
  reschedule: "Reagendamento",
  import: "Importação de dados",
  migration: "Migração da versão anterior",
  initial: "Estado inicial",
};
const FIELD_LABELS: Record<string, string> = {
  registro: "Registro completo",
  gross: "Salário bruto",
  regime: "Regime",
  amount: "Valor",
  name: "Nome",
  category: "Categoria",
  term: "Prazo",
  firstMonth: "Primeira competência",
  endMonth: "Última competência",
  months: "Mensalidades",
  installments: "Parcelas",
  month: "Competência",
  card: "Cartão",
  status: "Situação",
  paid: "Pago",
  type: "Tipo",
  price: "Valor do imóvel",
  cash: "Entrada em dinheiro",
  mode: "Modo",
  duration: "Duração",
  unit: "Unidade",
  state: "Estado",
  referenceMonth: "Competência de referência",
  historyCount: "Registros de histórico",
  salary: "Salário",
  stages: "Etapas salariais",
  daily: "Gasto diário",
  initialBalance: "Saldo informado da reserva",
  fgts: "Saldo informado do FGTS",
  annualRate: "Rendimento anual",
  include13: "Investir 13º",
  includeVacation: "Investir adicional de férias",
  emergencyMonths: "Meses da reserva de emergência",
  projectionStart: "Início das etapas",
  horizon: "Horizonte",
  home: "Imóvel",
};
const VALUE_LABELS: Record<string, string> = {
  payroll: "Consignado",
  personal: "Pessoal",
  open: "Em aberto",
  paid: "Paga",
  projection: "Projeção salarial",
  current: "Salário atual",
  monthly: "Mensal",
  semiannual: "Semestral",
  annual: "Anual",
  months: "Meses",
  years: "Anos",
};
const showValue = (value: unknown) =>
  value === null
    ? "—"
    : typeof value === "boolean"
      ? value
        ? "Sim"
        : "Não"
      : typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : (VALUE_LABELS[String(value)] ?? String(value));
export function HistoryPanel({ document }: { document: PlanDocument }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="card history-panel"
      id="historico"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <History size={18} />
        <strong>Histórico de alterações</strong>
        <span>{document.history.length} registros</span>
      </summary>
      {open && (
        <div>
          <p className="small muted">
            Registrado em indica quando você confirmou; válido a partir de
            indica a competência financeira. Versões e correções preservam as
            premissas, sem tratar projeções como transações realizadas. Este
            histórico é local e editável por quem tem acesso aos dados.
          </p>
          <div className="history-list">
            {[...document.history].reverse().map((change) => (
              <details key={change.id} className="history-entry">
                <summary>
                  <span>
                    <strong>
                      {ACTIONS[change.action]} · {change.itemName}
                    </strong>
                    <small>
                      Registrado em{" "}
                      {new Date(change.recordedAt).toLocaleString("pt-BR")} ·{" "}
                      {change.effectiveMonth
                        ? `válido a partir de ${labelMonth(change.effectiveMonth)}`
                        : "opção de visualização"}
                    </small>
                  </span>
                </summary>
                <p className="small muted">ID: {change.id}</p>
                {change.fields.length === 0 && (
                  <p className="small muted">
                    Operação confirmada com os mesmos valores.
                  </p>
                )}
                <div className="history-fields">
                  {change.fields.map((field, i) => (
                    <div key={i}>
                      <strong>
                        {field.field
                          .split(".")
                          .map((key) => FIELD_LABELS[key] ?? key)
                          .join(" → ")}
                      </strong>
                      <div>
                        <span>Antes</span>
                        <pre>{showValue(field.before)}</pre>
                      </div>
                      <div>
                        <span>Depois</span>
                        <pre>{showValue(field.after)}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </details>
  );
}

export function DataTransfer({
  document,
  disabled,
  onImport,
}: {
  document: PlanDocument;
  disabled: boolean;
  onImport: (document: PlanDocument) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    sequence = useRef(0);
  const [pending, setPending] = useState<ReturnType<typeof parseImport> | null>(
      null,
    ),
    [error, setError] = useState("");
  function download() {
    const url = URL.createObjectURL(
      new Blob([exportData(document)], { type: "application/json" }),
    );
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `meu-simulador-financeiro-${monthKey()}.json`;
    window.document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function read(file: File) {
    const operation = ++sequence.current;
    setError("");
    setPending(null);
    try {
      if (!/\.json$/i.test(file.name) || file.size > 10 * 1024 * 1024)
        throw new Error("Selecione um arquivo JSON de até 10 MB.");
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Não foi possível ler o arquivo."));
        reader.readAsText(file);
      });
      const parsed = parseImport(text);
      if (sequence.current === operation) setPending(parsed);
    } catch (e) {
      if (sequence.current === operation)
        setError(e instanceof Error ? e.message : "Arquivo inválido.");
    }
  }
  return (
    <div className="data-transfer">
      <div className="data-buttons">
        <button
          className="button secondary small-button"
          disabled={disabled}
          onClick={download}
        >
          <Download size={14} />
          Exportar dados
        </button>
        <button
          className="button secondary small-button"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Upload size={14} />
          Importar dados
        </button>
        <input
          className="sr-only"
          type="file"
          disabled={disabled}
          accept=".json,application/json"
          aria-label="Arquivo JSON para importar"
          ref={input}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void read(file);
          }}
        />
      </div>
      <small>
        Os dados ficam neste navegador. Para transferir ou guardar uma cópia,
        use a exportação.
        {disabled &&
          " Confirme ou descarte a prévia antes de transferir dados."}
      </small>
      {error && (
        <div className="alert warning" role="alert">
          {error} Os dados existentes foram preservados.
        </div>
      )}
      {pending && (
        <Modal title="Conferir importação" onClose={() => setPending(null)}>
          <p className="small">
            Arquivo do formato 2, exportado em{" "}
            {new Date(pending.exportedAt).toLocaleString("pt-BR")}.
          </p>
          <ul className="import-summary">
            {(
              Object.entries({
                expense: "Despesas",
                loan: "Empréstimos",
                invoice: "Faturas",
                extra: "Receitas extras",
              }) as [EntityKind, string][]
            ).map(([kind, label]) => (
              <li key={kind}>
                {label}:{" "}
                <strong>{catalog(pending.document, kind).length}</strong>
              </li>
            ))}
            <li>
              Etapas salariais:{" "}
              <strong>
                {snapshotAt(pending.document, monthKey()).stages.length}
              </strong>
            </li>
            <li>
              Registros de histórico:{" "}
              <strong>{pending.document.history.length}</strong>
            </li>
            <li>
              Referência inicial:{" "}
              <strong>{labelMonth(pending.document.referenceMonth)}</strong>
            </li>
          </ul>
          <p className="small">
            Confirma substituir todos os dados deste navegador pelo arquivo? Não
            haverá mesclagem. Exporte uma cópia dos dados atuais antes, se
            quiser preservá-los.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setPending(null)}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              onClick={() => {
                onImport(pending.document);
                setPending(null);
              }}
            >
              Substituir dados
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
