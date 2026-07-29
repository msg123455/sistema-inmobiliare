import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44, NodoSitemap, ContenidoSEO, ConfigSEO } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Zap, Globe, Search, Sparkles, Clock, CheckCircle2, Lightbulb, Bot,
  ExternalLink, Loader2, Linkedin, Mail, Video, Copy, X, ChevronRight,
  Settings, BarChart3, AlertTriangle, XCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── constantes ──────────────────────────────────────────────────────────────

// Llama al motor SEO y normaliza la respuesta (invoke a veces envuelve en .data)
const seo = async (payload) => {
  const res = await base44.functions.invoke('seoEngine', payload);
  const data = res?.data ?? res;
  if (data?.error) throw new Error(data.error);
  return data;
};

const TABS = [
  { id: 'sitemap',   label: '1 · Sitemap' },
  { id: 'research',  label: '2 · Research' },
  { id: 'generar',   label: '3 · Generar' },
  { id: 'aprobar',   label: '4 · Aprobar' },
  { id: 'aeo',       label: '5 · AEO' },
  { id: 'exportar',  label: '6 · Exportar' },
];

const TYPE_BADGE = {
  pillar:    { label: 'PILLAR',    cls: 'bg-purple-500 text-white' },
  secondary: { label: 'SECONDARY', cls: 'bg-blue-500 text-white' },
  third:     { label: 'THIRD',     cls: 'bg-cyan-500 text-white' },
  blog:      { label: 'BLOG',      cls: 'bg-green-500 text-white' },
};

const STATUS_BADGE = {
  draft:            { label: 'DRAFT',      cls: 'bg-gray-200 text-gray-600' },
  researched:       { label: 'RESEARCHED', cls: 'bg-amber-100 text-amber-700' },
  pending_approval: { label: 'PENDIENTE',  cls: 'bg-orange-100 text-orange-700' },
  published:        { label: 'PUBLISHED',  cls: 'bg-green-100 text-green-700' },
  generating:       { label: 'GENERATING', cls: 'bg-orange-400 text-white' },
};

const DEMO_URLS = `/seguro-de-arrendamiento/
/seguro-de-arrendamiento/coberturas/
/seguro-de-arrendamiento/coberturas/canon-arrendamiento/
/seguro-de-arrendamiento/coberturas/cuotas-administracion/
/seguro-de-arrendamiento/coberturas/servicios-publicos-danos/
/seguro-de-arrendamiento/precio/
/seguro-de-arrendamiento/precio/calculo-costo/
/seguro-de-arrendamiento/precio/por-tipo-inmueble/
/seguro-de-arrendamiento/quien-paga/
/seguro-de-arrendamiento/quien-paga/arrendatario/
/seguro-de-arrendamiento/quien-paga/propietario/
/seguro-de-arrendamiento/vs-codeudor/
/seguro-de-arrendamiento/bogota/`;

// ─── componentes atómicos ─────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const cfg = TYPE_BADGE[type] || TYPE_BADGE.blog;
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.cls} flex-shrink-0`}>{cfg.label}</span>;
}

function StatusDot({ status }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${cfg.cls} flex-shrink-0`}>{cfg.label}</span>;
}

function Terminal({ logs, busy, minH = 'min-h-36' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs, busy]);
  return (
    <div ref={ref} className={`bg-gray-950 rounded-xl p-4 font-mono text-xs overflow-y-auto ${minH} max-h-64`}>
      {logs.length === 0 && !busy && <span className="text-gray-600">&gt; listo.</span>}
      {logs.map((l, i) => (
        <div key={i} className={l.err ? 'text-red-400' : l.done ? 'text-emerald-300 font-semibold' : 'text-emerald-500'}>
          &gt; {l.text}
        </div>
      ))}
      {busy && <div className="text-amber-400 animate-pulse">&gt; procesando<span className="inline-block animate-bounce">...</span></div>}
    </div>
  );
}

