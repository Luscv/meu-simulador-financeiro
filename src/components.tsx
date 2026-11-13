import { useId, useState } from "react";
import { ChevronDown, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Expense, Month } from "./engine/types";
import { brl, compact, monthLabel, percent } from "./format";

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  money = true,
  min = 0,
  max = 1e9,
  step = "0.01",
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  money?: boolean;
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const normalize = (text: string) =>
    Math.max(min, Math.min(max, Number(text) || 0));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="number-wrap">
        {money && <span>R$</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={editing ? draft : value === 0 ? "" : value}
          placeholder="0"
          onFocus={(e) => {
            setDraft(e.target.value);
            setEditing(true);
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(normalize(e.target.value));
          }}
          onBlur={(e) => {
            onChange(normalize(e.target.value));
            setEditing(false);
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`segment ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={option.value === value ? "selected" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

export function Assumptions({ children }: { children: ReactNode }) {
  return (
    <details className="assumptions">
      <summary>
        <Info size={14} />
        Como calculamos
        <ChevronDown size={15} />
      </summary>
      <div>{children}</div>
    </details>
  );
}

export function Metric({
  label,
  value,
  note,
  icon,
  dark = false,
  danger = false,
}: {
  label: string;
  value: string;
  note: ReactNode;
  icon: ReactNode;
  dark?: boolean;
  danger?: boolean;
}) {
  return (
    <article
      className={`metric ${dark ? "dark" : ""} ${danger ? "danger" : ""}`}
    >
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="metric-note">{note}</div>
    </article>
  );
}

export function SectionTitle({
  number,
  title,
  description,
  aside,
}: {
  number: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <div className="section-label">{number}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {aside}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  // Native dialog provides focus trapping, Escape and an accessible modal boundary.
  return (
    <dialog
      className="modal"
      aria-labelledby={titleId}
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h3 id={titleId}>{title}</h3>
        <button
          className="icon-button"
          type="button"
          aria-label="Fechar"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export const COLORS = [
  "#2a795d",
  "#91b69c",
  "#c5d3a3",
  "#e4bb7b",
  "#7d9caf",
  "#b7a0c1",
  "#8aab7e",
  "#c89075",
  "#c6c9c7",
];
export function Donut({ expenses }: { expenses: Expense[] }) {
  const grouped = Array.from(new Set(expenses.map((e) => e.category)))
    .map((category) => ({
      category,
      value: expenses
        .filter((e) => e.category === category)
        .reduce((sum, e) => sum + e.amount, 0),
    }))
    .filter((x) => x.value > 0);
  const total = grouped.reduce((sum, x) => sum + x.value, 0);
  let cursor = 0;
  const gradient = grouped
    .map((g, i) => {
      const from = cursor;
      cursor += (g.value / total) * 100;
      return `${COLORS[i % COLORS.length]} ${from}% ${cursor}%`;
    })
    .join(",");
  return (
    <div className="donut-layout">
      <div
        className="donut"
        role="img"
        aria-label={`Gastos por categoria: ${grouped.map((g) => `${g.category} ${percent((g.value / total) * 100)}`).join(", ") || "nenhuma despesa"}`}
        style={{
          background: total ? `conic-gradient(${gradient})` : "#edf0ec",
        }}
      >
        <div>
          <small>Gastos fixos</small>
          <strong>{brl(total)}</strong>
          <span>por mês</span>
        </div>
      </div>
      <ul className="donut-legend">
        {grouped.map((g, i) => (
          <li key={g.category}>
            <span
              className="legend-dot"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span>{g.category}</span>
            <strong>{percent((g.value / total) * 100, 0)}</strong>
          </li>
        ))}
        {!grouped.length && (
          <li>Cadastre uma despesa para ver a distribuição.</li>
        )}
      </ul>
    </div>
  );
}

export function EvolutionChart({
  rows,
  initial,
  wealth = false,
}: {
  rows: Month[];
  initial: number;
  wealth?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const width = 820,
    height = 250,
    left = 65,
    right = 18,
    top = 20,
    bottom = 32;
  const values = [initial, ...rows.map((r) => (wealth ? r.wealth : r.balance))];
  const max = Math.max(...values, 1000) * 1.14;
  const x = (i: number) => left + (i / rows.length) * (width - left - right);
  const y = (value: number) =>
    top + (1 - value / max) * (height - top - bottom);
  const path = (vs: number[]) =>
    vs.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const line = path(values),
    area = `${line} L${x(rows.length)},${y(0)} L${left},${y(0)} Z`;
  const selected = hover !== null && hover > 0 ? rows[hover - 1] : null;
  return (
    <div className="chart-container">
      <svg
        className="evolution-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          wealth
            ? "Evolução da reserva financeira, FGTS e patrimônio total; valores detalhados na tabela abaixo."
            : "Evolução do saldo investido; valores detalhados na tabela mensal."
        }
      >
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3c8a65" stopOpacity=".19" />
            <stop offset="100%" stopColor="#3c8a65" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1={left}
              x2={width - right}
              y1={y((max * i) / 4)}
              y2={y((max * i) / 4)}
              stroke="#e9ece7"
              strokeDasharray="4 5"
            />
            <text
              x={left - 12}
              y={y((max * i) / 4) + 4}
              textAnchor="end"
              fill="#818b85"
              fontSize="11"
            >
              {compact((max * i) / 4)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#fill-${id})`} />
        <path
          d={line}
          fill="none"
          stroke="#2a795d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {wealth && (
          <>
            <path
              d={path([
                initial - (rows[0]?.fgts - rows[0]?.fgtsDeposit || 0),
                ...rows.map((r) => r.balance),
              ])}
              fill="none"
              stroke="#93b49c"
              strokeWidth="2"
            />
            <path
              d={path([
                rows[0]?.fgts - rows[0]?.fgtsDeposit || 0,
                ...rows.map((r) => r.fgts),
              ])}
              fill="none"
              stroke="#d2ac72"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          </>
        )}
        {[0, ...rows.map((_, i) => i + 1)]
          .filter(
            (i) =>
              i === 0 ||
              i === rows.length ||
              i % Math.ceil(rows.length / 5) === 0,
          )
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 7}
              textAnchor={
                i === 0 ? "start" : i === rows.length ? "end" : "middle"
              }
              fill="#818b85"
              fontSize="11"
            >
              {i === 0 ? "Início" : monthLabel(rows[i - 1].date, true)}
            </text>
          ))}
        {values.map((value, i) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(value)}
              r={i === values.length - 1 || hover === i ? 4 : 0}
              fill="#2a795d"
              stroke="white"
              strokeWidth="2"
            />
            <circle
              cx={x(i)}
              cy={y(value)}
              r="10"
              fill="transparent"
              tabIndex={0}
              aria-label={`${i === 0 ? "Saldo inicial" : monthLabel(rows[i - 1].date)}: ${brl(value)}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onTouchStart={() => setHover(i)}
            >
              <title>
                {i === 0 ? "Saldo inicial" : monthLabel(rows[i - 1].date)}:{" "}
                {brl(value)}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="chart-tooltip" aria-live="polite">
        {selected ? (
          <>
            {monthLabel(selected.date)}{" "}
            <strong>{brl(wealth ? selected.wealth : selected.balance)}</strong>
          </>
        ) : (
          <>
            <span className="legend-dot green" />
            {wealth ? "Patrimônio total" : "Reserva investida"}
            {wealth && (
              <>
                <span className="legend-dot sage" />
                Reserva
                <span className="legend-dot gold" />
                FGTS
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
