import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { frFR } from '@clerk/localizations';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import HomePage from '@/pages/home';
import CockpitPage from '@/pages/cockpit';
import ScannerPage from '@/pages/scanner';
import JournalPage from '@/pages/journal';
import LaboratoirePage from '@/pages/laboratoire';
import EvolutionPage from '@/pages/evolution';
import AuditsPage from '@/pages/audits';
import { SignInPage, SignUpPage } from '@/pages/auth';
import { queryClient } from '@/lib/query-client';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(168, 62%, 17%)',
    colorForeground: 'hsl(168, 35%, 9%)',
    colorMutedForeground: 'hsl(168, 10%, 34%)',
    colorDanger: 'hsl(10, 66%, 42%)',
    colorBackground: 'hsl(48, 30%, 96.5%)',
    colorInput: 'hsl(46, 24%, 93%)',
    colorInputForeground: 'hsl(168, 35%, 9%)',
    colorNeutral: 'hsl(44, 14%, 70%)',
    fontFamily: "'Instrument Sans', system-ui, sans-serif",
    borderRadius: '0.375rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[hsl(48,30%,96.5%)] border border-[hsl(44,14%,82%)] rounded-md w-[420px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: { fontFamily: "'Fraunces', Georgia, serif", fontWeight: 800 },
    headerSubtitle: { color: 'hsl(168, 10%, 34%)' },
    formButtonPrimary: { backgroundColor: 'hsl(168, 62%, 17%)', color: 'hsl(48, 30%, 95%)' },
    footerActionLink: { color: 'hsl(168, 62%, 22%)', fontWeight: 600 },
    logoImage: { height: '44px' },
  },
};

const localization = {
  ...frFR,
  signIn: {
    ...frFR.signIn,
    start: {
      ...frFR.signIn?.start,
      title: 'Entrer au laboratoire',
      subtitle: 'Connectez-vous pour piloter le moteur papier',
    },
  },
  signUp: {
    ...frFR.signUp,
    start: {
      ...frFR.signUp?.start,
      title: 'Ouvrir un accès',
      subtitle: 'Un compte débloque les commandes et exports privés',
    },
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prev.current !== undefined && prev.current !== id) qc.clear();
      prev.current = id;
    });
    return unsub;
  }, [addListener, qc]);
  return null;
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/cockpit" />
      </Show>
      <Show when="signed-out">
        <HomePage />
      </Show>
    </>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Routes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={localization}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRoute} />
              <Route path="/cockpit" component={CockpitPage} />
              <Route path="/scanner" component={ScannerPage} />
              <Route path="/journal" component={JournalPage} />
              <Route path="/laboratoire" component={LaboratoirePage} />
              <Route path="/evolution" component={EvolutionPage} />
              <Route path="/audits" component={AuditsPage} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <Routes />
    </WouterRouter>
  );
}

export default App;
