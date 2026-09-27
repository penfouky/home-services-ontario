/* Pictures drawn in code: the Teddy mascot and a small icon set, all original artwork. */

const stroke = (paths, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  wand: stroke('<path d="M4 20 15 9"/><path d="m14 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="m19 11 .6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6z"/><path d="M8 3.5v2M7 4.5h2"/>'),
  shelf: stroke('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 12h18"/><path d="M7 8h3M7 16h3"/>'),
  gear: stroke('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  play: stroke('<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5z" fill="currentColor"/>'),
  pause: stroke('<rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/>'),
  plus: stroke('<path d="M12 5v14M5 12h14"/>'),
  sd: stroke('<path d="M7 3h8l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 7v3M12 7v3M15 7v3"/>'),
  eject: stroke('<path d="M12 5 5 13h14z" fill="currentColor"/><path d="M5 18h14"/>'),
  trash: stroke('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  save: stroke('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  music: stroke('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  folder: stroke('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  file: stroke('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  x: stroke('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: stroke('<path d="m5 12 5 5 9-10"/>'),
  grip: stroke('<circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/>'),
  edit: stroke('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>'),
  search: stroke('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  star: stroke('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>'),
  back: stroke('<path d="M15 5 8 12l7 7"/>'),
  next: stroke('<path d="m9 5 7 7-7 7"/>'),
  refresh: stroke('<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/>'),
  info: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  sparkles: stroke('<path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" fill="currentColor"/><path d="m19 15 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="currentColor"/>'),
  tag: stroke('<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/>'),
  heart: stroke('<path d="M12 20s-7-4.4-9-9a4.7 4.7 0 0 1 9-3 4.7 4.7 0 0 1 9 3c-2 4.6-9 9-9 9z" fill="currentColor"/>'),
  clock: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  magic: stroke('<path d="M5 19 19 5"/><path d="M15 5h4v4"/><path d="M5 9V5M3 7h4M17 17v4M15 19h4"/>'),
  finder: stroke('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/><path d="M7 9v1M17 9v1"/><path d="M7 15c3 2 7 2 10 0"/>'),
  mic: stroke('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>'),
  stop: stroke('<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>'),
  broom: stroke('<path d="m14 3-5 9"/><path d="M5 13h8l2 8H3z"/><path d="M7 17v4M11 17v4"/>')
};

/* Teddy the bear. mood: happy, wave, sleepy */
export function teddy(mood = 'happy', size = 96) {
  const eyes = mood === 'sleepy'
    ? '<path d="M39 57q6 5 12 0M69 57q6 5 12 0" stroke="#3b2640" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
    : '<circle cx="45" cy="57" r="5.2" fill="#3b2640"/><circle cx="46.8" cy="55.2" r="1.8" fill="#fff"/><circle cx="75" cy="57" r="5.2" fill="#3b2640"/><circle cx="76.8" cy="55.2" r="1.8" fill="#fff"/>';
  const cap = mood === 'sleepy'
    ? '<path d="M24 36q30-40 72-6 8 6 2 10-34-18-72 4z" fill="#7c5cff"/><path d="M92 30q18 10 14 34" stroke="#7c5cff" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="106" cy="66" r="7" fill="#ffc94d"/><path d="M26 40q34-20 70-6" stroke="#ffc94d" stroke-width="3" fill="none" stroke-dasharray="1 7" stroke-linecap="round"/>'
    : '';
  const paw = mood === 'wave'
    ? '<g class="teddy-paw"><ellipse cx="104" cy="92" rx="11" ry="13" fill="#d99a66"/><ellipse cx="104" cy="95" rx="6" ry="7" fill="#f5d3b3"/></g>'
    : '';
  return `<svg class="teddy teddy-${mood}" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="30" cy="30" r="16" fill="#c98556"/><circle cx="30" cy="30" r="8.5" fill="#f2c7a5"/>
    <circle cx="90" cy="30" r="16" fill="#c98556"/><circle cx="90" cy="30" r="8.5" fill="#f2c7a5"/>
    <circle cx="60" cy="63" r="41" fill="#d99a66"/>
    <ellipse cx="60" cy="78" rx="19" ry="15" fill="#f5d3b3"/>
    ${eyes}
    <ellipse cx="60" cy="71" rx="6.5" ry="4.8" fill="#3b2640"/>
    <path d="M52 80q8 7 16 0" stroke="#3b2640" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="37" cy="72" rx="6.5" ry="3.8" fill="#ff8fb1" opacity=".65"/><ellipse cx="83" cy="72" rx="6.5" ry="3.8" fill="#ff8fb1" opacity=".65"/>
    ${cap}${paw}
  </svg>`;
}

/* a little five-point star for sprinkling around */
export const star = (size = 14, color = '#ffe8a3') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="m12 1.5 2.9 6.9 7.4.6-5.6 4.9 1.7 7.3L12 17.3 5.6 21.2l1.7-7.3L1.7 9l7.4-.6z" fill="${color}"/></svg>`;

/* a friendly SD card with a face, for "put the card in" */
export function sdArt(size = 120) {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
    <ellipse cx="60" cy="110" rx="34" ry="6" fill="#2a2178" opacity=".16"/>
    <path d="M36 12h36l20 20v66a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8V20a8 8 0 0 1 8-8z" fill="#7c5cff"/>
    <path d="M36 12h36l20 20v8H28V20a8 8 0 0 1 8-8z" fill="#9b82ff"/>
    <g fill="#ffc94d"><rect x="42" y="18" width="6" height="14" rx="2"/><rect x="54" y="18" width="6" height="14" rx="2"/><rect x="66" y="18" width="6" height="14" rx="2"/></g>
    <circle cx="48" cy="66" r="5" fill="#241d4f"/><circle cx="49.6" cy="64.4" r="1.7" fill="#fff"/>
    <circle cx="72" cy="66" r="5" fill="#241d4f"/><circle cx="73.6" cy="64.4" r="1.7" fill="#fff"/>
    <path d="M52 78q8 7 16 0" stroke="#241d4f" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="40" cy="76" rx="5" ry="3" fill="#ff8fb1" opacity=".7"/><ellipse cx="80" cy="76" rx="5" ry="3" fill="#ff8fb1" opacity=".7"/>
  </svg>`;
}
