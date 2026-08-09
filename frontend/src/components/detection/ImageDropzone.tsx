import { useCallback, useRef, useState } from 'react';

interface ImageDropzoneProps {
  onImageSelect: (file: File) => void;
  accepting?: string;
}

export default function ImageDropzone({ onImageSelect, accepting = 'image/*' }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onImageSelect(file);
    },
    [onImageSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onImageSelect(file);
    },
    [onImageSelect]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
        dragOver
          ? 'border-primary bg-primary/5'
          : 'border-dark-border hover:border-primary/50 hover:bg-dark-surface'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accepting}
        onChange={handleChange}
        className="hidden"
      />
      <div className="text-4xl mb-3">📤</div>
      <p className="text-sm text-dark-text">
        {dragOver ? 'Drop image here' : 'Drag & drop an image, or click to browse'}
      </p>
      <p className="text-xs text-dark-text/60 mt-1">JPG, PNG, BMP, TIFF</p>
    </div>
  );
}
