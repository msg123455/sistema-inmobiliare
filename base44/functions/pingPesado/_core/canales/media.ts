// Audio -> texto y imagen -> descripcion. Compartido por ambos canales.

export async function transcribir(buf: ArrayBuffer, mimeType: string, openaiKey: string): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mimeType }), 'audio.ogg');
  fd.append('model', 'whisper-1');
  fd.append('language', 'es');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: fd,
  });
  if (!r.ok) { console.error('Whisper error:', r.status); return null; }
  return ((await r.json()).text || '').trim() || null;
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
}

export async function describirImagen(
  buf: ArrayBuffer, mimeType: string, openaiKey: string, caption: string,
): Promise<string | null> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Un cliente de una inmobiliaria en Bogota envio esta imagen por chat${caption ? ` con el texto: "${caption}"` : ''}. Describe en 1 o 2 frases en espanol QUE muestra, enfocandote en lo util para bienes raices: si es un inmueble (que tipo o ambiente), un dano o averia (que se ve danado), un plano, un pantallazo de un anuncio, un documento (cedula, extracto, recibo), o algo personal. Solo la descripcion, sin preambulos.` },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64(buf)}` } },
        ],
      }],
    }),
  });
  if (!r.ok) { console.error('Vision error:', r.status); return null; }
  return ((await r.json()).choices?.[0]?.message?.content || '').trim() || null;
}
