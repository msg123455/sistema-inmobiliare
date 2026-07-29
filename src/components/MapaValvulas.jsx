import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { MapPin, ExternalLink, Layers, Navigation2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import CompanyLogo from '@/components/crm/CompanyLogo';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STAGE_CONFIG = {
  Activo:             { color: '#10b981', label: 'Activo',                   bg: '#d1fae5' },
  Instalacion:        { color: '#3b82f6', label: 'Pendiente Instalación',    bg: '#dbeafe' },
  Evaluacion_tecnica: { color: '#f59e0b', label: 'Hacer Evaluación Técnica', bg: '#fef3c7' },
  Lead:               { color: '#8b5cf6', label: 'Lead',                     bg: '#ede9fe' },
  Prospecto:          { color: '#94a3b8', label: 'Prospecto',                bg: '#f1f5f9' },
};

const TILE_LAYERS = {
  mapa: {
    label: 'Mapa',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  satelite: {
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
};

const iconCache = {};
function makeMarker(color, label) {
  const key = `${color}::${label}`;
  if (iconCache[key]) return iconCache[key];
  const abbr = (label || '?').slice(0, 2).toUpperCase();
  const fontSize = abbr.length === 1 ? 13 : 11;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50" width="40" height="50">
  <defs>
    <filter id="sh${label}" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#00000033"/>
    </filter>
  </defs>
  <path d="M20 2C11.163 2 4 9.163 4 18c0 10.5 16 28 16 28s16-17.5 16-28C36 9.163 28.837 2 20 2z"
    fill="${color}" filter="url(#sh${label})"/>
  <circle cx="20" cy="17" r="10" fill="white"/>
  <text x="20" y="${17 + fontSize * 0.38}" text-anchor="middle"
    font-size="${fontSize}" font-weight="700" fill="${color}"
    font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${abbr}</text>
</svg>`;
  const icon = L.divIcon({ html: svg, className: '', iconSize: [40, 50], iconAnchor: [20, 50], popupAnchor: [0, -52] });
  iconCache[key] = icon;
  return icon;
}

function FitBounds({ positions }) {
  const map = useMap();
  useMemo(() => {
    if (positions.length < 2) return;
    map.fitBounds(L.latLngBounds(positions), { padding: [48, 48] });
  }, []);
  return null;
}

export default function MapaValvulas({ clientes = [], instalaciones = [], height = 440, clienteSeleccionadoId = null, onSelectCliente }) {
  const [tileKey, setTileKey] = useState('mapa');

  const clienteMap = useMemo(
    () => Object.fromEntries(clientes.map(c => [c.id, c])),
    [clientes]
  );

  // Use ValvulaInstalada records with coordinates
  const puntos = useMemo(
    () => instalaciones.filter(v => v.latitud && v.longitud),
    [instalaciones]
  );

  const positions = puntos.map(v => [v.latitud, v.longitud]);

  const center = useMemo(() => {
    if (!puntos.length) return [4.711, -74.0721];
    const lat = puntos.reduce((s, v) => s + v.latitud, 0) / puntos.length;
    const lng = puntos.reduce((s, v) => s + v.longitud, 0) / puntos.length;
    return [lat, lng];
  }, [puntos]);

  const tile = TILE_LAYERS[tileKey];

  // Group by client for the list
  const byCliente = useMemo(() => {
    const groups = {};
    puntos.forEach(v => {
      if (!groups[v.cliente_id]) groups[v.cliente_id] = [];
      groups[v.cliente_id].push(v);
    });
    return groups;
  }, [puntos]);

  if (puntos.length === 0) {
    return (
      <div className="bg-card rounded-2xl overflow-hidden border border-border/60">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Mapa de válvulas</h2>
        </div>
        <div className="flex flex-col items-center gap-3 py-14 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
            <Navigation2 className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-foreground">Sin ubicaciones GPS todavía</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Ve al perfil de cualquier cliente → pestaña <strong>Ubicación</strong> → agrega una válvula con foto GPS
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border/60 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
            <MapPin className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground leading-none">Mapa de válvulas</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {puntos.length} válvula{puntos.length !== 1 ? 's' : ''} en {Object.keys(byCliente).length} empresa{Object.keys(byCliente).length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
          {Object.entries(TILE_LAYERS).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setTileKey(key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tileKey === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{ height }} className="relative">
        <MapContainer
          center={center}
          zoom={puntos.length <= 1 ? 16 : 12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer key={tileKey} url={tile.url} attribution={tile.attribution} />
          {puntos.length > 1 && <FitBounds positions={positions} />}

          {puntos.map(v => {
            const cliente = clienteMap[v.cliente_id];
            const cfg = STAGE_CONFIG[cliente?.etapa_pipeline] || { color: '#6b7280' };
            const empresaAbbr = (cliente?.nombre_empresa || '?').slice(0, 2).toUpperCase();
            const valveLabel = v.identificador || v.valvula_nombre || 'V';
            return (
              <Marker key={v.id} position={[v.latitud, v.longitud]} icon={makeMarker(cfg.color, empresaAbbr)}>
                <Popup>
                  <div style={{ minWidth: 180, fontFamily: '-apple-system,sans-serif' }}>
                    {cliente && (
                      <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 2px' }}>{cliente.nombre_empresa}</p>
                    )}
                    <p style={{ fontSize: 11, color: '#555', margin: '0 0 2px' }}>{valveLabel}</p>
                    {v.identificador && v.valvula_nombre && (
                      <p style={{ fontSize: 11, color: '#888', margin: '0 0 6px' }}>{v.valvula_nombre}</p>
                    )}
                    <p style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', margin: '0 0 8px' }}>
                      {v.latitud.toFixed(6)}, {v.longitud.toFixed(6)}
                    </p>
                    <a href={`https://www.google.com/maps?q=${v.latitud},${v.longitud}&z=18`}
                      target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'white', backgroundColor: '#2563eb', borderRadius: 8, padding: '6px 10px', textDecoration: 'none' }}>
                      Abrir en Google Maps
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* List grouped by client */}
      <div className="border-t border-border/40 divide-y divide-border/10 max-h-52 overflow-y-auto bg-card">
        {Object.entries(byCliente).map(([clienteId, valvulas]) => {
          const cliente = clienteMap[clienteId];
          const cfg = STAGE_CONFIG[cliente?.etapa_pipeline] || { color: '#6b7280', label: cliente?.etapa_pipeline || '', bg: '#f3f4f6' };
          const seleccionado = clienteSeleccionadoId === clienteId;
          return (
            <div key={clienteId} className={`px-4 py-2.5 cursor-pointer transition-colors ${seleccionado ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
              onClick={() => onSelectCliente?.(seleccionado ? null : clienteId)}>
              {/* Company row */}
              <div className="flex items-center gap-2.5 mb-1.5">
                <CompanyLogo cliente={cliente} size="sm" />
                <span className="text-sm font-semibold text-foreground flex-1 truncate">
                  {cliente?.nombre_empresa || 'Empresa desconocida'}
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                  {cfg.label}
                </span>
              </div>
              {/* Valve rows */}
              {valvulas.map(v => (
                <div key={v.id} className="flex items-center gap-2 pl-9 py-0.5">
                  <MapPin className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">
                    {v.identificador || v.valvula_nombre}
                    {v.identificador && v.valvula_nombre && (
                      <span className="text-muted-foreground"> — {v.valvula_nombre}</span>
                    )}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">
                    {v.latitud.toFixed(4)}, {v.longitud.toFixed(4)}
                  </span>
                  <a href={`https://www.google.com/maps?q=${v.latitud},${v.longitud}&z=18`}
                    target="_blank" rel="noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
