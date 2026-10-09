import { useMemo, useState } from 'react';
import { getGetSnapshotQueryKey, useGetSnapshot } from '@workspace/api-client-react';
import { Shell } from '@/components/shell';
import {
  EmptyState,
  ErrorBlock,
  PageHead,
  Panel,
  Pill,
  SkeletonRows,
  TradeTable,
} from '@/components/kit';
import { ExportButtons } from '@/components/export-buttons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { downloadBlob, dt, num, toCsv } from '@/lib/format';

export default function JournalPage() {
  const { data, isLoading, isError, refetch } = useGetSnapshot({
    query: { refetchInterval: 10000, queryKey: getGetSnapshotQueryKey() },
  });
  const [tab, setTab] = useState<'trades' | 'decisions'>('trades');
  const [status, setStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [q, setQ] = useState('');

  const trades = useMemo(
    () =>
      (data?.trades ?? []).filter(
        (t) => (status === 'ALL' || t.status === status) && t.symbol.toLowerCase().includes(q.toLowerCase()),
      ),
    [data, status, q],
  );
  const decisions = useMemo(
    () => (data?.decisions ?? []).filter((d) => d.symbol.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  const viewCsv = () => {
    const rows =
      tab === 'trades'
        ? trades.map((t) => ({ ...t }))
        : decisions.map((d) => ({ ...d, reasons: d.reasons.join(' | '), features: JSON.stringify(d.features) }));
    downloadBlob(`frankenstein-vue-${tab}.csv`, toCsv(rows as Record<string, unknown>[]), 'text/csv');
  };

  return (
    <Shell>
      <PageHead
        kicker="Mémoire persistante"
        title="Journal"
        lead="Toutes les positions et toutes les décisions, acceptées comme rejetées, avec leur version de règles et leur source."
      />
      <div className="space-y-5">
        <Panel title="Export complet" kicker="Privé · session requise">
          <ExportButtons />
        </Panel>
        <Panel
          flush
          title={tab === 'trades' ? 'Positions' : 'Décisions'}
          kicker={tab === 'trades' ? `${trades.length} ligne(s)` : `${decisions.length} ligne(s)`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {(['trades', 'decisions'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  data-testid={`tab-${k}`}
                  className={`rounded-sm px-2.5 py-1 text-xs ${tab === k ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                >
                  {k === 'trades' ? 'Positions' : 'Décisions'}
                </button>
              ))}
              {tab === 'trades' &&
                (['ALL', 'OPEN', 'CLOSED'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    data-testid={`filter-status-${s}`}
                    className={`rounded-sm border px-2 py-1 text-xs ${status === s ? 'border-primary font-semibold' : 'border-border'}`}
                  >
                    {s === 'ALL' ? 'Toutes' : s === 'OPEN' ? 'Ouvertes' : 'Clôturées'}
                  </button>
                ))}
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Symbole"
                className="h-8 w-32 text-xs"
                data-testid="input-filter-journal"
              />
              <Button size="sm" variant="outline" onClick={viewCsv} data-testid="button-csv-view">
                CSV de la vue
              </Button>
            </div>
          }
        >
          {isLoading ? (
            <div className="p-4"><SkeletonRows rows={6} /></div>
          ) : isError || !data ? (
            <div className="p-4"><ErrorBlock onRetry={() => refetch()} /></div>
          ) : tab === 'trades' ? (
            <TradeTable trades={trades} />
          ) : decisions.length === 0 ? (
            <div className="p-4"><EmptyState title="Aucune décision" body="Rien n'a encore été journalisé." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs" data-testid="table-decisions">
                <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    {['Heure', 'Symbole', 'Verdict', 'Score', 'Score fantôme (observation)', 'Raisons', 'Issue'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={d.id} className="border-b border-border/60 align-top hover:bg-muted/50" data-testid={`row-decision-${d.id}`}>
                      <td className="whitespace-nowrap px-3 py-2">{dt(d.time)}</td>
                      <td className="px-3 py-2 font-semibold">{d.symbol}</td>
                      <td className="px-3 py-2"><Pill tone={d.accepted ? 'ok' : 'bad'}>{d.accepted ? 'Acceptée' : 'Rejetée'}</Pill></td>
                      <td className="tabular px-3 py-2">{d.score === null ? 'absent' : num(d.score, 3)}</td>
                      <td className="tabular px-3 py-2 text-muted-foreground" data-testid={`shadow-${d.id}`}>
                        {d.shadowScore === null || d.shadowScore === undefined ? '—' : `${num(d.shadowScore, 3)} (${d.shadowModelId?.slice(0, 8) ?? 'modèle ?'})`}
                      </td>
                      <td className="px-3 py-2">{d.reasons.join(' · ')}</td>
                      <td className="px-3 py-2">{d.outcome ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
