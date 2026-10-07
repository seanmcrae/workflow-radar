import type { Range } from "../domain/estimate.js";

export function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function num(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function pct(value: number): string {
  return `${num(value * 100)}%`;
}

export function months(value: number): string {
  if (!Number.isFinite(value)) return "no payback";
  if (value > 120) return "> 120 mo";
  return `${num(value, 1)} mo`;
}

export function rangeText(range: Range, format: (n: number) => string = (n) => num(n)): string {
  if (range.low === range.high) return format(range.likely);
  return `${format(range.likely)} (${format(range.low)}–${format(range.high)})`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
