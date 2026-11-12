# PDF Audio Driver

Lecteur audio de PDF pour conducteurs. Frontend Next.js (Vercel) + Backend FastAPI (Docker).

## Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

## Frontend
cd frontend
npx create-next-app@latest . --ts --tailwind --app --src-dir --import-alias "@/*"   # puis copier les fichiers de src/ par-dessus
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
