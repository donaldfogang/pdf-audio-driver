"use client";
import { useRef, useState } from "react";
import { SpinnerIcon, UploadIcon } from "./icons";

export default function Dropzone({ onFile, onReject, busy }: { onFile: (f: File) => void; onReject: () => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (f?: File) => {
    if (!f || busy) return;
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) onFile(f);
    else onReject();
  };

  return (
    <div
      role="button" tabIndex={0} aria-busy={busy}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      className={`flex min-h-72 cursor-pointer flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        over ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-accent/60"
      }`}
    >
      <div className="grid size-16 place-items-center rounded-full bg-accent/10 text-accent">
        {busy ? <SpinnerIcon className="size-7" /> : <UploadIcon className="size-7" />}
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold">{busy ? "Analyse du PDF…" : "Déposez votre PDF"}</p>
        <p className="text-muted">{busy ? "Extraction du texte et comptage des pages" : "ou touchez pour le choisir · 25 Mo maximum"}</p>
      </div>
      <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
