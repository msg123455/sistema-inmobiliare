import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award, Upload, FileText, File, Trash2, Download,
  Plus, X, ChevronLeft, ChevronRight, ZoomIn, ExternalLink, BookOpen, Wrench, ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/hooks/useUserRole';

const CERT_ID = '__CERTIFICACIONES__';

const CATEGORIAS = [
  { key: 'certificado',   label: 'Certificados',     icon: Award,       color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/30' },
  { key: 'ficha_tecnica', label: 'Fichas técnicas',  icon: FileText,    color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-950/30' },
  { key: 'manual',        label: 'Manuales',         icon: BookOpen,    color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  { key: 'normativa',     label: 'Normativa',        icon: ScrollText,  color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/30' },
  { key: 'otro',          label: 'Otros',            icon: Wrench,      color: 'text-slate-500',  bg: 'bg-slate-50 dark:bg-slate-900/30' },
];

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

function LightboxViewer({ docs, initialIndex, onClose }) {
  const [idx, setIdx] = useState(initialIndex);
  const [blobUrl, setBlobUrl] = useState(null);
  const thumbsRef = useRef(null);
  const doc = docs[idx];
  const isImage = doc?.tipo_mime?.startsWith('image/');
  const isPDF = doc?.tipo_mime === 'application/pdf';

  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx(i => Math.min(docs.length - 1, i + 1)), [docs.length]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    const el = thumbsRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [idx]);

  // Fetch current doc as blob — bypasses cross-origin restrictions for PDF preview and download
  useEffect(() => {
    if (!doc?.contenido) return;
    setBlobUrl(null);
    let objectUrl = null;
    fetch(doc.contenido)
      .then(r => r.blob())
      .then(blob => { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl); })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc?.id]);

  const handleDownload = () => {
    if (!doc) return;
    const a = document.createElement('a');
    a.href = blobUrl || doc.contenido;
    a.download = doc.nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const touchStart = useRef(null);
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? next() : prev();
    touchStart.current = null;
  };

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center justify-between px-5 py-3 bg-black/40 backdrop-blur-sm border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 text-white/40 text-sm tabular-nums">{idx + 1} / {docs.length}</div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{doc.nombre}</p>
            {doc.descripcion && <p className="text-xs text-white/50 truncate">{doc.descripcion}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
          <a href={doc.contenido} target="_blank" rel="noreferrer"
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Abrir en nueva pestaña">
            <ExternalLink className="w-4 h-4" />
          </a>
          <button onClick={handleDownload}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Descargar">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {idx > 0 && (
          <button onClick={prev} className="absolute left-3 z-10 p-2.5 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-sm transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {isImage ? (
          <img key={doc.id} src={doc.contenido} alt={doc.nombre} className="max-h-full max-w-full object-contain select-none" draggable={false} />
        ) : isPDF ? (
          blobUrl ? (
            <iframe key={blobUrl} src={blobUrl} title={doc.nombre} className="w-full h-full border-0" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/50">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <p className="text-sm">Cargando PDF…</p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <File className="w-20 h-20 text-white/20" />
            <p className="text-white font-medium text-lg">{doc.nombre}</p>
            <p className="text-white/50 text-sm">{doc.tipo_mime} · {formatBytes(doc.tamanio_bytes)}</p>
            <button onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors">
              <Download className="w-4 h-4" /> Descargar archivo
            </button>
          </div>
        )}
        {idx < docs.length - 1 && (
          <button onClick={next} className="absolute right-3 z-10 p-2.5 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-sm transition-colors">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {docs.length > 1 && (
        <div ref={thumbsRef} className="flex items-center gap-2 px-4 py-3 bg-black/40 backdrop-blur-sm border-t border-white/10 overflow-x-auto flex-shrink-0 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {docs.map((d, i) => {
            const isImg = d.tipo_mime?.startsWith('image/');
            const active = i === idx;
            return (
              <button key={d.id} data-active={active} onClick={() => setIdx(i)}
                className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${active ? 'border-white scale-110' : 'border-white/20 hover:border-white/60 opacity-60 hover:opacity-100'}`}>
                {isImg ? (
                  <img src={d.contenido} alt={d.nombre} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/10 flex items-center justify-center">
                    <File className="w-5 h-5 text-white/60" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DocCard ──────────────────────────────────────────────────────────────────

function DocCard({ doc, onOpen, onDelete }) {
  const isImage = doc.tipo_mime?.startsWith('image/');
  return (
    <div className="group relative bg-muted/40 rounded-xl overflow-hidden border border-border/40 hover:border-border transition-colors">
      <button onClick={onOpen} className="w-full h-32 flex items-center justify-center bg-muted/60 overflow-hidden focus:outline-none">
        {isImage ? (
          <img src={doc.contenido} alt={doc.nombre} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <File className="w-10 h-10" />
            <span className="text-xs font-medium uppercase">{doc.tipo_mime?.split('/')[1] || 'archivo'}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ZoomIn className="w-7 h-7 text-white drop-shadow" />
        </div>
      </button>
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
          className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      <div className="p-2.5">
        <p className="text-xs font-medium text-foreground truncate">{doc.nombre}</p>
        {doc.descripcion && <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.descripcion}</p>}
        <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(doc.tamanio_bytes)}</p>
      </div>
    </div>
  );
}

// ── UploadModal ──────────────────────────────────────────────────────────────

function UploadModal({ categoriaDefault, onClose, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [categoria, setCategoria] = useState(categoriaDefault);
  const [descripcion, setDescripcion] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const handleFiles = (e) => {
    setFiles(prev => [...prev, ...Array.from(e.target.files)]);
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Documento.create({
        cliente_id: CERT_ID,
        nombre: file.name,
        categoria,
        descripcion,
        tipo_mime: file.type,
        tamanio_bytes: file.size,
        contenido: file_url,
      });
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }
    setUploading(false);
    onUploaded();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border/40">
          <h3 className="font-semibold text-foreground">Subir archivos</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {CATEGORIAS.map(({ key, label, icon: Icon, color, bg }) => (
              <button key={key} onClick={() => setCategoria(key)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-colors ${categoria === key ? 'border-primary bg-primary/5' : 'border-border/40 hover:border-border'}`}>
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <span className="text-[10px] font-medium text-foreground text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>

          <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-border/60 rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-foreground font-medium">Arrastrá archivos o hacé click</p>
            <p className="text-xs text-muted-foreground mt-1">Imágenes, PDFs, documentos</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFiles} />
          </div>

          {files.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg">
                  <File className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-foreground flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  <button onClick={() => removeFile(i)} className="ml-1 text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción opcional..."
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />

          {uploading && (
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <Button onClick={handleUpload} disabled={!files.length || uploading} className="w-full rounded-xl">
            {uploading ? `Subiendo... ${progress}%` : `Subir ${files.length ? `${files.length} archivo${files.length > 1 ? 's' : ''}` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Certificaciones() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const [uploadModal, setUploadModal] = useState(null);
  const [categoriaActiva, setCategoriaActiva] = useState('certificado');
  const [lightboxIdx, setLightboxIdx] = useState(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['docs-certificaciones'],
    queryFn: () => base44.entities.Documento.filter({ cliente_id: CERT_ID }),
  });

  const handleDelete = async (docId) => {
    if (!confirm('¿Eliminar este archivo?')) return;
    await base44.entities.Documento.delete(docId);
    queryClient.invalidateQueries({ queryKey: ['docs-certificaciones'] });
  };

  const handleUploaded = () => {
    queryClient.invalidateQueries({ queryKey: ['docs-certificaciones'] });
  };

  const docsDeCategoria = docs.filter(d => d.categoria === categoriaActiva);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Certificaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">Documentos técnicos, certificados y normativa del producto</p>
      </div>

      <div className="bg-card rounded-xl p-5 space-y-4">
        {/* Category tabs + upload button */}
        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIAS.map(({ key, label, icon: Icon, color, bg }) => {
            const count = docs.filter(d => d.categoria === key).length;
            return (
              <button key={key} onClick={() => setCategoriaActiva(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  categoriaActiva === key
                    ? 'border-primary bg-primary/8 text-primary'
                    : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground'
                }`}>
                <div className={`w-5 h-5 rounded-md ${bg} flex items-center justify-center`}>
                  <Icon className={`w-3 h-3 ${color}`} />
                </div>
                {label}
                {count > 0 && (
                  <span className="ml-0.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{count}</span>
                )}
              </button>
            );
          })}
          <button onClick={() => setUploadModal(categoriaActiva)}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Subir
          </button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : docsDeCategoria.length === 0 ? (
          <div onClick={() => setUploadModal(categoriaActiva)}
            className="flex flex-col items-center justify-center h-48 rounded-2xl border-2 border-dashed border-border/40 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
            <Upload className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Sin archivos en esta categoría</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click para subir</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {docsDeCategoria.map((doc, i) => (
              <DocCard key={doc.id} doc={doc} onOpen={() => setLightboxIdx(i)} onDelete={isAdmin ? handleDelete : null} />
            ))}
            <button onClick={() => setUploadModal(categoriaActiva)}
              className="h-full min-h-[12rem] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer">
              <Plus className="w-6 h-6 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/60 mt-1">Agregar</span>
            </button>
          </div>
        )}
      </div>

      {lightboxIdx !== null && (
        <LightboxViewer docs={docsDeCategoria} initialIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}

      {uploadModal && (
        <UploadModal categoriaDefault={uploadModal} onClose={() => setUploadModal(null)} onUploaded={handleUploaded} />
      )}
    </div>
  );
}
