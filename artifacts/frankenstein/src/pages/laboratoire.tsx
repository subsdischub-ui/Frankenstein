import { useRef, useState } from 'react';
import { useListExperiments, useRunReplay } from '@workspace/api-client-react';
import type { Candle, DerivativeObservation, Experiment } from '@workspace/api-client-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FileUp, Play } from 'lucide-react';
import { Shell } from '@/components/shell';
import {
  EmptyState,
  EquityChart,
  ErrorBlock,
  GateNote,
  PageHead,
  Panel,
  Pill,
  SkeletonRows,
  Stat,
  TradeTable,
  useAuthed,
  useRefreshAll,
} from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { STRATEGY_LABEL, dt, downloadJson, errMessage, num, pnlTone, signed, usdt, ratio } from '@/lib/format';

const BAR = 15 * 60 * 1000;
type Strategy = 'momentum' | 'trend' | 'hybrid' | 'filtered';

function validateCandles(raw: unknown): { ok: true; candles: Candle[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Le JSON doit être un tableau de bougies.' };
  if (raw.length < 250) return { ok: false, error: `${raw.length} bougies : minimum 250 requis.` };
  if (raw.length > 20000) return { ok: false, error: 'Maximum 20 000 bougies.' };
  const keys = ['time', 'open', 'high', 'low', 'close', 'volume', 'quoteVolume', 'takerBuy'] as const;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as Record<string, unknown>;
    for (const k of keys) {
      if (typeof c?.[k] !== 'number' || !Number.isFinite(c[k] as number))
        return { ok: false, error: `Bougie ${i} : champ « ${k} » absent ou non numérique.` };
    }
    const n = c as unknown as Candle;
    if (n.open <= 0 || n.high <= 0 || n.low <= 0 || n.close <= 0)
      return { ok: false, error: `Bougie ${i} : les prix doivent être strictement positifs.` };
    if (n.volume < 0 || n.quoteVolume < 0 || n.takerBuy < 0)
      return { ok: false, error: `Bougie ${i} : volumes négatifs interdits.` };
    if (n.time % BAR !== 0)
      return { ok: false, error: `Bougie ${i} : l'horodatage n'est pas aligné sur 15 minutes.` };
    if (i > 0 && n.time - (raw[i - 1] as Candle).time !== BAR)
      return { ok: false, error: `Bougie ${i} : écart différent de 15 minutes avec la précédente.` };
  }
  return { ok: true, candles: raw as Candle[] };
}

type ImportBundle = {
  candles: Candle[];
  btcCandles?: Candle[];
  derivativeObservations?: DerivativeObservation[];
  symbol?: string;
  parameters?: { volumeRatio: number; rsiMax: number; expiryBars: number };
};

function parseImport(raw: unknown): { ok: true; bundle: ImportBundle } | { ok: false; error: string } {
  let src: unknown = raw;
  let extra: Record<string, unknown> = {};
  if (!Array.isArray(raw)) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'JSON attendu : tableau de bougies ou bundle.' };
    extra = raw as Record<string, unknown>;
    if (extra.source === 'synthetic')
      return { ok: false, error: "Fichier marqué source « synthetic » : refusé. Un gabarit de format n'est jamais une preuve de marché. Utilisez le bouton de démonstration." };
    src = extra.candles;
  }
  const c = validateCandles(src);
  if (!c.ok) return c;
  const bundle: ImportBundle = { candles: c.candles };
  if (typeof extra.symbol === 'string') bundle.symbol = extra.symbol;
  if (extra.parameters !== undefined) {
    const q = extra.parameters as Record<string, unknown>;
    const ok = (v: unknown, a: number, b: number) => typeof v === 'number' && v >= a && v <= b;
    if (!ok(q?.volumeRatio, 1.5, 5) || !ok(q?.rsiMax, 25, 50) || !ok(q?.expiryBars, 8, 48))
      return { ok: false, error: 'parameters : volumeRatio 1,5 à 5, rsiMax 25 à 50, expiryBars 8 à 48.' };
    bundle.parameters = q as ImportBundle['parameters'];
  }
  if (extra.btcCandles !== undefined) {
    const b = validateCandles(extra.btcCandles);
    if (!b.ok) return { ok: false, error: `btcCandles : ${b.error}` };
    if (b.candles.length !== c.candles.length || b.candles.some((x, i) => x.time !== c.candles[i].time))
      return { ok: false, error: 'btcCandles doit être exactement aligné sur candles (mêmes horodatages, même longueur).' };
    bundle.btcCandles = b.candles;
  }
  if (extra.derivativeObservations !== undefined) {
    const d = extra.derivativeObservations;
    if (
      !Array.isArray(d) ||
      d.some((o) => typeof o?.time !== 'number' || typeof o?.deltaOi !== 'number' || typeof o?.fundingRate !== 'number')
    )
      return { ok: false, error: 'derivativeObservations : attendu [{time, deltaOi, fundingRate}] numériques.' };
    bundle.derivativeObservations = d as DerivativeObservation[];
  }
  return { ok: true, bundle };
}

