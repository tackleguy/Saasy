import Link from "next/link";

/** Temporary landing — replaced by the full hero + portfolio in step 3. */
export default function Home() {
  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-center px-4 py-24 sm:px-6">
      <h1 className="max-w-3xl font-serif text-5xl leading-[1.05] text-ink sm:text-7xl">Visualise, underwrite and sell your next development.</h1>
      <p className="mt-6 max-w-xl text-ash">Live 3D, walk-through interiors and a developer-grade yield engine in one place.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/studio" className="btn-primary">Open Studio</Link>
      </div>
    </section>
  );
}
