function pad(n) { return String(n).padStart(2, '0'); }

export function gcalEventLink({ titulo, fecha_limite, hora = '', descripcion = '' }) {
  const parts = (fecha_limite || '').split('-').map(Number);
  if (parts.length < 3 || !parts[0]) return null;
  const [y, m, d] = parts;

  let start, end;
  if (hora) {
    const [h, min] = hora.split(':').map(Number);
    const totalEnd = h * 60 + (min || 0) + 30;
    const eH = Math.floor(totalEnd / 60) % 24;
    const eM = totalEnd % 60;
    const eD = totalEnd >= 1440 ? d + 1 : d;
    start = `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(min || 0)}00`;
    end   = `${y}${pad(m)}${pad(eD)}T${pad(eH)}${pad(eM)}00`;
  } else {
    start = `${y}${pad(m)}${pad(d)}`;
    const next = new Date(y, m - 1, d + 1);
    end = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
  }

  const params = new URLSearchParams({ action: 'TEMPLATE', text: titulo, dates: `${start}/${end}` });
  if (descripcion) params.set('details', descripcion);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
