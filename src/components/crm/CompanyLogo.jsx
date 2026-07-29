import React, { useState, useEffect } from 'react';

const COLORS = [
  ['#3B82F6','#1D4ED8'], ['#8B5CF6','#6D28D9'], ['#10B981','#047857'],
  ['#F59E0B','#B45309'], ['#EF4444','#B91C1C'], ['#EC4899','#BE185D'],
  ['#14B8A6','#0F766E'], ['#F97316','#C2410C'], ['#6366F1','#4338CA'],
  ['#84CC16','#4D7C0F'],
];

function getColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getDomain(cliente) {
  if (cliente?.dominio_web) {
    const cleaned = cliente.dominio_web.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
    if (cleaned && cleaned.includes('.')) return cleaned;
  }
  const email = cliente?.contacto_email;
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1];
  const generic = ['gmail.com','hotmail.com','outlook.com','yahoo.com','icloud.com','aol.com','live.com','mail.com','protonmail.com'];
  return generic.includes(domain) ? null : domain;
}

function InitialsAvatar({ name, size }) {
  const [bg, text] = getColor(name);
  const initials = getInitials(name);
  const sizeClasses = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${sizeClasses} rounded-lg flex items-center justify-center font-bold flex-shrink-0 select-none`}
      style={{ background: `linear-gradient(135deg, ${bg}, ${text})`, color: '#fff' }}
    >
      {initials}
    </div>
  );
}

const LOGO_SOURCES = (domain) => [
  `https://logo.clearbit.com/${domain}`,
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
];

export default function CompanyLogo({ cliente, size = 'md' }) {
  const domain = getDomain(cliente);
  const [srcIndex, setSrcIndex] = useState(0);

  useEffect(() => {
    setSrcIndex(0);
  }, [domain]);

  const sizeClasses = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-10 h-10';
  const sources = domain ? LOGO_SOURCES(domain) : [];

  if (!domain || srcIndex >= sources.length) {
    return <InitialsAvatar name={cliente?.nombre_empresa || ''} size={size} />;
  }

  return (
    <img
      src={sources[srcIndex]}
      alt=""
      className={`${sizeClasses} rounded-lg object-contain bg-white border border-border/40 flex-shrink-0`}
      onError={() => setSrcIndex(i => i + 1)}
    />
  );
}