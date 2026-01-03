import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import AnalyticsSidebar from '../components/analytics/AnalyticsSidebar';
import AnalyticsHeader from '../components/analytics/AnalyticsHeader';

/**
 * AnalyticsLayout - Layout wrapper for analytics pages
 */
const AnalyticsLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen analytics-bg safe-area-padding">
      <AnalyticsSidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <AnalyticsHeader
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default AnalyticsLayout;
