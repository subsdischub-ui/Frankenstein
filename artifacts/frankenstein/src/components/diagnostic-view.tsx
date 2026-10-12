import {
  getExportLabDiagnosticsQueryKey,
  getGetLabDiagnosticsQueryKey,
  useExportLabDiagnostics,
  useGetLabDiagnostics,
} from '@workspace/api-client-react';
import type { DiagnosticCheckStatus, DiagnosticCycle, DiagnosticWindow } from '@workspace/api-client-react';
import { useAuth } from '@clerk/react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { EmptyState, ErrorBlock, GateNote, Panel, Pill, SkeletonRows, Stat } from '@/components/kit';
import { downloadJson, dt, errMessage } from '@/lib/format';

const STATUS: Record<DiagnosticCheckStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'volt' | 'mute' | 'line' }> = {
  FILTERED: { label: 'Filtré', tone: 'mute' },
  WAITING: { label: 'En attente', tone: 'line' },
  ERROR: { label: 'Erreur', tone: 'bad' },
  SIGNAL: { label: 'Signal', tone: 'volt' },
  ACCEPTED: { label: 'Accepté', tone: 'ok' },
  REJECTED: { label: 'Rejeté', tone: 'warn' },
};

function ageLabel(iso: string | null): string {
  if (!iso) return 'aucun enregistrement';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "il y a moins d'une minute";
  if (m < 120) return `il y a ${m} min`;
  return `il y a ${Math.round(m / 60)} h`;
}

