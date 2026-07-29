import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Named entity exports for convenient imports
export const Propiedad = base44.entities.Propiedad;
export const Contacto = base44.entities.Contacto;
export const Propietario = base44.entities.Propietario;
export const ContratoArriendo = base44.entities.ContratoArriendo;
export const ContratoVenta = base44.entities.ContratoVenta;
export const Visita = base44.entities.Visita;
export const Tarea = base44.entities.Tarea;
export const Nota = base44.entities.Nota;
export const MensajeTemplate = base44.entities.MensajeTemplate;
export const MensajeEnviado = base44.entities.MensajeEnviado;
export const CampanaSocial = base44.entities.CampanaSocial;
export const WasiConfig = base44.entities.WasiConfig;
export const ConfigSEO = base44.entities.ConfigSEO;
export const SEOPropiedad = base44.entities.SEOPropiedad;

// IA Agente entities
export const Conversacion = base44.entities.Conversacion;
export const MensajeConversacion = base44.entities.MensajeConversacion;
export const HistorialLead = base44.entities.HistorialLead;
export const ConfigAgente = base44.entities.ConfigAgente;
export const ConocimientoRAG = base44.entities.ConocimientoRAG;

// Arquitectura multi-agente
export const MemoriaChat = base44.entities.MemoriaChat;
export const AgentePrompt = base44.entities.AgentePrompt;
export const ColaSalida = base44.entities.ColaSalida;
export const Asesor = base44.entities.Asesor;

// Operación
export const Arrendatario = base44.entities.Arrendatario;
export const Consignacion = base44.entities.Consignacion;
export const Reparacion = base44.entities.Reparacion;
export const Avaluo = base44.entities.Avaluo;
export const PQR = base44.entities.PQR;
export const SolicitudMatricula = base44.entities.SolicitudMatricula;
export const PagoCanon = base44.entities.PagoCanon;

// SEO Pipeline entities
export const NodoSitemap = base44.entities.NodoSitemap;
export const ContenidoSEO = base44.entities.ContenidoSEO;
