export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const percent = (value: number, digits = 1) =>
  `${value.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
export const monthLabel = (date: string, short = false) =>
  new Date(`${date.slice(0, 7)}-01T12:00:00`)
    .toLocaleDateString("pt-BR", {
      month: short ? "short" : "long",
      year: short ? "2-digit" : "numeric",
    })
    .replace(".", "");
export const compact = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
