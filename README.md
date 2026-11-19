# pdf-audio

Transformez n'importe quel PDF en audio : lecture page par page, texte suivi à l'écran, aperçu de la page d'origine,
recherche, chapitres, reprise automatique, minuteur de veille, commandes vocales, comptes et bibliothèque.

- `backend/` : API FastAPI (extraction PDF, voix multi-moteurs, comptes, statistiques admin) + `tests/`
- `frontend/` : application Next.js (App Router, Tailwind)
- `supabase/schema.sql` : tables et règles de sécurité (comptes, bibliothèque, événements)
- `docs/SETUP.md` : mise en service pas à pas

## En local
Backend : `cd backend && python -m uvicorn app.main:app --reload --port 8000`
Frontend : `cd frontend && npm install && npm run dev` (variables : `frontend/.env.example`)
Tests backend : `cd backend && python -m pytest tests`
