/**
 * Identidad de la marca en un solo lugar.
 *
 * El nombre estaba repetido como string suelto ("InmoGest") en varios puntos del
 * Layout. Centralizarlo evita que aplicar el manual de marca sea una caceria de
 * strings por el codigo.
 *
 * Los tokens visuales (color, tipografia, radio) viven aparte, en
 * src/styles/brand.css. Aqui solo va el texto.
 */
export const MARCA = {
  /** Nombre completo. Titulos de pagina, documentos, correos. */
  nombre: 'INMOBILIARE Julio Corredor',
  /** Version corta para el header y espacios estrechos. */
  nombreCorto: 'INMOBILIARE',
  /** Razon social, para documentos legales y contratos. */
  razonSocial: 'J.C.O Inversiones S.A.S',
  sitioWeb: 'https://www.inmobiliarelatam.com',
  telefono: '485 3000',
  whatsapp: '3182152607',
  email: 'gerencia@inmobiliarelatam.com',
  direccion: 'Calle 81 # 8 - 95, Bogota',
  ciudad: 'Bogota',
};
