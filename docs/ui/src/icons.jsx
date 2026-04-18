// Icons — simple, inked line icons matching the paper aesthetic

const Icon = ({ d, size = 16, stroke = 'currentColor', fill = 'none', sw = 1.5, style, viewBox = '0 0 24 24' }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);

// Logo — squirrel & acorn in conversation, facing each other
const AcornLogo = ({ size = 24, color }) => {
  const ink = color || 'var(--acorn-2)';
  const fill = color || 'var(--acorn)';
  return (
    <svg width={size * 1.33} height={size} viewBox="0 0 32 24" fill="none" style={{ flexShrink: 0 }}>
      {/* squirrel — left, facing right */}
      <g>
        {/* tail — curling up behind */}
        <path d="M3 18 Q0.5 14 2 10 Q3.5 6.5 6 6 Q5 9 5.5 12 Q6 14.5 7 16 Z"
          fill={fill} stroke={ink} strokeWidth="0.9" strokeLinejoin="round" opacity="0.85"/>
        {/* body */}
        <path d="M6 18 Q5 14 7 11.5 Q9 9.5 11.5 10 Q13 10.5 13 13 L13 18 Z"
          fill={fill} stroke={ink} strokeWidth="0.9" strokeLinejoin="round"/>
        {/* head */}
        <path d="M10 11 Q9.5 8 11.5 7 Q13.5 6.3 14.8 7.5 Q15.5 8.3 15.3 9.5 Q15 10.8 13.8 11.2 Q12.5 11.6 11 11.2 Z"
          fill={fill} stroke={ink} strokeWidth="0.9" strokeLinejoin="round"/>
        {/* ear tuft */}
        <path d="M12.3 6.8 L13 5.5 L13.7 6.8" fill={ink} stroke={ink} strokeWidth="0.6" strokeLinejoin="round"/>
        {/* eye — looking right at acorn */}
        <circle cx="14" cy="8.8" r="0.7" fill="var(--ink)"/>
      </g>

      {/* speech — three dots connecting them */}
      <circle cx="17.5" cy="9" r="0.8" fill={ink} opacity="0.9"/>
      <circle cx="19.5" cy="9" r="0.6" fill={ink} opacity="0.6"/>
      <circle cx="21.2" cy="9" r="0.4" fill={ink} opacity="0.35"/>

      {/* acorn — right, facing left */}
      <g>
        {/* cap */}
        <path d="M22.5 10 Q22.5 7.5 24.5 6.8 Q27 6 29.5 6.8 Q31 7.3 31 10 Z"
          fill={ink} stroke={ink} strokeWidth="0.9" strokeLinejoin="round"/>
        {/* cap rim highlight */}
        <path d="M22.5 10 L31 10" stroke={ink} strokeWidth="0.6" opacity="0.6"/>
        {/* stem */}
        <path d="M26.5 7 Q26.5 5.5 25.8 5" stroke={ink} strokeWidth="0.9" strokeLinecap="round" fill="none"/>
        {/* body */}
        <path d="M23 10.5 Q23 15.5 25 18 Q27 19.5 29 18 Q31 15.5 31 10.5 Z"
          fill={fill} stroke={ink} strokeWidth="0.9" strokeLinejoin="round"/>
        {/* face — looking left at squirrel */}
        <circle cx="25" cy="14" r="0.6" fill="var(--ink)"/>
        <path d="M25.5 15.8 Q26.5 16.4 27.5 15.8" stroke="var(--ink)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
      </g>
    </svg>
  );
};

const I = {
  Clip: (p) => <Icon {...p} d={<><path d="M7 7v10a4 4 0 0 0 8 0V5.5a2.5 2.5 0 0 0-5 0V16a1 1 0 0 0 2 0V7"/></>} />,
  Search: (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="6"/><path d="M21 21l-5.5-5.5"/></>} />,
  Back: (p) => <Icon {...p} d="M15 18l-6-6 6-6"/>,
  Fwd: (p) => <Icon {...p} d="M9 18l6-6-6-6"/>,
  Reload: (p) => <Icon {...p} d={<><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>} />,
  Plus: (p) => <Icon {...p} d={<><path d="M12 5v14"/><path d="M5 12h14"/></>} />,
  Star: (p) => <Icon {...p} d="M12 2.5l2.9 6.2 6.6.8-4.9 4.5 1.3 6.5L12 17.3 6.1 20.5l1.3-6.5L2.5 9.5l6.6-.8z" />,
  Bookmark: (p) => <Icon {...p} d="M6 3h12v18l-6-4-6 4z"/>,
  Folder: (p) => <Icon {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>,
  File: (p) => <Icon {...p} d={<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></>} />,
  Chat: (p) => <Icon {...p} d="M21 12a8 8 0 0 1-11.7 7.1L4 20l1-5.2A8 8 0 1 1 21 12z"/>,
  Globe: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13 13 0 0 1 0 18"/><path d="M12 3a13 13 0 0 0 0 18"/></>} />,
  Settings: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="2.5"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />,
  Library: (p) => <Icon {...p} d={<><path d="M4 4v16"/><path d="M4 4h7a3 3 0 0 1 3 3v13"/><path d="M14 7a3 3 0 0 1 3-3h3v16h-3a3 3 0 0 0-3 3"/></>} />,
  At: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/></>} />,
  Send: (p) => <Icon {...p} d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>,
  Check: (p) => <Icon {...p} d="M4 12l5 5L20 6"/>,
  X: (p) => <Icon {...p} d={<><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>} />,
  More: (p) => <Icon {...p} d={<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>} fill="currentColor" stroke="none" sw={0}/>,
  Tag: (p) => <Icon {...p} d={<><path d="M20 12V5a1 1 0 0 0-1-1h-7l-9 9 8 8z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></>} />,
  Clock: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  Edit: (p) => <Icon {...p} d={<><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></>} />,
  Sparkles: (p) => <Icon {...p} d={<><path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8z"/><path d="M5 3v3M19 17v3M4 5h2M18 18h2"/></>} />,
  Warn: (p) => <Icon {...p} d={<><path d="M12 3L2 20h20z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></>} />,
  Branch: (p) => <Icon {...p} d={<><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8"/><path d="M6 14c0-4 6-2 6-6 0 0 0-.7 0-0"/></>} />,
  Tool: (p) => <Icon {...p} d={<><path d="M14 6l3-3 5 5-3 3M10 10L3 17v4h4l7-7"/></>} />,
  Arrow: (p) => <Icon {...p} d="M5 12h14M13 5l7 7-7 7"/>,
  Dot: (p) => <Icon {...p} d="" viewBox="0 0 8 8" fill="currentColor" stroke="none" />,
  Squirrel: ({ size = 20, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M8 20 Q6 18 6 14 Q6 10 9 9 Q7 7 8 5 Q10 4 12 6 Q14 4 16 6 Q17 8 15 10 Q18 10 18 13 Q22 14 21 18 Q19 17 17 18 L17 20 Z"
        fill={color || 'var(--acorn)'} stroke={color || 'var(--acorn-2)'} strokeWidth="1" strokeLinejoin="round"/>
      <circle cx="10.5" cy="9" r="0.8" fill="var(--ink)"/>
    </svg>
  ),
};

Object.assign(window, { Icon, I, AcornLogo });
