import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { base44 } from '@/api/base44Client';
import { useUserRole } from '@/hooks/useUserRole';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera, MapPin, Check, Loader2, Navigation,
  ExternalLink, Edit2, Sparkles, AlertTriangle, Plus, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import CompanyLogo from '@/components/crm/CompanyLogo';
import { extractGPSFromPhoto } from '@/utils/exifGPS';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const PIN_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];
const ESTADO_COLORS = { activa: 'bg-green-100 text-green-700', mantenimiento: 'bg-amber-100 text-amber-700', inactiva: 'bg-red-100 text-red-700' };
const ESTADO_LABELS = { activa: 'Activa', mantenimiento: 'Mantenimiento', inactiva: 'Inactiva' };

function makePinIcon(dominio_web = '', label = '', colorIndex = 0) {
  const color = PIN_COLORS[colorIndex % PIN_COLORS.length];
  const abbr = (label || '?').slice(0, 2).toUpperCase();
  const fontSize = abbr.length === 1 ? 13 : 11;
  const logoUrl = dominio_web ? `https://logo.clearbit.com/${dominio_web}` : null;

  const html = `
<div style="position:relative;width:40px;height:50px">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50" width="40" height="50" style="position:absolute;top:0;left:0">
    <defs>
      <filter id="s${colorIndex}" x="-30%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#00000033"/>
      </filter>
    </defs>
    <path d="M20 2C11.163 2 4 9.163 4 18c0 10.5 16 28 16 28s16-17.5 16-28C36 9.163 28.837 2 20 2z"
      fill="${color}" filter="url(#s${colorIndex})"/>
    <circle cx="20" cy="17" r="10" fill="white"/>
  </svg>
  <div style="position:absolute;top:7px;left:10px;width:20px;height:20px;display:flex;align-items:center;justify-content:center">
    <span style="font-size:${fontSize}px;font-weight:700;color:${color};font-family:system-ui,sans-serif">${abbr}</span>
    ${logoUrl ? `<img src="${logoUrl}" style="position:absolute;inset:0;width:20px;height:20px;object-fit:contain;border-radius:50%;background:white" onerror="this.style.display='none'" />` : ''}
  </div>
</div>`;

  return L.divIcon({ html, className: '', iconSize: [40, 50], iconAnchor: [20, 50], popupAnchor: [0, -52] });
}

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [50, 50] });
    } else if (positions.length === 1) {
      map.setView(positions[0], 17);
    }
  }, [JSON.stringify(positions)]);
  return null;
}

async function extractCoordsViaAI(imageUrl) {
  try {
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `This is a photo taken with a GPS camera app. Look for GPS coordinates in any text overlay.
Extract ONLY the latitude and longitude numbers.
Reply with ONLY valid JSON: {"lat": 4.707157, "lng": -74.083163}
If no coordinates found: {"error": "not found"}`,
      model: 'claude_sonnet_4_6',
      image_url: imageUrl,
    });
    return parseAICoordResponse(response);
  } catch { return null; }
}

function parseAICoordResponse(text) {
  if (!text) return null;
  try {
    const obj = JSON.parse(text.trim());
    if (typeof obj.lat === 'number' && typeof obj.lng === 'number') return { lat: obj.lat, lng: obj.lng };
  } catch {}
  const jsonMatch = text.match(/\{[^}]+\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      if (typeof obj.lat === 'number' && typeof obj.lng === 'number') return { lat: obj.lat, lng: obj.lng };
    } catch {}
  }
  const gpsMapMatch = text.match(/Lat\s+(-?\d+\.\d+)[,\s]+Long\s+(-?\d+\.\d+)/i);
  if (gpsMapMatch) return { lat: parseFloat(gpsMapMatch[1]), lng: parseFloat(gpsMapMatch[2]) };
  const latMatch = text.match(/lat[itude]*[:\s]+(-?\d+\.?\d+)/i);
  const lngMatch = text.match(/l(?:ong?|ng?)[itude]*[:\s]+(-?\d+\.?\d+)/i);
  if (latMatch && lngMatch) return { lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]) };
  return null;
}

const defaultForm = { valvula_id: '', identificador: '', lat: '', lng: '', fecha_instalacion: '', estado: 'activa', notas: '' };

