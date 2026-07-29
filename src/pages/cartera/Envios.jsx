import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Barcode, FileText, Send, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  EncabezadoModulo, FiltrosEstado, EstadoBadge, FilaCard, Vacio, Cargando,
  Metrica, moneda, fecha, periodo,
} from '@/components/modulo';

const CodigoBarras = base44.entities.CodigoBarras;
const CertificadoPropietario = base44.entities.CertificadoPropietario;
const Arrendatario = base44.entities.Arrendatario;
const Propietario = base44.entities.Propietario;

const ESTADOS_ENVIO = ['Pendiente', 'Enviado', 'Fallido'];

/**
 * Envios masivos a clientes: codigos de barra (mensual, a arrendatarios) y
 * certificados (anual, a propietarios).
 *
 * Los dos son el mismo problema —un lote de documentos que hay que hacer llegar
 * y cuyo envio hay que poder auditar— asi que comparten pantalla en vez de
 * duplicar la tabla dos veces.
 *
 * El envio real lo hace el backend por WhatsApp con link al portal; aqui se
 * marca el estado y se ve que quedo sin salir. Nunca se manda el PDF por chat:
 * va el link, que caduca.
 */
function Lote({ items, cargando, nombrePor, campoSujeto, etiquetaVacio, icono, onMarcarEnviado, columnaExtra }) {
  const [filtro, setFiltro] = useState('todos');

  const visibles = items
    .filter((x) => filtro === 'todos' || (x.estado_envio || 'Pendiente') === filtro)
    .sort((a, b) => String(b.periodo || b.anio || '').localeCompare(String(a.periodo || a.anio || '')));

  const pendientes = items.filter((x) => (x.estado_envio || 'Pendiente') === 'Pendiente');
  const fallidos = items.filter((x) => x.estado_envio === 'Fallido');

  const enviarPendientes = async () => {
    if (!pendientes.length) return;
    try {
      await Promise.all(pendientes.map((x) => onMarcarEnviado(x.id)));
      toast.success(`${pendientes.length} marcados como enviados`);
    } catch { toast.error('No se pudo actualizar el lote'); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metrica etiqueta="Total" valor={items.length} />
        <Metrica etiqueta="Pendientes" valor={pendientes.length} tono={pendientes.length ? 'curso' : 'exito'} />
        <Metrica etiqueta="Fallidos" valor={fallidos.length} tono={fallidos.length ? 'peligro' : 'neutro'} />
      </div>

      <div className="flex gap-2 flex-wrap items-center justify-between">
        <FiltrosEstado valor={filtro} onChange={setFiltro} opciones={ESTADOS_ENVIO} />
        {pendientes.length > 0 && (
          <Button size="sm" className="presionable" onClick={enviarPendientes}>
            <Send className="w-3.5 h-3.5 mr-1.5" />Marcar {pendientes.length} como enviados
          </Button>
        )}
      </div>

      {cargando ? <Cargando /> : visibles.length === 0 ? (
        <Vacio mensaje={etiquetaVacio} icono={icono} />
      ) : (
        <div className="space-y-3">
          {visibles.map((x) => (
            <FilaCard key={x.id}>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm">{nombrePor.get(x[campoSujeto]) || 'Sin nombre'}</span>
                    <EstadoBadge valor={x.estado_envio || 'Pendiente'} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    {columnaExtra(x)}
                    {x.fecha_envio && <span>enviado {fecha(x.fecha_envio)}</span>}
                    {x.canal_envio && <span>{x.canal_envio}</span>}
                  </div>
                </div>
                {x.url_pdf && (
                  <a href={x.url_pdf} target="_blank" rel="noreferrer noopener"
                     className="text-xs text-primary hover:underline flex items-center gap-1 presionable">
                    <ExternalLink className="w-3 h-3" />PDF
                  </a>
                )}
                {(x.estado_envio || 'Pendiente') !== 'Enviado' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs presionable"
                          onClick={async () => { await onMarcarEnviado(x.id); toast.success('Marcado como enviado'); }}>
                    Marcar enviado
                  </Button>
                )}
              </div>
            </FilaCard>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Envios() {
  const qc = useQueryClient();

  const { data: codigos = [], isLoading: cargandoCodigos } = useQuery({ queryKey: ['codigos_barras'], queryFn: () => CodigoBarras.list() });
  const { data: certificados = [], isLoading: cargandoCerts } = useQuery({ queryKey: ['certificados'], queryFn: () => CertificadoPropietario.list() });
  const { data: arrendatarios = [] } = useQuery({ queryKey: ['arrendatarios'], queryFn: () => Arrendatario.list() });
  const { data: propietarios = [] } = useQuery({ queryKey: ['propietarios'], queryFn: () => Propietario.list() });

  const mapaArr = useMemo(() => new Map(arrendatarios.map((a) => [a.id, a.nombre])), [arrendatarios]);
  const mapaProp = useMemo(() => new Map(propietarios.map((p) => [p.id, p.nombre])), [propietarios]);

  const marcar = (entidad, clave) => async (id) => {
    await entidad.update(id, { estado_envio: 'Enviado', fecha_envio: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: [clave] });
  };

  const pendientesTotal =
    codigos.filter((c) => (c.estado_envio || 'Pendiente') === 'Pendiente').length +
    certificados.filter((c) => (c.estado_envio || 'Pendiente') === 'Pendiente').length;

  return (
    <div className="space-y-5">
      <EncabezadoModulo
        titulo="Envíos a clientes"
        resumen={`${pendientesTotal} documentos pendientes de enviar`}
      />

      <Tabs defaultValue="codigos">
        <TabsList>
          <TabsTrigger value="codigos" className="presionable">
            <Barcode className="w-4 h-4 mr-1.5" />Códigos de barras
          </TabsTrigger>
          <TabsTrigger value="certificados" className="presionable">
            <FileText className="w-4 h-4 mr-1.5" />Certificados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="codigos" className="mt-4">
          <Lote
            items={codigos}
            cargando={cargandoCodigos}
            nombrePor={mapaArr}
            campoSujeto="arrendatario_id"
            etiquetaVacio="No hay códigos de barras generados"
            icono={Barcode}
            onMarcarEnviado={marcar(CodigoBarras, 'codigos_barras')}
            columnaExtra={(x) => (
              <>
                <span>{periodo(x.periodo)}</span>
                {x.valor > 0 && <span className="tabular">{moneda(x.valor)}</span>}
                {x.codigo && <span className="tabular">{x.codigo}</span>}
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="certificados" className="mt-4">
          <Lote
            items={certificados}
            cargando={cargandoCerts}
            nombrePor={mapaProp}
            campoSujeto="propietario_id"
            etiquetaVacio="No hay certificados generados"
            icono={FileText}
            onMarcarEnviado={marcar(CertificadoPropietario, 'certificados')}
            columnaExtra={(x) => <span className="tabular">año {x.anio || '—'}</span>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
