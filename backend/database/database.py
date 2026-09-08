"""Connexion base de donnees.

Postgres en production. SQLite accepte en developpement, pour pouvoir lancer le
jeu sans rien installer : `DATABASE_URL=sqlite:///./lexik.db`.

Le schema n'utilise rien de specifique a Postgres, donc les deux marchent — mais
ne pas s'y fier pour valider une migration : c'est Postgres qui fait foi.
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL") or (
    f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME')}"
)

if DATABASE_URL.startswith("sqlite"):
    # FastAPI sert les requetes depuis un pool de threads ; SQLite refuse par
    # defaut qu'une connexion change de thread.
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
