import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";

type User = { id: string; username: string; primaryEmailAddress?: { emailAddress: string } };
type State = { user: User | null; loaded: boolean };
type Listener = (data: { user: User | null }) => void;
const Context = createContext<{
  state: State;
  reload: () => Promise<void>;
  addListener: (fn: Listener) => () => void;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
} | null>(null);
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export function ClerkProvider({ children }: { children: ReactNode; [key: string]: unknown }) {
  const [state, setState] = useState<State>({ user: null, loaded: false });
  const listeners = useRef(new Set<Listener>());
  const reload = useCallback(async () => {
    const response = await fetch(`${base}/api/vps-auth/session`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Session indisponible.");
    const data = await response.json();
    setState({ user: data.authenticated ? data.user : null, loaded: true });
    for (const listener of listeners.current) listener({ user: data.authenticated ? data.user : null });
  }, []);
  const addListener = useCallback((fn: Listener) => {
    listeners.current.add(fn); return () => { listeners.current.delete(fn); };
  }, []);
  const signOut = useCallback(async (options?: { redirectUrl?: string }) => {
    const response = await fetch(`${base}/api/vps-auth/logout`, { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error("Déconnexion impossible.");
    setState({ user: null, loaded: true });
    for (const listener of listeners.current) listener({ user: null });
    window.location.assign(options?.redirectUrl || `${base}/`);
  }, []);
  useEffect(() => {
    void reload().catch(() => setState({ user: null, loaded: true }));
    const update = () => { void reload().catch(() => {
      setState({ user: null, loaded: true });
      for (const listener of listeners.current) listener({ user: null });
    }); };
    window.addEventListener("focus", update);
    const interval = window.setInterval(update, 60000);
    return () => { window.removeEventListener("focus", update); window.clearInterval(interval); };
  }, [reload]);
  return <Context.Provider value={{ state, reload, addListener, signOut }}>{children}</Context.Provider>;
}
function useSession() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Session VPS absente.");
  return ctx;
}
export function useAuth() {
  const { state } = useSession();
  return { isLoaded: state.loaded, isSignedIn: !!state.user, userId: state.user?.id ?? null };
}
export function useUser() {
  const { state } = useSession(); return { user: state.user, isLoaded: state.loaded, isSignedIn: !!state.user };
}
export function useClerk() {
  const { addListener, signOut } = useSession(); return { addListener, signOut };
}
export function Show({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) {
  const { state } = useSession();
  if (!state.loaded) return null;
  return (when === "signed-in" ? !!state.user : !state.user) ? <>{children}</> : null;
}
export function SignIn(_props: Record<string, unknown>) {
  const { reload } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/api/vps-auth/login`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connexion impossible.");
      setPassword(""); await reload(); window.location.assign(`${base}/cockpit`);
    } catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible."); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-md border border-border bg-card p-6">
    <h1 className="font-serif text-2xl font-bold">Accès privé au VPS</h1>
    <p className="text-sm text-muted-foreground">Compte opérateur créé sur le serveur. Paper only, sans clé Binance.</p>
    <label className="block text-sm">Identifiant
      <input name="username" autoComplete="username" required maxLength={40} value={username}
        onChange={e => setUsername(e.target.value)} className="mt-1 w-full rounded border border-border bg-background px-3 py-2" />
    </label>
    <label className="block text-sm">Mot de passe
      <input name="password" type="password" autoComplete="current-password" required maxLength={256} value={password}
        onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded border border-border bg-background px-3 py-2" />
    </label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button disabled={busy} type="submit" className="w-full rounded bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">
      {busy ? "Connexion…" : "Se connecter"}
    </button>
    <p className="text-xs text-muted-foreground">Pas d’inscription publique. Sessions de 8 h ; un redémarrage impose une nouvelle connexion.</p>
  </form>;
}
export function SignUp(_props: Record<string, unknown>) {
  return <div className="max-w-sm rounded border border-border bg-card p-6 text-sm">
    <h1 className="mb-3 font-serif text-xl font-bold">Installation privée</h1>
    <p>Les inscriptions publiques sont désactivées. Utilisez le compte créé sur le VPS.</p>
    <a href={`${base}/sign-in`} className="mt-4 inline-block underline">Se connecter</a>
  </div>;
}
