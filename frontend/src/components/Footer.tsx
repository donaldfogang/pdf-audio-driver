import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-line/60">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
        <p><b className="font-display text-ink">pdf-audio</b> · écoutez vos documents, partout.</p>
        <Link href="/privacy" className="font-semibold hover:text-ink">Confidentialité</Link>
      </div>
    </footer>
  );
}
