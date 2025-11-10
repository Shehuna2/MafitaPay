// src/components/OffersCarousel.jsx
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Gift, Moon, Users, Share2, Percent, Calendar } from "lucide-react";

/* ---------- Dummy offers (replace later with API) ---------- */
const OFFERS = {
  airtime: [
    { title: "Recharge ₦500+", subtitle: "Get 5% Bonus Airtime", Icon: Percent },
    { title: "MTN Night Plan", subtitle: "Unlimited 12AM–5AM", Icon: Moon },
    { title: "Refer & Earn", subtitle: "₦100 per friend", Icon: Users },
  ],
  data: [
    { title: "Buy 1GB, Get 100MB Free", subtitle: "MTN Only", Icon: Gift },
    { title: "Weekend Bundle", subtitle: "2GB for ₦300", Icon: Calendar },
    { title: "Family Share", subtitle: "Split data with 3 lines", Icon: Share2 },
  ],
};

export default function OffersCarousel({ type = "airtime" }) {
  const [index, setIndex] = useState(0);
  const items = OFFERS[type] ?? OFFERS.airtime;

  /* ---------- Auto-play ---------- */
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [items.length]);

  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);
  const next = () => setIndex((i) => (i + 1) % items.length);

  return (
    <div className="mt-8 px-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-1">
          <Sparkles className="w-4 h-4" />
          Special Offers
        </h3>

        {/* Dots */}
        <div className="flex gap-1">
          {items.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === index ? "bg-indigo-400 w-8" : "bg-gray-600 w-6"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Carousel */}
      <div className="relative overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((offer, i) => (
            <div
              key={i}
              className="w-full flex-shrink-0 px-4 py-5 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 backdrop-blur-md border border-indigo-500/30 rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600/30 rounded-xl">
                  <offer.Icon className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <p className="font-bold text-white">{offer.title}</p>
                  <p className="text-xs text-gray-300">{offer.subtitle}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Prev / Next */}
        <button
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/30 backdrop-blur rounded-full text-white hover:bg-black/50 transition"
          aria-label="Previous offer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/30 backdrop-blur rounded-full text-white hover:bg-black/50 transition"
          aria-label="Next offer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}