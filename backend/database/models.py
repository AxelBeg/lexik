"""Modele de donnees Lexik.

Repris de LexiFight en retirant tout le duel : plus de room, de file d'attente,
d'amis, d'icones ni d'XP. Une partie n'a qu'un joueur.

Deux choix structurants (voir docs/prompt-persistance.md) :
  - `users.id` est un UUID interne. Les identites externes (Play Games, repli
    appareil) vivent dans `auth_identities`, pour qu'ajouter un fournisseur ne
    demande aucune migration.
  - le serveur est la source de verite : le client ne persiste rien qui compte.
"""

from datetime import datetime, timezone
import uuid

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Index,
    Integer, Numeric, String, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# --------------------------------------------------------------------------
# Identite
# --------------------------------------------------------------------------

class User(Base):
    """Le joueur. Aucune donnee personnelle : ni email, ni pseudo, ni mot de passe."""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # monnaie unique du jeu : l'indice (icone ampoule)
    hint_currency = Column(Integer, nullable=False, default=0, server_default="0")

    # serie quotidienne
    streak_current = Column(Integer, nullable=False, default=0, server_default="0")
    streak_best = Column(Integer, nullable=False, default=0, server_default="0")
    last_daily_played_on = Column(Date, nullable=True)

    identities = relationship("AuthIdentity", back_populates="user", cascade="all, delete-orphan")
    games = relationship("Game", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("hint_currency >= 0", name="ck_user_currency_positive"),
    )


class AuthIdentity(Base):
    """Une facon de se connecter a un `users.id`.

    provider = 'play_games' (playerId verifie cote serveur) ou 'device' (repli
    quand Play Games est indisponible). 'apple' / 'email' s'ajouteraient ici
    sans toucher au reste du schema.
    """

    __tablename__ = "auth_identities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(20), nullable=False)
    external_id = Column(String(128), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="identities")

    __table_args__ = (
        UniqueConstraint("provider", "external_id", name="uq_identity"),
        Index("ix_identity_user", "user_id"),
    )


# --------------------------------------------------------------------------
# Contenu : mots, indices, campagne, quotidien
# --------------------------------------------------------------------------

class SecretWord(Base):
    """Un mot secret, avec ses 5 indices precalcules.

    Les indices sont calcules hors ligne (scripts/precompute_hints.py) : c'est
    la seule operation couteuse du moteur (plus proches voisins sur tout le
    vocabulaire), et elle n'a jamais besoin de tourner pendant une partie.
    """

    __tablename__ = "secret_words"

    id = Column(Integer, primary_key=True, autoincrement=True)
    word = Column(String(64), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    hints = relationship(
        "Hint", back_populates="secret_word",
        cascade="all, delete-orphan", order_by="Hint.rank",
    )
    neighbors = relationship(
        "Neighbor", back_populates="secret_word",
        cascade="all, delete-orphan", order_by="Neighbor.rank",
    )


class Hint(Base):
    """Indice n(1..5) d'un mot secret : un mot proche, jamais une lettre."""

    __tablename__ = "hints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    secret_word_id = Column(Integer, ForeignKey("secret_words.id", ondelete="CASCADE"), nullable=False)
    rank = Column(Integer, nullable=False)          # 1 = le plus eloigne, 5 = le plus proche
    word = Column(String(64), nullable=False)
    score = Column(Numeric(5, 2), nullable=False)   # score de jeu 0-100

    secret_word = relationship("SecretWord", back_populates="hints")

    __table_args__ = (
        UniqueConstraint("secret_word_id", "rank", name="uq_hint_rank"),
        CheckConstraint("rank BETWEEN 1 AND 5", name="ck_hint_rank"),
    )


class Neighbor(Base):
    """Un des mots les plus proches du secret, avec sa place dans le classement.

    Rien a voir avec `Hint` malgre la ressemblance des colonnes. Un indice est
    CHOISI : cinq paliers etages, ecartes les uns des autres, payants. Un voisin
    est SUBI : le classement brut du modele.

    `rank` est lu a deux moments opposes. PENDANT la partie, il situe une
    proposition sans rien reveler — « 847e sur 1000 » ne nomme aucun mot que le
    joueur n'ait deja tape. APRES la victoire, les cent premiers sont montres
    en entier, et la ce meme classement EST la solution. La frontiere est dans
    `services/games.py` : `neighbor_ranks` ne sort jamais que des rangs,
    `serialize_neighbors` sort des mots et n'est appele que par `build_victory`.

    Precalcule hors ligne (scripts/precompute_neighbors.py) pour la meme raison
    que les indices : le classement exige la matrice complete du vocabulaire,
    qui pese plusieurs centaines de Mo et n'a rien a faire dans le serveur de
    jeu.
    """

    __tablename__ = "neighbors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    secret_word_id = Column(Integer, ForeignKey("secret_words.id", ondelete="CASCADE"), nullable=False)
    rank = Column(Integer, nullable=False)          # 1 = le plus proche du secret
    word = Column(String(64), nullable=False)
    score = Column(Numeric(5, 2), nullable=False)   # score de jeu 0-100

    secret_word = relationship("SecretWord", back_populates="neighbors")

    __table_args__ = (
        UniqueConstraint("secret_word_id", "rank", name="uq_neighbor_rank"),
        CheckConstraint("rank >= 1", name="ck_neighbor_rank"),
    )


class CampaignLevel(Base):
    """6 planetes x 30 niveaux. Un niveau = un mot.

    Le nom de la planete n'est qu'un marqueur de progression : il ne dit rien du
    contenu semantique (prompt-campagne.md, section 14).
    """

    __tablename__ = "campaign_levels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    planet_id = Column(String(20), nullable=False)   # terre, mars, jupiter, saturne, uranus, neptune
    planet_order = Column(Integer, nullable=False)   # 1..6
    level_number = Column(Integer, nullable=False)   # 1..30
    secret_word_id = Column(Integer, ForeignKey("secret_words.id", ondelete="RESTRICT"), nullable=False)

    secret_word = relationship("SecretWord")

    __table_args__ = (
        UniqueConstraint("planet_id", "level_number", name="uq_campaign_level"),
        Index("ix_campaign_planet", "planet_order", "level_number"),
    )


class DailyWord(Base):
    """Le mot du jour. Une ligne par date UTC, numerotee (#428)."""

    __tablename__ = "daily_words"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True)
    number = Column(Integer, nullable=False, unique=True)
    secret_word_id = Column(Integer, ForeignKey("secret_words.id", ondelete="RESTRICT"), nullable=False)

    secret_word = relationship("SecretWord")


