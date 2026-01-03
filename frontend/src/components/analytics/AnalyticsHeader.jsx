import { FiMenu, FiSettings, FiLogOut } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';

/**
 * AnalyticsHeader - Top header for analytics dashboard
 */
const AnalyticsHeader = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-white/10">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
        {/* Left side */}
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden text-gray-300 hover:text-white p-2 hover:bg-white/5 rounded-lg transition-all"
          >
            <FiMenu size={20} />
          </button>
          <div>
            <h1 className="text-lg md:text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              CEO Analytics Dashboard
            </h1>
            <p className="text-xs md:text-sm text-gray-400 hidden md:block">Real-time insights and metrics</p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 rounded-xl 
                glass-card hover:bg-white/10 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 
                flex items-center justify-center text-white font-bold text-sm shadow-lg">
                {user?.username?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-sm font-medium text-white">
                  {user?.username || 'Admin'}
                </p>
                <p className="text-xs text-gray-400">Administrator</p>
              </div>
            </button>

            {/* Dropdown menu */}
            {showDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-10"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-48 glass-panel rounded-xl shadow-2xl border border-white/20 z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      // Navigate to settings
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 
                      hover:bg-white/5 text-white transition-all"
                  >
                    <FiSettings size={16} />
                    <span>Settings</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 
                      hover:bg-white/5 text-white transition-all border-t border-white/10"
                  >
                    <FiLogOut size={16} />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default AnalyticsHeader;
