import type { Entrada } from '../protocol.ts';
import { describirImagen, transcribir } from './media.ts';

const API = (token: string) => `https://api.telegram.org/bot${token}`;

export const esTelegram = (body: any) => !!(body?.message?.chat || body?.edited_message?.chat);

async function descargarMedia(fileId: string, tgToken: string) {
  const rInfo = await fetch(`${API(tgToken)}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!rInfo.ok) return null;
  const path = (await rInfo.json())?.result?.file_path;
  if (!path) return null;
  const rBin = await fetch(`https://api.telegram.org/file/bot${tgToken}/${path}`);
  if (!rBin.ok) return null;
  const mimeType = /\.(jpe?g)$/i.test(path) ? 'image/jpeg' : /\.png$/i.test(path) ? 'image/png' : 'audio/ogg';
  return { buf: await rBin.arrayBuffer(), mimeType };
}

export async function normalizar(
  body: any,
  env: { tgToken: string; openaiKey: string; tgBotKey?: string },
): Promise<Entrada | null> {
  const m = body?.message || body?.edited_message;
  const chatId = m?.chat?.id;
  if (!chatId) return null;
  // Telegram no conversa dentro de grupos: los ids negativos se ignoran.
  if (Number(chatId) < 0) return null;

  const base = {
    canal: 'telegram' as const,
    tel: String(chatId),
    // message_id solo es unico dentro de cada bot/chat. El prefijo evita que
    // dos bots dedicados conserven el mismo numero y el dedup descarte uno.
    msgId: `${env.tgBotKey || 'compartido'}:${String(m.message_id || '')}`,
    botonId: '',
    adReferral: { adId: '', adTitulo: '', adCuerpo: '' },
    destino: String(chatId),
  };

  const texto = String(m.text || '').trim();
  if (texto) return { ...base, texto };

  const audioId = m.voice?.file_id || m.audio?.file_id;
  if (audioId && env.openaiKey) {
    const media = await descargarMedia(audioId, env.tgToken);
    const t = media ? await transcribir(media.buf, media.mimeType, env.openaiKey) : null;
    return t ? { ...base, texto: t } : null;
  }

  const fotoId = Array.isArray(m.photo) && m.photo.length ? m.photo[m.photo.length - 1].file_id : '';
  if (fotoId) {
    const caption = String(m.caption || '').trim();
    let desc: string | null = null;
    if (env.openaiKey) {
      const media = await descargarMedia(fotoId, env.tgToken);
      if (media) desc = await describirImagen(media.buf, media.mimeType, env.openaiKey, caption);
    }
    return {
      ...base,
      texto: desc
        ? (caption ? `${caption}\n[El cliente envio una foto: ${desc}]` : `[El cliente envio una foto: ${desc}]`)
        : (caption || '[El cliente envio una foto que no pude ver bien]'),
    };
  }

  // Igual que en WhatsApp: un documento sin rama devolvia null y el cliente se
  // quedaba sin respuesta. No se descarga; solo se avisa para que el agente
  // pueda contestar.
  if (m.document) {
    const nombre = String(m.document.file_name || '').slice(0, 120);
    const caption = String(m.caption || '').trim();
    const aviso = `[El cliente envio un archivo${nombre ? ` llamado "${nombre}"` : ''}. NO lo has abierto ni puedes leerlo.]`;
    return { ...base, texto: caption ? `${caption}
${aviso}` : aviso };
  }

  if (m.video || m.sticker || m.location || m.contact) {
    const que = m.video ? 'video' : m.sticker ? 'sticker' : m.location ? 'ubicacion' : 'contacto';
    return { ...base, texto: `[El cliente envio un ${que} que no puedes procesar.]` };
  }

  return null;
}

export async function enviar(destino: string, texto: string, env: { tgToken: string }) {
  const r = await fetch(`${API(env.tgToken)}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Number(destino), text: texto }),
  });
  if (!r.ok) console.error('TG send error:', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}

export async function marcarEscribiendo(destino: string, env: { tgToken: string }) {
  try {
    await fetch(`${API(env.tgToken)}/sendChatAction`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(destino), action: 'typing' }),
    });
  } catch { /* cosmetico */ }
}
