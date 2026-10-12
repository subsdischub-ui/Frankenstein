import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Show, useClerk, useUser } from '@clerk/react';
import { useHealthCheck } from '@workspace/api-client-react';
import {
  BookText,
  Dna,
  FlaskConical,
  Gauge,
  LogOut,
  Radar,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/kit';

const NAV = [
  { href: '/cockpit', label: 'Cockpit', icon: Gauge },
  { href: '/scanner', label: 'Scanner', icon: Radar },
  { href: '/journal', label: 'Journal', icon: BookText },
  { href: '/laboratoire', label: 'Laboratoire', icon: FlaskConical },
  { href: '/evolution', label: 'Évolution', icon: Dna },
  { href: '/audits', label: 'Audits', icon: ShieldCheck },
];

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-brand">
      <img src={`${base}/logo.svg`} alt="" className="h-8 w-8" />
      <div className="leading-none">
        <div className="font-serif text-lg font-extrabold tracking-tight text-sidebar-foreground">
          Frankenstein
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/60">
          laboratoire de recherche
        </div>
      </div>
    </Link>
  );
}

function Health() {
  const { data, isError, isLoading } = useHealthCheck();
  const ok = !!data && !isError;
  return (
    <div
      className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/70"
      data-testid="status-health"
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          isLoading ? 'bg-sidebar-foreground/40' : ok ? 'bg-accent pulse-dot' : 'bg-destructive',
        )}
      />
      {isLoading ? 'API…' : ok ? `API ${data.status}` : 'API injoignable'}
    </div>
  );
}

function Account() {
  const { signOut } = useClerk();
  const { user } = useUser();
  return (
    <>
      <Show when="signed-in">
        <div className="space-y-2">
          <div className="truncate text-xs text-sidebar-foreground/80" data-testid="text-user">
            {user?.primaryEmailAddress?.emailAddress ?? user?.username ?? 'Chercheur'}
          </div>
          <button
            type="button"
            data-testid="button-signout"
            onClick={() => signOut({ redirectUrl: base || '/' })}
            className="flex items-center gap-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <LogOut className="h-3 w-3" /> Se déconnecter
          </button>
        </div>
      </Show>
      <Show when="signed-out">
        <div className="space-y-2">
          <div className="text-[11px] text-sidebar-foreground/60">Mode observateur</div>
          <div className="flex gap-2">
            <Link
              href="/sign-in"
              data-testid="link-signin"
              className="rounded-sm bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground"
            >
              Connexion
            </Link>
            <Link
              href="/sign-up"
              data-testid="link-signup"
              className="rounded-sm border border-sidebar-border px-2.5 py-1 text-xs text-sidebar-foreground"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </Show>
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  useEffect(() => {
    const page = NAV.find(n => n.href === loc)?.label || 'Laboratoire crypto';
    document.title = `${page} · Frankenstein`;
    const description = `${page} — laboratoire crypto paper-only Frankenstein. Scanner, replay et décisions vérifiables, sans argent réel. Stratégie non validée.`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  }, [loc]);
  return (
    <div className="min-h-[100dvh] md:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col justify-between bg-sidebar p-5 md:flex">
        <div className="space-y-8">
          <Brand />
          <nav className="space-y-1">
            {NAV.map((n) => {
              const active = loc === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  data-testid={`nav-${n.label.toLowerCase()}`}
                  className={cn(
                    'flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_2px_0_0_hsl(var(--accent))]'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60',
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="space-y-4">
          <Account />
          <Health />
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-sidebar md:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Brand />
          <Health />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              data-testid={`navm-${n.label.toLowerCase()}`}
              className={cn(
                'shrink-0 rounded-sm px-3 py-1.5 text-xs',
                loc === n.href
                  ? 'bg-accent font-semibold text-accent-foreground'
                  : 'text-sidebar-foreground/80',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="stitch h-1.5" aria-hidden />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-4 py-2 md:px-8"
        data-testid="banner-paper"
      >
        <Pill tone="volt">Paper only</Pill>
        <Pill tone="warn">Stratégie non validée</Pill>
        <span className="text-xs text-muted-foreground">
          Aucun ordre réel. Capital simulé de 10 000 USDT. Aucun résultat ici ne constitue une preuve d'edge.
        </span>
        <span className="ml-auto md:hidden">
          <Show when="signed-out">
            <Link href="/sign-in" className="text-xs font-semibold text-primary underline">
              Connexion
            </Link>
          </Show>
          <Show when="signed-in">
            <MobileSignOut />
          </Show>
        </span>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}

function MobileSignOut() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      className="text-xs font-semibold text-primary underline"
      onClick={() => signOut({ redirectUrl: base || '/' })}
      data-testid="button-signout-mobile"
    >
      Déconnexion
    </button>
  );
}
