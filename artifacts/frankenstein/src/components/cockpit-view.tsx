import { useState } from 'react';
import { getGetSnapshotQueryKey, useControlEngine, useGetSnapshot } from '@workspace/api-client-react';
import type { ControlInputAction } from '@workspace/api-client-react';
import { Pause, Play, OctagonX } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  EmptyState,
  EquityChart,
  ErrorBlock,
  GateNote,
  Panel,
  Pill,
  SkeletonRows,
  Stat,
  TradeTable,
  useAuthed,
  useRefreshAll,
} from '@/components/kit';
import { dt, errMessage, num, pnlTone, ratio, signed, usdt } from '@/lib/format';

const FEED: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'mute' }> = {
  waiting: { label: 'En attente', tone: 'mute' },
  healthy: { label: 'Flux sain', tone: 'ok' },
  stale: { label: 'Flux périmé', tone: 'warn' },
  unavailable: { label: 'Flux indisponible', tone: 'bad' },
};

const CONFIRM: Record<ControlInputAction, { title: string; body: string; cta: string }> = {
  start: {
    title: 'Démarrer le moteur papier ?',
    body: "Le démarrage n'envoie aucun ordre à un exchange : toutes les positions restent simulées. Si le moteur est en arrêt d'urgence, ce démarrage manuel est la seule façon de réautoriser les entrées.",
    cta: 'Confirmer le démarrage',
  },
  pause: {
    title: 'Mettre le moteur en pause ?',
    body: 'Les nouvelles entrées sont suspendues. Les positions ouvertes restent surveillées pour leurs sorties (stop, cible, durée).',
    cta: 'Confirmer la pause',
  },
  halt: {
    title: "Déclencher l'arrêt d'urgence ?",
    body: "Toutes les entrées sont bloquées de façon permanente jusqu'à un redémarrage manuel avec confirmation.",
    cta: "Confirmer l'arrêt",
  },
};

