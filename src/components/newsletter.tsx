import { useState } from "react";

export function Newsletter({ compact = false }: { compact?: boolean }) {
  const [done, setDone] = useState(false);
  if (done) return <p className="text-sm">Thanks — you're on the list for launch updates.</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); setDone(true); }} className="w-full">
      {!compact && <p className="mb-4 text-sm opacity-70">Be first to hear about new drops and launch updates.</p>}
      <div className="flex border-b border-current">
        <input required type="email" placeholder="Email address" aria-label="Email address"
          className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:opacity-60" />
        <button className="eyebrow px-2">Join</button>
      </div>
    </form>
  );
}
