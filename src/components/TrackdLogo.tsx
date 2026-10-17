
interface TrackdLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  showBeta?: boolean;
  subtitle?: string;
  className?: string;
}

export default function TrackdLogo({
  size = "md",
  showWordmark = true,
  showBeta = false,
  subtitle,
  className = "",
}: TrackdLogoProps) {
  const iconSizes = {
    sm: "w-7 h-7 rounded-lg",
    md: "w-8 h-8 rounded-xl",
    lg: "w-11 h-11 rounded-2xl",
    xl: "w-16 h-16 rounded-3xl",
  };

  const textSizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-3xl",
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Official Brand Emblem */}
      <div
        className={`relative ${iconSizes[size]} overflow-hidden shrink-0 shadow-lg shadow-[#00F29D]/20 ring-1 ring-[#00F29D]/30 group-hover:ring-[#00F29D]/60 transition bg-[#070B14]`}
      >
        <img
          src="/official_icon.jpeg"
          alt="Trackd Emblem"
          className="w-full h-full object-cover scale-105"
        />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[inherit]" />
      </div>

      {/* Official Brand Wordmark */}
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className={`font-black tracking-tight text-white ${textSizes[size]}`}>
              Track<span className="text-[#00F29D]">d</span>
            </span>
            {showBeta && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#00F29D]/10 text-[#00F29D] border border-[#00F29D]/30 shadow-sm shadow-[#00F29D]/10">
                Beta
              </span>
            )}
          </div>
          {subtitle && (
            <span className="text-[9px] font-mono tracking-widest text-[#00F29D]/80 uppercase mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
