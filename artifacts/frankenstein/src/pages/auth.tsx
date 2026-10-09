import { type ReactNode } from 'react';
import { SignIn, SignUp } from '@clerk/react';
import { Link } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] md:grid-cols-[1fr_minmax(0,520px)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground md:flex">
        <div className="stitch absolute inset-x-0 top-0 h-1.5" aria-hidden />
        <Link href="/" className="flex items-center gap-3">
          <img src={`${basePath}/logo.svg`} alt="" className="h-10 w-10" />
          <span className="font-serif text-2xl font-extrabold">Frankenstein</span>
        </Link>
        <div>
          <h2 className="font-serif text-5xl font-extrabold leading-[0.95]">
            Disséquer
            <br />
            avant
            <br />
            de <span className="text-accent">croire.</span>
          </h2>
          <p className="mt-5 max-w-sm text-sm text-sidebar-foreground/70">
            Un compte débloque les commandes du moteur, les imports, les candidats et les exports privés. Tout reste en paper trading.
          </p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/50">
          Paper only · Stratégie non validée
        </div>
      </aside>
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 py-10">
        {children}
        <Link href="/" className="text-xs text-muted-foreground underline" data-testid="link-back-observer">
          Continuer en observateur
        </Link>
      </div>
    </div>
  );
}

export function SignInPage() {
  return (
    <Frame>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </Frame>
  );
}

export function SignUpPage() {
  return (
    <Frame>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </Frame>
  );
}
