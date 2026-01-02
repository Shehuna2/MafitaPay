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
    <header className="bg-gray-800 border-b border-gray-700">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left side */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden text-gray-300 hover:text-white"
          >
            <FiMenu size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">CEO Analytics Dashboard</h1>
            <p className="text-sm text-gray-400">Real-time insights and metrics</p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg 
                bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center 
                justify-center text-white font-bold">
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
                <div className="absolute right-0 mt-2 w-48 bg-gray-700 rounded-lg 
                  shadow-lg border border-gray-600 z-20">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      // Navigate to settings
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 
                      hover:bg-gray-600 text-white transition-colors 
                      rounded-t-lg"
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
                      hover:bg-gray-600 text-white transition-colors 
                      rounded-b-lg border-t border-gray-600"
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
