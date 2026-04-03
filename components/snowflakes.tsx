"use client";

import { useEffect, useState } from "react";

/**
 * Brief snowflake/petal animation on first page load.
 * Shows falling flower petals (🌸) for ~5 seconds then fades out.
 */
export function Snowflakes() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Check if already shown this session
    if (sessionStorage.getItem("snowflakes_shown")) {
      setVisible(false);
      return;
    }
    sessionStorage.setItem("snowflakes_shown", "1");

    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const flakes = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 3,
    size: 12 + Math.random() * 14,
    symbol: ["🌸", "🍃", "🌿", "🌺", "🍀"][Math.floor(Math.random() * 5)],
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" style={{ animation: "fadeOut 1s ease-in 5s forwards" }}>
      {flakes.map((f) => (
        <span
          key={f.id}
          className="absolute"
          style={{
            left: `${f.left}%`,
            top: "-30px",
            fontSize: `${f.size}px`,
            animation: `snowfall ${f.duration}s ease-in ${f.delay}s forwards`,
            opacity: 0.8,
          }}
        >
          {f.symbol}
        </span>
      ))}
      <style>{`
        @keyframes snowfall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.8; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        @keyframes fadeOut {
          to { opacity: 0; visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