function Breakdown({ title, items, testId }: { title: string; items: { label: string; count: number }[]; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      {items.length ? (
        <ul className="space-y-1 text-xs">
          {items.map((i) => (
            <li key={i.label} className="flex justify-between gap-3 border-b border-border/50 pb-1">
              <span className="break-words">{i.label}</span>
              <span className="tabular font-mono">{i.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune donnée.</p>
      )}
    </div>
  );
}

function WindowSummary({ label, w, id }: { label: string; w: DiagnosticWindow; id: string }) {
  return (
    <div className="space-y-4" data-testid={`window-${id}`}>
      <h3 className="font-serif text-base font-semibold">{label}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Cycles" value={w.cycles} testId={`stat-${id}-cycles`} />
        <Stat label="Observations" value={w.observations} testId={`stat-${id}-observations`} />
        <Stat label="Candidats" value={w.candidates} />
        <Stat label="Signaux" value={w.signals} />
        <Stat label="Acceptés" value={w.accepted} />
        <Stat label="Rejetés" value={w.rejected} />
        <Stat label="Erreurs" value={w.errors} tone={w.errors > 0 ? 'text-destructive' : undefined} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Breakdown title="Étapes" items={w.stages} testId={`list-${id}-stages`} />
        <Breakdown title="Raisons" items={w.reasons} testId={`list-${id}-reasons`} />
      </div>
    </div>
  );
}

function CycleBlock({ c }: { c: DiagnosticCycle }) {
  return (
    <div data-testid="block-latest-cycle">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Pill tone={c.status === 'healthy' ? 'ok' : 'bad'}>{c.status === 'healthy' ? 'Collecte générale OK' : 'Données indisponibles'}</Pill>
        <Pill tone="line">{c.ownerRunning ? 'Moteur en marche' : 'Moteur arrêté'}</Pill>
        <Pill tone="line">Baseline {c.baselineVersion}</Pill>
        <span className="font-mono text-[11px] text-muted-foreground">{dt(c.time)} · {ageLabel(c.time)}</span>
      </div>
      {c.checks.length ? (
        <ul className="divide-y divide-border/60 rounded-sm border border-border">
          {c.checks.map((k, i) => (
            <li key={`${k.symbol}-${i}`} className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-start sm:gap-3" data-testid={`row-check-${k.symbol}`}>
              <div className="flex items-center gap-2 sm:w-48 sm:shrink-0">
                <span className="font-semibold">{k.symbol}</span>
                <Pill tone={STATUS[k.status]?.tone ?? 'mute'}>{STATUS[k.status]?.label ?? k.status}</Pill>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground sm:w-32 sm:shrink-0">{k.stage}</div>
              <div className="flex-1 break-words">{k.reasons.length ? k.reasons.join(' · ') : '—'}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aucun actif évalué lors de ce cycle.</p>
      )}
    </div>
  );
}

export function DiagnosticView() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const signedIn = !!isSignedIn;
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useGetLabDiagnostics({
    query: { enabled: !!userId, refetchInterval: 60000, queryKey: [...getGetLabDiagnosticsQueryKey(), userId] },
  });
  const exp = useExportLabDiagnostics({
    query: { enabled: false, retry: false, queryKey: [...getExportLabDiagnosticsQueryKey(), userId] },
  });

  const onExport = async () => {
    const r = await exp.refetch();
    if (r.data) {
      const stamp = r.data.generatedAt.replace(/[:.]/g, '-');
      downloadReport(stamp, r.data);
    } else {
      toast({ title: "Échec de l'export", description: errMessage(r.error), variant: 'destructive' });
    }
  };

  const action = (
    <Button size="sm" variant="outline" disabled={!signedIn || exp.isFetching} onClick={onExport} data-testid="button-export-diagnostics">
      <Download className="mr-1 h-3 w-3" /> {exp.isFetching ? 'Export…' : 'Exporter JSON (72 h)'}
    </Button>
  );

  return (
    <Panel kicker="Diagnostic labo" title="Parcours des scans" action={action} testId="panel-diagnostics">
      {!signedIn && (
        <div className="mb-4">
          <GateNote what="L'export privé du rapport exige une session." />
        </div>
      )}
      {!isLoaded || (signedIn && isLoading) ? (
        <SkeletonRows rows={4} />
      ) : !signedIn ? (
        <EmptyState title="Diagnostic privé" body="Connecte-toi pour voir les scans de ton laboratoire paper." />
      ) : isError || !data ? (
        <ErrorBlock message="Impossible de charger le diagnostic." onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Pill tone="line">Mode {data.mode}</Pill>
            <Pill tone="line">Baseline {data.baselineVersion}</Pill>
            <span className="font-mono text-[11px] text-muted-foreground" data-testid="text-diagnostic-freshness">
              Dernier enregistrement : {dt(data.lastRecordedAt)} ({ageLabel(data.lastRecordedAt)}) · Premier : {dt(data.firstRecordedAt)} · Généré : {dt(data.generatedAt)}
            </span>
          </div>
          {signedIn && data.lastRecordedAt && Date.now() - Date.parse(data.lastRecordedAt) > 10 * 60000 && (
            <p className="rounded-sm border border-destructive/50 px-3 py-2 text-xs text-destructive" role="alert">
              Aucun diagnostic enregistré depuis plus de 10 minutes. Vérifier l'état du moteur et les journaux du serveur.
            </p>
          )}
          <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground" data-testid="text-diagnostic-notice">
            Les compteurs sont des observations (un actif évalué à chaque cycle), pas des cryptos uniques : un même actif compte une fois par cycle. L'historique ne commence qu'après le déploiement de ce diagnostic. Lecture seule : les seuils du modèle et du trading restent inchangés. Actualisé au plus toutes les 60 secondes.
          </p>
          {data.cycles.length === 0 && data.last72h.cycles === 0 ? (
            <EmptyState title="Aucun cycle enregistré" body="Le diagnostic se remplira au prochain cycle du moteur papier." />
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <WindowSummary label="Dernières 24 h" w={data.last24h} id="24h" />
                <WindowSummary label="Dernières 72 h" w={data.last72h} id="72h" />
              </div>
              <div className="border-t border-border pt-4">
                <h3 className="mb-2 font-serif text-base font-semibold">Cycle le plus récent, par actif</h3>
                {data.cycles.length ? (
                  <CycleBlock c={[...data.cycles].sort((a, b) => b.time.localeCompare(a.time))[0]} />
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun cycle détaillé disponible.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function downloadReport(stamp: string, report: unknown) {
  downloadJson(`frankenstein-diagnostic-${stamp}.json`, report);
}
