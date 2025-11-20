// src/layouts/ShortFormLayout.jsx
import { useRef } from "react";

export default function ShortFormLayout({ children, title }) {
  const containerRef = useRef(null);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-gray-900 text-white flex flex-col overflow-y-auto scroll-smooth"
      style={{
        touchAction: "pan-y",
        overscrollBehavior: "none",
      }}
    >
      {/* Title */}
      {title && (
        <div className="flex items-center gap-2 px-4 pt-6 pb-3">
          <button
            onClick={() => window.history.back()}
            className="text-indigo-400"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-indigo-400">{title}</h2>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-6">
        <div className="max-w-4xl mx-auto pt-6">{children}</div>
      </div>
    </div>
  );
}
