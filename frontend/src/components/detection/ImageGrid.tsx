interface ImageGridProps {
  slots: number;
  images: (string | null)[];
  highlights?: number[];
  onSlotClick?: (index: number) => void;
}

export default function ImageGrid({ slots, images, highlights = [], onSlotClick }: ImageGridProps) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
    >
      {Array.from({ length: slots }).map((_, idx) => (
        <div
          key={idx}
          onClick={() => onSlotClick?.(idx)}
          className={`relative aspect-square rounded-xl border-2 overflow-hidden flex items-center justify-center transition-all cursor-pointer ${
            highlights.includes(idx)
              ? 'border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
              : 'border-dark-border hover:border-primary/50'
          }`}
        >
          {images[idx] ? (
            <img src={images[idx]} alt={`Slot ${idx + 1}`} className="w-full h-full object-cover" />
          ) : (
            <span className="text-dark-text/40 text-sm">Slot {idx + 1}</span>
          )}
          {highlights.includes(idx) && (
            <div className="absolute top-1 right-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded">
              Match
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