function NodeList({ nodes, selected, onSelect, generatingId }) {
  return (
    <div className="overflow-y-auto flex-1">
      {nodes.map(n => (
        <div
          key={n.id}
          className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${selected?.id === n.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
          onClick={() => onSelect(n)}
        >
          <div className="flex-1 min-w-0" style={{ paddingLeft: `${n.page_type === 'pillar' ? 0 : n.page_type === 'secondary' ? 12 : 24}px` }}>
            <div className="text-xs font-mono text-gray-700 truncate">{n.url}</div>
            {n.keyword && <div className="text-[10px] text-muted-foreground truncate">{n.keyword}</div>}
          </div>
          <TypeBadge type={n.page_type} />
          <StatusDot status={generatingId === n.id ? 'generating' : n.estado} />
        </div>
      ))}
      {nodes.length === 0 && (
        <div className="py-8 text-center text-xs text-muted-foreground">Sin nodos</div>
      )}
    </div>
  );
}

function SerpPreview({ title, meta, slug, webUrl }) {
  const titleLen = (title || '').length;
  const metaLen  = (meta || '').length;
  const titleOk  = titleLen >= 30 && titleLen <= 60;
  const metaOk   = metaLen  >= 70 && metaLen  <= 155;
  const domain   = (webUrl || 'www.miinmobiliaria.com').replace(/https?:\/\//, '').replace(/\/$/, '');
  return (
    <div className="border rounded-xl p-4 bg-white shadow-sm">
      <div className="text-xs text-gray-500 mb-0.5">{domain} › {slug || '...'}</div>
      <div className="text-blue-600 text-[18px] leading-snug hover:underline cursor-pointer">{title || '(sin título)'}</div>
      <div className="text-sm text-gray-600 mt-1 leading-relaxed">{meta || '(sin descripción)'}</div>
      <div className="flex gap-4 mt-2">
        <span className={`text-xs font-medium ${titleOk ? 'text-green-600' : 'text-red-500'}`}>
          Titulo {titleLen}/60
        </span>
        <span className={`text-xs font-medium ${metaOk ? 'text-green-600' : 'text-red-500'}`}>
          Meta {metaLen}/155
        </span>
      </div>
    </div>
  );
}

// ─── Tab 1: Sitemap ───────────────────────────────────────────────────────────

function TabSitemap({ nodos, onRefresh }) {
  const [urlsText, setUrlsText] = useState('');
  const [keyword, setKeyword] = useState('');
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [logs, setLogs] = useState([]);
  const addLog = (text, done = false, err = false) => setLogs(p => [...p, { text, done, err }]);

  const sorted = useMemo(() =>
    [...nodos].sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0) || (a.url || '').localeCompare(b.url || '')),
  [nodos]);

  const parsear = async () => {
    if (!urlsText.trim()) { toast.error('Pega al menos una URL'); return; }
    setParsing(true);
    setLogs([]);
    addLog('Enviando URLs a Claude para clasificar...');
    try {
      const data = await seo({ action: 'sitemap_generate', keyword: urlsText.trim().split('\n')[0].replace(/\//g, ' ').trim() });
      addLog(`${data.creados ?? 0} nodos creados`, true);
      onRefresh();
    } catch (e) { addLog('Error: ' + (e?.message || JSON.stringify(e)), false, true); }
    finally { setParsing(false); }
  };

  const generarCluster = async () => {
    if (!keyword.trim()) { toast.error('Escribe una keyword'); return; }
    setGenerating(true);
    setLogs([]);
    addLog('Generando arquitectura de contenido...');
    addLog('Claude diseñando pillar + secondary + third + blog...');
    try {
      const data = await seo({ action: 'sitemap_generate', keyword: keyword.trim() });
      addLog(`Cluster listo: ${data.creados ?? 0} nodos creados`, true);
      setKeyword('');
      onRefresh();
    } catch (e) { addLog('Error: ' + (e?.message || JSON.stringify(e)), false, true); }
    finally { setGenerating(false); }
  };

  return (
    <div className="flex h-full gap-0">
      {/* left */}
      <div className="w-80 border-r flex flex-col gap-4 p-4 overflow-y-auto flex-shrink-0">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Pegar URLs planas</p>
          <p className="text-[11px] text-muted-foreground mb-2">Una URL (path) por línea. Claude las clasifica en pillar/secondary/third/blog.</p>
          <Textarea
            value={urlsText}
            onChange={e => setUrlsText(e.target.value)}
            rows={9}
            className="font-mono text-xs"
            placeholder="/arrendamiento-bogota/&#10;/arrendamiento-bogota/apartamentos/&#10;/arrendamiento-bogota/casas/"
          />
          <div className="flex gap-2 mt-2">
            <Button className="flex-1" size="sm" onClick={parsear} disabled={parsing}>
              {parsing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
              Parsear estructura
            </Button>
            <Button variant="outline" size="sm" onClick={() => setUrlsText(DEMO_URLS)}>
              Demo "seguros"
            </Button>
          </div>
        </div>
        <div className="border-t pt-4">
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Generar arquitectura desde keyword</p>
          <Input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generarCluster()}
            placeholder="arrendamiento bogota..."
            className="text-xs mb-2"
          />
          <Button className="w-full" size="sm" onClick={generarCluster} disabled={generating}>
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-400" />}
            {generating ? 'Generando...' : 'Generar cluster (18-28 nodos)'}
          </Button>
        </div>
        {logs.length > 0 && <Terminal logs={logs} busy={parsing || generating} minH="min-h-20" />}
      </div>
      {/* right */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="text-sm font-semibold">Nodos clasificados</span>
          <span className="text-xs text-muted-foreground">· {nodos.length} nodos</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={onRefresh}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <NodeList nodes={sorted} selected={null} onSelect={() => {}} generatingId={null} />
      </div>
    </div>
  );
}

// ─── Tab 2: Research ──────────────────────────────────────────────────────────

function TabResearch({ nodos, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [freeKw, setFreeKw] = useState('');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);
  const addLog = (text, done = false, err = false) => setLogs(p => [...p, { text, done, err }]);

  const draft = useMemo(() =>
    [...nodos].filter(n => n.estado === 'draft' || n.estado === 'researched')
      .sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0)),
  [nodos]);

  const investigate = async () => {
    const kw = freeKw.trim() || selected?.keyword;
    if (!kw && !selected) { toast.error('Selecciona un nodo o escribe una keyword'); return; }
    setBusy(true);
    setLogs([]);
    addLog('Iniciando investigación con Claude...');
    addLog(`Keyword: "${kw || selected?.keyword}"`);
    addLog('Cruzando con el conocimiento real de ND (precios por zona, comisiones)...');
    try {
      if (selected) {
        const data = await seo({ action: 'research', nodo_id: selected.id });
        const r = data.research || {};
        addLog(`Investigación completa: ${(r.datos_clave || []).length} datos, ${(r.preguntas_frecuentes || []).length} preguntas`, true);
        if (r.angulo) addLog(`Ángulo: ${r.angulo}`);
        onRefresh();
      } else {
        addLog('Para keyword libre, primero agrégala al sitemap', false, true);
      }
    } catch (e) { addLog('Error: ' + (e?.message || JSON.stringify(e)), false, true); }
    finally { setBusy(false); }
  };

  let researchData = null;
  if (selected?.research_data) {
    try { researchData = JSON.parse(selected.research_data); } catch {}
  }

  return (
    <div className="flex h-full gap-0">
      {/* left */}
      <div className="w-80 border-r flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 pt-4 pb-2 border-b flex-shrink-0">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Selecciona un nodo</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">…o keyword manual</p>
          <Input
            value={freeKw}
            onChange={e => setFreeKw(e.target.value)}
            placeholder="keyword libre para investigar"
            className="text-xs"
          />
        </div>
        <NodeList nodes={draft} selected={selected} onSelect={setSelected} generatingId={busy ? selected?.id : null} />
      </div>
      {/* right */}
      <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Claude · Research</p>
            <p className="text-xs text-muted-foreground">Hechos clave, estadísticas, PAA, gaps de contenido</p>
          </div>
          <Button
            className="bg-violet-700 hover:bg-violet-800 text-white"
            onClick={investigate}
            disabled={busy || (!selected && !freeKw.trim())}
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
            Investigar con Claude
          </Button>
        </div>
        <Terminal logs={logs} busy={busy} />
        {researchData && !busy && (
          <div className="space-y-3 text-xs">
            {researchData.summary && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-semibold text-[11px] text-muted-foreground mb-1">RESUMEN</p>
                <p className="leading-relaxed">{researchData.summary}</p>
              </div>
            )}
            {researchData.key_facts?.length > 0 && (
              <div>
                <p className="font-semibold text-[11px] text-muted-foreground mb-1">HECHOS CLAVE</p>
                <ul className="space-y-1">{researchData.key_facts.map((f, i) => <li key={i} className="flex gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />{f}</li>)}</ul>
              </div>
            )}
            {researchData.paa_questions?.length > 0 && (
              <div>
                <p className="font-semibold text-[11px] text-muted-foreground mb-1">PREGUNTAS PAA</p>
                <ul className="space-y-1">{researchData.paa_questions.map((q, i) => <li key={i} className="flex gap-1.5"><span className="text-blue-400">?</span>{q}</li>)}</ul>
              </div>
            )}
            {researchData.content_gaps?.length > 0 && (
              <div>
                <p className="font-semibold text-[11px] text-muted-foreground mb-1">GAPS DE CONTENIDO</p>
                <ul className="space-y-1">{researchData.content_gaps.map((g, i) => <li key={i} className="flex gap-1.5"><span className="text-amber-500">→</span>{g}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 3: Generar ───────────────────────────────────────────────────────────

const PAGE_TYPE_OPTIONS = [
  { value: 'pillar',    label: 'PILLAR — 2500+ palabras, 6-8 H2' },
  { value: 'secondary', label: 'SECONDARY — 1500-2000 palabras, 4-6 H2' },
  { value: 'third',     label: 'THIRD — 800-1200 palabras, 4 H2 exactos' },
  { value: 'blog',      label: 'BLOG — 900-1200 palabras, 4-5 H2' },
];

function TabGenerar({ nodos, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [pageType, setPageType] = useState('');
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 });
  const [logs, setLogs] = useState([]);
  const addLog = (text, done = false, err = false) => setLogs(p => [...p, { text, done, err }]);

  const researched = useMemo(() =>
    [...nodos].filter(n => n.estado === 'researched')
      .sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0)),
  [nodos]);

  useEffect(() => {
    if (selected) setPageType(selected.page_type || 'blog');
  }, [selected]);

  // El artículo se genera por partes: estructura primero y luego una sección por
  // llamada. Cada llamada del backend debe quedar bajo el límite de tiempo de Base44.
  const generarArticulo = async (nodo, log) => {
    log(`Diseñando estructura de "${nodo.keyword}"...`);
    const plan = await seo({ action: 'generate_outline', nodo_id: nodo.id });
    log(`Estructura lista: "${plan.title}" — ${plan.total_secciones} secciones`);

    for (let i = 0; i < plan.outline.length; i++) {
      log(`Escribiendo ${i + 1}/${plan.outline.length}: ${plan.outline[i].h2}`);
      await seo({
        action: 'generate_section',
        contenido_id: plan.contenido_id,
        index: i,
        outline: plan.outline,
      });
    }

    log('Generando preguntas frecuentes y schema...');
    const fin = await seo({ action: 'generate_finalize', contenido_id: plan.contenido_id });
    return { ...plan, palabras: fin.palabras, faqs: (fin.faq_items || []).length };
  };

  const generate = async () => {
    if (!selected) { toast.error('Selecciona un nodo'); return; }
    setBusy(true);
    setGeneratingId(selected.id);
    setLogs([]);
    setProgreso({ hecho: 0, total: 0 });
    try {
      const r = await generarArticulo(selected, (t) => {
        addLog(t);
        setProgreso(p => ({ ...p, hecho: p.hecho + 1 }));
      });
      addLog(`Contenido listo: "${r.title}"`, true);
      addLog(`${r.palabras} palabras — ${r.faqs} preguntas frecuentes`, true);
      onRefresh();
    } catch (e) { addLog('Error: ' + (e?.message || JSON.stringify(e)), false, true); }
    finally { setBusy(false); setGeneratingId(null); setProgreso({ hecho: 0, total: 0 }); }
  };

  const batchGenerate = async () => {
    if (researched.length === 0) { toast.error('No hay nodos investigados'); return; }
    setBatchBusy(true);
    setLogs([]);
    addLog(`Procesando ${researched.length} nodos en lote...`);
    let ok = 0;
    for (const n of researched) {
      setGeneratingId(n.id);
      try {
        const r = await generarArticulo(n, (t) => addLog(t));
        ok++;
        addLog(`Listo: ${n.url} (${r.palabras} palabras)`, true);
      } catch (e) { addLog(`Error en ${n.url}: ${e.message}`, false, true); }
    }
    setGeneratingId(null);
    addLog(`Lote completo: ${ok}/${researched.length} generados`, true);
    setBatchBusy(false);
    onRefresh();
  };

  return (
    <div className="flex h-full gap-0">
      {/* left */}
      <div className="w-80 border-r flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
          <p className="text-xs font-semibold text-muted-foreground">Nodos investigados ({researched.length})</p>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={batchGenerate} disabled={batchBusy || researched.length === 0}>
            {batchBusy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            Modo lote
          </Button>
        </div>
        <NodeList nodes={researched} selected={selected} onSelect={setSelected} generatingId={generatingId} />
      </div>
      {/* right */}
      <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
        <div>
          <p className="text-sm font-semibold mb-0.5">Claude · Generar contenido</p>
          <p className="text-xs text-muted-foreground">Artículo estructurado con prompts del mercado inmobiliario colombiano</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Tipo de página</p>
          <Select value={pageType} onValueChange={setPageType}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Selecciona tipo..." />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="bg-violet-700 hover:bg-violet-800 text-white w-fit"
          onClick={generate}
          disabled={busy || !selected}
        >
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          {busy ? 'Generando...' : 'Generar (Claude)'}
        </Button>
        <Terminal logs={logs} busy={busy} />
        {selected && (
          <div className="text-xs text-muted-foreground p-3 bg-muted/40 rounded-lg">
            <p className="font-semibold mb-1">Nodo seleccionado</p>
            <p><span className="font-mono">{selected.url}</span></p>
            <p>Keyword: {selected.keyword}</p>
            <p>Tipo: {selected.page_type} · Depth: {selected.depth}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 4: Aprobar ───────────────────────────────────────────────────────────

function ContentBody({ contenido, editable, onChange }) {
  let sections = [];
  let faqs = [];
  try { sections = JSON.parse(contenido.content_sections || '[]'); } catch {}
  try { faqs = JSON.parse(contenido.faq_items || '[]'); } catch {}

  return (
    <div className="text-sm space-y-2 pb-6">
      {editable && <p className="text-[11px] text-muted-foreground italic">Haz clic en cualquier texto para editarlo directamente</p>}
      {sections.map((s, i) => {
        if (s.type === 'heading2') return <h2 key={i} className="text-xl font-bold mt-5 mb-2">{s.content}</h2>;
        if (s.type === 'heading3') return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{s.content}</h3>;
        if (s.type === 'paragraph') return <p key={i} className="leading-7 text-gray-700">{s.content}</p>;
        if (s.type === 'list') return <ul key={i} className="list-disc ml-5 space-y-1">{(s.items||[]).map((item, j) => <li key={j}>{item}</li>)}</ul>;
        if (s.type === 'callout') return (
          <div key={i} className="p-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg my-3">
            <strong className="text-amber-800">{s.content}</strong>
          </div>
        );
        if (s.type === 'table') return (
          <div key={i} className="overflow-x-auto my-3">
            <table className="w-full text-xs border-collapse border">
              <thead className="bg-gray-100">
                <tr>{(s.headers||[]).map((h, j) => <th key={j} className="border p-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(s.rows||[]).map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k} className="border p-2">{cell}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        );
        return null;
      })}
      {faqs.length > 0 && (
        <>
          <h2 className="text-xl font-bold mt-5 mb-2">Preguntas frecuentes</h2>
          {faqs.map((f, i) => (
            <div key={i} className="p-3 border rounded-lg mb-2">
              <p className="font-semibold text-sm">{f.question}</p>
              <p className="text-gray-600 text-sm mt-1">{f.answer}</p>
            </div>
          ))}
        </>
      )}
      {contenido.cta_text && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center mt-4">
          <p className="text-sm font-medium text-blue-800">{contenido.cta_text}</p>
        </div>
      )}
    </div>
  );
}

function TabAprobar({ contenidos, configs, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  const [logs, setLogs] = useState([]);
  const addLog = (text, done = false, err = false) => setLogs(p => [...p, { text, done, err }]);

  const pending = contenidos.filter(c => c.estado === 'pendiente');
  const cfg = configs[0] || {};

  useEffect(() => {
    if (pending.length > 0 && !selected) setSelected(pending[0]);
  }, [pending.length]);

  // Aprobar deja el artículo listo para exportar al CMS (pestaña Exportar).
  const publish = async () => {
    if (!selected) return;
    setPublishingId(selected.id);
    setLogs([]);
    addLog('Aprobando contenido...');
    try {
      await ContenidoSEO.update(selected.id, { estado: 'aprobado' });
      addLog('Preparando HTML para exportar...');
      await seo({ action: 'export', contenido_id: selected.id });
      addLog('Aprobado. Disponible en la pestaña Exportar.', true);
      setSelected(null);
      onRefresh();
    } catch (e) { addLog('Error: ' + (e?.message || JSON.stringify(e)), false, true); }
    finally { setPublishingId(null); }
  };

  const reject = async () => {
    if (!selected) return;
    await ContenidoSEO.update(selected.id, { estado: 'rechazado' });
    setSelected(null);
    onRefresh();
  };

  return (
    <div className="flex h-full gap-0">
      {/* left */}
      <div className="w-80 border-r flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b flex-shrink-0">
          <p className="text-xs font-semibold text-muted-foreground">Pendientes de aprobación ({pending.length})</p>
        </div>
        <div className="overflow-y-auto flex-1">
          {pending.map(c => (
            <div
              key={c.id}
              className={`px-3 py-3 cursor-pointer border-b hover:bg-gray-50 transition-colors ${selected?.id === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
              onClick={() => { setSelected(c); setLogs([]); }}
            >
              <p className="text-sm font-medium leading-snug mb-1">{c.title || c.keyword_principal}</p>
              <div className="flex items-center gap-1.5">
                <TypeBadge type={c.page_type} />
                <span className="text-[10px] font-mono text-muted-foreground truncate">{c.nodo_url || c.slug}</span>
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">Sin pendientes</div>
          )}
        </div>
      </div>
      {/* right */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="px-5 py-3 border-b flex items-center gap-3 flex-shrink-0">
              <span className="text-sm font-semibold flex-1 truncate">Preview · {selected.title}</span>
              <Button variant="ghost" size="sm" className="text-red-500 h-7" onClick={reject}>
                <XCircle className="w-4 h-4 mr-1" />Rechazar
              </Button>
              <Button size="sm" className="h-7 bg-green-600 hover:bg-green-700 text-white" onClick={() => publish()} disabled={!!publishingId}>
                {publishingId === selected.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                Publicar en WP
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Vista previa en Google</p>
                <SerpPreview
                  title={selected.title}
                  meta={selected.meta_description}
                  slug={selected.slug}
                  webUrl={cfg.website_url}
                />
              </div>
              {logs.length > 0 && <Terminal logs={logs} busy={!!publishingId} minH="min-h-20" />}
              <div className="border-t pt-4">
                <ContentBody contenido={selected} editable />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {pending.length === 0 ? 'No hay contenido pendiente' : 'Selecciona un artículo para revisar'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 5: AEO ───────────────────────────────────────────────────────────────

function TabAEO({ contenidos, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);
  const addLog = (text, done = false, err = false) => setLogs(p => [...p, { text, done, err }]);

  const all = contenidos.filter(c => c.estado === 'pendiente' || c.estado === 'aprobado');

  const optimize = async () => {
    if (!selected) { toast.error('Selecciona un artículo'); return; }
    setBusy(true);
    setLogs([]);
    addLog(`Optimizando "${selected.keyword_principal}" para motores de respuesta...`);
    addLog('Generando respuesta directa, featured snippet y entidades...');
    try {
      const data = await seo({ action: 'aeo', contenido_id: selected.id });
      const a = data.aeo || {};
      addLog(`AEO listo: ${(a.entidades || []).length} entidades, ${(a.preguntas_seed || []).length} preguntas seed`, true);
      onRefresh();
      setSelected(prev => ({ ...prev, aeo_data: JSON.stringify(a) }));
    } catch (e) { addLog('Error: ' + (e?.message || JSON.stringify(e)), false, true); }
    finally { setBusy(false); }
  };

  let aeo = null;
  if (selected?.aeo_data) { try { aeo = JSON.parse(selected.aeo_data); } catch {} }

  return (
    <div className="flex h-full gap-0">
      {/* left */}
      <div className="w-80 border-r flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b flex-shrink-0">
          <p className="text-xs font-semibold text-muted-foreground">Contenido disponible</p>
        </div>
        <div className="overflow-y-auto flex-1">
          {all.map(c => {
            const hasAeo = !!c.aeo_data;
            return (
              <div
                key={c.id}
                className={`px-3 py-2.5 cursor-pointer border-b hover:bg-gray-50 ${selected?.id === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                onClick={() => { setSelected(c); setLogs([]); }}
              >
                <p className="text-xs font-medium leading-snug truncate">{c.title || c.keyword_principal}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasAeo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {hasAeo ? 'AEO listo' : 'sin AEO'}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.estado === 'aprobado' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                    {c.estado}
                  </span>
                </div>
              </div>
            );
          })}
          {all.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">Genera contenido primero</div>}
        </div>
      </div>
      {/* right */}
      <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">AEO · AI Overviews / ChatGPT / Perplexity</p>
            <p className="text-xs text-muted-foreground">Optimiza para ser citado en respuestas generadas por IA</p>
          </div>
          <Button
            className="bg-violet-700 hover:bg-violet-800 text-white"
            onClick={optimize}
            disabled={busy || !selected}
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Bot className="w-4 h-4 mr-1.5" />}
            Optimizar para IAs
          </Button>
        </div>
        <Terminal logs={logs} busy={busy} />
        {aeo && !busy && (
          <div className="space-y-4 text-xs">
            {aeo.direct_answer && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="font-semibold text-[11px] text-blue-700 mb-1">DIRECT ANSWER (para AI Overviews)</p>
                <p className="text-blue-900 leading-relaxed">{aeo.direct_answer}</p>
              </div>
            )}
            {aeo.featured_snippet && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-semibold text-[11px] text-green-700 mb-1">FEATURED SNIPPET (Position Zero)</p>
                <p className="text-green-900 leading-relaxed">{aeo.featured_snippet}</p>
              </div>
            )}
            {aeo.entity_graph?.length > 0 && (
              <div>
                <p className="font-semibold text-[11px] text-muted-foreground mb-1">ENTITY GRAPH</p>
                <div className="flex flex-wrap gap-1.5">
                  {aeo.entity_graph.map((e, i) => <span key={i} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-[10px]">{e}</span>)}
                </div>
              </div>
            )}
            {aeo.schema_faq?.length > 0 && (
              <div>
                <p className="font-semibold text-[11px] text-muted-foreground mb-2">SCHEMA FAQ</p>
                {aeo.schema_faq.map((f, i) => (
                  <div key={i} className="p-2.5 border rounded-lg mb-2">
                    <p className="font-medium">{f.question}</p>
                    <p className="text-muted-foreground mt-0.5">{f.answer}</p>
                  </div>
                ))}
              </div>
            )}
            {aeo.llm_seed_phrases?.length > 0 && (
              <div>
                <p className="font-semibold text-[11px] text-muted-foreground mb-1">LLM SEED PHRASES</p>
                <ul className="space-y-1">{aeo.llm_seed_phrases.map((s, i) => <li key={i} className="flex gap-1.5"><span className="text-violet-500">→</span>{s}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 6: Exportar ──────────────────────────────────────────────────────────

function TabExportar({ contenidos, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formato, setFormato] = useState('html');
  const [salida, setSalida] = useState('');

  const listos = contenidos.filter(c => c.estado === 'aprobado' || c.estado === 'pendiente');

  const exportar = async (c, fmt) => {
    setBusy(true);
    setSalida('');
    try {
      const data = await seo({ action: 'export', contenido_id: c.id });
      setSalida(fmt === 'html' ? data.html : data.markdown);
      setSelected({ ...c, _export: data });
      onRefresh();
    } catch (e) { toast.error('Error: ' + (e?.message || 'desconocido')); }
    finally { setBusy(false); }
  };

  const copiar = () => {
    if (!salida) return;
    navigator.clipboard.writeText(salida);
    toast.success('Copiado al portapapeles');
  };

  const descargar = () => {
    if (!salida || !selected) return;
    const ext = formato === 'html' ? 'html' : 'md';
    const blob = new Blob([salida], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (selected.slug || 'articulo') + '.' + ext;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cambiarFormato = async (fmt) => {
    setFormato(fmt);
    if (selected?._export) setSalida(fmt === 'html' ? selected._export.html : selected._export.markdown);
  };

  return (
    <div className="flex h-full gap-0">
      <div className="w-80 border-r flex flex-col p-4 overflow-y-auto flex-shrink-0">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Artículos listos ({listos.length})</p>
        {listos.length === 0 && (
          <p className="text-xs text-muted-foreground">Aún no hay artículos. Genera y aprueba contenido primero.</p>
        )}
        {listos.map(c => (
          <button
            key={c.id}
            onClick={() => exportar(c, formato)}
            className={`w-full text-left p-2.5 rounded-lg border mb-1.5 transition-colors ${selected?.id === c.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted'}`}
          >
            <p className="text-[13px] font-medium leading-tight">{c.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={c.estado === 'aprobado' ? 'bg-green-100 text-green-700 text-[10px]' : 'bg-orange-100 text-orange-700 text-[10px]'}>
                {c.estado}
              </Badge>
              {c.palabras ? <span className="text-[10px] text-muted-foreground">{c.palabras} palabras</span> : null}
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {!selected && (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm text-muted-foreground">Selecciona un artículo para exportarlo</p>
              <p className="text-xs text-muted-foreground mt-1">Copia el HTML o descarga el archivo para subirlo a tu CMS</p>
            </div>
          </div>
        )}

        {selected && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{selected.title}</p>
                <p className="text-xs text-muted-foreground truncate">/{selected.slug}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button size="sm" variant={formato === 'html' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => cambiarFormato('html')}>HTML</Button>
                <Button size="sm" variant={formato === 'markdown' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => cambiarFormato('markdown')}>Markdown</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={copiar}><Copy className="w-3 h-3" />Copiar</Button>
                <Button size="sm" className="h-7 text-xs" onClick={descargar}>Descargar</Button>
              </div>
            </div>

            <div className="mb-3 p-3 bg-muted/40 rounded-lg text-xs space-y-1">
              <p><span className="font-semibold">Meta description:</span> {selected.meta_description}</p>
              {selected._export?.schema_jsonld ? <p className="text-muted-foreground">Incluye schema JSON-LD listo para el head de la página.</p> : null}
            </div>

            <Textarea
              value={busy ? 'Generando exportación...' : salida}
              readOnly
              className="flex-1 font-mono text-[11px] resize-none"
            />
          </>
        )}
      </div>
    </div>
  );
}


export default function SEOPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('sitemap');

  const { data: nodos      = [] } = useQuery({ queryKey: ['nodos-sitemap'],  queryFn: () => NodoSitemap.list() });
  const { data: contenidos = [] } = useQuery({ queryKey: ['contenidos-seo'], queryFn: () => ContenidoSEO.list() });
  const { data: configs    = [] } = useQuery({ queryKey: ['config-seo'],     queryFn: () => ConfigSEO.list() });
  const { data: propiedades= [] } = useQuery({ queryKey: ['propiedades'],    queryFn: () => Propiedad.list() });

  const refresh = () => qc.invalidateQueries({ queryKey: ['nodos-sitemap'] })
    .then(() => qc.invalidateQueries({ queryKey: ['contenidos-seo'] }));

  const pending  = contenidos.filter(c => c.estado === 'pendiente').length;
  const draftCnt = nodos.filter(n => n.estado === 'draft').length + nodos.filter(n => n.estado === 'researched').length;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* tab bar */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b bg-slate-50 flex-shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors relative flex-shrink-0
              ${tab === t.id
                ? 'bg-white text-gray-900 shadow-sm border'
                : t.special
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
          >
            {t.label}
            {t.id === 'aprobar' && pending > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">{pending}</span>
            )}
            {t.id === 'generar' && draftCnt > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">{draftCnt}</span>
            )}
          </button>
        ))}
      </div>

      {/* content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'sitemap'    && <TabSitemap    nodos={nodos} onRefresh={refresh} />}
        {tab === 'research'   && <TabResearch   nodos={nodos} onRefresh={refresh} />}
        {tab === 'generar'    && <TabGenerar    nodos={nodos} onRefresh={refresh} />}
        {tab === 'aprobar'    && <TabAprobar    contenidos={contenidos} configs={configs} onRefresh={refresh} />}
        {tab === 'aeo'        && <TabAEO        contenidos={contenidos} onRefresh={refresh} />}
        {tab === 'exportar'   && <TabExportar   contenidos={contenidos} onRefresh={refresh} />}
      </div>
    </div>
  );
}