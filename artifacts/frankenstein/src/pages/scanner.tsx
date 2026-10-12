import { Fragment, useMemo, useState } from 'react';
import { useGetSnapshot, useScanMarket, getGetSnapshotQueryKey } from '@workspace/api-client-react';
import { Radar } from 'lucide-react';
import { Shell } from '@/components/shell';
import {
  EmptyState,
  ErrorBlock,
  GateNote,
  PageHead,
  Panel,
  Pill,
  SkeletonRows,
  useAuthed,
  useRefreshAll,
} from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { dt, errMessage, num, ratio, signedRatio } from '@/lib/format';

type SortKey = 'volumeRatio' | 'relativeStrength' | 'quoteVolume' | 'change24h' | 'symbol';
const SORTS: { k: SortKey; l: string }[] = [
  { k: 'volumeRatio', l: 'Ratio de volume' },
  { k: 'relativeStrength', l: 'Force relative' },
  { k: 'quoteVolume', l: 'Volume coté' },
  { k: 'change24h', l: 'Variation 24 h' },
  { k: 'symbol', l: 'Symbole' },
];

export default function ScannerPage() {
  const { data, isLoading, isError, refetch } = useGetSnapshot({
    query: { refetchInterval: 10000, queryKey: getGetSnapshotQueryKey() },
  });
  const { signedIn } = useAuthed();
  const refresh = useRefreshAll();
  const { toast } = useToast();
  const scan = useScanMarket();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('volumeRatio');
  const [only, setOnly] = useState<'all' | 'yes' | 'no'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const assets = useMemo(() => {
    const list = (data?.assets ?? []).filter((a) => a.symbol.toLowerCase().includes(q.toLowerCase()));
    return [...list].sort((a, b) => {
      if (sort === 'symbol') return a.symbol.localeCompare(b.symbol);
      const av = a[sort];
      const bv = b[sort];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });
  }, [data, q, sort]);

  const decisions = useMemo(
    () =>
      (data?.decisions ?? []).filter((d) =>
        only === 'all' ? true : only === 'yes' ? d.accepted : !d.accepted,
      ),
    [data, only],
  );

  const runScan = () =>
    scan.mutate(undefined, {
      onSuccess: (r) => {
        toast({ title: r.ok ? 'Scan lancé' : 'Scan refusé', description: r.message });
        void refresh();
      },
      onError: (e) => toast({ title: 'Échec du scan', description: errMessage(e), variant: 'destructive' }),
    });

  return (
    <Shell>
      <PageHead
        kicker="Classement et raisons"
        title="Scanner"
        lead="Chaque actif est classé et porte les raisons exactes pour lesquelles il est accepté ou rejeté. Un score absent reste absent."
        right={
          <div className="space-y-2">
            <Button onClick={runScan} disabled={!signedIn || scan.isPending} data-testid="button-scan">
              <Radar className="mr-1 h-4 w-4" /> {scan.isPending ? 'Scan en cours…' : 'Lancer un scan'}
            </Button>
            {!signedIn && <GateNote what="Le scan manuel exige une session." />}
          </div>
        }
      />
      {isLoading ? (
        <SkeletonRows rows={8} />
      ) : isError || !data ? (
        <ErrorBlock onRetry={() => refetch()} />
      ) : (
        <div className="space-y-5">
          <Panel
            title="Classement des actifs"
            kicker={`${assets.length} actif(s)`}
            flush
            action={
              <div className="flex flex-wrap gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filtrer un symbole"
                  className="h-8 w-44 text-xs"
                  data-testid="input-filter-asset"
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  data-testid="select-sort"
                >
                  {SORTS.map((s) => (
                    <option key={s.k} value={s.k}>
                      Tri : {s.l}
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            {assets.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Aucun actif scanné"
                  body="Aucun résultat pour l'instant. Le flux de marché est peut-être en attente ou le filtre est trop strict."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs" data-testid="table-assets">
                  <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      {['#', 'Symbole', 'Prix', '24 h', 'Volume coté', 'Ratio vol.', 'Force rel.', 'État', 'Mis à jour'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {assets.map((a, i) => (
                      <Fragment key={a.symbol}>
                        <tr
                          className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                          onClick={() => setOpenId(openId === a.symbol ? null : a.symbol)}
                          data-testid={`row-asset-${a.symbol}`}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-semibold">{a.symbol}</td>
                          <td className="px-3 py-2">{num(a.price, 4)}</td>
                          <td className={`px-3 py-2 ${a.change24h < 0 ? 'text-destructive' : ''}`}>{signedRatio(a.change24h)}</td>
                          <td className="px-3 py-2">{num(a.quoteVolume, 0)}</td>
                          <td className="px-3 py-2">{a.volumeRatio === null ? 'absent' : num(a.volumeRatio)}</td>
                          <td className="px-3 py-2">{a.relativeStrength === null ? 'absente' : signedRatio(a.relativeStrength)}</td>
                          <td className="px-3 py-2"><Pill tone="line">{a.state}</Pill></td>
                          <td className="whitespace-nowrap px-3 py-2">{dt(a.updatedAt)}</td>
                        </tr>
                        {openId === a.symbol && (
                          <tr className="bg-muted/40">
                            <td />
                            <td colSpan={8} className="px-3 py-3">
                              {a.reasons.length ? (
                                <ul className="list-inside list-disc space-y-0.5">
                                  {a.reasons.map((r) => <li key={r}>{r}</li>)}
                                </ul>
                              ) : (
                                <span className="text-muted-foreground">Aucune raison fournie.</span>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Décisions et raisons"
            kicker={`${decisions.length} décision(s)`}
            action={
              <div className="flex gap-1">
                {([['all', 'Toutes'], ['yes', 'Acceptées'], ['no', 'Rejetées']] as const).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOnly(k)}
                    data-testid={`filter-decisions-${k}`}
                    className={`rounded-sm px-2.5 py-1 text-xs ${only === k ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            }
          >
            {decisions.length === 0 ? (
              <EmptyState title="Aucune décision" body="Aucune décision enregistrée pour ce filtre." />
            ) : (
              <ul className="divide-y divide-border">
                {decisions.map((d) => (
                  <li key={d.id} className="py-3" data-testid={`decision-${d.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{d.symbol}</span>
                      <Pill tone={d.accepted ? 'ok' : 'bad'}>{d.accepted ? 'Acceptée' : 'Rejetée'}</Pill>
                      <span className="font-mono text-xs text-muted-foreground">{dt(d.time)}</span>
                      <span className="ml-auto font-mono text-xs">
                        {d.score === null ? 'Score absent' : `Score ${num(d.score, 3)}`}
                      </span>
                    </div>
                    <ul className="mt-1.5 list-inside list-disc text-xs">
                      {d.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                    {d.shadowScore !== null && d.shadowScore !== undefined && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Score fantôme {num(d.shadowScore, 3)} (modèle {d.shadowModelId?.slice(0, 8) ?? 'inconnu'}) : observation uniquement, sans effet sur la décision.
                      </div>
                    )}
                    {d.outcome && <div className="mt-1 text-xs text-muted-foreground">Issue : {d.outcome}</div>}
                    {Object.keys(d.features).length > 0 && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Caractéristiques
                        </summary>
                        <dl className="mt-1 grid grid-cols-2 gap-x-4 font-mono text-[11px] md:grid-cols-4">
                          {Object.entries(d.features).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2 border-b border-border/50 py-0.5">
                              <dt className="text-muted-foreground">{k}</dt>
                              <dd>{num(v, 4)}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </Shell>
  );
}
