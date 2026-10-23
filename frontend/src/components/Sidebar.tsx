import React from 'react';
import {
  LayoutDashboard,
  MailSearch,
  History,
  ShieldCheck,
} from 'lucide-react';

export type PageId =
  | 'dashboard'
  | 'scanner'
  | 'history'
  | 'dataset'
  | 'statistics'
  | 'chi-square'
  | 'training'
  | 'evaluation';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onSelectPage }) => {
  const navItems: { id: PageId; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'scanner',
      label: 'Email Scanner',
      icon: <MailSearch className="w-4 h-4" />,
      badge: 'Scan',
    },
    {
      id: 'history',
      label: 'Scan History',
      icon: <History className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between shrink-0">
      <div className="space-y-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3 mb-2">
            Navigation
          </div>
          <nav className="space-y-1.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  currentPage === item.id
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800 shadow-sm shadow-cyan-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={currentPage === item.id ? 'text-cyan-400' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Security Status Card */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Spam Protection Active</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Emails are analyzed in real time using automated Bayesian classification.
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800/80 px-2 text-[11px] text-slate-500 font-sans text-center">
        <span>ProbMail Email Security</span>
      </div>
    </aside>
  );
};
