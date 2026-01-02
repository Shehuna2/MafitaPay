import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AnalyticsSidebar from '../components/analytics/AnalyticsSidebar';
import AnalyticsHeader from '../components/analytics/AnalyticsHeader';

/**
 * AnalyticsLayout - Layout wrapper for analytics pages
 */
const AnalyticsLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    // Trigger a refresh of the current page data
    window.location.reload();
  };

  return (
    <div className="flex h-screen bg-gray-900">
      <AnalyticsSidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <AnalyticsHeader
          onMenuClick={() => setSidebarOpen(true)}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default AnalyticsLayout;
