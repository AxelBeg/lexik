"""Point d'entree du backend Lexik.

Un seul service porte le moteur semantique ET l'API de jeu. Les separer
ajouterait un saut reseau pour aucun benefice a cette echelle.

Le modele est charge au demarrage et reste en RAM : c'est ce qui interdit le
serverless a la demande (docs/prompt-persistance.md, section 32).
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from services import similarity


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Demarrage de Lexik...")
    similarity.preload()
    print("Pret.")
    yield
    print("Arret.")


app = FastAPI(title="Lexik API", version="1.0.0", lifespan=lifespan)

# L'app mobile n'est pas soumise au CORS ; ce reglage ne sert qu'au dev web.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