/** Gabarit de FORMAT uniquement : valeurs synthétiques déterministes, sans valeur de marché. */
function templateCandles(): Candle[] {
  const start = Math.floor(Date.UTC(2024, 0, 1) / BAR) * BAR;
  let price = 100;
  return Array.from({ length: 250 }, (_, i) => {
    const open = price;
    price = Math.max(1, price + Math.sin(i / 9) * 0.6 + Math.cos(i / 23) * 0.4);
    const close = price;
    return {
      time: start + i * BAR,
      open: +open.toFixed(4),
      high: +(Math.max(open, close) * 1.002).toFixed(4),
      low: +(Math.min(open, close) * 0.998).toFixed(4),
      close: +close.toFixed(4),
      volume: 1000 + (i % 17) * 20,
      quoteVolume: +((1000 + (i % 17) * 20) * close).toFixed(2),
      takerBuy: 480 + (i % 13) * 10,
    };
  });
}

function ExperimentView({ exp, transient }: { exp: Experiment; transient?: boolean }) {
  return (
    <div className="space-y-5" data-testid={`experiment-${exp.id}`}>
      <Panel
        kicker={`${exp.source} · ${STRATEGY_LABEL[exp.strategy] ?? exp.strategy}`}
        title={`Expérience ${exp.id.slice(0, 8)}`}
        action={
          <div className="flex items-center gap-2">
            {transient && <Pill tone="warn">Transitoire · hors portefeuille</Pill>}
            <Pill tone="line">{exp.status}</Pill>
            <Button size="sm" variant="outline" onClick={() => downloadJson(`frankenstein-replay-${exp.id}.json`, exp)} data-testid="button-download-report">
              <Download className="mr-1 h-3 w-3" /> Rapport JSON
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
          <Stat label="Trades" value={exp.trades} />
          <Stat label="PnL" value={signed(exp.pnl)} tone={pnlTone(exp.pnl)} />
          <Stat label="Frais" value={usdt(exp.fees)} />
          <Stat label="Drawdown" value={ratio(exp.drawdown)} />
          <Stat label="Espérance" value={exp.expectancy === null ? 'Non calculable' : num(exp.expectancy, 4)} />
          <Stat
            label="Intervalle de confiance"
            value={exp.confidenceLow === null || exp.confidenceHigh === null ? 'Absent' : `${num(exp.confidenceLow, 3)} à ${num(exp.confidenceHigh, 3)}`}
            sub={exp.confidenceLow === null ? "Échantillon insuffisant : aucune borne n'est inventée" : undefined}
          />
          <Stat label="Créée" value={dt(exp.createdAt)} />
          <Stat label="Empreinte" value={<span className="font-mono text-sm">{exp.dataHash.slice(0, 14)}</span>} />
        </div>
        {exp.notes.length > 0 && (
          <div className="mt-4 rounded-sm border-l-2 border-[hsl(38,85%,50%)] bg-muted/60 p-3" data-testid="notes-experiment">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider">Notes du backend (verbatim)</div>
            <ul className="list-inside list-disc space-y-1 text-xs">
              {exp.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Courbe d'équité" kicker="Replay">
          <EquityChart points={exp.equityCurve} />
        </Panel>
        <Panel title="Ablation" kicker="Comparaison des stratégies">
          {exp.comparisons.length === 0 ? (
            <EmptyState title="Aucune comparaison" />
          ) : (
            <>
              <div className="h-40" data-testid="chart-ablation">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={exp.comparisons.map((c) => ({ ...c, label: STRATEGY_LABEL[c.strategy] ?? c.strategy }))}>
                    <CartesianGrid stroke="hsl(44 14% 80%)" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis width={48} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [signed(v), 'PnL']} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="pnl" fill="hsl(168 62% 28%)" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-3 w-full text-xs tabular">
                <thead className="font-mono text-[10px] uppercase text-muted-foreground">
                  <tr><th className="text-left">Stratégie</th><th className="text-right">Trades</th><th className="text-right">PnL</th><th className="text-right">Drawdown</th></tr>
                </thead>
                <tbody>
                  {exp.comparisons.map((c) => (
                    <tr key={c.strategy} className="border-t border-border/60">
                      <td className="py-1.5">{STRATEGY_LABEL[c.strategy] ?? c.strategy}</td>
                      <td className="text-right">{c.trades}</td>
                      <td className={`text-right ${pnlTone(c.pnl)}`}>{signed(c.pnl)}</td>
                      <td className="text-right">{ratio(c.drawdown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      </div>
      <Panel title="Journal du replay" kicker={`${exp.journal.length} position(s)`} flush>
        <TradeTable trades={exp.journal} />
      </Panel>
    </div>
  );
}

export default function LaboratoirePage() {
  const { signedIn } = useAuthed();
  const refresh = useRefreshAll();
  const { toast } = useToast();
  const replay = useRunReplay();
  const experiments = useListExperiments();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'demo' | 'import'>('demo');
  const [strategy, setStrategy] = useState<Strategy>('hybrid');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [candles, setCandles] = useState<ImportBundle | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [result, setResult] = useState<{ exp: Experiment; transient: boolean } | null>(null);
  const [selected, setSelected] = useState<Experiment | null>(null);

  const symbolOk = /^[A-Z0-9]{2,20}USDT$/.test(symbol);
  const needImport = source === 'import';
  const canRun = (!needImport || (signedIn && !!candles && symbolOk)) && !replay.isPending;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setCandles(null);
    setFileError('');
    try {
      const v = parseImport(JSON.parse(await f.text()));
      if (v.ok) {
        setCandles(v.bundle);
        if (v.bundle.symbol && /^[A-Z0-9]{2,20}USDT$/.test(v.bundle.symbol)) setSymbol(v.bundle.symbol);
      }
      else setFileError(v.error);
    } catch {
      setFileError('Fichier illisible : JSON invalide.');
    }
  };

  const run = () => {
    const data =
      source === 'demo'
        ? { source: 'demo' as const, strategy }
        : {
            source: 'import' as const,
            strategy,
            symbol,
            candles: candles?.candles ?? [],
            ...(candles?.parameters ? { parameters: candles.parameters } : {}),
            ...(candles?.btcCandles ? { btcCandles: candles.btcCandles } : {}),
            ...(candles?.derivativeObservations ? { derivativeObservations: candles.derivativeObservations } : {}),
          };
    replay.mutate(
      { data },
      {
        onSuccess: (exp) => {
          setResult({ exp, transient: source === 'demo' });
          setSelected(null);
          toast({ title: 'Replay terminé', description: `${exp.trades} trade(s) simulé(s).` });
          void refresh();
        },
        onError: (e) => toast({ title: 'Échec du replay', description: errMessage(e), variant: 'destructive' }),
      },
    );
  };

  const shown = selected ? { exp: selected, transient: false } : result;

  return (
    <Shell>
      <PageHead
        kicker="Isolé du portefeuille"
        title="Laboratoire"
        lead="Rejouez une stratégie sur des bougies historiques sans toucher au portefeuille de marché. Le replay de démonstration est transitoire et accessible sans compte."
      />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Panel title="Nouveau replay" kicker="Paramètres" testId="panel-replay-form">
            <div className="space-y-4 text-sm">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Source</label>
                <div className="grid grid-cols-2 gap-1">
                  {([['demo', 'Démonstration'], ['import', 'JSON importé']] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setSource(k)} data-testid={`source-${k}`}
                      className={`rounded-sm px-2 py-1.5 text-xs ${source === k ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stratégie</label>
                <select value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" data-testid="select-strategy">
                  {Object.entries(STRATEGY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              {needImport && (
                <>
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Symbole</label>
                    <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} data-testid="input-symbol" />
                    {!symbolOk && <p className="mt-1 text-xs text-destructive">Format attendu : ex. BTCUSDT.</p>}
                  </div>
                  <div>
                    <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                      onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-file" />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-pick-file">
                      <FileUp className="mr-1 h-3 w-3" /> Choisir un fichier JSON
                    </Button>
                    {fileName && <p className="mt-1.5 font-mono text-xs">{fileName}</p>}
                    {candles && <p className="text-xs text-primary" data-testid="text-candles-ok">{candles.candles.length} bougies valides, alignées sur 15 min.{' '}
                      {candles.btcCandles ? 'BTC aligné fourni.' : 'Sans BTC : hybride et filtré refuseront toute entrée.'}{candles.parameters ? ` Paramètres candidats : ${candles.parameters.volumeRatio} / ${candles.parameters.rsiMax} / ${candles.parameters.expiryBars}.` : ' Paramètres baseline (3 / 40 / 32).'}{candles.derivativeObservations ? ` ${candles.derivativeObservations.length} observation(s) dérivés.` : ''}</p>}
                    {fileError && <p className="text-xs text-destructive" data-testid="text-candles-error">{fileError}</p>}
                  </div>
                  {!signedIn && <GateNote what="L'import de données exige une session." />}
                </>
              )}
              <Button className="w-full" disabled={!canRun} onClick={run} data-testid="button-run-replay">
                <Play className="mr-1 h-4 w-4" /> {replay.isPending ? 'Replay en cours…' : 'Lancer le replay'}
              </Button>
              {source === 'demo' && (
                <p className="text-xs text-muted-foreground">Test d'intégration injecté (ouverture puis clôture), pas une performance générée par la stratégie. Jamais mélangé au portefeuille de marché.</p>
              )}
            </div>
          </Panel>

          <Panel title="Contrat JSON" kicker="Bougies importées">
            <p className="text-xs text-muted-foreground">
              Tableau de 250 à 20 000 bougies de 15 minutes clôturées, consécutives, avec <span className="font-mono">time</span> en millisecondes aligné sur 15 min.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Accepté : un tableau de bougies, ou un bundle <span className="font-mono">{'{ candles, btcCandles?, derivativeObservations?, symbol?, parameters? }'}</span>. <span className="font-mono">btcCandles</span> doit être exactement aligné sur <span className="font-mono">candles</span>. <span className="font-mono">derivativeObservations</span> : <span className="font-mono">{'[{ time (ms), deltaOi (fraction), fundingRate (fraction) }]'}</span>, horodatage antérieur ou égal au signal et frais de moins de 2 h. <span className="font-mono">parameters</span> optionnel : <span className="font-mono">{'{ volumeRatio, rsiMax, expiryBars }'}</span> pour tester un candidat sans changer le moteur (baseline 3 / 40 / 32). Sans BTC, les stratégies hybride et filtrée refusent toute entrée.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-sm bg-muted p-2 font-mono text-[10px] leading-relaxed">{`[{
  "time": 1704067200000,
  "open": 100.0, "high": 100.4,
  "low": 99.8, "close": 100.2,
  "volume": 1000,
  "quoteVolume": 100200,
  "takerBuy": 480
}]`}</pre>
            <Button size="sm" variant="secondary" className="mt-3" data-testid="button-download-template"
              onClick={() => { const c = templateCandles(); downloadJson('frankenstein-gabarit-bundle.json', { source: 'synthetic', warning: "Gabarit de format uniquement. Ne pas importer comme données de marché ; utilisez le bouton de démonstration.", symbol: 'BTCUSDT', candles: c, btcCandles: c, derivativeObservations: [{ time: c[0].time, deltaOi: 0.01, fundingRate: 0.0001 }] }); }}>
              <Download className="mr-1 h-3 w-3" /> Gabarit de format (250 bougies)
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Marqué source « synthetic » : valeurs fictives, refusé à l'import. Pour tester le moteur, utilisez la démonstration.
            </p>
          </Panel>
        </div>

        <div className="space-y-5">
          {shown ? (
            <ExperimentView exp={shown.exp} transient={shown.transient} />
          ) : (
            <EmptyState title="Aucun replay affiché" body="Lancez un replay de démonstration ou ouvrez une expérience de l'historique." />
          )}
          <Panel title="Historique des expériences" kicker="Persistant" flush testId="panel-experiments">
            {experiments.isLoading ? (
              <div className="p-4"><SkeletonRows rows={3} /></div>
            ) : experiments.isError || !experiments.data ? (
              <div className="p-4"><ErrorBlock onRetry={() => experiments.refetch()} /></div>
            ) : experiments.data.length === 0 ? (
              <div className="p-4"><EmptyState title="Aucune expérience enregistrée" body="Les replays importés apparaîtront ici." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs tabular">
                  <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      {['Date', 'Source', 'Stratégie', 'Trades', 'PnL', 'Drawdown', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {experiments.data.map((x) => (
                      <tr key={x.id} className="border-b border-border/60 hover:bg-muted/50" data-testid={`row-experiment-${x.id}`}>
                        <td className="px-3 py-2">{dt(x.createdAt)}</td>
                        <td className="px-3 py-2">{x.source}</td>
                        <td className="px-3 py-2">{STRATEGY_LABEL[x.strategy] ?? x.strategy}</td>
                        <td className="px-3 py-2">{x.trades}</td>
                        <td className={`px-3 py-2 ${pnlTone(x.pnl)}`}>{signed(x.pnl)}</td>
                        <td className="px-3 py-2">{ratio(x.drawdown)}</td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(x)} data-testid={`button-open-${x.id}`}>Ouvrir</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
