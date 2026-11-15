// Shown while the challenge simulations run (first visit after a server start
// or a re-import; later visits come from memory).
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <p className="text-sm text-fog">Running the challenge simulations…</p>
      <div className="rounded-[10px] border border-rule bg-deck p-5">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="mb-3 h-5 animate-pulse rounded bg-deck-2 last:mb-0" style={{ width: `${92 - (i % 3) * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