# --------------------------------------------------------------------------
# Parties
# --------------------------------------------------------------------------

class Game(Base):
    """Une partie = un joueur face a un mot.

    `mode` vaut 'daily' ou 'campaign'. Un joueur n'a qu'une seule partie par
    (mode, mot) : on la reprend au lieu d'en creer une deuxieme, ce qui permet
    de rejouer l'historique des propositions au retour du joueur.
    """

    __tablename__ = "games"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mode = Column(String(10), nullable=False)
    secret_word_id = Column(Integer, ForeignKey("secret_words.id", ondelete="RESTRICT"), nullable=False)

    daily_word_id = Column(Integer, ForeignKey("daily_words.id", ondelete="CASCADE"), nullable=True)
    campaign_level_id = Column(Integer, ForeignKey("campaign_levels.id", ondelete="CASCADE"), nullable=True)

    completed = Column(Boolean, nullable=False, default=False, server_default="false")
    best_score = Column(Numeric(5, 2), nullable=True)
    attempts_count = Column(Integer, nullable=False, default=0, server_default="0")
    hints_used = Column(Integer, nullable=False, default=0, server_default="0")

    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="games")
    secret_word = relationship("SecretWord")
    daily_word = relationship("DailyWord")
    campaign_level = relationship("CampaignLevel")
    attempts = relationship(
        "Attempt", back_populates="game",
        cascade="all, delete-orphan", order_by="Attempt.created_at",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "daily_word_id", name="uq_game_user_daily"),
        UniqueConstraint("user_id", "campaign_level_id", name="uq_game_user_level"),
        CheckConstraint("mode IN ('daily', 'campaign')", name="ck_game_mode"),
        CheckConstraint("hints_used BETWEEN 0 AND 5", name="ck_game_hints"),
        Index("ix_game_user_mode", "user_id", "mode"),
    )


class Attempt(Base):
    """Une ligne de la carte semantique du joueur.

    `is_hint` distingue les indices achetes des propositions : ils vivent dans
    la meme liste (section 7) mais ne comptent pas comme des essais (section 8).
    """

    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String(36), ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    word = Column(String(64), nullable=False)
    score = Column(Numeric(5, 2), nullable=False)
    is_hint = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    game = relationship("Game", back_populates="attempts")

    __table_args__ = (
        UniqueConstraint("game_id", "word", name="uq_attempt_word"),
        Index("ix_attempt_game_score", "game_id", "score"),
    )


class DailyResult(Base):
    """Resultat fige d'un mot du jour, pour le percentile et la mediane.

    Table separee de `games` parce qu'elle est lue en agregat par tous les
    joueurs : c'est la seule chose qui rende « mieux que 73 % des joueurs »
    calculable (section 10).
    """

    __tablename__ = "daily_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    daily_word_id = Column(Integer, ForeignKey("daily_words.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    attempts_count = Column(Integer, nullable=False)
    hints_used = Column(Integer, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=False,
                          default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("daily_word_id", "user_id", name="uq_daily_result"),
        Index("ix_daily_result_word_attempts", "daily_word_id", "attempts_count"),
    )
