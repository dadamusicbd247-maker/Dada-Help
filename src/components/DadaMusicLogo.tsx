import React from 'react';

interface DadaMusicLogoProps {
  className?: string;
  size?: number;
}

export const DadaMusicLogo: React.FC<DadaMusicLogoProps> = ({
  className = '',
  size,
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...(size ? { width: size, height: size } : {})}
      className={`shrink-0 drop-shadow-sm select-none ${className}`}
      aria-label="DADA MUSIC BD Logo"
    >
      <defs>
        {/* Rich vibrant emerald brand background */}
        <linearGradient id="dada_brand_grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="60%" stopColor="#047857" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>

        {/* Soft top-light highlight for 3D depth */}
        <linearGradient id="dada_surface_shine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Soundwave gradient */}
        <linearGradient id="dada_wave_grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>

      {/* Main Container Squircle */}
      <rect
        x="3"
        y="3"
        width="94"
        height="94"
        rx="24"
        fill="url(#dada_brand_grad)"
        stroke="#10b981"
        strokeWidth="2"
      />

      {/* Subtle top glare highlight */}
      <rect
        x="5"
        y="5"
        width="90"
        height="44"
        rx="22"
        fill="url(#dada_surface_shine)"
      />

      {/* Bold, high-visibility Headphone Arch (Pure White) */}
      <path
        d="M 23 52 C 23 30, 77 30, 77 52"
        stroke="#ffffff"
        strokeWidth="6.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Left Ear Cushion (Solid White with green core) */}
      <rect
        x="15"
        y="45"
        width="13"
        height="24"
        rx="6.5"
        fill="#ffffff"
      />
      <rect
        x="18.5"
        y="49"
        width="4"
        height="16"
        rx="2"
        fill="#047857"
      />

      {/* Right Ear Cushion (Solid White with green core) */}
      <rect
        x="72"
        y="45"
        width="13"
        height="24"
        rx="6.5"
        fill="#ffffff"
      />
      <rect
        x="77.5"
        y="49"
        width="4"
        height="16"
        rx="2"
        fill="#047857"
      />

      {/* Centerpiece: Bold Stylized 'D' Lettermark (Solid White) */}
      {/* Outer D shape and inner hole combined cleanly using evenodd fill rule */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 36 34 H 51 C 62.5 34, 69 41.5, 69 52 C 69 62.5, 62.5 70, 51 70 H 36 V 34 Z M 43 41.5 V 62.5 H 50.5 C 57.5 62.5, 61.5 58, 61.5 52 C 61.5 46, 57.5 41.5, 50.5 41.5 H 43 Z"
        fill="#ffffff"
      />

      {/* High-visibility Equalizer Soundwave Bars inside the D */}
      <rect x="46" y="47" width="3" height="10" rx="1.5" fill="url(#dada_wave_grad)" />
      <rect x="51.5" y="44" width="3" height="16" rx="1.5" fill="#ffffff" />
      <rect x="57" y="48" width="3" height="8" rx="1.5" fill="url(#dada_wave_grad)" />

      {/* Bangladesh Red Circle Accent (With white outline ring for maximum pop) */}
      <circle cx="78" cy="22" r="6" fill="#ffffff" />
      <circle cx="78" cy="22" r="4.5" fill="#ef4444" />
    </svg>
  );
};
