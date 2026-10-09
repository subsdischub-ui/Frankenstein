import { Link } from 'wouter';
import { Shell } from '@/components/shell';
import { EmptyState } from '@/components/kit';

export default function NotFound() {
  return (
    <Shell>
      <EmptyState
        title="Page introuvable"
        body="Cette page n'existe pas dans le laboratoire."
        action={
          <Link href="/cockpit" className="text-sm font-semibold text-primary underline" data-testid="link-notfound-home">
            Retour au cockpit
          </Link>
        }
      />
    </Shell>
  );
}
