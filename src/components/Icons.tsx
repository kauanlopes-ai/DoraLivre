type P = { size?: number };
const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconPlay = ({ size }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
  </svg>
);
export const IconClose = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const IconSearch = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const IconNext = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const IconPrev = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
export const IconExpand = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);
export const IconList = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

export const Logo = () => (
  <span className="logo" aria-label="Lua Doramas">
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe3a3" />
          <stop offset="1" stopColor="#f08a6c" />
        </linearGradient>
      </defs>
      <path d="M20.5 3.5A13 13 0 1 0 28.5 21 10.5 10.5 0 0 1 20.5 3.5Z" fill="url(#lg)" />
      <circle cx="24.5" cy="7.5" r="1.4" fill="#ffe3a3" />
    </svg>
    <span className="logo-word">
      lua<span>doramas</span>
    </span>
  </span>
);
