const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const n1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const money = (n: number) => usd0.format(Math.round(n));
export const moneyExact = (n: number) => usd2.format(n);
export const num = (n: number) => n1.format(n);
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const compactMoney = (n: number) =>
  Math.abs(n) >= 1000 ? `$${n1.format(n / 1000)}k` : money(n);

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
