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
import WasiIntegracion from '@/pages/integraciones/WasiIntegracion.jsx';
import ImportarInventario from '@/pages/integraciones/ImportarInventario.jsx';

// IA Agente + Lead management
import Inbox from '@/pages/inbox/Inbox.jsx';
import ContactoDetalle from '@/pages/crm/ContactoDetalle.jsx';
import AnalyticsLeads from '@/pages/analytics/AnalyticsLeads.jsx';
import ConfigAgenteIA from '@/pages/agente/ConfigAgente.jsx';
import Autoeducacion from '@/pages/agente/Autoeducacion.jsx';
import ConfigEvaluadorPage from '@/pages/agente/ConfigEvaluador.jsx';
import Aprendizajes from '@/pages/agente/Aprendizajes.jsx';

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
        <Route path="/inbox" element={<Inbox />} />

        {/* CRM */}
        <Route path="/crm" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="/crm/pipeline" element={<Pipeline />} />
        <Route path="/crm/propiedades" element={<Propiedades />} />
        <Route path="/crm/contactos" element={<Contactos />} />
        <Route path="/crm/contactos/:id" element={<ContactoDetalle />} />
        <Route path="/crm/propietarios" element={<Propietarios />} />
        <Route path="/crm/visitas" element={<Visitas />} />
        <Route path="/crm/tareas" element={<TareasCRM />} />

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
        <Route path="/integraciones/wasi" element={<WasiIntegracion />} />
        <Route path="/integraciones/inventario" element={<ImportarInventario />} />

        {/* IA Agente */}
        <Route path="/agente/configuracion" element={<AdminOnly><ConfigAgenteIA /></AdminOnly>} />
        <Route path="/agente/autoeducacion" element={<AdminOnly><Autoeducacion /></AdminOnly>} />
        <Route path="/agente/config-evaluador" element={<AdminOnly><ConfigEvaluadorPage /></AdminOnly>} />
        <Route path="/agente/aprendizajes" element={<AdminOnly><Aprendizajes /></AdminOnly>} />
        <Route path="/analytics/leads" element={<AnalyticsLeads />} />

        {/* Equipo - Admin only */}
        <Route path="/equipo/calendario" element={<AdminOnly><Calendario /></AdminOnly>} />
        <Route path="/equipo/metas" element={<AdminOnly><Metas /></AdminOnly>} />

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

function App() {
  return (
    // Los tokens .dark ya existian en index.css pero nadie ponia la clase en <html>,
    // asi que el modo oscuro estaba muerto. next-themes la aplica y la persiste.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
