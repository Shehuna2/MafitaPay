// src/pages/Home.jsx
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ArrowRight, Zap, Smartphone, Shield, Users, Wallet, Globe, ChevronRight, Star, Sparkles } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    const access = localStorage.getItem("access");
    if (access) {
      navigate("/dashboard");
    }
  }, [navigate]);

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .float { animation: float 6s ease-in-out infinite; }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.6s ease-out forwards; }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); }
          50% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.6); }
        }
        .pulse-glow { animation: pulse-glow 3s ease-in-out infinite; }
      `}</style>

      <div className="min-h-screen bg-gray-900 text-white overflow-hidden relative">
        {/* Gradient Background */}
        <div className="fixed inset-0 bg-gradient-to-br from-indigo-900/50 via-purple-900/25 to-gray-900 pointer-events-none -z-10" />

        {/* Hero Section */}
        <section className="relative z-10 px-4 pt-16 pb-32 md:pb-40">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              {/* Logo + Sparkles */}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <Sparkles className="w-12 h-12 text-indigo-400 absolute -top-4 -left-4 animate-pulse" />
                  <Sparkles className="w-8 h-8 text-indigo-400 absolute -top-2 -right-3 animate-pulse delay-300" />
                  <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-indigo-400">
                    MafitaPay
                  </h1>
                </div>
              </div>

              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 animate-fade-in-up">
                Crypto. Bills. Rewards.
              </h2>
              <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-3xl mx-auto animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
                Buy crypto instantly, pay airtime, data, electricity, and earn <span className="text-yellow-400 font-bold">₦500+</span> per referral — all in one secure app.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
                <Link
                  to="/register"
                  className="group inline-flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white font-bold text-lg rounded-xl transition-all duration-300 shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 pulse-glow"
                >
                  Start Earning Now
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-gray-800/80 backdrop-blur-md hover:bg-gray-700/80 text-white font-medium text-lg rounded-xl border border-gray-700/50 transition-all duration-300"
                >
                  Sign In
                </Link>
              </div>
            </div>

            {/* Floating Feature Preview */}
            <div className="mt-20 relative max-w-5xl mx-auto">
              <div className="absolute inset-0 bg-indigo-600/30 to-transparent rounded-3xl blur-3xl"></div>
              <div className="relative bg-gray-800/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-gray-700/50 float">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                  {[
                    { icon: <Zap className="w-8 h-8" />, title: "Instant Crypto", desc: "Buy BTC, ETH, USDT in seconds" },
                    { icon: <Smartphone className="w-8 h-8" />, title: "Pay Bills", desc: "Airtime, Data, Electricity, Cable" },
                    { icon: <Wallet className="w-8 h-8" />, title: "Earn Rewards", desc: "₦500+ per referral" },
                  ].map((item, idx) => (
                    <div key={idx} className="animate-fade-in-up" style={{ animationDelay: `${0.6 + idx * 0.1}s` }}>
                      <div className="w-16 h-16 mx-auto mb-3 bg-indigo-600/20 rounded-2xl flex items-center justify-center text-indigo-400">
                        {item.icon}
                      </div>
                      <h3 className="font-semibold text-lg mb-1">{item.title}</h3>
                      <p className="text-sm text-gray-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="px-4 py-20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-indigo-300">
              Built for Speed, Security & Savings
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: <Shield className="w-8 h-8" />,
                  title: "Bank-Level Security",
                  desc: "256-bit encryption, 2FA, cold storage — your funds are safe.",
                  color: "from-green-500 to-emerald-600",
                },
                {
                  icon: <Globe className="w-8 h-8" />,
                  title: "Global & Local",
                  desc: "Pay with NGN, receive crypto instantly — anywhere in Nigeria.",
                  color: "from-blue-500 to-cyan-600",
                },
                {
                  icon: <Users className="w-8 h-8" />,
                  title: "Referral Rewards",
                  desc: "Invite friends, earn ₦500+ per active user. No limits.",
                  color: "from-yellow-500 to-orange-600",
                },
              ].map((feature, idx) => (
                <div
                  key={idx}
                  className="bg-gray-800/60 backdrop-blur-md rounded-2xl p-6 border border-gray-700/50 hover:border-indigo-500/50 transition-all duration-300 group animate-fade-in-up"
                  style={{ animationDelay: `${0.8 + idx * 0.1}s` }}
                >
                  <div className={`w-14 h-14 mx-auto mb-4 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-center mb-3">{feature.title}</h3>
                  <p className="text-sm text-gray-400 text-center">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-4 py-20 bg-gradient-to-t from-indigo-900/20 to-transparent">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
              Join Thousands Earning with MafitaPay
            </h2>
            <p className="text-lg text-gray-300 mb-8">
              Start buying crypto, paying bills, and earning rewards — <span className="text-indigo-300 font-bold">today</span>.
            </p>
            <Link
              to="/register"
              className="inline-flex items-center gap-3 px-10 py-5 bg-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white font-bold text-xl rounded-xl transition-all duration-300 shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 pulse-glow"
            >
              Get Started Free
              <ChevronRight className="w-6 h-6" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-4 py-8 border-t border-gray-800">
          <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
            © 2025 MafitaPay. All rights reserved. Built with <span className="text-red-500">heart</span> in Nigeria.
          </div>
        </footer>
      </div>
    </>
  );

}
