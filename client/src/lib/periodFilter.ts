/**
 * Funções compartilhadas pro filtro de período usado em várias telas (Pedidos,
 * Empacotamento, Entregas...). O valor guardado no estado é sempre uma string:
 * - "all" → sem filtro
 * - "YYYY-MM" → um mês específico
 * - "custom:YYYY-MM-DD:YYYY-MM-DD" → período personalizado (data inicial:final)
 */

export function periodMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i <= 11; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

export function periodValueToRange(value: string): { dateFrom?: string; dateTo?: string } {
  if (!value || value === "all") return {};

  if (value.startsWith("custom:")) {
    const [, from, to] = value.split(":");
    return { dateFrom: from || undefined, dateTo: to || undefined };
  }

  const [year, m] = value.split("-").map(Number);
  if (!year || !m) return {};
  const start = new Date(year, m - 1, 1);
  const end = new Date(year, m, 0);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
}

function formatBr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export function periodValueToLabel(value: string): string {
  if (!value || value === "all") return "Todos os meses";

  if (value.startsWith("custom:")) {
    const [, from, to] = value.split(":");
    if (from && to) return `${formatBr(from)} — ${formatBr(to)}`;
    return "Personalizado";
  }

  const [year, m] = value.split("-").map(Number);
  if (!year || !m) return "Todos os meses";
  const d = new Date(year, m - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
