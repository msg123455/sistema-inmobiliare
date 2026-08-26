import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from 'next-themes'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout.jsx';
import { useUserRole } from '@/hooks/useUserRole';

// Páginas base
import Dashboard from '@/pages/Dashboard.jsx';
import Configuracion from '@/pages/Configuracion.jsx';
import Calendario from '@/pages/Calendario.jsx';
import Metas from '@/pages/Metas.jsx';

// CRM
import Pipeline from '@/pages/crm/Pipeline.jsx';
import Propiedades from '@/pages/crm/Propiedades.jsx';
import Contactos from '@/pages/crm/Contactos.jsx';
import Propietarios from '@/pages/crm/Propietarios.jsx';
import Visitas from '@/pages/crm/Visitas.jsx';
import TareasCRM from '@/pages/crm/Tareas.jsx';

// Operación
import Consignaciones from '@/pages/operacion/Consignaciones.jsx';
import Reparaciones from '@/pages/operacion/Reparaciones.jsx';
import Avaluos from '@/pages/operacion/Avaluos.jsx';
import PQR from '@/pages/operacion/PQR.jsx';
import Matriculas from '@/pages/operacion/Matriculas.jsx';
import Asistidos from '@/pages/operacion/Asistidos.jsx';

// Cartera
import Recaudo from '@/pages/cartera/Recaudo.jsx';
import Envios from '@/pages/cartera/Envios.jsx';
import CodigosMensuales from '@/pages/cartera/CodigosMensuales.jsx';
import Liquidaciones from '@/pages/cartera/Liquidaciones.jsx';

// Equipo
import Asesores from '@/pages/equipo/Asesores.jsx';

// Contratos
import ContratosArriendo from '@/pages/contratos/ContratosArriendo.jsx';
import ContratosVenta from '@/pages/contratos/ContratosVenta.jsx';

// Finanzas
import Gastos from '@/pages/finanzas/Gastos.jsx';

// Marketing
import SEOPage from '@/pages/marketing/SEO.jsx';
import AgenteSocial from '@/pages/marketing/AgenteSocial.jsx';
import Campanas from '@/pages/marketing/Campanas.jsx';

// Integraciones
import SincronizarSimi from '@/pages/integraciones/SincronizarSimi.jsx';

// Portal del cliente (arrendatarios y propietarios) — arbol aparte, sin auth de staff
import PortalLayout from '@/pages/portal/PortalLayout.jsx';
import PortalEntrar from '@/pages/portal/PortalEntrar.jsx';
import {
  PortalInicio, PortalEstadoCuenta, PortalPagos,
  PortalContrato, PortalReparaciones, PortalLiquidaciones, PortalCertificados,
} from '@/pages/portal/paginas.jsx';

// IA Agente + Lead management
import Inbox from '@/pages/inbox/Inbox.jsx';
import ContactoDetalle from '@/pages/crm/ContactoDetalle.jsx';
import AnalyticsLeads from '@/pages/analytics/AnalyticsLeads.jsx';
import ConfigAgenteIA from '@/pages/agente/ConfigAgente.jsx';
import Agentes from '@/pages/agente/Agentes.jsx';
import Conocimiento from '@/pages/agente/Conocimiento.jsx';

