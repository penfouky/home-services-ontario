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
  book: stroke('<path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2z"/><path d="M20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2z"/>'),
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

/* Original storybook characters for the picture picker: generic archetypes (princess, hero,
   mermaid, …) drawn in this app's own flat style. Not copies of any studio's characters. */
const face = (skin, eyeY = 54) =>
  `<circle cx="50" cy="55" r="26" fill="${skin}"/>
   <circle cx="41" cy="${eyeY}" r="3.4" fill="#2f2440"/><circle cx="59" cy="${eyeY}" r="3.4" fill="#2f2440"/>
   <circle cx="42.2" cy="${eyeY - 1.2}" r="1.1" fill="#fff"/><circle cx="60.2" cy="${eyeY - 1.2}" r="1.1" fill="#fff"/>
   <path d="M43 ${eyeY + 10}q7 6 14 0" stroke="#a4506a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
   <ellipse cx="35" cy="${eyeY + 7}" rx="4" ry="2.6" fill="#ff9db3" opacity=".6"/>
   <ellipse cx="65" cy="${eyeY + 7}" rx="4" ry="2.6" fill="#ff9db3" opacity=".6"/>`;

const characterArt = {
  princess: `<path d="M22 60c0-24 12-38 28-38s28 14 28 38c0 10-4 18-4 18l-8-6-6 6-10-4-10 4-6-6-8 6s-4-8-4-18z" fill="#8a5a2b"/>
    ${face('#f4c9a3')}
    <path d="M32 30l6 8 6-10 6 10 6-8 4 10H28z" fill="#ffcf4d" stroke="#e8a91f" stroke-width="1.5"/>
    <circle cx="50" cy="31" r="2.4" fill="#ff6fae"/>`,
  prince: `<path d="M26 40c2-14 12-20 24-20s22 6 24 20c-6-4-14-6-24-6s-18 2-24 6z" fill="#5b3b21"/>
    ${face('#f0c19a')}
    <path d="M34 26l5 7 5-9 6 9 5-7 4 9H30z" fill="#ffd24d" stroke="#e8a91f" stroke-width="1.5"/>
    <path d="M24 82c4-12 14-16 26-16s22 4 26 16z" fill="#4a7bd6"/>`,
  mermaid: `<path d="M20 58c0-26 14-40 30-40s30 14 30 40c0 12-6 20-6 20l-6-8-8 8-10-6-10 6-8-8-6 8s-6-8-6-20z" fill="#12b3a6"/>
    ${face('#f4c9a3')}
    <path d="M50 79c8 0 14 5 14 12 0 6-6 9-14 9s-14-3-14-9c0-7 6-12 14-12z" fill="#18c2b4"/>
    <path d="M50 30a5 5 0 0 1 5 5h-10a5 5 0 0 1 5-5z" fill="#ffd24d"/>`,
  fairy: `<path d="M50 40C30 28 14 34 14 50s18 20 36 8c18 12 36 8 36-8s-16-22-36-10z" fill="#bfe3ff" opacity=".85"/>
    <path d="M24 44c8-22 44-22 52 0" fill="#8a5a2b"/>
    ${face('#f4c9a3')}
    <path d="M78 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffd24d"/>`,
  hero: `<path d="M16 86c3-18 17-26 34-26s31 8 34 26z" fill="#e8456a"/>
    <path d="M50 62l3.4 6.8 7.6.6-5.8 5 1.8 7.4L50 84l-6.8 3.8 1.8-7.4-5.8-5 7.6-.6z" fill="#ffd24d"/>
    <circle cx="50" cy="52" r="26" fill="#f0c19a"/>
    <path d="M24 46c2-12 14-18 26-18s24 6 26 18c-9-5-17-7-26-7s-17 2-26 7z" fill="#3a2b6b"/>
    <path d="M27 50c6-4 40-4 46 0l-2 9c-8 3-34 3-42 0z" fill="#3450b0"/>
    <ellipse cx="41" cy="54" rx="4.6" ry="3.3" fill="#fff"/><ellipse cx="59" cy="54" rx="4.6" ry="3.3" fill="#fff"/>
    <circle cx="41" cy="54" r="2" fill="#2f2440"/><circle cx="59" cy="54" r="2" fill="#2f2440"/>
    <path d="M43 65q7 5 14 0" stroke="#a4506a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  wizard: `<path d="M50 6l16 40H34z" fill="#5a3fb0"/><path d="M30 44h40v8H30z" fill="#4a2f9e"/>
    <path d="M44 20l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#ffd24d"/><circle cx="58" cy="30" r="2" fill="#ffd24d"/>
    ${face('#f0c19a', 58)}
    <path d="M36 66c4 8 24 8 28 0 2 8-2 20-14 20s-16-12-14-20z" fill="#f2f2f7"/>`,
  pirate: `${face('#f0c19a', 55)}
    <path d="M20 46c2-10 14-16 30-16s28 6 30 16c-8-6-18-8-30-8s-22 2-30 8z" fill="#7a3b2b"/>
    <path d="M20 44h60v6a30 30 0 0 1-60 0z" fill="#2f2b3a" opacity="0"/>
    <path d="M18 42c6-6 58-6 64 0l-2 6H20z" fill="#c0392b"/>
    <rect x="34" y="50" width="12" height="9" rx="2" fill="#2f2440"/><path d="M28 54h6M46 54h8" stroke="#2f2440" stroke-width="2"/>`,
  astronaut: `<circle cx="50" cy="54" r="30" fill="#eef2f7"/><circle cx="50" cy="54" r="30" fill="none" stroke="#c7d2e0" stroke-width="3"/>
    <circle cx="50" cy="55" r="20" fill="#3a4a63"/>
    <path d="M35 49a20 20 0 0 1 19-8" stroke="#9fc3ff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>
    <circle cx="44" cy="53" r="2.4" fill="#dcecff"/><circle cx="58" cy="61" r="1.6" fill="#dcecff"/>
    <rect x="44" y="19" width="12" height="7" rx="3" fill="#c7d2e0"/><circle cx="50" cy="16" r="3" fill="#ffd24d"/>`,
  knight: `<path d="M30 30h40v40a20 20 0 0 1-40 0z" fill="#c7d2e0"/><path d="M30 30h40v40a20 20 0 0 1-40 0z" fill="none" stroke="#98a6bd" stroke-width="3"/>
    <rect x="46" y="40" width="8" height="34" rx="3" fill="#4a5568"/><rect x="34" y="50" width="32" height="7" rx="3" fill="#4a5568"/>
    <path d="M50 10c6 4 8 10 6 20h-12c-2-10 0-16 6-20z" fill="#e8456a"/>`,
  robot: `<rect x="24" y="30" width="52" height="46" rx="12" fill="#8a93c7"/><rect x="24" y="30" width="52" height="46" rx="12" fill="none" stroke="#6a74b0" stroke-width="2"/>
    <rect x="32" y="42" width="36" height="20" rx="6" fill="#241d4f"/>
    <circle cx="43" cy="52" r="4" fill="#5ee0c8"/><circle cx="57" cy="52" r="4" fill="#5ee0c8"/>
    <path d="M40 68h20" stroke="#5ee0c8" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="47" y="16" width="6" height="12" rx="3" fill="#6a74b0"/><circle cx="50" cy="14" r="4" fill="#ffd24d"/>`,
  dragon: `<path d="M22 58c0-22 12-34 28-34s28 12 28 34c0 12-8 22-28 22s-28-10-28-22z" fill="#4bbf6b"/>
    <path d="M32 30l-6-12 14 6zM68 30l6-12-14 6z" fill="#7bd98f"/>
    <ellipse cx="50" cy="66" rx="16" ry="12" fill="#bff0c8"/>
    <circle cx="41" cy="52" r="4" fill="#2f2440"/><circle cx="59" cy="52" r="4" fill="#2f2440"/>
    <circle cx="43" cy="66" r="2" fill="#2f2440"/><circle cx="57" cy="66" r="2" fill="#2f2440"/>`,
  snowman: `<circle cx="50" cy="58" r="28" fill="#f2f7ff"/><circle cx="50" cy="58" r="28" fill="none" stroke="#d6e3f2" stroke-width="2"/>
    <circle cx="41" cy="54" r="3.4" fill="#2f2440"/><circle cx="59" cy="54" r="3.4" fill="#2f2440"/>
    <path d="M50 58l14 4-14 4z" fill="#ff8a3d"/>
    <circle cx="42" cy="70" r="2" fill="#2f2440"/><circle cx="50" cy="72" r="2" fill="#2f2440"/><circle cx="58" cy="70" r="2" fill="#2f2440"/>
    <path d="M24 34h52v6H24z" fill="#3a2b6b"/><path d="M32 20h36v16H32z" fill="#3a2b6b"/><path d="M32 34h36v3H32z" fill="#e8456a"/>`,
  genie: `<path d="M50 12c10 0 16 8 16 16 0 6-4 8-4 8H38s-4-2-4-8c0-8 6-16 16-16z" fill="#7c5cff"/>
    <circle cx="50" cy="24" r="3" fill="#ffd24d"/>
    ${face('#c8a0e8', 58)}
    <path d="M34 70c4 6 24 6 32 0 4 6 2 16-16 16s-20-10-16-16z" fill="#a48dff"/>`
};

export const characters = Object.keys(characterArt);

export function character(name, size = 64) {
  const art = characterArt[name];
  return art ? `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${art}</svg>` : '';
}
