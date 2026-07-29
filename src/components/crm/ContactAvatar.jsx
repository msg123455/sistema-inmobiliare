import React, { useRef } from 'react';
import { User, Camera } from 'lucide-react';

export default function ContactAvatar({ url, nombre, onUpload, size = 'lg', editable = false }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onUpload?.(ev.target.result);
    reader.readAsDataURL(file);
  };

  const sizeClasses = size === 'lg' ? 'w-16 h-16 text-2xl' : size === 'md' ? 'w-10 h-10 text-base' : 'w-7 h-7 text-xs';
  const iconSize = size === 'lg' ? 'w-7 h-7' : size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5';

  const initials = nombre
    ? nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : null;

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeClasses} rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-background flex items-center justify-center font-semibold text-primary`}
        onClick={editable ? () => inputRef.current?.click() : undefined}
        style={editable ? { cursor: 'pointer' } : undefined}
      >
        {url ? (
          <img src={url} alt={nombre} className="w-full h-full object-cover" />
        ) : initials ? (
          <span>{initials}</span>
        ) : (
          <User className={iconSize} />
        )}
      </div>
      {editable && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Camera className="w-2.5 h-2.5 text-primary-foreground" />
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </>
      )}
    </div>
  );
}
