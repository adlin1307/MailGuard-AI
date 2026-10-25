import React, { useState } from 'react';
import { AuthPage } from './pages/AuthPage';
import { InboxPage } from './pages/InboxPage';
import { DashboardPage } from './pages/DashboardPage';
import { ScannerPage } from './pages/ScannerPage';
import { HistoryPage } from './pages/HistoryPage';
import { DatasetPage } from './pages/DatasetPage';
import { Header } from './components/Header';
import { Sidebar, PageId } from './components/Sidebar';
import { authService, User } from './services/auth-service';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => authService.getCurrentUser());
  const [currentPage, setCurrentPage] = useState<PageId>('inbox');
  const [modelTrained] = useState(true);

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
  };

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    setCurrentPage('inbox');
  };

  // If user is not authenticated, show strict registration & login gate
  if (!currentUser) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'inbox':
        return <InboxPage currentUser={currentUser} onLogout={handleLogout} />;
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'scanner':
        return <ScannerPage />;
      case 'history':
        return <HistoryPage />;
      case 'dataset':
        return <DatasetPage />;
      default:
        return <InboxPage currentUser={currentUser} onLogout={handleLogout} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0B0F19] text-slate-100 overflow-hidden font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Application Header */}
      <Header
        modelTrained={modelTrained}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Workspace with Sidebar Navigation & Page Container */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentPage={currentPage}
          onSelectPage={setCurrentPage}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        <main
          className={`flex-1 relative ${
            currentPage === 'inbox'
              ? 'overflow-hidden'
              : 'overflow-y-auto p-6 lg:p-8 bg-slate-950/40'
          }`}
        >
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;
