import type { Entrada } from '../protocol.ts';
import { describirImagen, transcribir } from './media.ts';

const GRAPH = 'https://graph.facebook.com/v19.0';

export const esWhatsApp = (body: any) => !!body?.entry?.[0]?.changes;

const conIndicativo = (t: string) => {
  const d = String(t).replace(/\D/g, '');
  return d.startsWith('57') ? d : '57' + d;
};

async function descargarMedia(mediaId: string, waToken: string) {
  const rMeta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${waToken}` } });
  if (!rMeta.ok) return null;
  const meta = await rMeta.json();
  if (!meta.url) return null;
  const rBin = await fetch(meta.url, { headers: { Authorization: `Bearer ${waToken}` } });
  if (!rBin.ok) return null;
  return { buf: await rBin.arrayBuffer(), mimeType: meta.mime_type || 'application/octet-stream' };
}

export async function normalizar(body: any, env: { waToken: string; openaiKey: string }): Promise<Entrada | null> {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const m = value?.messages?.[0];
  if (!m?.from) return null;

  const tel = String(m.from).replace(/\D/g, '');
  const ref = m.referral || {};
  const base = {
    canal: 'whatsapp' as const,
    tel,
    msgId: m.id || '',
    botonId: '',
    adReferral: { adId: ref.source_id || '', adTitulo: ref.headline || '', adCuerpo: ref.body || '' },
    destino: conIndicativo(tel),
  };

  if (m.type === 'text') {
    return { ...base, texto: String(m.text?.body || '').trim() };
  }

  // Botones y listas del menu: ruteo gratis y familiar para sus usuarios.
  if (m.type === 'interactive') {
    const btn = m.interactive?.button_reply;
    const lst = m.interactive?.list_reply;
    const id = btn?.id || lst?.id || '';
    const titulo = btn?.title || lst?.title || '';
    return { ...base, botonId: String(id), texto: String(titulo || id) };
  }
  if (m.type === 'button') {
    return { ...base, botonId: String(m.button?.payload || ''), texto: String(m.button?.text || '') };
  }

  if (m.type === 'audio' && m.audio?.id && env.openaiKey) {
    const media = await descargarMedia(m.audio.id, env.waToken);
    const texto = media ? await transcribir(media.buf, media.mimeType, env.openaiKey) : null;
    return texto ? { ...base, texto } : null;
  }

  if (m.type === 'image' && m.image?.id) {
    const caption = String(m.image.caption || '').trim();
    let desc: string | null = null;
    if (env.openaiKey) {
      const media = await descargarMedia(m.image.id, env.waToken);
      if (media) desc = await describirImagen(media.buf, media.mimeType, env.openaiKey, caption);
    }
    const texto = desc
      ? (caption ? `${caption}\n[El cliente envio una foto: ${desc}]` : `[El cliente envio una foto: ${desc}]`)
      : (caption || '[El cliente envio una foto que no pude ver bien]');
    return { ...base, texto };
  }

  return null;
}

export async function enviar(destino: string, texto: string, env: { waPhoneId: string; waToken: string }) {
  const r = await fetch(`${GRAPH}/${env.waPhoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.waToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: texto } }),
  });
  if (!r.ok) console.error('WA send error:', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}

// Indicador de "escribiendo" real de Meta. Sustituye al sleep dentro del webhook:
// la pausa la hace el worker de entrega, no el request.
export async function marcarEscribiendo(msgId: string, env: { waPhoneId: string; waToken: string }) {
  if (!msgId) return;
  try {
    await fetch(`${GRAPH}/${env.waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: msgId, typing_indicator: { type: 'text' } }),
    });
  } catch { /* el indicador es cosmetico: nunca debe tumbar el turno */ }
}
