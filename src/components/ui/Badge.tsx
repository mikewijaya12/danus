import type { ReactNode } from 'react';
import { clsx } from 'clsx';

type Tone = 'green' | 'red' | 'amber' | 'gray' | 'indigo';

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx('badge', `badge-${tone}`)}>{children}</span>;
}

export function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? 'green' : 'gray'}>{active ? 'Aktif' : 'Nonaktif'}</Badge>;
}
