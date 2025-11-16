// File: src/components/Deposit/DvaDisplay.jsx
import React from "react";
import { Copy, RefreshCcw, ChevronDown, ChevronUp } from "lucide-react";

export default function DvaDisplay({
  details,
  onCopy,
  onRequery,
  requeryLoading,
  showAdvanced,
  setShowAdvanced,
  lastRequeryDate,
  setLastRequeryDate,
}) {
  if (!details?.account_number) return null;

  return (
    <div className="bg-gray-800/60 p-5 rounded-xl space-y-5 border border-gray-700/50">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Type</span>
          <span className="font-bold text-white">
            {details.type?.toUpperCase()} {details.type === "static" && "(Reusable)"}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Bank</span>
          <span className="font-bold text-white text-right">
            {details.bank_name || "—"}
            <span className="block text-xs text-gray-500 mt-0.5">({details.provider?.toUpperCase() || "PROVIDER"})</span>
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Account No.</span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-indigo-300">{details.account_number}</span>
            <button onClick={() => onCopy(details.account_number)} className="text-indigo-400 hover:text-indigo-300">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Name</span>
          <span className="font-bold text-white">{details.account_name || "—"}</span>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-700/50">
        <p className="text-xs text-gray-300 leading-relaxed">
          Funds are credited <span className="font-bold text-green-400">automatically</span> within minutes.
          <br />
          <strong className="text-yellow-400">Note:</strong> A 1% fee (up to ₦300) applies per transfer.
        </p>
      </div>

      <div className="pt-4 border-t border-gray-700/50">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onRequery} disabled={requeryLoading} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
            <RefreshCcw className={`w-4 h-4 ${requeryLoading ? "animate-spin" : ""}`} />
            {requeryLoading ? "Checking..." : "Requery Funds"}
          </button>

          <button onClick={() => setShowAdvanced(s => !s)} className="text-xs text-gray-400 hover:text-indigo-300 flex items-center gap-1">
            {showAdvanced ? (<><ChevronUp className="w-3.5 h-3.5" /> Hide</>) : (<><ChevronDown className="w-3.5 h-3.5" /> Advanced</>)}
          </button>
        </div>

        {showAdvanced && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Requery Date</label>
            <input type="date" value={lastRequeryDate} onChange={(e) => setLastRequeryDate(e.target.value)} className="w-full bg-gray-800/60 border border-gray-700/80 p-2 rounded-xl text-white text-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
