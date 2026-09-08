"""Construit un modele semantique reduit a partir de cc.fr.300.

Le binaire officiel pese ~7 Go. Le jeu n'interroge jamais que le vocabulaire
jouable (~42 000 mots) plus les candidats-indices : extraire ces vecteurs du
fichier texte public ramene l'empreinte a quelques dizaines de Mo, avec les
memes scores.

    python -m scripts.build_reduced_model

Telecharge https://fasttext.cc/docs/en/crawl-vectors.html (cc.fr.300.vec.gz,
~1.2 Go) si besoin, filtre, ecrit models/lexik.fr.300.npz.
"""

from __future__ import annotations

import argparse
import gzip
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

from utils.const import (
    HINT_WORDS_PATH,
    MODELS_DIR,
    PLAYABLE_WORDS_PATH,
    REDUCED_MODEL_PATH,
)
from utils.helpers import display_word, normalize_key

VEC_URL = "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.fr.300.vec.gz"
VEC_PATH = MODELS_DIR / "cc.fr.300.vec.gz"
VEC_BYTES = 1_287_757_366
DIM = 300

# campaign_words n'est pas dans const : chemin local, evite un import circulaire
# si on l'ajoute plus tard. On le lit depuis DATA_DIR via PLAYABLE parent.
_CAMPAIGN = PLAYABLE_WORDS_PATH.parent / "campaign_words.json"


def _load_needed() -> dict[str, str]:
    """cle depouillee -> forme d'affichage du jeu."""
    needed: dict[str, str] = {}
    for path in (PLAYABLE_WORDS_PATH, HINT_WORDS_PATH, _CAMPAIGN):
        if not path.exists():
            continue
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        for word in raw:
            display = display_word(word or "")
            key = normalize_key(display)
            if key and key not in needed:
                needed[key] = display
    return needed


def _download(dest: Path, force: bool) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size == VEC_BYTES and not force:
        print(f"Deja telecharge : {dest}")
        return
    if dest.exists() and dest.stat().st_size != VEC_BYTES:
        print(f"Fichier incomplet ({dest.stat().st_size}/{VEC_BYTES}), reprise...")

    curl = "curl.exe" if sys.platform == "win32" else "curl"
    cmd = [curl, "-L", "--retry", "8", "-C", "-", "--fail", "--output", str(dest), VEC_URL]
    print(f"Telechargement de {VEC_URL}")
    print(f"  -> {dest} ({VEC_BYTES / 1e9:.2f} Go)")
    subprocess.check_call(cmd)
    size = dest.stat().st_size
    if size != VEC_BYTES:
        raise SystemExit(f"Taille inattendue : {size} (attendu {VEC_BYTES})")


def _token_rank(token: str, target: str) -> int:
    """Plus haut = mieux. La forme accentuee du jeu l'emporte sur le repli."""
    displayed = display_word(token)
    if token == target or displayed == target:
        return 4
    if displayed == display_word(target):
        return 3
    return 1 + min(2, sum(1 for c in token if ord(c) > 127))


def _extract(src: Path, needed: dict[str, str]) -> tuple[list[str], np.ndarray]:
    """Lit le .vec.gz et garde le meilleur vecteur pour chaque cle du jeu."""
    best: dict[str, tuple[int, np.ndarray]] = {}
    print(f"Extraction depuis {src} ({len(needed)} mots cibles)...")

    with gzip.open(src, "rt", encoding="utf-8", errors="ignore") as f:
        header = f.readline()
        try:
            n_words, dim = header.split()
            dim = int(dim)
        except ValueError as exc:
            raise SystemExit(f"En-tete .vec illisible : {header!r}") from exc
        if dim != DIM:
            raise SystemExit(f"Dimension {dim}, attendu {DIM}")
        print(f"  {n_words} vecteurs dans le fichier source")

        for i, line in enumerate(f, 1):
            parts = line.split(" ")
            if len(parts) < dim + 1:
                continue
            token = parts[0]
            key = normalize_key(display_word(token))
            if key not in needed:
                continue
            try:
                vec = np.array(parts[1:1 + dim], dtype=np.float32)
            except ValueError:
                continue
            if vec.shape != (dim,):
                continue
            rank = _token_rank(token, needed[key])
            prev = best.get(key)
            if prev is None or rank > prev[0]:
                best[key] = (rank, vec)
            if i % 200_000 == 0:
                print(f"  {i}/{n_words} lignes, {len(best)} mots trouves")

    missing = [w for k, w in needed.items() if k not in best]
    print(f"  {len(best)}/{len(needed)} vecteurs extraits, {len(missing)} manquants")
    if missing:
        preview = ", ".join(missing[:15])
        more = f" (+{len(missing) - 15})" if len(missing) > 15 else ""
        print(f"  manquants : {preview}{more}")

    campaign_missing = []
    if _CAMPAIGN.exists():
        with open(_CAMPAIGN, encoding="utf-8") as f:
            for word in json.load(f):
                key = normalize_key(display_word(word))
                if key not in best:
                    campaign_missing.append(word)
    if campaign_missing:
        raise SystemExit(
            "Mots de campagne sans vecteur : " + ", ".join(campaign_missing)
        )

    words = []
    rows = []
    for key, display in needed.items():
        hit = best.get(key)
        if hit is None:
            continue
        words.append(display)
        rows.append(hit[1])
    return words, np.stack(rows).astype(np.float32)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument("--keep-download", action="store_true",
                        help="conserve cc.fr.300.vec.gz apres extraction")
    args = parser.parse_args()

    needed = _load_needed()
    if not needed:
        raise SystemExit("Vocabulaire vide : verifier data/playable_words.json")

    _download(VEC_PATH, force=args.force_download)
    words, vectors = _extract(VEC_PATH, needed)

    REDUCED_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(REDUCED_MODEL_PATH, words=np.asarray(words), vectors=vectors)
    size_mb = REDUCED_MODEL_PATH.stat().st_size / 1e6
    print(f"Ecrit {REDUCED_MODEL_PATH} ({len(words)} vecteurs, {size_mb:.1f} Mo)")

    if not args.keep_download and VEC_PATH.exists():
        VEC_PATH.unlink()
        print(f"Supprime {VEC_PATH}")


if __name__ == "__main__":
    main()
