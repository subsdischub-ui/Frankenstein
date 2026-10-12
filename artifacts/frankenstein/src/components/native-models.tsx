import { useRef, useState } from 'react';
import {
  getGetSnapshotQueryKey,
  useGetSnapshot,
  useImportNativeModel,
  useRetireNativeModel,
} from '@workspace/api-client-react';
import { FileUp } from 'lucide-react';
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
import { EmptyState, GateNote, Panel, Pill, useAuthed, useRefreshAll } from '@/components/kit';
import { dt, errMessage, num } from '@/lib/format';

const MAX = 3_000_000;

export function NativeModels() {
  const { signedIn } = useAuthed();
  const { data } = useGetSnapshot({ query: { queryKey: getGetSnapshotQueryKey(), refetchInterval: 10000 } });
  const refresh = useRefreshAll();
  const { toast } = useToast();
  const imp = useImportNativeModel();
  const retire = useRetireNativeModel();
  const modelRef = useRef<HTMLInputElement>(null);
  const manifestRef = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<{ name: string; text: string } | null>(null);
  const [manifest, setManifest] = useState<{ name: string; obj: Record<string, unknown> } | null>(null);
  const [err, setErr] = useState('');
  const [toRetire, setToRetire] = useState<string | null>(null);

  const pickModel = async (f?: File) => {
    if (!f) return;
    setErr('');
    if (f.size > MAX) return setErr('Modèle natif trop volumineux : 3 Mo maximum.');
    setModel({ name: f.name, text: await f.text() });
  };
  const pickManifest = async (f?: File) => {
    if (!f) return;
    setErr('');
    try {
      const o = JSON.parse(await f.text());
      if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error();
      setManifest({ name: f.name, obj: o });
    } catch {
      setErr('manifest.json illisible : objet JSON attendu.');
    }
  };

  const submit = () => {
    if (!model || !manifest) return;
    imp.mutate(
      { data: { nativeModel: model.text, manifest: manifest.obj } },
      {
        onSuccess: () => {
          toast({ title: 'Modèle importé', description: 'Statut SHADOW_UNVERIFIED : scoring fantôme uniquement.' });
          setModel(null);
          setManifest(null);
          void refresh();
        },
        onError: (e) => toast({ title: "Échec de l'import", description: errMessage(e), variant: 'destructive' }),
      },
    );
  };

  const confirmRetire = () => {
    if (!toRetire) return;
    retire.mutate(
      { id: toRetire },
      {
        onSuccess: () => {
          toast({ title: 'Modèle retiré', description: 'Statut RETIRED ; audit et fichiers conservés.' });
          void refresh();
        },
        onError: (e) => toast({ title: 'Échec du retrait', description: errMessage(e), variant: 'destructive' }),
        onSettled: () => setToRetire(null),
      },
    );
  };

  const models = data?.nativeModels ?? [];

  return (
    <Panel title="Modèles XGBoost natifs" kicker="Scoring fantôme · observation uniquement" testId="panel-native-models" className="lg:col-span-2">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3 text-sm">
          <input ref={modelRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => pickModel(e.target.files?.[0])} data-testid="input-native-model" />
          <input ref={manifestRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => pickManifest(e.target.files?.[0])} data-testid="input-manifest" />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => modelRef.current?.click()} data-testid="button-pick-native">
              <FileUp className="mr-1 h-3 w-3" /> candidate_xgboost.json
            </Button>
            <span className="font-mono text-xs">{model?.name ?? 'aucun fichier'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => manifestRef.current?.click()} data-testid="button-pick-manifest">
              <FileUp className="mr-1 h-3 w-3" /> manifest.json
            </Button>
            <span className="font-mono text-xs">{manifest?.name ?? 'aucun fichier'}</span>
          </div>
          {err && <p className="text-xs text-destructive" data-testid="text-native-error">{err}</p>}
          <Button disabled={!signedIn || !model || !manifest || imp.isPending} onClick={submit} data-testid="button-import-native">
            {imp.isPending ? 'Import…' : 'Importer en fantôme'}
          </Button>
          {!signedIn && <GateNote what="L'import de modèle exige une session." />}
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>Le manifest est un rapport externe non vérifié.</li>
            <li>Refusés : pickle, DART, variables catégorielles, features incompatibles. 3 Mo maximum.</li>
            <li>Aucun code téléversé n'est exécuté ; aucun algorithme n'est lancé depuis le fichier.</li>
            <li>La baseline reste inchangée. Aucune promotion : pas d'homologation de modèle en v1.</li>
          </ul>
        </div>
        <div>
          {models.length === 0 ? (
            <EmptyState title="Aucun modèle importé" body="Les modèles importés apparaîtront ici avec le statut fantôme non vérifié." />
          ) : (
            <ul className="space-y-2">
              {models.map((m) => (
                <li key={m.id} className="rounded-sm border border-border p-3 text-xs" data-testid={`model-${m.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{m.id.slice(0, 10)}</span>
                    <Pill tone={m.status === 'RETIRED' ? 'mute' : 'warn'}>{m.status === 'RETIRED' ? 'Retiré' : 'Shadow non vérifié'}</Pill>
                    {m.status !== 'RETIRED' && (
                      <Button size="sm" variant="ghost" className="ml-auto" disabled={!signedIn} onClick={() => setToRetire(m.id)} data-testid={`button-retire-${m.id}`}>
                        Retirer
                      </Button>
                    )}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {dt(m.createdAt)} · seuil {num(m.threshold, 3)} · {m.features.length} feature(s)
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">hash {m.hash}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <AlertDialog open={toRetire !== null} onOpenChange={(o) => !o && setToRetire(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Retirer ce modèle ?</AlertDialogTitle>
            <AlertDialogDescription>Le modèle passe au statut RETIRED. L'audit et les fichiers sont conservés.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmRetire(); }} data-testid="button-confirm-retire">
              {retire.isPending ? 'Retrait…' : 'Retirer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
