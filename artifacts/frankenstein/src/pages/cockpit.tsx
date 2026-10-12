import { Shell } from '@/components/shell';
import { PageHead } from '@/components/kit';
import { CockpitView } from '@/components/cockpit-view';
import { DiagnosticView } from '@/components/diagnostic-view';

export default function CockpitPage() {
  return (
    <Shell>
      <PageHead
        kicker="Portefeuille et moteur"
        title="Cockpit"
        lead="Supervision en temps quasi réel du moteur papier. Rafraîchi toutes les 10 secondes."
      />
      <CockpitView />
      <div className="mt-5">
        <DiagnosticView />
      </div>
    </Shell>
  );
}
