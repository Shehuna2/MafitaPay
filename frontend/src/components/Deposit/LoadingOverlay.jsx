// File: src/components/Deposit/LoadingOverlay.jsx
import React from "react";
import { Loader2 } from "lucide-react";

export default function LoadingOverlay({ show, message = "Loading..." }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800/90 p-6 rounded-2xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-600/20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
          <p className="text-lg font-medium text-indigo-300">{message}</p>
        </div>
      </div>
    </div>
  );
}
