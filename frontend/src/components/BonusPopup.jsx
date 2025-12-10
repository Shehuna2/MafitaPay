import { Gift, X, CheckCircle, Sparkles } from "lucide-react";

export default function BonusPopup({ bonus, onClose }) {
  if (!bonus) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-gray-800 w-full max-w-sm rounded-t-3xl p-6 border border-gray-700 shadow-2xl animate-slide-up">
        
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            Reward Unlocked!
          </h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>
        </div>

        <p className="text-4xl font-bold text-green-400 mb-1">
          ₦{bonus.amount}
        </p>
        <p className="text-sm text-gray-300 capitalize mb-4">
          {bonus.bonus_type_name.replace("-", " ")}
        </p>

        <div className="text-xs text-gray-400 flex items-center gap-1 mb-5">
          <CheckCircle className="w-4 h-4 text-green-400" />
          Bonus has been added to your wallet balance
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
        >
          Continue
        </button>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up .35s ease-out; }
      `}</style>
    </div>
  );
}
