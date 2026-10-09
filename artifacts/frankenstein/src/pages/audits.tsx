import { useGetAudits } from '@workspace/api-client-react';
import { Shell } from '@/components/shell';
import { EmptyState, ErrorBlock, PageHead, Panel, SkeletonRows } from '@/components/kit';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const METHOD = [
  "Chaque revue est une attaque adverse : on cherche comment la stratégie ou le moteur peut se tromper sans que personne ne le voie.",
  "Chaque attaque se conclut par une résolution vérifiable et des tests nommés ; le risque résiduel est écrit noir sur blanc.",
  "Un audit réussi ne valide pas la stratégie. Le statut reste NON VALIDÉ tant qu'aucun échantillon hors-échantillon suffisant n'existe.",
  "Aucune promotion automatique : les candidats ne deviennent jamais la baseline sans décision humaine.",
];

export default function AuditsPage() {
  const { data, isLoading, isError, refetch } = useGetAudits();
  return (
    <Shell>
      <PageHead
        kicker="Revues adverses"
        title="Audits"
        lead="Six attaques menées contre le moteur, leurs résolutions, leurs tests et ce qui reste fragile."
      />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Les revues" kicker="Attaque, résolution, risque résiduel" testId="panel-audits">
          {isLoading ? (
            <SkeletonRows rows={6} />
          ) : isError || !data ? (
            <ErrorBlock onRetry={() => refetch()} />
          ) : data.length === 0 ? (
            <EmptyState title="Aucun audit publié" />
          ) : (
            <Accordion type="single" collapsible defaultValue={`a-${data[0].id}`}>
              {data.map((a) => (
                <AccordionItem key={a.id} value={`a-${a.id}`} data-testid={`audit-${a.id}`}>
                  <AccordionTrigger className="text-left">
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {String(a.id).padStart(2, '0')}
                      </span>
                      <span className="font-serif text-base font-semibold">{a.title}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 text-sm">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-destructive">Attaque</div>
                      <p>{a.attack}</p>
                    </div>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-primary">Résolution</div>
                      <p>{a.resolution}</p>
                    </div>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Tests</div>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 font-mono text-xs">
                        {a.tests.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-sm border-l-2 border-[hsl(38,85%,50%)] bg-muted/60 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest">Risque résiduel</div>
                      <p>{a.remainingRisk}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </Panel>
        <Panel title="Méthode" kicker="Comment lire ces audits" testId="panel-method">
          <ol className="space-y-3 text-sm">
            {METHOD.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-xs font-semibold text-primary">{i + 1}.</span>
                <span>{m}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </Shell>
  );
}
