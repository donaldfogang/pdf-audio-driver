import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "PDF Audio Driver",
  description: "Écoutez vos PDF à voix haute, page par page.",
  appleWebApp: { capable: true, title: "PDF Audio", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f4f9" },
    { media: "(prefers-color-scheme: dark)", color: "#070b12" },
  ],
};

const themeInit = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={manrope.variable}>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
