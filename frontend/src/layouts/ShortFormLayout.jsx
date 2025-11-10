// src/layouts/ShortFormLayout.jsx
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import OffersCarousel from "../components/OffersCarousel";

export default function ShortFormLayout({ children, title, backPath = "/dashboard" }) {
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 640;
      setIsMobile(mobile);
    };

    const lockScrollIfFits = () => {
      const container = containerRef.current;
      if (!container || !isMobile) return;

      const fits = container.scrollHeight <= container.clientHeight + 20;
      const style = fits ? "hidden" : "auto";
      container.style.overflow = style;
      document.body.style.overflow = style;
    };

    checkMobile();
    lockScrollIfFits();

    const handleResize = () => {
      checkMobile();
      lockScrollIfFits();
    };

    const observer = new ResizeObserver(lockScrollIfFits);
    if (containerRef.current) observer.observe(containerRef.current);

    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      document.body.style.overflow = "auto";
    };
  }, [isMobile, children]);

  const service = title?.toLowerCase().includes("data") ? "data" : "airtime";

  return (
    <div
      ref={containerRef}
      className="bg-gray-900 text-white flex flex-col"
      style={{
        height: "100dvh",
        touchAction: "pan-y",
        overscrollBehavior: "contain",
      }}
    >
      {/* Header */}
      {title && (
        <div className="flex items-center gap-2 px-4 pt-safe-top pb-3">
          <button
            onClick={() => navigate(backPath)}
            className="text-indigo-400 hover:text-indigo-300 transition-colors p-2 -ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-indigo-400 flex-1">{title}</h2>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-safe-bottom">
        <div className="max-w-4xl mx-auto pt-4 pb-8">
          {children}

          {/* Carousel - Mobile Only */}
          {isMobile && (
            <div className="mt-8 -mx-3 px-3">
              <OffersCarousel type={service} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}