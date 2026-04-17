import { useRef } from 'react';

interface Props {
  onCapture: (file: File) => void;
}

export default function CameraCapture({ onCapture }: Props) {
  const ref = useRef<HTMLInputElement | null>(null);

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <p className="muted" style={{ marginTop: 0 }}>
        Fit the whole card in frame, flat and straight.
        The bottom-left corner should be readable.
      </p>
      <button
        className="primary"
        style={{ width: '100%', padding: '20px' }}
        onClick={() => ref.current?.click()}
      >
        Scan a Card
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCapture(f);
          // reset so the same file can be selected again
          e.target.value = '';
        }}
      />
    </div>
  );
}
