import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pdf-audio",
    short_name: "pdf-audio",
    description: "Transformez n’importe quel PDF en audio.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "fr",
    background_color: "#070b12",
    theme_color: "#070b12",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
