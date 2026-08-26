// Aviso de tratamiento de datos (Ley 1581/2012).
//
// POR QUE VIVE EN CODIGO Y NO EN EL PROMPT: el sistema crea el registro de
// Contacto con datos personales en el primer mensaje entrante, antes de que el
// modelo genere una palabra. Si el aviso dependiera de que el modelo se acuerde
// de darlo, habria conversaciones donde se guardan datos sin haberlo dado — y
// no habria forma de saber cuales. Aqui es determinista: primer turno sin
// autorizacion registrada, el aviso se antepone a la respuesta.
//
// El modelo NO puede omitirlo ni reformularlo, que es justo lo que se necesita
// de un texto con efecto legal.

/** Versión del texto y de la política. Subirla fuerza a re-avisar a todos. */
export const POLITICA_VERSION = '2026-01';

/** URL por defecto. Se puede sobreescribir con ConfigAgente.politica_datos_url. */
const POLITICA_URL_DEFECTO = 'https://bit.ly/3imaawE';

export function urlPolitica(config: Record<string, any>): string {
  return String(config?.politica_datos_url || '').trim() || POLITICA_URL_DEFECTO;
}

/**
 * El texto del aviso. Un solo globo, corto: va antes de la respuesta real y no
 * debe tapar la conversación.
 *
 * Es el modelo de aviso que ya usa su chatbot actual —consentimiento por
 * continuación— y es la práctica común en atención por WhatsApp en Colombia.
 * No es consentimiento expreso: si el negocio decide que lo necesita, este es
 * el punto donde se cambia a bloqueante.
 */
export function textoAviso(config: Record<string, any>): string {
  const empresa = String(config?.nombre_inmobiliaria || '').trim() || 'INMOBILIARE Julio Corredor';
  return (
    `Antes de seguir: en ${empresa} tratamos tus datos conforme a nuestra política. ` +
    `Si continúas, entenderemos que la aceptas. Puedes consultarla en ${urlPolitica(config)}`
  );
}

/**
 * ¿Hay que avisar? Solo en el primer turno de una conversación y solo si el
 * contacto no tiene registrada una autorización de esta misma versión.
 *
 * Se re-avisa cuando cambia POLITICA_VERSION: una autorización dada sobre otro
 * texto no cubre el nuevo.
 */
export function debeAvisar(esPrimerTurno: boolean, contacto: Record<string, any> | null): boolean {
  if (!esPrimerTurno) return false;
  if (!contacto) return true;
  if (!contacto.autoriza_tratamiento) return true;
  return String(contacto.politica_version || '') !== POLITICA_VERSION;
}

/** Campos a escribir en Contacto cuando se entrega el aviso. */
export function marcaAutorizacion() {
  return {
    autoriza_tratamiento: true,
    fecha_autorizacion: new Date().toISOString(),
    politica_version: POLITICA_VERSION,
  };
}
