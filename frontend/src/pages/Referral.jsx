import { useEffect, useState } from "react";
import axios from "axios";
import { Copy, Users } from "lucide-react";

export default function Referral() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReferralData = async () => {
      try {
        const token = localStorage.getItem("access"); // adjust if needed
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/referrals/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(res.data);
      } catch (err) {
        console.error("Error fetching referral data:", err);
        setData({ referral_code: null, total_referrals: 0, total_bonus: 0, referred_users: [] });
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

  if (!data)
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading referral data...
      </div>
    );

  const referredUsers = data.referred_users || [];

  return (
    <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg space-y-6">
      <h1 className="text-2xl font-bold mb-3">Referral Program</h1>
      <p className="text-gray-300">
        Invite your friends and earn rewards when they use MafitaPay 🚀
      </p>

      {/* Referral Code Section */}
      <div className="mt-4 p-4 bg-gray-800 rounded-xl flex justify-between items-center">
        <div>
          <p className="font-mono text-sm text-gray-400">Your Referral Code:</p>
          <p className="text-2xl font-semibold text-blue-400">
            {data.referral_code || "Not assigned yet"}
          </p>
        </div>
        <button
          onClick={handleCopy}
          disabled={!data.referral_code}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 px-3 py-2 rounded-lg flex items-center space-x-2"
        >
          <Copy size={16} />
          <span>{copied ? "Copied!" : "Copy Link"}</span>
        </button>
      </div>

      {/* Referral Stats */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-gray-800 p-4 rounded-xl text-center">
          <p className="text-gray-400 text-sm">Total Referrals</p>
          <p className="text-3xl font-bold text-green-400">
            {data.total_referrals ?? 0}
          </p>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl text-center">
          <p className="text-gray-400 text-sm">Total Bonus</p>
          <p className="text-3xl font-bold text-yellow-400">
            ₦{data.total_bonus ?? 0}
          </p>
        </div>
      </div>

      {/* Referred Users List */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Users size={20} /> Referred Users
        </h2>
        {referredUsers.length === 0 ? (
          <p className="text-gray-500 text-sm">No referrals yet — start sharing your link!</p>
        ) : (
          <ul className="space-y-2">
            {referredUsers.map((user, idx) => (
              <li
                key={idx}
                className="bg-gray-800 p-3 rounded-xl flex justify-between text-sm text-gray-300"
              >
                <span>{user.email}</span>
                <span className="text-gray-500">
                  {new Date(user.date_joined).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
