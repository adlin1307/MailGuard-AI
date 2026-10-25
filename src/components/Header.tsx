import React from 'react';
import { ShieldCheck, Activity, RefreshCw, LogOut, User as UserIcon } from 'lucide-react';
import { User } from '../services/auth-service';

interface HeaderProps {
  modelTrained: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  currentUser?: User | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  modelTrained,
  onRefresh,
  isRefreshing,
  currentUser,
  onLogout,
}) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

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

      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Protection Status Badge */}
        <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          <span className="text-slate-400">Protection:</span>
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
        <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-emerald-400 font-medium">Engine Active</span>
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

        {/* User Profile Pill & Logout */}
        {currentUser && (
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
            <div className="flex items-center space-x-2.5 bg-slate-950/70 border border-slate-800 py-1 px-2.5 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-cyan-900/60 border border-cyan-600/50 flex items-center justify-center text-cyan-300 text-xs font-bold font-mono">
                {currentUser.name ? getInitials(currentUser.name) : <UserIcon className="w-3.5 h-3.5" />}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-white leading-tight max-w-[120px] truncate">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-cyan-400 font-mono leading-tight">
                  {currentUser.role || 'SecOps Analyst'}
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-800 text-slate-400 border border-slate-700 transition"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
