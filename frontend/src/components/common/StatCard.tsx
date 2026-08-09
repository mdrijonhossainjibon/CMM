import { Icon } from './Icons';
import type { IconName } from '../../types';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: IconName;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  trendUp?: boolean;
  pulse?: boolean;
}

export default function StatCard({ label, value, icon, trend, trendValue, trendUp, pulse }: StatCardProps) {
  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-yellow-400',
  };

  return (
    <div className="glass rounded-xl p-4 flex items-start gap-3 relative">
      {pulse && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      )}
      {icon && (
        <Icon
          name={icon}
          className={`w-5 h-5 mt-0.5 ${pulse ? 'text-primary' : 'text-dark-text'}`}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-dark-text mb-1">{label}</p>
        <p className="text-xl font-semibold text-dark-heading">{value}</p>
        {(trend || trendUp) && (
          <p className={`text-xs mt-1 ${trendUp ? 'text-green-400' : trend ? trendColors[trend] : ''}`}>
            {trendValue || (trendUp ? 'active' : '')}
          </p>
        )}
      </div>
    </div>
  );
}
