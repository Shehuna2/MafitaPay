// src/components/OffersCarousel.jsx
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Gift, Moon, Users, Share2, Percent, Calendar } from "lucide-react";

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
  const touchStart = useRef(0);
  const items = OFFERS[type] ?? OFFERS.airtime;

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [items.length]);

  const goTo = (i) => setIndex(i);
  const prev = () => goTo((index - 1 + items.length) % items.length);
  const next = () => goTo((index + 1) % items.length);

  const handleTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (!touchStart.current) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart.current - touchEnd;

    if (Math.abs(diff) > 50) {
      diff > 0 ? next() : prev();
    }
    touchStart.current = 0;
  };

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-1">
          <Sparkles className="w-4 h-4" />
          Special Offers
        </h3>
        <div className="flex gap-1">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1 rounded-full transition-all ${
                i === index ? "bg-indigo-400 w-8" : "bg-gray-600 w-5"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Slides */}
      <div className="overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((offer, i) => (
            <div
              key={i}
              className="w-full flex-shrink-0 px-5 py-4 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 backdrop-blur-md border border-indigo-500/30 rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600/30 rounded-xl flex-shrink-0">
                  <offer.Icon className="w-5 h-5 text-indigo-300" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{offer.title}</p>
                  <p className="text-xs text-gray-300 truncate">{offer.subtitle}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nav Buttons */}
      <button
        onClick={prev}
        className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 backdrop-blur rounded-full text-white hover:bg-black/60 transition-all"
        aria-label="Previous"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={next}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 backdrop-blur rounded-full text-white hover:bg-black/60 transition-all"
        aria-label="Next"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}