import {
  Inbox,
  LayoutDashboard,
  MailSearch,
  History,
  ShieldCheck,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { User } from '../services/auth-service';

export type PageId =
  | 'inbox'
  | 'dashboard'
  | 'scanner'
  | 'history';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  currentUser?: User | null;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  currentUser,
  onLogout,
}) => {
  const securityItems: { id: PageId; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'inbox',
      label: 'Mailbox & Threats',
      icon: <Inbox className="w-4 h-4" />,
      badge: 'Mail',
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'scanner',
      label: 'Email & File Scanner',
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
    <aside className="w-64 border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
      <div className="space-y-6">
        {/* Security Operations */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3 mb-2 font-mono">
            Security Operations
          </div>
          <nav className="space-y-1">
            {securityItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  currentPage === item.id
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800 shadow-sm shadow-cyan-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className={currentPage === item.id ? 'text-cyan-400' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
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
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Spam Protection Active</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Emails are analyzed in real time using automated Bayesian classification.
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800/80 space-y-3">
        {currentUser && (
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 text-xs font-bold font-mono shrink-0">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200 truncate">{currentUser.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{currentUser.email}</div>
              </div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition shrink-0"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        <div className="px-2 text-[11px] text-slate-500 font-sans text-center">
          <span>ProbMail Email Security</span>
        </div>
      </div>
    </aside>
  );
};
