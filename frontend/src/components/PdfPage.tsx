"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { MinusIcon, PlusIcon, SpinnerIcon } from "./icons";

// pdf.js n'est chargé qu'à la première ouverture du lecteur (module lourd, uniquement côté navigateur).
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjsPromise;
}

const ZOOMS = [1, 1.5, 2, 3];

/** Affiche la page d'origine du PDF (lue localement dans le navigateur : rien n'est envoyé au serveur). */
export default function PdfPage({ file, page }: { file: File; page: number }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const task = useRef<RenderTask | null>(null);

  useEffect(() => {
    let alive = true;
    let loading: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const loaded = await loading.promise;
        if (alive) setDoc(loaded);
      } catch { if (alive) setError("Impossible d’afficher ce document."); }
    })();
    return () => { alive = false; loading?.destroy(); };  // libère le document et arrête le worker
  }, [file]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !width) return;
    let stale = false;
    (async () => {
      task.current?.cancel();
      try { await task.current?.promise; } catch {}
      if (stale) return;
      const p = await doc.getPage(page);
      const c = canvas.current;
      if (stale || !c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const scale = (width * ZOOMS[zoomIdx]) / p.getViewport({ scale: 1 }).width;
      const vp = p.getViewport({ scale: scale * dpr });
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(vp.width / dpr)}px`;
      c.style.height = `${Math.floor(vp.height / dpr)}px`;
      task.current = p.render({ canvas: c, viewport: vp });
      await task.current.promise;
      if (!stale) setError(null);
    })().catch((e) => { if (!stale && e?.name !== "RenderingCancelledException") setError("Impossible d’afficher cette page."); });
    return () => { stale = true; task.current?.cancel(); };
  }, [doc, page, width, zoomIdx]);

  const zoomBtn = "grid size-9 place-items-center rounded-full bg-surface text-muted hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] bg-raised">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <p className="font-bold">Page d’origine <span className="text-muted">· p. {page}</span></p>
        <div className="flex items-center gap-2">
          <button className={zoomBtn} disabled={zoomIdx === 0} onClick={() => setZoomIdx(zoomIdx - 1)} aria-label="Dézoomer"><MinusIcon className="size-4" /></button>
          <span className="w-12 text-center text-sm font-bold tabular-nums">{Math.round(ZOOMS[zoomIdx] * 100)} %</span>
          <button className={zoomBtn} disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx(zoomIdx + 1)} aria-label="Zoomer"><PlusIcon className="size-4" /></button>
        </div>
      </div>
      <div ref={wrap} className="relative min-h-0 flex-1 overflow-auto px-3 pb-3">
        {!doc && !error && <div className="grid h-full place-items-center text-muted"><SpinnerIcon className="size-7" /></div>}
        {error && <p role="alert" className="p-4 text-center font-semibold text-red-500">{error}</p>}
        <canvas ref={canvas} className={`mx-auto rounded-md bg-white shadow-lg ${doc && !error ? "" : "hidden"}`} />
      </div>
    </div>
  );
}
