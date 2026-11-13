import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCheck,
  CircleHelp,
  Coins,
  CreditCard,
  House,
  LayoutDashboard,
  Leaf,
  LockKeyhole,
  MapPin,
  Pencil,
  PiggyBank,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  Assumptions,
  EvolutionChart,
  Metric,
  Modal,
  NumberField,
  SectionTitle,
  Segment,
  Toggle,
} from "./components";
import {
  housing,
  payroll,
  project,
  projectionMonths,
} from "./engine/calculate";
import { RULES, SOURCES } from "./engine/rules";
import type { Extra } from "./engine/types";
import { brl, monthLabel, percent } from "./format";
import { HORIZONS, useCurrentMonth, useSimulation } from "./state";
import { monthDate } from "./engine/calendar";
import { catalog, changeEntity, snapshotAt } from "./engine/timeline";
import {
  CloseForm,
  DataTransfer,
  DebtsSection,
  EmergencyCard,
  ExpensesCard,
  HistoryPanel,
  MonthField,
  ValidityNote,
} from "./financial-ui";

const regimeOptions = [
  { value: "CLT" as const, label: "CLT" },
  { value: "PJ" as const, label: "PJ" },
];
const id = () => crypto.randomUUID();

function ExtraEditor({
  current,
  value,
  onSave,
  onClose,
}: {
  current: string;
  value: Extra;
  onSave: (e: Extra, month: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [validFrom, setValidFrom] = useState(value.month ?? current);
  return (
    <Modal
      title={value.name ? "Editar receita extra" : "Nova receita extra"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.name.trim()) {
            const { month: _month, ...extra } = draft;
            onSave(
              {
                ...extra,
                name: draft.name.trim(),
                ...(draft.recurrence === "once" ? { month: validFrom } : {}),
              },
              validFrom,
            );
          }
        }}
      >
        <label className="field">
          Nome da receita
          <input
            autoFocus
            required
            maxLength={80}
            value={draft.name}
            placeholder="Ex.: Trabalho extra"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <NumberField
          label="Valor líquido"
          value={draft.amount}
          onChange={(amount) => setDraft({ ...draft, amount })}
        />
        <label className="field">
          Recorrência
          <select
            value={draft.recurrence}
            onChange={(e) =>
              setDraft({
                ...draft,
                recurrence: e.target.value as Extra["recurrence"],
              })
            }
          >
            <option value="monthly">Mensal</option>
            <option value="semiannual">Semestral</option>
            <option value="annual">Anual</option>
            <option value="once">Única</option>
          </select>
        </label>
        <MonthField
          label={
            draft.recurrence === "once"
              ? "Competência da entrada única"
              : "Alteração válida a partir de"
          }
          value={validFrom}
          onChange={setValidFrom}
        />
        {draft.recurrence === "once" && (
          <p className="small muted">
            Soma à renda da projeção e à reserva apenas nesta competência, sem
            repetição.
          </p>
        )}
        <ValidityNote month={validFrom} current={current} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" type="submit">
            <Check size={16} />
            Salvar receita
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function App() {
  const currentMonth = useCurrentMonth();
  const workspace = useSimulation(currentMonth);
  const {
    document: plan,
    state: s,
    preview,
    update,
    commit,
    storageOk,
  } = workspace;
  const start = useMemo(() => monthDate(currentMonth), [currentMonth]);
  const salaryStart =
    snapshotAt(preview, workspace.effectiveMonth).projectionStart ??
    currentMonth;
  const period = useMemo(
    () =>
      s.mode === "projection"
        ? projectionMonths(preview, currentMonth)
        : s.horizon,
    [preview, currentMonth, s.mode, s.horizon],
  );
  const allRows = useMemo(
    () => project(preview, Math.max(12, period), start),
    [preview, period, start],
  );
  const rows = allRows.slice(0, period),
    first = rows[0],
    last = rows.at(-1)!,
    p = first.payroll;
  const annualRows = allRows.slice(0, 12);
  const annualReserve = annualRows.reduce((sum, m) => sum + m.budget, 0);
  const annualVariable = annualRows.reduce((sum, m) => sum + m.variable, 0);
  const home = useMemo(() => housing(s.home, last.fgts), [s.home, last.fgts]);
  const horizon =
    s.mode === "projection"
      ? `${period} ${period === 1 ? "mês" : "meses"}`
      : HORIZONS.find((h) => h.value === s.horizon)!.label;
  const extras = useMemo(() => {
    const entries = new Map(s.extras.map((e) => [e.id, e]));
    for (const e of catalog<Extra>(preview, "extra")) {
      if (
        e.recurrence === "once" &&
        e.month &&
        e.month > currentMonth &&
        snapshotAt(preview, e.month).extras.some((item) => item.id === e.id)
      )
        entries.set(e.id, e);
    }
    return [...entries.values()];
  }, [s.extras, preview, currentMonth]);
  const [editingExtra, setEditingExtra] = useState<Extra | null>(null);
  const [closingExtra, setClosingExtra] = useState<Extra | null>(null);
  const [active, setActive] = useState("visao-geral");
  const nav = [
    { key: "visao-geral", label: "Visão geral", icon: LayoutDashboard },
    { key: "renda", label: "Minha renda", icon: BriefcaseBusiness },
    { key: "orcamento", label: "Meu orçamento", icon: Wallet },
    { key: "dividas", label: "Dívidas", icon: CreditCard },
    { key: "investimentos", label: "Investimentos", icon: TrendingUp },
    { key: "patrimonio", label: "Patrimônio e FGTS", icon: ShieldCheck },
    { key: "imovel", label: "Meu imóvel", icon: House },
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#visao-geral"
          aria-label="Meu Simulador Financeiro, início"
        >
          <span className="brand-icon">
            <BarChart3 size={23} />
          </span>
          <span>
            meu simulador
            <strong>
              financeiro<span className="brand-period">.</span>
            </strong>
          </span>
        </a>
        <div className="sidebar-caption">SEU PLANEJAMENTO</div>
        <nav aria-label="Navegação principal">
          {nav.map(({ key, label, icon: Icon }) => (
            <a
              key={key}
              href={`#${key}`}
              className={active === key ? "active" : ""}
              aria-current={active === key ? "location" : undefined}
              onClick={() => setActive(key)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {active === key && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="grow-note">
            <span className="leaf-icon">
              <Leaf size={20} />
            </span>
            <strong>Um passo de cada vez.</strong>
            <p>
              Pequenas escolhas hoje.
              <br />
              Mais possibilidades amanhã.
            </p>
          </div>
          <a className="help-link" href="#premissas">
            <CircleHelp size={17} />
            Premissas e fontes
            <ArrowUpRight size={14} />
          </a>
          <div className="local-note">
            <LockKeyhole size={13} />
            <span>
              Seus dados ficam só
              <br />
              neste navegador.
            </span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="topbar-label">Meu planejamento</span>
            <span className="topbar-divider">/</span>
            <span>Visão geral</span>
          </div>
          <div
            className={`saved ${storageOk ? "" : "save-error"}`}
            role="status"
          >
            {storageOk ? <CheckCheck size={15} /> : <X size={15} />}
            <span>
              {storageOk
                ? "Salvo neste navegador"
                : "Armazenamento indisponível"}
            </span>
          </div>
        </header>
        <main id="conteudo">
          <section id="visao-geral" className="overview-section">
            <div className="hero">
              <div>
                <div className="eyebrow">
                  <span />
                  MAIS CLAREZA, MAIS POSSIBILIDADES
                </div>
                <h1>
                  Seu dinheiro, <span>um bom plano.</span>
                </h1>
                <p>Entenda seu presente. Visualize o que vem pela frente.</p>
              </div>
              <div className="date-chip">
                <CalendarDays size={16} />
                <span>
                  {start.toLocaleDateString("pt-BR", {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
            <div className="global-controls">
              <Segment
                label="Modo global de renda"
                className="mode-toggle"
                value={s.mode}
                onChange={(v) => update("mode", v)}
                options={[
                  {
                    value: "current",
                    label: (
                      <>
                        <BriefcaseBusiness size={16} />
                        Salário atual
                      </>
                    ),
                  },
                  {
                    value: "projection",
                    label: (
                      <>
                        <TrendingUp size={16} />
                        Projeção salarial
                      </>
                    ),
                  },
                ]}
              />
              {s.mode === "projection" ? (
                <div className="horizon-select automatic-horizon">
                  <span>Período automático</span>
                  <strong aria-label="Período automático da projeção">
                    {horizon}
                  </strong>
                </div>
              ) : (
                <label className="horizon-select">
                  <span>Projetar por</span>
                  <select
                    aria-label="Horizonte da projeção"
                    value={s.horizon}
                    onChange={(e) => update("horizon", Number(e.target.value))}
                  >
                    {HORIZONS.map((h) => (
                      <option key={h.value} value={h.value}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <DataTransfer
              document={plan}
              disabled={workspace.dirty}
              onImport={workspace.replace}
            />
            {plan.history.some(
              (c) =>
                c.action === "edit" &&
                c.effectiveMonth !== null &&
                c.effectiveMonth > currentMonth,
            ) && (
              <p className="small scheduled-note">
                Há alterações confirmadas com validade futura. Elas entram nas
                respectivas competências da projeção.{" "}
                <a href="#historico">Ver histórico.</a>
              </p>
            )}
            {workspace.dirty && (
              <div
                id="confirmar-alteracoes"
                className="confirm-settings"
                role="region"
                aria-label="Confirmar alterações financeiras"
              >
                <div>
                  <strong>Prévia de alterações ainda não confirmadas</strong>
                  <p className="small">
                    Os resultados acompanham a prévia. Confirme para salvar e
                    registrar uma alteração completa no histórico.
                  </p>
                </div>
                <MonthField
                  label="Alterações válidas a partir de"
                  value={workspace.effectiveMonth}
                  onChange={workspace.setEffectiveMonth}
                />
                <ValidityNote
                  month={workspace.effectiveMonth}
                  current={currentMonth}
                />
                <div className="confirm-actions">
                  <button
                    className="button secondary"
                    onClick={workspace.discard}
                  >
                    Descartar prévia
                  </button>
                  <button
                    className="button primary"
                    onClick={workspace.confirm}
                  >
                    Aplicar alterações
                  </button>
                </div>
              </div>
            )}
            {workspace.error && (
              <div className="alert warning" role="alert">
                {workspace.error}
              </div>
            )}
            <div className="metrics-grid">
              <Metric
                label="Renda disponível"
                value={brl(first.income)}
                note={
                  <>
                    <span className="tiny-dot green" />
                    {p.regime === "CLT"
                      ? "Salário líquido CLT"
                      : "Disponível PJ estimado"}{" "}
                    · mês inicial
                  </>
                }
                icon={<Wallet size={18} />}
              />
              <Metric
                label="Gastos mensais"
                value={brl(first.spending)}
                note={<>Fixos, variáveis e dívidas · {first.days} dias</>}
                icon={<ArrowDownLeft size={18} />}
              />
              <Metric
                label={first.budget < 0 ? "Déficit mensal" : "Reserva mensal"}
                value={brl(first.budget)}
                note={
                  first.income > 0 ? (
                    <>
                      {percent((first.budget / first.income) * 100)} da renda
                      disponível
                    </>
                  ) : (
                    <>Renda disponível igual a zero</>
                  )
                }
                icon={<PiggyBank size={18} />}
                danger={first.budget < 0}
              />
              <Metric
                label="Patrimônio projetado"
                value={brl(last.wealth)}
                note={
                  <>
                    Reserva + FGTS em {horizon}
                    <ArrowUpRight size={15} />
                  </>
                }
                icon={<TrendingUp size={18} />}
                dark
              />
            </div>
            {allRows.some((m) => !m.payroll.supported) && (
              <div className="alert warning">
                O cenário PJ suporta faturamento de até R$ 300.000/mês
                (sublimite de R$ 3,6 milhões/ano). Nos meses acima desse limite,
                a renda não é estimada. Reduza o valor para obter uma projeção
                válida.
              </div>
            )}
            <div className="overview-grid">
              <article className="card overview-chart">
                <div className="card-heading">
                  <div>
                    <div className="card-kicker">
                      SEU DINHEIRO AO LONGO DO TEMPO
                    </div>
                    <h2>O futuro da sua reserva</h2>
                  </div>
                  <span className="badge">
                    <span className="tiny-dot green" />
                    {horizon}
                  </span>
                </div>
                <div className="chart-headline">
                  <strong>{brl(last.balance)}</strong>
                  <span>saldo investido ao final do período</span>
                </div>
                <EvolutionChart rows={rows} initial={first.openingBalance} />
                <div className="chart-footer">
                  <span>
                    <span className="legend-dot green" />
                    Reserva financeira investida
                  </span>
                  <a href="#investimentos">
                    Ver detalhes
                    <ArrowRight size={14} />
                  </a>
                </div>
              </article>
              <article className="card income-card" id="renda">
                <div className="card-heading">
                  <h2>Sua renda</h2>
                  <span className="soft-icon">
                    <BriefcaseBusiness size={18} />
                  </span>
                </div>
                {s.mode === "current" ? (
                  <>
                    <NumberField
                      label={
                        s.salary.regime === "CLT"
                          ? "Salário bruto mensal"
                          : "Faturamento mensal PJ"
                      }
                      value={s.salary.gross}
                      onChange={(gross) =>
                        update("salary", { ...s.salary, gross })
                      }
                    />
                    <div className="field">
                      <span className="field-label">Regime de trabalho</span>
                      <Segment
                        label="Regime de trabalho"
                        value={s.salary.regime}
                        options={regimeOptions}
                        onChange={(regime) =>
                          update("salary", { ...s.salary, regime })
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="muted small">
                      Etapas consecutivas. Início salvo:{" "}
                      {monthLabel(`${salaryStart}-01`)}.
                    </p>
                    <div className="stages">
                      {s.stages.map((stage, i) => {
                        const net = payroll(stage);
                        return (
                          <div className="stage" key={stage.id}>
                            <div className="stage-heading">
                              <strong>
                                <span>{String(i + 1).padStart(2, "0")}</span>
                                Etapa {i + 1}
                              </strong>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Remover etapa ${i + 1}`}
                                disabled={s.stages.length === 1}
                                onClick={() =>
                                  update(
                                    "stages",
                                    s.stages.filter((x) => x.id !== stage.id),
                                  )
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <NumberField
                              label={
                                stage.regime === "CLT"
                                  ? `Salário bruto · etapa ${i + 1}`
                                  : `Faturamento PJ · etapa ${i + 1}`
                              }
                              value={stage.gross}
                              onChange={(gross) =>
                                update(
                                  "stages",
                                  s.stages.map((x) =>
                                    x.id === stage.id ? { ...x, gross } : x,
                                  ),
                                )
                              }
                            />
                            <Segment
                              label={`Regime · etapa ${i + 1}`}
                              value={stage.regime}
                              options={regimeOptions}
                              onChange={(regime) =>
                                update(
                                  "stages",
                                  s.stages.map((x) =>
                                    x.id === stage.id ? { ...x, regime } : x,
                                  ),
                                )
                              }
                            />
                            <div className="stage-net">
                              <span>
                                {stage.regime === "CLT"
                                  ? "Salário líquido estimado"
                                  : "Disponível PJ estimado"}
                              </span>
                              <output
                                aria-label={`Líquido estimado · etapa ${i + 1}`}
                              >
                                {net.supported
                                  ? brl(net.available)
                                  : "Fora do cenário PJ"}
                              </output>
                            </div>
                            <div className="duration-fields">
                              <NumberField
                                label={`Duração · etapa ${i + 1}`}
                                value={stage.duration}
                                min={1}
                                max={600}
                                step="1"
                                money={false}
                                onChange={(duration) =>
                                  update(
                                    "stages",
                                    s.stages.map((x) =>
                                      x.id === stage.id
                                        ? {
                                            ...x,
                                            duration: Math.round(duration),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              />
                              <label className="field">
                                Unidade
                                <select
                                  aria-label={`Unidade · etapa ${i + 1}`}
                                  value={stage.unit}
                                  onChange={(e) =>
                                    update(
                                      "stages",
                                      s.stages.map((x) =>
                                        x.id === stage.id
                                          ? {
                                              ...x,
                                              unit: e.target.value as
                                                | "months"
                                                | "years",
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  <option value="months">Meses</option>
                                  <option value="years">Anos</option>
                                </select>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="button secondary full"
                      onClick={() =>
                        update("stages", [
                          ...s.stages,
                          {
                            id: id(),
                            gross: s.stages.at(-1)!.gross,
                            regime: s.stages.at(-1)!.regime,
                            duration: 1,
                            unit: "years",
                          },
                        ])
                      }
                    >
                      <Plus size={16} />
                      Adicionar etapa
                    </button>
                    <p className="small muted">
                      O período da projeção acompanha o fim da última etapa. As
                      marcações no gráfico indicam o início de cada emprego.
                    </p>
                  </>
                )}
                <div className="payroll-breakdown">
                  <div>
                    <span>
                      {p.regime === "CLT" ? "Salário bruto" : "Faturamento"}
                    </span>
                    <span>{brl(p.gross)}</span>
                  </div>
                  {p.regime === "PJ" && (
                    <div>
                      <span>DAS · Simples Nacional</span>
                      <span>− {brl(p.das)}</span>
                    </div>
                  )}
                  <div>
                    <span>
                      {p.regime === "CLT"
                        ? "INSS progressivo"
                        : "INSS · pró-labore"}
                    </span>
                    <span>− {brl(p.inss)}</span>
                  </div>
                  <div>
                    <span>IRRF{p.regime === "PJ" ? " · pró-labore" : ""}</span>
                    <span>− {brl(p.irrf)}</span>
                  </div>
                  {p.regime === "PJ" && (
                    <>
                      <div>
                        <span>IRRF · dividendos</span>
                        <span>− {brl(p.dividendTax)}</span>
                      </div>
                      <div className="provision-line">
                        <span>Provisão de 13º</span>
                        <span>− {brl(p.provision13)}</span>
                      </div>
                      <div>
                        <span>Provisão de 1/3 de férias</span>
                        <span>− {brl(p.provisionVacation)}</span>
                      </div>
                    </>
                  )}
                  <div className="breakdown-total">
                    <strong>
                      {p.regime === "CLT"
                        ? "Salário líquido"
                        : "Disponível PJ estimado"}
                    </strong>
                    <strong>{brl(p.available)}</strong>
                  </div>
                </div>
                {p.regime === "CLT" ? (
                  <div className="fgts-note">
                    <ShieldCheck size={15} />
                    <span>
                      <strong>+ {brl(p.fgtsBase)} de FGTS</strong>
                      <br />
                      Depósito mensal básico do empregador.
                    </span>
                  </div>
                ) : (
                  <p className="small muted">
                    Provisões são reservas próprias. PJ não gera FGTS.
                    Estimativa depende do enquadramento assumido.
                  </p>
                )}
                <Assumptions>
                  <p>
                    Referência: {RULES.reference}. CLT: INSS progressivo de 2026
                    e IRRF com dedução mais favorável entre INSS e R$ 607,20;
                    redução até R$ 7.350. Sem dependentes ou descontos
                    adicionais. FGTS não reduz o líquido nem fica disponível
                    para gastos.
                  </p>
                  <p>
                    PJ: serviços de TI sujeitos ao fator R, Simples Nacional,
                    Anexo III, sem empregados. Pró-labore = maior entre 28% do
                    faturamento e R$ 1.621 (mês sem receita: zero). RBT12 =
                    faturamento do mês × 12, sem reconstruir histórico. CPP
                    incluída no DAS; INSS de 11% no pró-labore, limitado ao
                    teto, e IRRF. Lucros apurados por escrituração;
                    distribuições acima de R$ 50 mil/mês têm retenção de 10%
                    sobre o total. Não há ajuste anual de IR nesta estimativa
                    mensal.
                  </p>
                  <p>
                    Provisões PJ: faturamento ÷ 12 para 13º e ÷ 36 para 1/3 de
                    férias. Não reservamos outro salário inteiro de férias. Sem
                    contabilidade ou custos opcionais. Cenário limitado a R$ 300
                    mil/mês para manter o ISS no DAS.
                  </p>
                </Assumptions>
              </article>
            </div>
          </section>

          <section id="orcamento" className="page-section">
            <SectionTitle
              number="01 / ORGANIZAR"
              title="Um lugar para cada real"
              description="Gastos planejados e o que sobra para os seus próximos passos."
            />
            <div className="budget-grid">
              <ExpensesCard
                document={plan}
                current={currentMonth}
                fixed={first.fixed}
                annual={annualRows.reduce((sum, m) => sum + m.fixed, 0)}
                commit={commit}
              />
              <div className="budget-right">
                <article className="card">
                  <div className="card-heading">
                    <h3>
                      <span className="soft-icon gold-soft">
                        <Coins size={17} />
                      </span>
                      Gastos variáveis
                    </h3>
                  </div>
                  <NumberField
                    label="Máximo planejado por dia"
                    value={s.daily}
                    onChange={(v) => update("daily", v)}
                    suffix="/ dia"
                  />
                  <div className="stat-list">
                    <div>
                      <span>Por semana</span>
                      <strong>{brl(s.daily * 7)}</strong>
                    </div>
                    <div>
                      <span>Neste mês · {first.days} dias</span>
                      <strong>{brl(first.variable)}</strong>
                    </div>
                    <div>
                      <span>Próximos 12 meses</span>
                      <strong>{brl(annualVariable)}</strong>
                    </div>
                  </div>
                  <p className="small muted">
                    Um limite diário simples, sem registrar compras.
                  </p>
                </article>
                <article
                  className={`reserve-card ${first.budget < 0 ? "deficit-card" : ""}`}
                >
                  <div className="card-heading">
                    <h3>
                      <PiggyBank size={19} />
                      {first.budget < 0
                        ? "Déficit do mês"
                        : "Sua reserva mensal"}
                    </h3>
                    <ArrowUpRight size={19} />
                  </div>
                  <strong className="reserve-value">{brl(first.budget)}</strong>
                  <p>
                    {first.income > 0
                      ? `${percent((first.budget / first.income) * 100)} da renda disponível`
                      : "Sem renda disponível neste mês"}
                  </p>
                  <div className="reserve-annual">
                    <span>
                      {annualReserve < 0
                        ? "Déficit nos próximos 12 meses"
                        : "Reserva nos próximos 12 meses"}
                    </span>
                    <strong>{brl(annualReserve)}</strong>
                  </div>
                  <p className="reserve-caption">
                    {first.budget < 0
                      ? "O déficit reduz o saldo investido. Se ele acabar, mostramos a parte não coberta."
                      : "Esse valor vira um aporte automático no investimento."}
                  </p>
                </article>
                <EmergencyCard
                  fixed={first.fixed}
                  daily={first.daily}
                  months={s.emergencyMonths ?? 6}
                  current={currentMonth}
                  onChange={(v) => update("emergencyMonths", v)}
                />
              </div>
            </div>
            <Assumptions>
              <p>
                Reserva = renda disponível − gastos fixos ativos − parcelas de
                empréstimos − faturas − gasto diário × dias reais de cada mês. A
                reserva de emergência é apenas uma meta com 30 dias fixos. Não
                representa outra despesa.
              </p>
              <p>
                Gastos e dívidas respeitam suas competências de início, fim e
                versões. Projeções recalculadas não representam movimentações
                financeiras realizadas.
              </p>
              <p>
                Os totais anuais somam os próximos 12 meses completos, começando
                pelo mês atual, e acompanham cada etapa salarial. Despesas
                permanecem constantes em reais nominais, sem inflação.
                Benefícios e extras entram na projeção de investimentos,
                separados do orçamento mensal básico.
              </p>
            </Assumptions>
          </section>

          <DebtsSection
            document={plan}
            current={currentMonth}
            commit={commit}
            loanMonthly={first.loans}
            invoiceMonthly={first.invoices}
          />
          <section id="investimentos" className="page-section">
            <SectionTitle
              number="03 / CULTIVAR"
              title="Dê tempo ao seu dinheiro"
              description={`Sua reserva mensal investida, mês a mês. Horizonte: ${horizon}.`}
              aside={
                <span className="section-tag">
                  <Sparkles size={14} />
                  Aportes automáticos
                </span>
              }
            />
            <div className="card investment-settings">
              <div className="investment-inputs">
                <NumberField
                  label="Saldo atual da reserva"
                  value={s.initialBalance}
                  onChange={(v) => update("initialBalance", v)}
                />
                <NumberField
                  label="Rendimento anual médio"
                  value={s.annualRate}
                  onChange={(v) => update("annualRate", v)}
                  money={false}
                  min={-99}
                  max={1000}
                  suffix="% a.a."
                  hint="Taxa líquida assumida, sem garantia de retorno."
                />
              </div>
              <div className="benefit-toggles">
                <Toggle
                  label="Investir 13º"
                  checked={s.include13}
                  onChange={(v) => update("include13", v)}
                />
                <Toggle
                  label="Investir adicional de 1/3 de férias"
                  checked={s.includeVacation}
                  onChange={(v) => update("includeVacation", v)}
                />
              </div>
            </div>
            <article className="card extras-card">
              <div className="card-heading">
                <div>
                  <h3>Receitas extras</h3>
                  <p className="small muted">
                    Valores líquidos que também entram na reserva.
                  </p>
                </div>
                <button
                  className="button secondary small-button"
                  onClick={() =>
                    setEditingExtra({
                      id: id(),
                      name: "",
                      amount: 0,
                      recurrence: "monthly",
                    })
                  }
                >
                  <Plus size={15} />
                  Adicionar receita
                </button>
              </div>
              {extras.length ? (
                <div className="extras-list">
                  {extras.map((e) => (
                    <div className="extra-row" key={e.id}>
                      <span className="soft-icon">
                        <Plus size={16} />
                      </span>
                      <div>
                        <strong>{e.name}</strong>
                        <small>
                          {
                            {
                              monthly: "Mensal",
                              semiannual: "Semestral",
                              annual: "Anual",
                              once: `Única · ${e.month ? monthLabel(`${e.month}-01`) : ""}`,
                            }[e.recurrence]
                          }
                        </small>
                      </div>
                      <strong>{brl(e.amount)}</strong>
                      <button
                        className="icon-button"
                        aria-label={`Editar ${e.name}`}
                        onClick={() => setEditingExtra(e)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Encerrar receita ${e.name}`}
                        onClick={() => setClosingExtra(e)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="extras-empty">
                  <span className="soft-icon">
                    <Plus size={17} />
                  </span>
                  <span>Tem uma renda a mais? Adicione quando quiser.</span>
                </div>
              )}
            </article>
            <div className="investment-summary">
              <div>
                <span>Saldo inicial</span>
                <strong>{brl(first.openingBalance)}</strong>
              </div>
              <div>
                <span>Aportes acumulados</span>
                <strong>{brl(last.totalContributions)}</strong>
              </div>
              <div>
                <span>Extras e benefícios investidos</span>
                <strong>{brl(last.totalExtras)}</strong>
              </div>
              <div>
                <span>Rendimentos acumulados</span>
                <strong className="green-text">
                  {brl(last.totalInterest)}
                </strong>
              </div>
              <div className="summary-final">
                <span>Saldo final</span>
                <strong>{brl(last.balance)}</strong>
              </div>
            </div>
            {rows.some(
              (m) => m.balanceAdjustment !== 0 || m.fgtsAdjustment !== 0,
            ) && (
              <div className="alert neutral">
                Há revisões de saldos informados neste horizonte. Ajuste da
                reserva: {brl(last.totalBalanceAdjustments)}. São mudanças de
                premissa, não aportes nem movimentações realizadas; consulte o
                histórico e os detalhes do saldo na tabela.
              </div>
            )}
            {last.totalWithdrawals > 0 && (
              <div className="alert neutral">
                <ArrowDownLeft size={18} />
                <span>
                  Retiradas para cobrir déficits:{" "}
                  <strong>{brl(last.totalWithdrawals)}</strong>. Esses valores
                  já reduziram o saldo final.
                </span>
              </div>
            )}
            {last.totalUncovered > 0 && (
              <div className="alert warning">
                Déficit não coberto no período:{" "}
                <strong>{brl(last.totalUncovered)}</strong>. A reserva chega a
                zero e não gera juros sobre saldo negativo.
              </div>
            )}
            <div className="pending-provisions">
              <span>
                <ShieldCheck size={16} />
                Fora do saldo investido
              </span>
              <span>
                Provisões PJ aguardando transferência:{" "}
                <strong>
                  {brl(last.pendingPj13 + last.pendingPjVacation)}
                </strong>
              </span>
              <small>
                13º: {brl(last.pendingPj13)} · 1/3 de férias:{" "}
                {brl(last.pendingPjVacation)}
              </small>
              {last.pending13 + last.pendingVacation > 0 && (
                <small>
                  Benefícios CLT acumulados, ainda não recebidos:{" "}
                  {brl(last.pending13 + last.pendingVacation)}.
                </small>
              )}
            </div>
            <article className="card table-card">
              <div className="card-heading">
                <div>
                  <h3>Sua projeção, mês a mês</h3>
                  <p className="small muted">
                    {monthLabel(first.date)} a {monthLabel(last.date)} · valores
                    nominais
                  </p>
                </div>
                <span className="badge">{rows.length} meses</span>
              </div>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Tabela mensal dos investimentos"
              >
                <table>
                  <caption className="sr-only">
                    Projeção mensal de renda, gastos e investimentos
                  </caption>
                  <thead>
                    <tr>
                      <th>Mês / regime</th>
                      <th>Renda disponível</th>
                      <th>Fixos + variáveis</th>
                      <th>Parcelas de empréstimos</th>
                      <th>Faturas</th>
                      <th>Aporte / déficit</th>
                      <th>Extras + benefícios</th>
                      <th>Rendimentos</th>
                      <th>Não coberto</th>
                      <th>Saldo investido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.date}>
                        <th scope="row">
                          {monthLabel(m.date, true)}
                          <span
                            className={`regime-pill ${m.payroll.regime.toLowerCase()}`}
                          >
                            {m.payroll.regime}
                          </span>
                        </th>
                        <td>{brl(m.income)}</td>
                        <td>{brl(m.fixed + m.variable)}</td>
                        <td>{brl(m.loans)}</td>
                        <td>{brl(m.invoices)}</td>
                        <td
                          className={m.budget < 0 ? "red-text" : "green-text"}
                        >
                          {m.budget >= 0 ? "+ " : ""}
                          {brl(m.budget)}
                        </td>
                        <td>{brl(m.extras + m.benefits)}</td>
                        <td>{brl(m.interest)}</td>
                        <td className={m.uncovered ? "red-text" : ""}>
                          {brl(m.uncovered)}
                        </td>
                        <td
                          className="balance-cell"
                          title={
                            m.balanceAdjustment
                              ? `Revisão do saldo informado: ${brl(m.balanceAdjustment)}`
                              : undefined
                          }
                        >
                          {brl(m.balance)}
                          {m.balanceAdjustment !== 0 && (
                            <small className="revision-note">
                              Revisão: {brl(m.balanceAdjustment)}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <Assumptions>
              <p>
                Taxa mensal equivalente = (1 + taxa anual)^(1/12) − 1. Os juros
                incidem sobre o saldo do início do mês; aportes, extras e
                benefícios entram no final. 10% a.a. é uma hipótese líquida
                editável, não promessa de retorno. Valores nominais, sem
                inflação.
              </p>
              <p>
                Extras mensais entram todos os meses; semestrais no 6º, 12º,
                18º… mês; anuais no 12º, 24º… mês da projeção. O ciclo começa
                neste mês, sem calendário de pagamentos. Receitas únicas entram
                somente na competência informada, somando à renda total e ao
                saldo investido uma única vez.
              </p>
              <p>
                CLT: acumulamos mensalmente 1/12 do 13º líquido e 1/12 do
                adicional líquido de férias. O adicional é a diferença entre o
                líquido de 4/3 do salário e o líquido normal, sem duplicar o
                salário de férias. Transferimos ao final de cada ciclo de 12
                meses, se a opção estiver ativada. É uma convenção de
                planejamento, não reprodução da folha.
              </p>
              <p>
                PJ: as provisões saem do disponível todo mês. Quando ativadas,
                ficam separadas até a transferência no 12º mês; não são nova
                renda e não são tributadas novamente. Quando desativadas, são
                destinadas ao uso pessoal, fora dos investimentos. Benefícios
                CLT e provisões PJ mantêm o que foi acumulado nas mudanças de
                regime.
              </p>
              <p>
                Déficits consomem o saldo após os juros e as entradas do mês. Se
                as entradas e a reserva forem insuficientes, o restante aparece
                como déficit não coberto. Saldo inicial + aportes +
                extras/benefícios + rendimentos − retiradas + revisões de saldo
                informado = saldo final. Saldos informados são premissas para a
                projeção; uma revisão futura redefine a referência naquela
                competência, sem ser tratada como aporte ou transação realizada.
              </p>
            </Assumptions>
          </section>

          <section id="patrimonio" className="page-section">
            <SectionTitle
              number="04 / CONSTRUIR"
              title="Uma visão do seu patrimônio"
              description="Sua reserva e seu FGTS, cada um no seu lugar."
            />
            <div className="wealth-grid">
              <article className="card fgts-settings">
                <div className="card-heading">
                  <h3>
                    <span className="soft-icon">
                      <ShieldCheck size={18} />
                    </span>
                    Seu FGTS
                  </h3>
                </div>
                <NumberField
                  label="Saldo atual do FGTS"
                  value={s.fgts}
                  onChange={(v) => update("fgts", v)}
                />
                <div className="stat-list">
                  <div>
                    <span>Novos depósitos no período</span>
                    <strong>
                      {brl(rows.reduce((sum, m) => sum + m.fgtsDeposit, 0))}
                    </strong>
                  </div>
                  <div>
                    <span>FGTS em {horizon}</span>
                    <strong>{brl(last.fgts)}</strong>
                  </div>
                </div>
                <div className="small-callout">
                  <ShieldCheck size={17} />
                  <span>
                    FGTS é patrimônio, mas não é dinheiro disponível para
                    gastos.
                  </span>
                </div>
                <p className="small muted">
                  O saldo projetado alimenta automaticamente a entrada do
                  imóvel.
                </p>
              </article>
              <article className="card wealth-chart">
                <div className="card-heading">
                  <h3>Reserva + FGTS</h3>
                  <span className="badge">{horizon}</span>
                </div>
                <div className="chart-headline">
                  <strong>{brl(last.wealth)}</strong>
                  <span>patrimônio de referência ao final</span>
                </div>
                <EvolutionChart
                  rows={rows}
                  initial={first.openingBalance + first.openingFgts}
                  wealth
                />
              </article>
            </div>
            <article className="card table-card">
              <div
                className="table-scroll wealth-table"
                tabIndex={0}
                role="region"
                aria-label="Tabela mensal de patrimônio"
              >
                <table>
                  <caption>Patrimônio mês a mês</caption>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Reserva investida</th>
                      <th>Depósito de FGTS</th>
                      <th>Saldo de FGTS</th>
                      <th>Patrimônio total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Saldo inicial</th>
                      <td>{brl(first.openingBalance)}</td>
                      <td>—</td>
                      <td>{brl(first.openingFgts)}</td>
                      <td className="balance-cell">
                        {brl(first.openingBalance + first.openingFgts)}
                      </td>
                    </tr>
                    {rows.map((m) => (
                      <tr key={m.date}>
                        <th scope="row">{monthLabel(m.date, true)}</th>
                        <td>{brl(m.balance)}</td>
                        <td>{brl(m.fgtsDeposit)}</td>
                        <td
                          title={
                            m.fgtsAdjustment
                              ? `Revisão do saldo informado: ${brl(m.fgtsAdjustment)}`
                              : undefined
                          }
                        >
                          {brl(m.fgts)}
                          {m.fgtsAdjustment !== 0 && (
                            <small className="revision-note">
                              Revisão: {brl(m.fgtsAdjustment)}
                            </small>
                          )}
                        </td>
                        <td className="balance-cell">{brl(m.wealth)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <Assumptions>
              <p>
                FGTS: saldo inicial + depósitos, sem juros, TR ou distribuição
                de resultados futura. Não aplicamos a rentabilidade da reserva
                ao FGTS. Na convenção mensal, CLT gera 8% do salário, mais 8%
                sobre as frações de 13º (salário ÷ 12) e de adicional de férias
                (salário ÷ 36). O salário normal de férias já está nos 12
                salários; não há outro depósito duplicado. Os depósitos de
                benefícios independem da opção de investi-los.
              </p>
              <p>
                PJ não gera novos depósitos; o saldo anterior é preservado. Essa
                soma serve como referência de patrimônio e potencial de entrada.
                O uso efetivo do FGTS depende das regras de elegibilidade,
                vínculo, localização e propriedade aplicáveis.
              </p>
            </Assumptions>
          </section>

          <section id="imovel" className="page-section">
            <SectionTitle
              number="05 / IMAGINAR"
              title="Seu próximo endereço"
              description="Uma primeira noção da compra, sem mexer no seu orçamento."
              aside={
                <span className="section-tag">
                  <MapPin size={14} />
                  BH / Contagem, MG
                </span>
              }
            />
            <article className="card housing-card">
              <Segment
                label="Modalidade de financiamento"
                className="housing-toggle"
                value={s.home.mode}
                onChange={(mode) => update("home", { ...s.home, mode })}
                options={[
                  { value: "mcmv", label: "Minha Casa, Minha Vida — Caixa" },
                  { value: "standard", label: "Financiamento padrão" },
                ]}
              />
              <div className="housing-content">
                <div className="housing-inputs">
                  <NumberField
                    label="Valor do imóvel"
                    value={s.home.price}
                    onChange={(price) => update("home", { ...s.home, price })}
                  />
                  <NumberField
                    label="Entrada em dinheiro"
                    value={s.home.cash}
                    onChange={(cash) => update("home", { ...s.home, cash })}
                  />
                  <NumberField
                    label="Salário bruto na época da compra"
                    value={s.home.gross}
                    onChange={(gross) => update("home", { ...s.home, gross })}
                    hint="Renda independente do salário e das etapas acima. Referência CLT."
                  />
                  <div className="small-callout">
                    <LockKeyhole size={16} />
                    <span>
                      Este salário é informado por você e não acompanha a
                      projeção salarial.
                    </span>
                  </div>
                  <div className="housing-tags">
                    <span>Imóvel usado</span>
                    <span>SAC · 35 anos</span>
                    <span>Cotista FGTS</span>
                    <span>Sem subsídio</span>
                  </div>
                </div>
                <div className="housing-results">
                  <div className="housing-result-title">
                    <span className="soft-icon">
                      <House size={20} />
                    </span>
                    <span>SUA SIMULAÇÃO</span>
                  </div>
                  <span className="result-label">
                    Primeira parcela aproximada
                  </span>
                  <strong className="payment-value">
                    {s.home.mode === "mcmv" && home.nominal === null
                      ? "—"
                      : brl(home.firstPayment)}
                  </strong>
                  <p className="payment-note">Somente amortização e juros</p>
                  <div className="income-ratio">
                    <span>
                      {home.ratio === null ||
                      (s.home.mode === "mcmv" && home.nominal === null) ? (
                        "Sem referência de renda"
                      ) : (
                        <>
                          <strong>{percent(home.ratio)}</strong> da renda
                          líquida estimada
                        </>
                      )}
                    </span>
                    <div className="progress-track">
                      <span
                        style={{ width: `${Math.min(home.ratio ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="stat-list">
                    <div>
                      <span>Renda líquida de referência</span>
                      <strong>{brl(home.netReference)}</strong>
                    </div>
                    <div>
                      <span>Entrada em dinheiro considerada</span>
                      <strong>{brl(home.cash)}</strong>
                    </div>
                    <div>
                      <span>FGTS considerado na entrada</span>
                      <strong>{brl(home.fgts)}</strong>
                    </div>
                    <div>
                      <span>Valor financiado</span>
                      <strong>{brl(home.financed)}</strong>
                    </div>
                    <div>
                      <span>Juros efetivos anuais</span>
                      <strong>
                        {s.home.mode === "mcmv" && home.nominal === null
                          ? "—"
                          : `${percent(home.effectiveRate * 100, 2)} a.a.`}
                      </strong>
                    </div>
                    <div>
                      <span>Cota máxima financiável</span>
                      <strong>{percent(home.ltv * 100, 0)}</strong>
                    </div>
                  </div>
                  <div className="rate-date">
                    Taxas de referência consultadas em {RULES.reference}.
                  </div>
                </div>
              </div>
              {home.eligible ? (
                <div className="alert success">
                  <Check size={18} />
                  <span>
                    Cenário dentro dos limites estimados. A contratação depende
                    da análise de crédito e das regras da Caixa.
                  </span>
                </div>
              ) : (
                <div className="alert warning">
                  <CircleHelp size={18} />
                  <div>
                    <strong>Este cenário precisa de ajuste</strong>
                    <ul>
                      {home.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {home.extendedLowIncome && (
                <p className="small housing-disclaimer">
                  Para este imóvel, adotamos o enquadramento sem subsídio até R$
                  400 mil, a 7,66% nominais a.a., conforme art. 20, § 5º, da
                  Resolução 702.
                </p>
              )}
              <div className="housing-disclaimer">
                Sem ITBI, seguros, tarifas ou outras despesas. Correção
                monetária: TR = 0 nesta estimativa. O financiamento real pode
                ter parcelas maiores.
              </div>
              <Assumptions>
                <p>
                  Imóvel usado em Belo Horizonte/Contagem, MG. Apenas sua renda,
                  cotista do FGTS como hipótese, sem subsídio. SAC em 420 meses.
                  Primeira parcela = valor financiado ÷ 420 + valor financiado ×
                  taxa mensal. Para MCMV, taxa mensal = nominal anual ÷ 12;
                  mostramos a taxa efetiva anual (1 + taxa mensal)^12 − 1.
                </p>
                <p>
                  MCMV: taxas de cotista do Sudeste selecionadas pela renda.
                  Para renda até R$ 5 mil, usamos o teto local comum conservador
                  de Contagem (R$ 255 mil; BH: R$ 270 mil, Resolução 702/2012,
                  art. 20). Acima de R$ 255 mil, adotamos automaticamente a
                  opção sem subsídio até R$ 400 mil, com 7,66% nominais a.a.
                  (art. 20, § 5º). Assim não é necessário escolher município.
                  Renda até R$ 9.600: imóvel até R$ 400 mil; até R$ 13 mil:
                  imóvel até R$ 600 mil. Cota Caixa: 80% nas faixas 1–3 e 60%
                  para usado no Sudeste na Classe Média (IN 45/2025).
                </p>
                <p>
                  Padrão: referência SBPE de 10,99% efetivos a.a. (taxa inicial
                  divulgada pela Caixa), cota SAC de 80% e imóvel até R$ 2,25
                  milhões, limitando esta versão ao SFH. Fonte publicada em
                  09/12/2025 e atualizada em 28/10/2026, consultada em{" "}
                  {RULES.reference}. TR fixada em zero nas duas modalidades. Sem
                  previsão de taxas futuras.
                </p>
                <p>
                  Usamos o FGTS projetado no horizonte selecionado, limitado ao
                  valor do imóvel menos a entrada em dinheiro e ao limite do
                  SFH. A reserva investida não é usada automaticamente. A
                  simulação não retira FGTS, não altera gastos e não consome a
                  reserva. Verificação de renda: primeira parcela até 30% do
                  bruto; o percentual exibido usa o líquido CLT do salário
                  independente. Demais requisitos de crédito e de uso do FGTS
                  dependem da Caixa.
                </p>
              </Assumptions>
            </article>
          </section>

          <HistoryPanel document={plan} />
          <section id="premissas" className="sources-section">
            <details className="sources-details">
              <summary>
                <div>
                  <span className="soft-icon">
                    <CircleHelp size={18} />
                  </span>
                  <div>
                    <strong>Contas claras, premissas abertas.</strong>
                    <p>
                      Fontes oficiais e regras de referência · {RULES.reference}
                    </p>
                  </div>
                </div>
                <Plus size={18} />
              </summary>
              <div className="sources-content">
                <p>
                  Regras centralizadas no código. Para os anos futuros, mantemos
                  as regras conhecidas de 2026, sem inventar reajustes.
                  Projeções aproximadas para planejamento pessoal.
                </p>
                <ul>
                  {SOURCES.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.label}
                        <ArrowUpRight size={13} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </section>
          <footer>
            <a className="footer-brand" href="#visao-geral">
              <BarChart3 size={17} />
              meu simulador financeiro.
            </a>
            <span>Planejar hoje. Respirar melhor amanhã.</span>
            <span>
              <LockKeyhole size={12} />
              {storageOk
                ? "Dados neste navegador · exporte para guardar uma cópia"
                : "Dados apenas nesta sessão; armazenamento bloqueado"}
            </span>
          </footer>
        </main>
      </div>
      {editingExtra && (
        <ExtraEditor
          current={currentMonth}
          key={editingExtra.id}
          value={editingExtra}
          onClose={() => setEditingExtra(null)}
          onSave={(extra, month) => {
            if (commit(changeEntity(plan, "extra", extra, month, extra.name)))
              setEditingExtra(null);
          }}
        />
      )}
      {workspace.dirty && (
        <a className="pending-dock" href="#confirmar-alteracoes">
          Prévia não salva · revisar e confirmar
        </a>
      )}
      {closingExtra && (
        <CloseForm
          name={closingExtra.name}
          current={currentMonth}
          onClose={() => setClosingExtra(null)}
          onConfirm={(month) => {
            if (
              commit(
                changeEntity(
                  plan,
                  "extra",
                  null,
                  month,
                  closingExtra.name,
                  closingExtra.id,
                ),
              )
            )
              setClosingExtra(null);
          }}
        />
      )}
    </div>
  );
}