export function CockpitView() {
  const { data, isLoading, isError, refetch } = useGetSnapshot({
    query: { refetchInterval: 10000, queryKey: getGetSnapshotQueryKey() },
  });
  const { signedIn } = useAuthed();
  const refresh = useRefreshAll();
  const { toast } = useToast();
  const control = useControlEngine();
  const [pending, setPending] = useState<ControlInputAction | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonRows rows={3} />
        <SkeletonRows rows={5} />
      </div>
    );
  }
  if (isError || !data) return <ErrorBlock onRetry={() => refetch()} />;

  const { engine, portfolio: p, risk, trades, activity, equityCurve } = data;
  const feed = FEED[engine.feedStatus] ?? FEED.waiting;
  const open = trades.filter((t) => t.status === 'OPEN');
  const state = engine.halted
    ? { label: "Arrêt d'urgence", tone: 'bad' as const }
    : engine.running
      ? { label: 'En marche', tone: 'ok' as const }
      : { label: 'En pause', tone: 'warn' as const };

  const run = (action: ControlInputAction) => {
    control.mutate(
      { data: { action } },
      {
        onSuccess: (r) => {
          toast({ title: r.ok ? 'Commande appliquée' : 'Commande refusée', description: r.message });
          void refresh();
        },
        onError: (e) =>
          toast({ title: 'Échec de la commande', description: errMessage(e), variant: 'destructive' }),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <div className="space-y-5">
      <Panel kicker="Portefeuille simulé" title="État du capital" testId="panel-portfolio">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4 lg:grid-cols-5">
          <Stat label="Capital initial" value={usdt(p.initialCapital)} testId="stat-initial" />
          <Stat label="Équité" value={usdt(p.equity)} testId="stat-equity" />
          <Stat label="Liquidités" value={usdt(p.cash)} />
          <Stat label="PnL réalisé" value={signed(p.realizedPnl)} tone={pnlTone(p.realizedPnl)} />
          <Stat label="PnL latent" value={signed(p.unrealizedPnl)} tone={pnlTone(p.unrealizedPnl)} />
          <Stat label="Frais" value={usdt(p.fees)} />
          <Stat label="Exposition" value={ratio(p.exposure)} />
          <Stat label="Risque ouvert" value={usdt(p.openRisk)} />
          <Stat label="Drawdown" value={ratio(p.drawdown)} />
          <Stat
            label="Trades clos"
            value={p.closedTrades}
            sub={p.winRate === null ? 'Taux de réussite : aucun trade clos' : `Réussite ${ratio(p.winRate, 1)}`}
            testId="stat-closed"
          />
        </div>
        {p.closedTrades === 0 && open.length === 0 && (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground" data-testid="text-no-trades">
            Aucune transaction : état normal. Le moteur n'entre que si toutes les règles sont satisfaites ; le capital reste à 10 000 USDT tant qu'aucune position n'a été ouverte.
          </p>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel kicker="Moteur" title="Supervision" className="lg:col-span-1" testId="panel-engine">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Pill tone={state.tone} testId="status-engine">{state.label}</Pill>
            <Pill tone={feed.tone} testId="status-feed">{feed.label}</Pill>
            <Pill tone="line">Mode {engine.mode}</Pill>
            <Pill tone="line">{engine.authenticated ? 'Session authentifiée' : 'Observateur'}</Pill>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{engine.feedMessage}</p>
          <dl className="grid grid-cols-2 gap-y-2 text-xs">
            {[
              ['Dernier scan', dt(engine.lastScan)],
              ['Battement', dt(engine.heartbeat)],
              ['Prochain cycle', `${engine.nextCycleSeconds} s`],
              ['Baseline', engine.baselineVersion],
              ['Modèle (baseline, pas de score IA)', engine.modelStatus],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular text-right font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" disabled={!signedIn || control.isPending} onClick={() => setPending('start')} data-testid="button-start">
              <Play className="mr-1 h-3 w-3" /> Démarrer
            </Button>
            <Button size="sm" variant="secondary" disabled={!signedIn || control.isPending} onClick={() => setPending('pause')} data-testid="button-pause">
              <Pause className="mr-1 h-3 w-3" /> Pause
            </Button>
            <Button size="sm" variant="destructive" disabled={!signedIn || control.isPending} onClick={() => setPending('halt')} data-testid="button-halt">
              <OctagonX className="mr-1 h-3 w-3" /> Arrêt d'urgence
            </Button>
          </div>
          {!signedIn && (
            <div className="mt-3">
              <GateNote what="Les commandes du moteur exigent une session." />
            </div>
          )}
        </Panel>

        <Panel kicker="Série temporelle" title="Courbe d'équité" className="lg:col-span-2">
          <EquityChart points={equityCurve} baseline={p.initialCapital} />
        </Panel>
      </div>

      <Panel kicker={`${open.length} ouverte(s)`} title="Positions ouvertes" flush>
        {open.length ? (
          <TradeTable trades={open} />
        ) : (
          <div className="p-4">
            <EmptyState title="Aucune position ouverte" body="Le moteur attend un signal qui franchit tous les filtres." />
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel kicker="Garde-fous" title="Limites de risque" testId="panel-risk">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3">
            <Stat label="Risque / trade" value={ratio(risk.riskPerTrade)} />
            <Stat label="Risque ouvert max" value={ratio(risk.maxOpenRisk)} />
            <Stat label="Positions max" value={risk.maxPositions} />
            <Stat label="Exposition max" value={ratio(risk.maxExposure)} />
            <Stat label="Par actif max" value={ratio(risk.maxAssetExposure)} />
            <Stat label="Perte journalière" value={ratio(risk.dailyLossLimit)} />
            <Stat label="Drawdown max" value={ratio(risk.drawdownLimit)} />
            <Stat label="Frais" value={ratio(risk.feeRate, 3)} />
            <Stat label="Glissement" value={ratio(risk.slippageRate, 3)} />
            <Stat label="Récompense / risque" value={num(risk.rewardRisk)} />
            <Stat label="Durée max" value={`${risk.maxHoldingHours} h`} />
          </div>
        </Panel>
        <Panel kicker="Flux" title="Activité récente" testId="panel-activity">
          {activity.length ? (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {activity.map((a) => (
                <li key={a.id} className="border-l-2 border-accent pl-3 text-xs">
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">
                    {dt(a.time)} · {a.type}
                  </div>
                  {a.message}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucune activité" body="Le journal d'événements est vide." />
          )}
        </Panel>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-serif">{CONFIRM[pending].title}</AlertDialogTitle>
                <AlertDialogDescription>{CONFIRM[pending].body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-control">Annuler</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-confirm-control"
                  onClick={(e) => {
                    e.preventDefault();
                    run(pending);
                  }}
                >
                  {control.isPending ? 'Envoi…' : CONFIRM[pending].cta}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
