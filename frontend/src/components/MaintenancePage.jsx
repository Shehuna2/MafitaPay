import React, { useState, useEffect } from 'react';
import { Clock, Wrench, AlertCircle } from 'lucide-react';

const MaintenancePage = ({ maintenanceData }) => {
  const [timeRemaining, setTimeRemaining] = useState(null);

  useEffect(() => {
    if (!maintenanceData?.end_time || !maintenanceData?.show_countdown) {
      return;
    }

    const calculateTimeRemaining = () => {
      const endTime = new Date(maintenanceData.end_time);
      const now = new Date();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeRemaining(null);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ hours, minutes, seconds });
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [maintenanceData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12">
        <div className="text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-200 rounded-full blur-xl opacity-50"></div>
              <div className="relative bg-indigo-100 p-6 rounded-full">
                <Wrench className="w-16 h-16 text-indigo-600" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            We'll Be Back Soon!
          </h1>

          {/* Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-lg text-gray-700 text-left">
                {maintenanceData?.message || 
                  "We are currently performing scheduled maintenance. Please check back soon."}
              </p>
            </div>
          </div>

          {/* Countdown Timer */}
          {timeRemaining && maintenanceData?.show_countdown && (
            <div className="mb-8">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h2 className="text-xl font-semibold text-gray-800">
                  Estimated Time Remaining
                </h2>
              </div>
              <div className="flex justify-center gap-4">
                <div className="bg-indigo-100 rounded-lg p-4 min-w-[80px]">
                  <div className="text-3xl font-bold text-indigo-600">
                    {String(timeRemaining.hours).padStart(2, '0')}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Hours</div>
                </div>
                <div className="bg-indigo-100 rounded-lg p-4 min-w-[80px]">
                  <div className="text-3xl font-bold text-indigo-600">
                    {String(timeRemaining.minutes).padStart(2, '0')}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Minutes</div>
                </div>
                <div className="bg-indigo-100 rounded-lg p-4 min-w-[80px]">
                  <div className="text-3xl font-bold text-indigo-600">
                    {String(timeRemaining.seconds).padStart(2, '0')}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Seconds</div>
                </div>
              </div>
            </div>
          )}

          {/* Expected Return Time */}
          {maintenanceData?.end_time && !maintenanceData?.show_countdown && (
            <div className="mb-6">
              <p className="text-gray-600">
                Expected to return:{' '}
                <span className="font-semibold text-gray-800">
                  {new Date(maintenanceData.end_time).toLocaleString()}
                </span>
              </p>
            </div>
          )}

          {/* Footer Message */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-gray-600">
              Thank you for your patience. We're working hard to improve your experience!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
