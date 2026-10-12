import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getExportJournalQueryKey,
  getGetAuditsQueryKey,
  getGetSnapshotQueryKey,
  getListExperimentsQueryKey,
} from '@workspace/api-client-react';
import type { Trade } from '@workspace/api-client-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { dtShort, dt, num, pnlTone, signed, usdt } from '@/lib/format';

export function useAuthed() {
  const { isSignedIn, isLoaded } = useAuth();
  return { signedIn: !!isSignedIn, loaded: isLoaded };
}

export function useRefreshAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        getGetSnapshotQueryKey,
        getListExperimentsQueryKey,
        getExportJournalQueryKey,
        getGetAuditsQueryKey,
      ].map((f) => qc.invalidateQueries({ queryKey: f() })),
    );
}

export function Panel({
  title,
  kicker,
  action,
  children,
  className,
  flush,
  testId,
}: {
  title?: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn('rise rounded-md border border-card-border bg-card', className)}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-card-border px-4 py-3">
          <div>
            {kicker && (
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {kicker}
              </div>
            )}
            {title && <h2 className="font-serif text-lg font-semibold leading-tight">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  testId,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
  testId?: string;
}) {
  return (
    <div className="border-l-2 border-primary/30 pl-3" data-testid={testId}>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn('tabular font-serif text-xl font-semibold leading-snug', tone)}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const PILL: Record<string, string> = {
  ok: 'bg-primary text-primary-foreground',
  warn: 'bg-[hsl(38,85%,55%)] text-[hsl(168,35%,9%)]',
  bad: 'bg-destructive text-destructive-foreground',
  volt: 'bg-accent text-accent-foreground',
  mute: 'bg-secondary text-secondary-foreground',
  line: 'border border-border text-muted-foreground',
};

export function Pill({
  tone = 'mute',
  children,
  testId,
}: {
  tone?: keyof typeof PILL;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
        PILL[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden>
        <circle cx="22" cy="22" r="19" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" className="text-muted-foreground" />
        <path d="M13 22h18" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" />
      </svg>
      <div className="font-serif text-base font-semibold">{title}</div>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="error-block"
      className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <span className="flex-1">{message ?? 'Impossible de charger les données.'}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry">
          <RefreshCw className="mr-1 h-3 w-3" /> Réessayer
        </Button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="skeleton-rows">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function GateNote({ what }: { what: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      <Lock className="h-3 w-3" />
      <span>{what}</span>
      <Link href="/sign-in" className="font-semibold text-primary underline" data-testid="link-gate-signin">
        Se connecter
      </Link>
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  lead,
  right,
}: {
  kicker: string;
  title: string;
  lead?: string;
  right?: ReactNode;
}) {
  return (
    <div className="rise mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {kicker}
        </div>
        <h1 className="font-serif text-3xl font-extrabold leading-none tracking-tight md:text-4xl">
          {title}
        </h1>
        {lead && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{lead}</p>}
      </div>
      {right}
    </div>
  );
}

export function EquityChart({
  points,
  baseline,
}: {
  points: { time: string; equity: number }[];
  baseline?: number;
}) {
  const [hover, setHover] = useState(false);
  if (points.length < 2) {
    return (
      <EmptyState
        title="Courbe en attente"
        body={
          points.length === 1
            ? `Un seul point d'équité enregistré : ${usdt(points[0].equity)}. La courbe apparaît dès le deuxième point.`
            : "Aucun point d'équité enregistré."
        }
      />
    );
  }
  const data = points.map((p) => ({ t: new Date(p.time).getTime(), equity: p.equity }));
  return (
    <div
      className="h-56 w-full"
      data-testid="chart-equity"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(168 62% 28%)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(168 62% 28%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(44 14% 80%)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => dtShort(new Date(v).toISOString())}
            tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
            minTickGap={50}
          />
          <YAxis
            domain={['auto', 'auto']}
            width={64}
            tickFormatter={(v: number) => num(v, 0)}
            tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
          />
          {baseline !== undefined && (
            <ReferenceLine y={baseline} stroke="hsl(10 66% 42%)" strokeDasharray="4 4" />
          )}
          <Tooltip
            formatter={(v: number) => [usdt(v), 'Équité']}
            labelFormatter={(v: number) => dt(new Date(v).toISOString())}
            contentStyle={{ fontSize: 12, borderRadius: 4 }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="hsl(168 62% 24%)"
            strokeWidth={hover ? 2.5 : 1.75}
            fill="url(#eqfill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TradeTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) {
    return (
      <EmptyState
        title="Aucune position"
        body="Le journal est vide. Aucune entrée n'a été acceptée par les règles de risque."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-xs" data-testid="table-trades">
        <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            {['Id', 'Symbole', 'Statut', 'Entrée', 'Stop', 'Cible', 'Qté', 'Marque', 'Frais', 'PnL', 'Ouverte', 'Fermée', 'Sortie', 'Version', 'Source'].map(
              (h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="tabular">
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-border/60 hover:bg-muted/50" data-testid={`row-trade-${t.id}`}>
              <td className="px-3 py-2 font-mono">{t.id.slice(0, 8)}</td>
              <td className="px-3 py-2 font-semibold">{t.symbol}</td>
              <td className="px-3 py-2">
                <Pill tone={t.status === 'OPEN' ? 'volt' : 'mute'}>
                  {t.status === 'OPEN' ? 'Ouverte' : 'Clôturée'}
                </Pill>
              </td>
              <td className="px-3 py-2">{num(t.entry, 4)}</td>
              <td className="px-3 py-2">{num(t.stop, 4)}</td>
              <td className="px-3 py-2">{num(t.target, 4)}</td>
              <td className="px-3 py-2">{num(t.quantity, 4)}</td>
              <td className="px-3 py-2">{num(t.mark, 4)}</td>
              <td className="px-3 py-2">{num(t.fees, 4)}</td>
              <td className={cn('px-3 py-2 font-semibold', pnlTone(t.pnl))}>{signed(t.pnl, 4)}</td>
              <td className="whitespace-nowrap px-3 py-2">{dt(t.openedAt)}</td>
              <td className="whitespace-nowrap px-3 py-2">{dt(t.closedAt)}</td>
              <td className="px-3 py-2">{t.exitReason ?? '—'}</td>
              <td className="px-3 py-2 font-mono">{t.version}</td>
              <td className="px-3 py-2">{t.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
