import { PlayIcon } from "./icons";

/** Illustration décorative : une page dont la phrase lue est surlignée, et un mini-lecteur. */
export default function HeroArt() {
  const lines = [88, 100, 72, 94, 60, 98, 80];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-sm select-none pb-8">
      <div className="-rotate-3 rounded-[2rem] border border-line bg-surface p-7 shadow-2xl shadow-black/10">
        <div className="mb-6 h-4 w-2/5 rounded-full bg-ink/80" />
        <div className="space-y-3.5">
          {lines.map((w, i) => (
            <div key={i} className={`h-3 rounded-full ${i === 2 || i === 3 ? "bg-accent/45" : "bg-raised"}`} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      <div className="absolute -bottom-0 -right-1 flex items-center gap-4 rounded-full bg-accent py-3 pl-3 pr-6 text-accent-ink shadow-xl">
        <span className="grid size-10 place-items-center rounded-full bg-white/20"><PlayIcon className="size-5" /></span>
        <span className="eq on-accent"><span /><span /><span /><span /></span>
        <span className="font-bold tabular-nums">1,25×</span>
      </div>
    </div>
  );
}
