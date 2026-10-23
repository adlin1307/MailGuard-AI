import React from 'react';
import { ShieldCheck, Activity, RefreshCw } from 'lucide-react';

interface HeaderProps {
  modelTrained: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  modelTrained,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-sm shadow-cyan-900/20">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg text-white tracking-tight">ProbMail</span>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-cyan-950/80 border border-cyan-800 text-cyan-300">
              Email Security
            </span>
          </div>
          <p className="text-xs text-slate-400">Intelligent Spam &amp; Ham Email Classification</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Protection Status Badge */}
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          <span className="text-slate-400 hidden sm:inline">Protection:</span>
          {modelTrained ? (
            <span className="flex items-center text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1.5 animate-pulse"></span>
              Active
            </span>
          ) : (
            <span className="flex items-center text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1.5"></span>
              Initializing
            </span>
          )}
        </div>

        {/* System Online Indicator */}
        <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-emerald-400 font-medium">System Online</span>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        )}
      </div>
    </header>
  );
};
