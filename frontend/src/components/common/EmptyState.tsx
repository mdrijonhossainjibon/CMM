import { Icon } from './Icons';
import type { IconName } from '../../types';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
}

export default function EmptyState({ icon = 'empty', title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dark-border p-8">
      <Icon name={icon} className="w-10 h-10 text-dark-text/40" />
      <p className="text-sm font-medium text-dark-heading">{title}</p>
      {description && <p className="text-xs text-dark-text">{description}</p>}
    </div>
  );
}
