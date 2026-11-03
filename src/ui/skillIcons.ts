/**
 * Skill icons as inline SVG, drawn on a 64 x 64 grid: a dark plate with a beveled rim, and a
 * gold emblem. Inline SVG stays crisp at any size and costs no image downloads.
 */

const plate = (id: string) => `
  <defs>
    <radialGradient id="${id}-plate" cx="50%" cy="35%" r="75%">
      <stop offset="0" stop-color="#3a2416"/>
      <stop offset="1" stop-color="#0d0806"/>
    </radialGradient>
    <linearGradient id="${id}-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbe7a8"/>
      <stop offset="0.55" stop-color="#d8a447"/>
      <stop offset="1" stop-color="#8a5a1c"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="62" height="62" rx="7" fill="url(#${id}-plate)"/>
  <rect x="3.5" y="3.5" width="57" height="57" rx="5" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="2"/>`;

const emblems: Record<string, (gold: string) => string> = {
  // A crescent sweep with a blade trailing it.
  cleave: (gold) => `
    <path d="M9 47 C16 23 37 11 56 13 C42 18 25 29 17 50 Z" fill="${gold}"/>
    <path d="M17 50 C25 29 42 18 56 13" fill="none" stroke="#fff6d6" stroke-width="1.2" stroke-opacity="0.8"/>
    <path d="M44 34 L56 46 M41 37 L47 31" stroke="${gold}" stroke-width="3.5" stroke-linecap="round"/>`,

  // A heater shield driving forward, with speed lines behind it.
  charge: (gold) => `
    <path d="M38 13 L53 17 L53 31 C53 42 46 48 38 53 C30 48 23 42 23 31 L23 17 Z" fill="${gold}"/>
    <path d="M38 19 L47 21.5 L47 31 C47 38 43 42 38 45.5 C33 42 29 38 29 31 L29 21.5 Z" fill="#2a1a10" fill-opacity="0.55"/>
    <path d="M7 24 H18 M4 32 H18 M7 40 H18" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>`,

  // A shout radiating outward.
  warcry: (gold) => `
    <circle cx="17" cy="32" r="6" fill="${gold}"/>
    <path d="M27 21 A15 15 0 0 1 27 43" fill="none" stroke="${gold}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M35 14 A24 24 0 0 1 35 50" fill="none" stroke="${gold}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M43 8 A33 33 0 0 1 43 56" fill="none" stroke="${gold}" stroke-width="3.5" stroke-linecap="round" stroke-opacity="0.7"/>`,

  // A sword driven into cracking ground.
  earthshatter: (gold) => `
    <path d="M32 7 L35.5 35 L32 41 L28.5 35 Z" fill="${gold}"/>
    <path d="M23 12 H41" stroke="${gold}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M7 47 H57" stroke="${gold}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M32 45 L26 52 L21 57 M32 45 L38 51 L45 55 M32 45 L32.5 58 M26 52 L22 50 M38 51 L42 49"
      fill="none" stroke="${gold}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="32" cy="44" r="4" fill="#fff3c4" fill-opacity="0.85"/>`,
};

/** SVG markup for a skill icon; unknown ids get a plain plate. */
export function skillIcon(id: string): string {
  const gold = `url(#${id}-gold)`;
  const emblem = emblems[id]?.(gold) ?? '';
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${plate(id)}${emblem}</svg>`;
}
