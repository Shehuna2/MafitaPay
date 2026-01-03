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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-72 glass-panel border-r border-white/10
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              CEO Analytics
            </h2>
            <button
              onClick={onClose}
              className="lg:hidden text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
            >
              <FiX size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl
                    transition-all duration-200
                    ${active 
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/25 soft-ring' 
                      : 'text-gray-300 hover:bg-white/5 hover:text-white hover:soft-ring'
                    }
                  `}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-white/10">
            <Link
              to="/dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-xl
                text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-200 hover:soft-ring"
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
