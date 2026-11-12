export type Command =
  | { type: "pause" | "play" | "next" | "prev" | "repeat" | "stop" | "faster" | "slower" }
  | { type: "goto"; page: number };

export const COMMAND_LABELS: Record<string, string> = {
  pause: "Pause", play: "Lecture", next: "Page suivante", prev: "Page précédente",
  repeat: "Répéter la page", stop: "Arrêt", faster: "Plus vite", slower: "Moins vite", goto: "Aller à la page",
};

const WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20,
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Une commande doit commencer par le mot d'éveil « lecteur » : évite de déclencher
 *  une action quand la voix lit un texte contenant « pause » ou « suivant ». */
export function parseCommand(raw: string): Command | null {
  const t = norm(raw);
  const wake = [...t.matchAll(/\b(lecteurs?|reader)\b/g)].pop();
  if (!wake || wake.index === undefined) return null;
  const c = t.slice(wake.index + wake[0].length).trim();
  if (!c) return null;

  const g = c.match(/\bpage (\d{1,4}|[a-z]+)\b/);
  if (g) {
    const n = /^\d+$/.test(g[1]) ? Number(g[1]) : WORDS[g[1]];
    if (n) return { type: "goto", page: n };
  }
  if (/\b(plus vite|accelere|accelerer|faster)\b/.test(c)) return { type: "faster" };
  if (/\b(moins vite|plus lentement|ralentis|ralentir|slower)\b/.test(c)) return { type: "slower" };
  if (/\b(repete|repeter|recommence|encore une fois|again)\b/.test(c)) return { type: "repeat" };
  if (/\b(precedent|precedente|retour|reviens|revenir|recule|back|previous)\b/.test(c)) return { type: "prev" };
  if (/\b(suivant|suivante|passe|avance|next|skip)\b/.test(c)) return { type: "next" };
  if (/\b(pause|attends|attendez|silence|wait)\b/.test(c)) return { type: "pause" };
  if (/\b(stop|arrete|arreter|termine)\b/.test(c)) return { type: "stop" };
  if (/\b(reprends|reprendre|continue|continuer|lecture|joue|play|resume)\b/.test(c)) return { type: "play" };
  return null;
}
