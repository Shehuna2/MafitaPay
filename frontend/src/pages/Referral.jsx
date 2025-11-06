// src/pages/Referral.jsx
import { useEffect, useState } from "react";
import client from "../api/client";
import { Copy, Users, ArrowLeft, Share2, Check, Loader2 } from "lucide-react";

export default function Referral() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReferralData = async () => {
      setLoading(true);
      try {
        const res = await client.get("/referrals/");
        setData(res.data);
      } catch (err) {
        setData({
          referral_code: null,
          total_referrals: 0,
          total_bonus: 0,
          referred_users: [],
        });
      } finally {
        setLoading(false);
      }
    };
    fetchReferralData();
  }, []);

  const handleCopy = () => {
    if (!data?.referral_code) return;
    const referralLink = `${window.location.origin}/register?ref=${data.referral_code}`;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out; }
        @keyframes pulse-check {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        .pulse-check { animation: pulse-check 0.6s ease-out; }
      `}</style>

      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-gray-900/5 pointer-events-none" />

        {/* Full-Screen Loading */}
        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-indigo-600/30 animate-ping"></div>
                </div>
                <p className="text-lg font-medium text-indigo-300">Loading referral data...</p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="w-full relative z-10 px-3 py-6">
          {/* Back Arrow */}
          <button
            onClick={() => window.history.back()}
            className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-all duration-200 mb-4"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back
          </button>

          {/* Edge-to-Edge Glass Card */}
          <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 animate-fade-in-up max-w-none w-full">
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-2xl font-bold text-indigo-400">Referral Program</h1>
              <Share2 className="w-6 h-6 text-indigo-400" />
            </div>

            <p className="text-sm text-gray-300 mb-6">
              Invite friends and earn rewards when they join MafitaPay
            </p>

            {/* Referral Code Card */}
            <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 backdrop-blur-md border border-indigo-500/30 rounded-xl p-5 mb-6">
              <p className="text-xs font-medium text-gray-400 mb-1">Your Referral Code</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-mono font-bold text-white tracking-wider">
                  {data?.referral_code || "—"}
                </p>
                <button
                  onClick={handleCopy}
                  disabled={!data?.referral_code}
                  className="group relative flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <Copy className={`w-4 h-4 transition-transform ${copied ? "scale-0" : "scale-100"}`} />
                  <Check className={`w-4 h-4 text-green-400 absolute transition-transform pulse-check ${copied ? "scale-100" : "scale-0"}`} />
                  <span>{copied ? "Copied!" : "Copy Link"}</span>
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-800/60 backdrop-blur-md border border-gray-700/50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-gray-400 mb-1">Total Referrals</p>
                <p className="text-3xl font-bold text-green-400">{data?.total_referrals ?? 0}</p>
              </div>
              <div className="bg-gray-800/60 backdrop-blur-md border border-gray-700/50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-gray-400 mb-1">Total Bonus</p>
                <p className="text-3xl font-bold text-yellow-400">₦{data?.total_bonus ?? 0}</p>
              </div>
            </div>

            {/* Referred Users */}
            <div>
              <h2 className="text-lg font-semibold text-indigo-300 mb-3 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Referred Users
              </h2>

              {(!data?.referred_users || data.referred_users.length === 0) ? (
                <div className="text-center py-6 text-gray-500">
                  <div className="w-16 h-16 mx-auto mb-3 bg-gray-700/30 rounded-full flex items-center justify-center">
                    <Users className="w-8 h-8 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium">No referrals yet</p>
                  <p className="text-xs mt-1">Share your link to get started!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {data.referred_users.map((user, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/30 rounded-xl p-3 flex justify-between items-center text-sm animate-fade-in-up"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <span className="text-gray-300 font-medium">{user.email}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(user.date_joined).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}