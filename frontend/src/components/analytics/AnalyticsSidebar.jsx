import { Link, useLocation } from 'react-router-dom';
import { 
  FiHome, 
  FiTrendingUp, 
  FiDollarSign, 
  FiUsers, 
  FiGrid, 
  FiTarget,
  FiFileText,
  FiX
} from 'react-icons/fi';

/**
 * AnalyticsSidebar - Sidebar navigation for analytics dashboard
 */
const AnalyticsSidebar = ({ isOpen, onClose }) => {
  const location = useLocation();

  const menuItems = [
    { path: '/analytics/overview', icon: FiHome, label: 'Overview' },
    { path: '/analytics/transactions', icon: FiTrendingUp, label: 'Transactions' },
    { path: '/analytics/revenue', icon: FiDollarSign, label: 'Revenue' },
    { path: '/analytics/users', icon: FiUsers, label: 'Users' },
    { path: '/analytics/services', icon: FiGrid, label: 'Services' },
    { path: '/analytics/kpis', icon: FiTarget, label: 'KPIs' },
    { path: '/analytics/reports', icon: FiFileText, label: 'Reports' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-gray-800 border-r border-gray-700
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">CEO Analytics</h2>
            <button
              onClick={onClose}
              className="lg:hidden text-gray-400 hover:text-white"
            >
              <FiX size={24} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);

                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onClose}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg
                        transition-colors
                        ${active 
                          ? 'bg-blue-600 text-white' 
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        }
                      `}
                    >
                      <Icon size={20} />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700">
            <Link
              to="/dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-lg
                text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <FiHome size={20} />
              <span className="font-medium">Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
};

export default AnalyticsSidebar;
