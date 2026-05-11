import { useState } from 'react';

export function RawJSON({ json }: { json: string }) {
  const [show, setShow] = useState(false);
  return (
    <section>
      <button
        onClick={() => setShow((v) => !v)}
        className="h-7 rounded-md border border-(--color-border) bg-white/5 px-3 text-xs hover:bg-white/10"
      >
        {show ? 'Hide' : 'Show'} raw JSON ({json.length.toLocaleString()} bytes)
      </button>
      {show && (
        <pre className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-(--color-border) bg-black/35 p-4 font-mono text-xs leading-relaxed whitespace-pre">
          {json}
        </pre>
      )}
    </section>
  );
}
