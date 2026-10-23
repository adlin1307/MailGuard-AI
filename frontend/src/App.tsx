import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, PageId } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { ScannerPage } from './pages/ScannerPage';
import { HistoryPage } from './pages/HistoryPage';
import { api } from './services/api';

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [modelTrained, setModelTrained] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchActiveModel = async () => {
    setIsRefreshing(true);
    try {
      const evalData = await api.getEvaluation();
      if (evalData.is_trained) {
        setModelTrained(true);
      } else {
        setModelTrained(false);
      }
    } catch {
      // offline or uninitialized
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActiveModel();
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'scanner':
        return <ScannerPage />;
      case 'history':
        return <HistoryPage />;
      default:
        return <DashboardPage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      <Header
        modelTrained={modelTrained}
        onRefresh={fetchActiveModel}
        isRefreshing={isRefreshing}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentPage={currentPage} onSelectPage={setCurrentPage} />

        <main className="flex-1 overflow-y-auto p-6 md:p-8 max-w-7xl mx-auto w-full">
          {renderPage()}
        </main>
      </div>

      <footer className="h-10 border-t border-slate-800/80 bg-slate-950 px-6 flex items-center justify-between text-[11px] text-slate-500 font-sans">
        <div>
          <span>ProbMail Email Security</span>
          <span className="mx-2">•</span>
          <span>Intelligent Spam &amp; Ham Classification</span>
        </div>
        <div>
          <span>Automated Background Bayesian Engine</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
