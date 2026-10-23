import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  variant?: 'cyan' | 'emerald' | 'rose' | 'amber' | 'slate';
  badge?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtext,
  icon,
  variant = 'cyan',
  badge,
}) => {
  const variantStyles = {
    cyan: {
      border: 'border-cyan-900/40 hover:border-cyan-700/60',
      iconBg: 'bg-cyan-950/60 border-cyan-800/60 text-cyan-400',
      badge: 'bg-cyan-950 text-cyan-300 border-cyan-800',
    },
    emerald: {
      border: 'border-emerald-900/40 hover:border-emerald-700/60',
      iconBg: 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400',
      badge: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    },
    rose: {
      border: 'border-rose-900/40 hover:border-rose-700/60',
      iconBg: 'bg-rose-950/60 border-rose-800/60 text-rose-400',
      badge: 'bg-rose-950 text-rose-300 border-rose-800',
    },
    amber: {
      border: 'border-amber-900/40 hover:border-amber-700/60',
      iconBg: 'bg-amber-950/60 border-amber-800/60 text-amber-400',
      badge: 'bg-amber-950 text-amber-300 border-amber-800',
    },
    slate: {
      border: 'border-slate-800 hover:border-slate-700',
      iconBg: 'bg-slate-800/60 border-slate-700 text-slate-300',
      badge: 'bg-slate-800 text-slate-300 border-slate-700',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      className={`p-5 rounded-xl bg-slate-900/80 border ${style.border} transition duration-200 shadow-sm`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</span>
        <div className={`p-2.5 rounded-lg border ${style.iconBg}`}>{icon}</div>
      </div>
      <div className="mt-3 flex items-baseline space-x-2">
        <span className="text-2xl font-bold tracking-tight text-white font-mono">{value}</span>
        {badge && (
          <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-medium border ${style.badge}`}>
            {badge}
          </span>
        )}
      </div>
      {subtext && <p className="mt-1 text-xs text-slate-400">{subtext}</p>}
    </div>
  );
};
