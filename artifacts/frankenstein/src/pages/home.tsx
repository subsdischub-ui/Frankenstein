import { Link } from 'wouter';
import { Shell } from '@/components/shell';
import { CockpitView } from '@/components/cockpit-view';

export default function HomePage() {
  return (
    <Shell>
      <section className="rise mb-8 grid gap-6 border-b border-border pb-8 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div>
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Observatoire public · lecture seule
          </div>
          <h1 className="font-serif text-4xl font-extrabold leading-[0.95] tracking-tight md:text-6xl">
            Chaque décision,
            <br />
            <span className="bg-accent px-2 text-accent-foreground">sous verre.</span>
          </h1>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Frankenstein est un laboratoire personnel de recherche crypto. Une stratégie hybride
            momentum, tendance et repli y est disséquée pièce par pièce, sans jamais risquer un centime réel.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/laboratoire" className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground" data-testid="link-try-replay">
              Essayer un replay de démonstration
            </Link>
            <Link href="/sign-in" className="rounded-sm border border-border px-3 py-2 text-xs font-semibold" data-testid="link-home-signin">
              Se connecter
            </Link>
            <Link href="/audits" className="rounded-sm px-3 py-2 text-xs font-semibold underline" data-testid="link-home-audits">
              Lire les audits
            </Link>
          </div>
        </div>
      </section>
      <CockpitView />
    </Shell>
  );
}
