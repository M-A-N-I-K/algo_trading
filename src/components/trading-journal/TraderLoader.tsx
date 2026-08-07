import { useEffect, useState } from "react";

interface TraderLoaderProps {
  message?: string;
  subMessages?: string[];
}

const DEFAULT_SUB_MESSAGES = [
  "Connecting to exchange feeds...",
  "Downloading historical candlesticks...",
  "Computing indicators (EMA, MACD, S/R)...",
  "Executing strategy order simulation...",
  "Assembling performance analytics logs..."
];

export default function TraderLoader({ 
  message = "Simulating Market Setups", 
  subMessages = DEFAULT_SUB_MESSAGES 
}: TraderLoaderProps) {
  const [subIdx, setSubIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSubIdx((prev) => (prev + 1) % subMessages.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [subMessages]);

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center select-none">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes wickGrowth {
          0%, 100% { height: 28px; }
          50% { height: 48px; }
        }
        @keyframes bodyGrowth {
          0%, 100% { height: 16px; transform: translateY(0); }
          50% { height: 28px; transform: translateY(-3px); }
        }
        .animate-wick {
          animation: wickGrowth 1.6s ease-in-out infinite;
        }
        .animate-body {
          animation: bodyGrowth 1.6s ease-in-out infinite;
        }
      `}} />
      
      {/* Candlestick animation */}
      <div className="flex items-center gap-5 h-16 mb-5">
        {[
          { color: "bg-emerald-500", border: "border-emerald-500", delay: "0s" },
          { color: "bg-rose-500", border: "border-rose-500", delay: "0.3s" },
          { color: "bg-emerald-500", border: "border-emerald-500", delay: "0.6s" },
          { color: "bg-rose-500", border: "border-rose-500", delay: "0.9s" },
          { color: "bg-emerald-500", border: "border-emerald-500", delay: "1.2s" }
        ].map((candle, idx) => (
          <div key={idx} className="relative flex flex-col items-center justify-center w-3 h-12">
            {/* Wick */}
            <div 
              className="absolute w-[1.5px] bg-slate-700 animate-wick"
              style={{ animationDelay: candle.delay }}
            ></div>
            {/* Body */}
            <div 
              className={`absolute w-3 rounded-sm border ${candle.color} ${candle.border} animate-body`}
              style={{ 
                animationDelay: candle.delay,
                boxShadow: candle.color.includes("emerald") 
                  ? "0 0 10px rgba(16,185,129,0.15)" 
                  : "0 0 10px rgba(239,68,68,0.15)"
              }}
            ></div>
          </div>
        ))}
      </div>

      {/* Status Messages */}
      <div className="flex flex-col gap-1.5 max-w-[280px]">
        <h4 className="font-Outfit text-xs font-bold text-white tracking-widest uppercase">
          {message}
        </h4>
        <div className="font-mono text-[9px] text-violet-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-ping"></span>
          <span>{subMessages[subIdx]}</span>
        </div>
      </div>
    </div>
  );
}
