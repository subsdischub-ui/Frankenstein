import { useState } from 'react';
import { getGetSnapshotQueryKey, useCreateProposal, useGetSnapshot } from '@workspace/api-client-react';
import { Shell } from '@/components/shell';
import { ErrorBlock, GateNote, PageHead, Panel, Pill, SkeletonRows, Stat, useAuthed, useRefreshAll } from '@/components/kit';
import { NativeModels } from '@/components/native-models';
import { EmptyState } from '@/components/kit';
import { dt } from '@/lib/format';
import { ExportButtons } from '@/components/export-buttons';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { errMessage, num } from '@/lib/format';

function Param({ label, hint, value, min, max, step, onChange, id }: {
  label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; id: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold">{label}</label>
        <span className="tabular font-mono text-sm" data-testid={`value-${id}`}>{num(value, step < 1 ? 1 : 0)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} className="my-2" data-testid={`slider-${id}`} />
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{min}</span><span>{hint}</span><span>{max}</span>
      </div>
    </div>
  );
}

export default function EvolutionPage() {
  const { data, isLoading, isError, refetch } = useGetSnapshot({ query: { queryKey: getGetSnapshotQueryKey(), refetchInterval: 10000 } });
  const { signedIn } = useAuthed();
  const refresh = useRefreshAll();
  const { toast } = useToast();
  const proposal = useCreateProposal();
  const [volumeRatio, setVolumeRatio] = useState(2);
  const [rsiMax, setRsiMax] = useState(40);
  const [expiryBars, setExpiryBars] = useState(24);
  const [last, setLast] = useState<{ ok: boolean; message: string } | null>(null);

  const submit = () =>
    proposal.mutate(
      { data: { volumeRatio, rsiMax, expiryBars } },
      {
        onSuccess: (r) => {
          setLast(r);
          toast({ title: r.ok ? 'Proposition enregistrée (non validée)' : 'Candidat refusé', description: r.message });
          void refresh();
        },
        onError: (e) => toast({ title: 'Échec de la proposition', description: errMessage(e), variant: 'destructive' }),
      },
    );

  return (
    <Shell>
      <PageHead
        kicker="Candidats et modèle"
        title="Évolution"
        lead="Une proposition est enregistrée au statut PROPOSED_NOT_VALIDATED : ni testée, ni exécutée en ombre. Seuls des paramètres de recherche autorisés sont acceptés ; la baseline reste inchangée et rien n'est promu automatiquement."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Proposer un candidat" kicker="Paramètres bornés · PROPOSED_NOT_VALIDATED" testId="panel-proposal">
          <div className="space-y-5">
            <Param id="volume" label="Ratio de volume minimal" hint="x moyenne" value={volumeRatio} min={1.5} max={5} step={0.1} onChange={setVolumeRatio} />
            <Param id="rsi" label="RSI maximal à l'entrée en repli" hint="points" value={rsiMax} min={25} max={50} step={1} onChange={setRsiMax} />
            <Param id="expiry" label="Expiration du signal" hint="bougies de 15 min" value={expiryBars} min={8} max={48} step={1} onChange={setExpiryBars} />
            <Button onClick={submit} disabled={!signedIn || proposal.isPending} data-testid="button-propose">
              {proposal.isPending ? 'Envoi…' : 'Enregistrer la proposition'}
            </Button>
            {!signedIn && <GateNote what="Créer un candidat exige une session." />}
            {last && (
              <div className={`rounded-sm border-l-2 p-3 text-sm ${last.ok ? 'border-primary bg-muted/60' : 'border-destructive bg-destructive/5'}`} data-testid="text-proposal-result">
                {last.message}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Baseline et modèle" kicker="État courant" testId="panel-model">
          {isLoading ? <SkeletonRows rows={3} /> : isError || !data ? <ErrorBlock onRetry={() => refetch()} /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Baseline" value={<span className="font-mono text-base">{data.engine.baselineVersion}</span>} testId="text-baseline" />
                <Stat label="Modèle : baseline, aucun score IA" value={<span className="text-base">{data.engine.modelStatus}</span>} testId="text-model-status" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Pill tone="warn">Stratégie non validée</Pill>
                <Pill tone="line">Aucune promotion auto</Pill>
                <Pill tone="line">Baseline inchangée</Pill>
              </div>
            </div>
          )}
        </Panel>

        <NativeModels />

        <Panel title="Propositions enregistrées" kicker="Persistantes · PROPOSED_NOT_VALIDATED" className="lg:col-span-2" testId="panel-proposals">
          {!data || data.proposals.length === 0 ? (
            <EmptyState title="Aucune proposition" body="Les propositions enregistrées apparaîtront ici et survivent au rechargement." />
          ) : (
            <table className="w-full text-xs tabular">
              <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left">Date</th><th className="text-right">Ratio vol.</th><th className="text-right">RSI max</th><th className="text-right">Expiration</th><th className="text-right">Statut</th></tr>
              </thead>
              <tbody>
                {data.proposals.map((x) => (
                  <tr key={x.id} className="border-t border-border/60" data-testid={`row-proposal-${x.id}`}>
                    <td className="py-1.5">{dt(x.createdAt)}</td>
                    <td className="text-right">{num(x.params.volumeRatio, 1)}</td>
                    <td className="text-right">{num(x.params.rsiMax, 0)}</td>
                    <td className="text-right">{x.params.expiryBars} bougies</td>
                    <td className="text-right font-mono">{x.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Agents externes" kicker="Intégrations">
          <ul className="space-y-3 text-sm">
            {['OpenClaw', 'Claude Code'].map((n) => (
              <li key={n} className="flex items-center justify-between border-b border-border pb-2" data-testid={`agent-${n}`}>
                <span className="font-semibold">{n}</span>
                <Pill tone="bad">Non connecté</Pill>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Aucun agent n'est connecté ni n'agit sur le moteur. Le script local research/openclaw_adapter.py met seulement en forme un rapport local ; il ne se connecte à rien.
          </p>
        </Panel>

        <Panel title="Exports d'entraînement" kicker="Privé · session requise">
          <ExportButtons />
          <a href={`${import.meta.env.BASE_URL}frankenstein-research.zip`} download
            className="mt-3 inline-flex rounded-sm border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Télécharger les outils Mac et le guide
          </a>
          {!import.meta.env.VITE_VPS_BUILD && <a href={`${import.meta.env.BASE_URL}frankenstein-vps.zip`} download
            className="mt-3 ml-2 inline-flex rounded-sm border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Télécharger le paquet VPS paper-only
          </a>}
          {!import.meta.env.VITE_VPS_BUILD && <a href={`${import.meta.env.BASE_URL}frankenstein-vps.sha256.txt`} download
            className="mt-2 inline-block text-xs underline">
            Empreinte SHA-256 du paquet VPS
          </a>}
          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-foreground">Instructions</div>
            <ol className="list-inside list-decimal space-y-1">
              <li>Téléchargez le bundle JSON et les lignes d'entraînement.</li>
              <li>Placez-les dans le dossier de travail du dépôt.</li>
              <li>Lancez en local le script d'entraînement réel : <span className="font-mono text-foreground">research/train_model.py</span>. Il produit un candidat et ne le promeut jamais automatiquement.</li>
              <li>Comparez le candidat en laboratoire avant toute décision. Les colonnes suivent <span className="font-mono">featureOrder</span> du bundle.</li>
            </ol>
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
