"use client";

import { useEffect, useState } from "react";

/**
 * Falling flower petals animation on every page load for 10 seconds.
 * Shows on both landing page and inside the dashboard.
 */
export function Snowflakes() {
  const [visible, setVisible] = useState(true);
  const [flakes] = useState(() =>
    Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 4 + Math.random() * 4,
      size: 12 + Math.random() * 14,
      symbol: ["🌸", "🍃", "🌿", "🌺", "🍀"][Math.floor(Math.random() * 5)],
    }))
  );

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 11000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" style={{ animation: "fadeOut 1s ease-in 10s forwards" }}>
      {flakes.map((f) => (
        <span
          key={f.id}
          className="absolute"
          style={{
            left: `${f.left}%`,
            top: "-30px",
            fontSize: `${f.size}px`,
            animation: `snowfall ${f.duration}s ease-in ${f.delay}s forwards`,
            opacity: 0.7,
          }}
        >
          {f.symbol}
        </span>
      ))}
      <style>{`
        @keyframes snowfall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.7; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        @keyframes fadeOut {
          to { opacity: 0; visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
