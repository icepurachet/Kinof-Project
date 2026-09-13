// ============================================================
// KINOF Design Tokens — v2
// Same identity family (blue + gold) as before, with a deeper navy palette.
// Variable names kept identical to v1 so components don't need
// their imports touched — only the values change.
// ============================================================

// --- Primary: deep navy blue ---
export const NAVY = "#123B82";        // primary — deep navy blue
export const NAVY2 = "#0B2457";       // deeper stop for gradients
export const NAVY_LIGHT = "#1C4FA3";  // hover / active surface
export const NAVY_ACCENT = "#5679C4"; // borders / focus rings on dark surfaces
export const NAVY_SOFT = "#E8EEF8";   // light tint — badges, section backgrounds

// --- Accent: brighter, warmer gold ---
export const GOLD = "#FFB020";
export const GOLD_HOVER = "#F59300";
export const GOLD_SOFT = "#FFF3DC";

// --- Secondary accent: teal (fresh, friendly — still used sparingly) ---
export const TEAL = "#14B8A6";
export const TEAL_SOFT = "#E6FBF8";

// --- Reusable gradient strings, so every component builds the same gradient ---
export const GRADIENT_PRIMARY = `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`;
export const GRADIENT_GOLD = `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_HOVER} 100%)`;

// --- Neutrals / canvas ---
export const BG_APP = "#F7F9FF";      // airy, faint blue-white canvas
export const INK = "#101828";         // near-black for headings
export const MUTED = "#475569";       // secondary text

// --- Semantic ---
export const SUCCESS = "#16A34A";
export const WARNING = "#F59E0B";
export const DANGER = "#E11D48";
