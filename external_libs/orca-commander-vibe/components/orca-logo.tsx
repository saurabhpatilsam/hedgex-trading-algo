export function OrcaLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Orca body */}
      <path
        d="M160 80C160 80 140 50 120 40C100 30 80 35 65 45C50 55 40 70 38 85C36 100 40 115 48 125C56 135 70 140 85 138C100 136 115 128 125 115C135 102 150 95 160 80Z"
        fill="url(#gradient1)"
      />
      {/* Orca fin */}
      <path
        d="M100 25C100 25 95 10 85 5C75 0 65 5 60 15C55 25 58 40 65 48C72 56 85 55 92 48C99 41 100 25 100 25Z"
        fill="url(#gradient2)"
      />
      {/* Orca tail */}
      <path
        d="M48 145C48 145 30 155 25 165C20 175 22 185 30 188C38 191 48 185 53 175C58 165 58 150 48 145Z"
        fill="url(#gradient3)"
      />
      {/* White belly */}
      <ellipse
        cx="95"
        cy="105"
        rx="25"
        ry="15"
        fill="#F5F5DC"
        opacity="0.9"
      />
      <defs>
        <linearGradient id="gradient1" x1="40" y1="40" x2="160" y2="140" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" />
          <stop offset="0.5" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1E40AF" />
        </linearGradient>
        <linearGradient id="gradient2" x1="60" y1="5" x2="100" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="gradient3" x1="25" y1="145" x2="58" y2="190" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1E40AF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function OrcaLogoFull({ className = "h-12" }: { className?: string }) {
  return (
    <div className="flex items-center gap-3">
      <OrcaLogo className="h-10 w-10" />
      <div className="flex flex-col">
        <span className="text-2xl font-bold tracking-wider text-[#F5F5DC]">
          ORCA
        </span>
        <span className="text-sm font-light tracking-[0.3em] text-[#F5F5DC]/80">
          VENTURES
        </span>
      </div>
    </div>
  );
}