export default function UbicacionValvula({ cliente }) {
  const queryClient = useQueryClient();
  const { isAdmin, email: userEmail } = useUserRole();
  const fileRef = useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [editCoords, setEditCoords] = useState(false);

  const { data: instalaciones = [], refetch } = useQuery({
    queryKey: ['valvulas-instaladas', cliente?.id],
    queryFn: async () => {
      const all = await base44.entities.ValvulaInstalada.list();
      return all.filter(v => v.cliente_id === cliente?.id);
    },
    enabled: !!cliente?.id,
  });

  const { data: catalogoTodo = [] } = useQuery({
    queryKey: ['valvulas'],
    queryFn: () => base44.entities.Valvula.list(),
  });

  // Solo las válvulas asignadas que aún no tienen instalación registrada
  const asignadasIds = Object.keys(cliente?.valvulas_cantidades || {});
  const yaInstaladosIds = new Set(
    instalaciones.filter(i => !editingId || i.id !== editingId).map(i => i.valvula_id)
  );
  const catalogo = catalogoTodo.filter(v => asignadasIds.includes(v.id) && !yaInstaladosIds.has(v.id));

  const withCoords = instalaciones.filter(v => v.latitud && v.longitud);
  const mapPositions = withCoords.map(v => [v.latitud, v.longitud]);
  const mapCenter = mapPositions.length > 0 ? mapPositions[0] : [-4.0, -70.0];

  const hasCoords = form.lat && form.lng && !isNaN(parseFloat(form.lat)) && !isNaN(parseFloat(form.lng));

  const openAdd = () => {
    setForm(defaultForm);
    setEditingId(null);
    setStatus(null);
    setEditCoords(false);
    setShowForm(true);
  };

  const openEdit = (inst) => {
    setForm({
      valvula_id: inst.valvula_id || '',
      identificador: inst.identificador || '',
      lat: inst.latitud ? String(inst.latitud) : '',
      lng: inst.longitud ? String(inst.longitud) : '',
      fecha_instalacion: inst.fecha_instalacion || '',
      estado: inst.estado || 'activa',
      notas: inst.notas || '',
    });
    setEditingId(inst.id);
    setStatus(null);
    setEditCoords(false);
    setShowForm(true);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatus({ type: 'loading', text: 'Subiendo foto…' });
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setStatus({ type: 'loading', text: 'Buscando coordenadas GPS en la foto…' });
      const exifGPS = await extractGPSFromPhoto(file);
      if (exifGPS) {
        setForm(f => ({ ...f, lat: exifGPS.lat.toFixed(7), lng: exifGPS.lng.toFixed(7) }));
        setStatus({ type: 'ok', text: `GPS del EXIF: ${exifGPS.lat.toFixed(5)}, ${exifGPS.lng.toFixed(5)}` });
        setEditCoords(false);
      } else {
        setStatus({ type: 'loading', text: 'Analizando foto con IA…' });
        const aiGPS = await extractCoordsViaAI(file_url);
        if (aiGPS) {
          setForm(f => ({ ...f, lat: aiGPS.lat.toFixed(7), lng: aiGPS.lng.toFixed(7) }));
          setStatus({ type: 'ai', text: `Coordenadas leídas por IA: ${aiGPS.lat.toFixed(5)}, ${aiGPS.lng.toFixed(5)}` });
          setEditCoords(false);
        } else {
          setStatus({ type: 'warn', text: 'No se encontraron coordenadas. Ingrésalas manualmente.' });
          setEditCoords(true);
        }
      }
    } catch {
      setStatus({ type: 'err', text: 'Error al procesar la foto.' });
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!form.valvula_id) return;
    setSaving(true);
    const valvulaNombre = catalogo.find(v => v.id === form.valvula_id)?.nombre || '';
    const payload = {
      cliente_id: cliente.id,
      valvula_id: form.valvula_id,
      valvula_nombre: valvulaNombre,
      identificador: form.identificador || null,
      latitud: hasCoords ? parseFloat(form.lat) : null,
      longitud: hasCoords ? parseFloat(form.lng) : null,
      fecha_instalacion: form.fecha_instalacion || null,
      estado: form.estado,
      notas: form.notas || null,
    };
    if (editingId) {
      await base44.entities.ValvulaInstalada.update(editingId, payload);
    } else {
      await base44.entities.ValvulaInstalada.create(payload);
    }
    queryClient.invalidateQueries({ queryKey: ['valvulas-instaladas', cliente.id] });
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setStatus(null);
  };

  const handleDelete = async (id) => {
    await base44.entities.ValvulaInstalada.delete(id);
    queryClient.invalidateQueries({ queryKey: ['valvulas-instaladas', cliente.id] });
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {instalaciones.length === 0
            ? 'No hay válvulas registradas para esta empresa'
            : `${instalaciones.length} válvula${instalaciones.length !== 1 ? 's' : ''} instalada${instalaciones.length !== 1 ? 's' : ''}`}
        </p>
        <Button onClick={openAdd} size="sm" className="gap-1.5 rounded-lg h-8">
          <Plus className="w-3.5 h-3.5" /> Agregar válvula
        </Button>
      </div>

      {/* Map — shown when at least one installation has coordinates */}
      {mapPositions.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-border/40" style={{ height: 280 }}>
          <MapContainer
            center={mapCenter}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
            />
            <FitBounds positions={mapPositions} />
            {withCoords.map((inst, idx) => {
              const empresaAbbr = (cliente?.nombre_empresa || '?').slice(0, 2).toUpperCase();
              return (
                <Marker
                  key={inst.id}
                  position={[inst.latitud, inst.longitud]}
                  icon={makePinIcon(cliente?.dominio_web, empresaAbbr, idx)}
                >
                  <Popup>
                    <div style={{ minWidth: 140 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 2px' }}>
                        {cliente?.nombre_empresa}
                      </p>
                      <p style={{ fontSize: 11, color: '#555', margin: '0 0 2px' }}>
                        {inst.identificador || inst.valvula_nombre}
                      </p>
                      {inst.identificador && inst.valvula_nombre && (
                        <p style={{ fontSize: 11, color: '#888', margin: '0 0 2px' }}>{inst.valvula_nombre}</p>
                      )}
                      <p style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', margin: '2px 0 6px' }}>
                        {inst.latitud?.toFixed(6)}, {inst.longitud?.toFixed(6)}
                      </p>
                      <a
                        href={`https://www.google.com/maps?q=${inst.latitud},${inst.longitud}&z=18`}
                        target="_blank" rel="noreferrer"
                        style={{ display: 'block', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'white', backgroundColor: '#2563eb', borderRadius: 6, padding: '5px 8px', textDecoration: 'none' }}
                      >
                        Abrir en Google Maps
                      </a>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}

      {/* Installation cards */}
      {instalaciones.length > 0 && (
        <div className="space-y-2">
          {instalaciones.map((inst, idx) => (
            <div key={inst.id} className="bg-card border border-border/40 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <CompanyLogo cliente={cliente} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">
                      {inst.identificador || inst.valvula_nombre}
                    </p>
                    {inst.identificador && (
                      <span className="text-xs text-muted-foreground">{inst.valvula_nombre}</span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ESTADO_COLORS[inst.estado] || ESTADO_COLORS.activa}`}>
                      {ESTADO_LABELS[inst.estado] || inst.estado}
                    </span>
                  </div>
                  {inst.latitud && inst.longitud ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {inst.latitud.toFixed(6)}, {inst.longitud.toFixed(6)}
                      </span>
                      <a
                        href={`https://www.google.com/maps?q=${inst.latitud},${inst.longitud}&z=18`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-0.5 text-xs text-primary hover:underline ml-1"
                      >
                        <ExternalLink className="w-2.5 h-2.5" /> Maps
                      </a>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Sin ubicación registrada</p>
                  )}
                  {inst.fecha_instalacion && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Instalada: {new Date(inst.fecha_instalacion).toLocaleDateString('es-CO')}
                    </p>
                  )}
                  {inst.notas && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">{inst.notas}</p>
                  )}
                </div>
                {(isAdmin || inst.created_by === userEmail) && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(inst)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(inst.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {instalaciones.length === 0 && !showForm && (
        <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Cómo registrar la ubicación</p>
          <ol className="text-xs text-blue-600 dark:text-blue-300 space-y-1 list-decimal list-inside">
            <li>Haz clic en <strong>Agregar válvula</strong> y selecciona el tipo</li>
            <li>Sube una foto tomada con GPS Map Camera (Android) o GPS Cámara 55 (iOS)</li>
            <li>Las coordenadas se extraen automáticamente — confirma y guarda</li>
          </ol>
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-muted/30 border border-border/40 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {editingId ? 'Editar instalación' : 'Nueva instalación'}
            </h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); setStatus(null); }}
              className="p-1 hover:bg-muted rounded-lg transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Valve type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo de válvula *</label>
            <select
              value={form.valvula_id}
              onChange={e => setForm(f => ({ ...f, valvula_id: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Seleccionar válvula…</option>
              {catalogo.length === 0 && (
                <option disabled value="">— Sin válvulas asignadas a esta empresa —</option>
              )}
              {catalogo.map(v => {
                const cant = cliente?.valvulas_cantidades?.[v.id];
                return (
                  <option key={v.id} value={v.id}>
                    {v.nombre} — {v.pulgadas}" {cant > 1 ? `(×${cant})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Identifier */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Identificador</label>
            <input
              value={form.identificador}
              onChange={e => setForm(f => ({ ...f, identificador: e.target.value }))}
              placeholder="Válvula Norte, Unidad 1…"
              className="mt-1 w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <select
                value={form.estado}
                onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="activa">Activa</option>
                <option value="mantenimiento">Mantenimiento</option>
                <option value="inactiva">Inactiva</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notas</label>
              <input
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Opcional…"
                className="mt-1 w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Location section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Ubicación GPS</p>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {uploading ? 'Procesando…' : 'Foto con GPS'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

              {!editCoords && (
                <button
                  onClick={() => setEditCoords(true)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Ingresar manualmente
                </button>
              )}
            </div>

            {/* Status */}
            {status && status.type !== 'loading' && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                status.type === 'ok'   ? 'bg-green-50 dark:bg-green-950/30 text-green-700' :
                status.type === 'ai'   ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-700' :
                status.type === 'warn' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700' :
                                         'bg-red-50 dark:bg-red-950/30 text-red-700'
              }`}>
                {status.type === 'ok'   && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                {status.type === 'ai'   && <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />}
                {status.type === 'warn' && <Navigation className="w-3.5 h-3.5 flex-shrink-0" />}
                {status.type === 'err'  && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                {status.text}
              </div>
            )}
            {status?.type === 'loading' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {status.text}
              </div>
            )}

            {/* Manual coord fields */}
            {editCoords && (
              <div className="grid grid-cols-2 gap-3 bg-muted/40 rounded-lg p-3">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Latitud</label>
                  <input
                    type="number" step="any"
                    value={form.lat}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                    placeholder="4.707157"
                    className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Longitud</label>
                  <input
                    type="number" step="any"
                    value={form.lng}
                    onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                    placeholder="-74.083163"
                    className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {/* Mini map preview while filling form */}
            {hasCoords && (
              <div className="rounded-xl overflow-hidden border border-border/40" style={{ height: 180 }}>
                <MapContainer
                  key={`${form.lat}-${form.lng}`}
                  center={[parseFloat(form.lat), parseFloat(form.lng)]}
                  zoom={17}
                  style={{ height: '100%', width: '100%' }}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    attribution='&copy; OpenStreetMap &copy; CARTO'
                  />
                  <Marker position={[parseFloat(form.lat), parseFloat(form.lng)]}
                    icon={makePinIcon(cliente?.dominio_web, (cliente?.nombre_empresa || '?').slice(0, 2).toUpperCase(), instalaciones.length)}>
                    <Popup>Vista previa</Popup>
                  </Marker>
                </MapContainer>
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={saving || !form.valvula_id}
              size="sm"
              className="rounded-lg gap-1.5 flex-1"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Guardar instalación'}
            </Button>
            <Button
              onClick={() => { setShowForm(false); setEditingId(null); setStatus(null); }}
              variant="outline" size="sm" className="rounded-lg"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
