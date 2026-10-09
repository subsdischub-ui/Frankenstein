import { useState } from 'react';
import { getExportJournalQueryKey, useExportJournal } from '@workspace/api-client-react';
import type { ExportBundle } from '@workspace/api-client-react';
import { FileJson, FileSpreadsheet, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { GateNote, useAuthed } from '@/components/kit';
import { downloadBlob, downloadJson, errMessage } from '@/lib/format';

type Kind = 'bundle' | 'csv' | 'training';

export function ExportButtons() {
  const { signedIn } = useAuthed();
  const { toast } = useToast();
  const [busy, setBusy] = useState<Kind | null>(null);
  const q = useExportJournal({
    query: { enabled: false, queryKey: getExportJournalQueryKey() },
  });

  const go = async (kind: Kind) => {
    setBusy(kind);
    try {
      const r = await q.refetch();
      const b: ExportBundle | undefined = r.data;
      if (r.error || !b) throw r.error ?? new Error('Export vide.');
      const stamp = b.generatedAt.replace(/[:.]/g, '-');
      if (kind === 'bundle') downloadJson(`frankenstein-bundle-${stamp}.json`, b);
      if (kind === 'csv') downloadBlob(`frankenstein-journal-${stamp}.csv`, b.csv, 'text/csv');
      if (kind === 'training')
        downloadJson(`frankenstein-training-rows-${stamp}.json`, {
          featureOrder: b.featureOrder,
          rows: b.trainingRows,
        });
      toast({ title: 'Export téléchargé', description: `Schéma v${b.schemaVersion}, baseline ${b.baselineVersion}.` });
    } catch (e) {
      toast({ title: "Échec de l'export", description: errMessage(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2" data-testid="export-buttons">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!signedIn || busy !== null} onClick={() => go('bundle')} data-testid="button-export-bundle">
          <FileJson className="mr-1 h-3 w-3" /> {busy === 'bundle' ? 'Préparation…' : 'Bundle JSON'}
        </Button>
        <Button size="sm" variant="secondary" disabled={!signedIn || busy !== null} onClick={() => go('csv')} data-testid="button-export-csv">
          <FileSpreadsheet className="mr-1 h-3 w-3" /> {busy === 'csv' ? 'Préparation…' : 'CSV du journal'}
        </Button>
        <Button size="sm" variant="outline" disabled={!signedIn || busy !== null} onClick={() => go('training')} data-testid="button-export-training">
          <Table2 className="mr-1 h-3 w-3" /> {busy === 'training' ? 'Préparation…' : "Lignes d'entraînement"}
        </Button>
      </div>
      {!signedIn && <GateNote what="L'export est privé et exige une session." />}
    </div>
  );
}
