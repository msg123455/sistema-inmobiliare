/** Verifica X-Hub-Signature-256 sobre los bytes exactos enviados por Meta. */
export async function firmaMetaValida(
  rawBody: ArrayBuffer,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header?.startsWith('sha256=') || !secret) return false;
  const hex = header.slice('sha256='.length);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;

  const firma = new Uint8Array(32);
  for (let i = 0; i < firma.length; i++) {
    firma[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    return await crypto.subtle.verify('HMAC', key, firma, rawBody);
  } catch (e) {
    console.error('No se pudo verificar la firma de Meta:', (e as Error).message);
    return false;
  }
}

/** Comparacion de tiempo constante respecto del contenido del secret. */
export function secretoIgual(recibido: string | null, esperado: string): boolean {
  if (!recibido || !esperado) return false;
  const a = new TextEncoder().encode(recibido);
  const b = new TextEncoder().encode(esperado);
  let diferencia = a.length ^ b.length;
  const largo = Math.max(a.length, b.length);
  for (let i = 0; i < largo; i++) diferencia |= (a[i] || 0) ^ (b[i] || 0);
  return diferencia === 0;
}
