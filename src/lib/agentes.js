import {
  Headphones, TrendingUp, Building2, Wallet, Wrench, Ruler,
  MessageSquareWarning, ClipboardCheck, Star,
} from 'lucide-react';

/**
 * Catálogo de los nueve agentes.
 *
 * Vive en código y no en datos a propósito: es la lista de agentes que el
 * backend sabe enrutar, no una preferencia editable. Los prompts sí van en
 * datos (entidad AgentePrompt), que es lo que hay que poder cambiar sin
 * desplegar.
 *
 * Se lee desde tres pantallas —el editor de prompts, la vista de bandejas y la
 * bandeja de cada agente— así que tenerlo en un solo sitio evita que una añada
 * un agente y las otras dos no lo muestren.
 */
export const AGENTES = [
  { clave: 'recepcion',     nombre: 'Recepción',     icono: Headphones,           resumen: 'Orquestador. Desambigua y transfiere.' },
  { clave: 'ventas',        nombre: 'Ventas',        icono: TrendingUp,           resumen: 'Busca inmuebles, califica leads, agenda visitas.' },
  { clave: 'consignacion',  nombre: 'Consignación',  icono: Building2,            resumen: 'Capta inmuebles para venta o administración.' },
  { clave: 'cartera',       nombre: 'Cartera',       icono: Wallet,               resumen: 'Estado de cuenta y pagos. Exige verificación.' },
  { clave: 'mantenimiento', nombre: 'Mantenimiento', icono: Wrench,               resumen: 'Reparaciones y emergencias.' },
  { clave: 'avaluos',       nombre: 'Avalúos',       icono: Ruler,                resumen: 'Cotiza y agenda avalúos.' },
  { clave: 'pqr',           nombre: 'PQR',           icono: MessageSquareWarning, resumen: 'Radica peticiones y reclamos. Plazo legal.' },
  { clave: 'matricula',     nombre: 'Matrícula',     icono: ClipboardCheck,       resumen: 'Intake del F117 y participantes.' },
  { clave: 'encuestas',     nombre: 'Encuestas',     icono: Star,                 resumen: 'NPS y satisfacción.' },
];

/** clave -> nombre legible. */
export const NOMBRE_AGENTE = Object.fromEntries(AGENTES.map((a) => [a.clave, a.nombre]));

/** Devuelve el agente por su clave, o recepción si la clave es desconocida. */
export function agentePorClave(clave) {
  return AGENTES.find((a) => a.clave === clave) || AGENTES[0];
}
