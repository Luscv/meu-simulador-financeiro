export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export function validMonth(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(19\d\d|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value)
  );
}
export function monthDistance(from: string, to: string) {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7))
  );
}
export function addMonths(month: string, count: number) {
  const absolute =
    Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  return `${Math.floor(absolute / 12)}-${String((((absolute % 12) + 12) % 12) + 1).padStart(2, "0")}`;
}
export const monthDate = (month: string) =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1, 12);
