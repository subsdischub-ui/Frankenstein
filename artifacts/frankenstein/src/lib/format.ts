export const NA = '—';

export function usdt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return NA;
  return (
    n.toLocaleString('fr-FR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + ' USDT'
  );
}

export function num(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return NA;
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** ratio (0.012) -> "1,20 %" */
export function ratio(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return NA;
  return num(n * 100, digits) + ' %';
}

export function signedRatio(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return NA;
  return (n > 0 ? '+' : '') + num(n * 100, digits) + ' %';
}

/** valeur déjà en pourcentage */
export function pctRaw(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return NA;
  return (n > 0 ? '+' : '') + num(n, digits) + ' %';
}

export function signed(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return NA;
  return (n > 0 ? '+' : '') + num(n, digits);
}

export function dt(s: string | null | undefined): string {
  if (!s) return NA;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function dtShort(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pnlTone(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return 'text-foreground';
  return n > 0 ? 'text-[hsl(168,62%,26%)]' : 'text-destructive';
}

export function downloadBlob(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(name: string, data: unknown) {
  downloadBlob(name, JSON.stringify(data, null, 2), 'application/json');
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

export function errMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { message?: string; status?: number };
    if (o.status === 401) return 'Connexion requise pour cette action.';
    if (o.message) return o.message;
  }
  return 'Erreur inattendue.';
}

export const STRATEGY_LABEL: Record<string, string> = {
  momentum: 'Momentum seul',
  trend: 'Tendance seule',
  hybrid: 'Hybride',
  filtered: 'Hybride filtré',
};
