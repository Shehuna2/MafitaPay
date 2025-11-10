// src/layouts/ShortFormLayout.jsx
import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import OffersCarousel from "../components/OffersCarousel";

export default function ShortFormLayout({ children, title, backPath = "/dashboard" }) {
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkAndLock = () => {
      const isMobile = window.innerWidth <= 640;
      const contentFits = container.scrollHeight <= container.clientHeight + 10; // tolerance

      if (isMobile && contentFits) {
        container.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
      } else {
        container.style.overflow = "auto";
        document.body.style.overflow = "auto";
      }
    };

    checkAndLock();

    const observer = new ResizeObserver(checkAndLock);
    observer.observe(container);
    window.addEventListener("resize", checkAndLock);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", checkAndLock);
      document.body.style.overflow = "auto";
    };
  }, []);

  /* ---------- Detect service type ---------- */
  const service = title?.toLowerCase().includes("data") ? "data" : "airtime";

  return (
    <div
      ref={containerRef}
      className="h-screen bg-gray-900 text-white flex flex-col overflow-y-auto scroll-smooth"
      style={{
        touchAction: "pan-y",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Header */}
      {title && (
        <div className="flex items-center gap-2 px-4 pt-6 pb-3">
          <button
            onClick={() => navigate(backPath)}
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl sm:text-2xl font-bold text-indigo-400">{title}</h2>
        </div>
      )}

      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-6">
        <div className="max-w-4xl mx-auto pt-6">
          {children}

          {/* ---------- CAROUSEL – mobile only ---------- */}
          <div className="block sm:hidden">
            <OffersCarousel type={service} />
          </div>
        </div>
      </div>
    </div>
  );
}