function AdminOnly({ children }) {
  const { isAdmin, isLoading } = useUserRole();
  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />

        {/* Bandeja IA */}
        {/* Una sola bandeja: para el cliente es UN asistente, y el especialista
            que atiende es un detalle interno que se muestra como etiqueta. La
            ruta por agente se conserva redirigiendo, por enlaces guardados. */}
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/inbox/:agente" element={<Navigate to="/inbox" replace />} />

        {/* CRM */}
        <Route path="/crm" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="/crm/pipeline" element={<Pipeline />} />
        <Route path="/crm/propiedades" element={<Propiedades />} />
        <Route path="/crm/contactos" element={<Contactos />} />
        <Route path="/crm/contactos/:id" element={<ContactoDetalle />} />
        <Route path="/crm/propietarios" element={<Propietarios />} />
        <Route path="/crm/visitas" element={<Visitas />} />
        <Route path="/crm/tareas" element={<TareasCRM />} />

        {/* Operación */}
        <Route path="/operacion/consignaciones" element={<Consignaciones />} />
        <Route path="/operacion/reparaciones" element={<Reparaciones />} />
        <Route path="/operacion/avaluos" element={<Avaluos />} />
        <Route path="/operacion/pqr" element={<PQR />} />
        <Route path="/operacion/matriculas" element={<Matriculas />} />
        <Route path="/operacion/asistidos" element={<Asistidos />} />

        {/* Cartera */}
        <Route path="/cartera/recaudo" element={<Recaudo />} />
        <Route path="/cartera/envios" element={<Envios />} />
        <Route path="/cartera/codigos" element={<CodigosMensuales />} />
        {/* Alias: la pantalla es la misma. Se conserva por si alguien la tenia guardada. */}
        <Route path="/cartera/codigos/ensayo" element={<CodigosMensuales />} />
        <Route path="/cartera/liquidaciones" element={<AdminOnly><Liquidaciones /></AdminOnly>} />

        {/* Contratos */}
        <Route path="/contratos/arriendos" element={<ContratosArriendo />} />
        <Route path="/contratos/ventas" element={<ContratosVenta />} />

        {/* Finanzas - Admin only.
            Flujo de caja, comisiones y proyecciones modelaban el P&L del SaaS de
            valvulas anterior (costo por valvula, reparto a socios) y no significan
            nada para una inmobiliaria. Se retiran; el modulo financiero real se
            construye sobre PagoCanon / LiquidacionPropietario en Fase 5.
            Las rutas viejas redirigen a Gastos para no dejar enlaces rotos. */}
        <Route path="/finanzas" element={<AdminOnly><Navigate to="/finanzas/gastos" replace /></AdminOnly>} />
        <Route path="/finanzas/gastos" element={<AdminOnly><Gastos /></AdminOnly>} />
        <Route path="/finanzas/flujo-caja" element={<Navigate to="/finanzas/gastos" replace />} />
        <Route path="/finanzas/comisiones" element={<Navigate to="/finanzas/gastos" replace />} />
        <Route path="/finanzas/proyecciones" element={<Navigate to="/finanzas/gastos" replace />} />

        {/* Marketing */}
        <Route path="/marketing/seo" element={<SEOPage />} />
        <Route path="/marketing/agente-social" element={<AgenteSocial />} />
        <Route path="/marketing/campanas" element={<Campanas />} />

        {/* Integraciones */}
        <Route path="/integraciones/simi" element={<SincronizarSimi />} />

        {/* IA Agente */}
        <Route path="/agente/configuracion" element={<AdminOnly><ConfigAgenteIA /></AdminOnly>} />
        <Route path="/agente/agentes" element={<AdminOnly><Agentes /></AdminOnly>} />
        <Route path="/agente/conocimiento" element={<AdminOnly><Conocimiento /></AdminOnly>} />
        {/* El evaluador y los aprendizajes del bot monolitico quedaron fuera:
            operaban solo sobre ventas y escribian un campo que el runtime
            multiagente no consume. */}
        <Route path="/agente/autoeducacion" element={<Navigate to="/agente/agentes" replace />} />
        <Route path="/agente/config-evaluador" element={<Navigate to="/agente/agentes" replace />} />
        <Route path="/agente/aprendizajes" element={<Navigate to="/agente/conocimiento" replace />} />
        <Route path="/analytics/leads" element={<AnalyticsLeads />} />

        {/* Equipo - Admin only */}
        <Route path="/equipo/calendario" element={<AdminOnly><Calendario /></AdminOnly>} />
        <Route path="/equipo/metas" element={<AdminOnly><Metas /></AdminOnly>} />
        <Route path="/equipo/asesores" element={<AdminOnly><Asesores /></AdminOnly>} />

        {/* Sistema */}
        <Route path="/configuracion" element={<Configuracion />} />

        {/* Redirects de rutas antiguas */}
        <Route path="/crm/negocios" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="/comercio/inventario" element={<Navigate to="/crm/propiedades" replace />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

/**
 * Arbol de rutas del portal del cliente.
 *
 * Vive FUERA de AuthProvider a proposito. AuthProvider llama checkAppState() al
 * montar y, si no hay sesion de staff, redirige al login de Base44: un
 * arrendatario que abre su link de WhatsApp terminaria en la pantalla de acceso
 * de la inmobiliaria. El portal se autentica solo, con el token de un uso que
 * canjea portalAuth.
 */
function PortalApp() {
  return (
    <Routes>
      <Route path="entrar" element={<PortalEntrar />} />
      <Route element={<PortalLayout />}>
        <Route index element={<PortalInicio />} />
        <Route path="estado-cuenta" element={<PortalEstadoCuenta />} />
        <Route path="pagos" element={<PortalPagos />} />
        <Route path="contrato" element={<PortalContrato />} />
        <Route path="reparaciones" element={<PortalReparaciones />} />
        <Route path="liquidaciones" element={<PortalLiquidaciones />} />
        <Route path="certificados" element={<PortalCertificados />} />
      </Route>
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}

function App() {
  return (
    // Los tokens .dark ya existian en index.css pero nadie ponia la clase en <html>,
    // asi que el modo oscuro estaba muerto. next-themes la aplica y la persiste.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            {/* Clientes externos: sin AuthProvider (ver PortalApp) */}
            <Route path="/portal/*" element={<PortalApp />} />
            {/* Staff */}
            <Route
              path="/*"
              element={
                <AuthProvider>
                  <AuthenticatedApp />
                </AuthProvider>
              }
            />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
