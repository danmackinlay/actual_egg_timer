"""The fit's input: emulated eggs (tools/eggs.ts emulate), as arrays.

Each egg carries its own emulator column - log yolk and white dose and the
peak yolk temperature at its scored cook time, on a grid of time-scales in
literature sds (`zGrid`) - so the likelihood never runs the physics, only
interpolates (INFERENCE.md section 9).

TRUSTED IDS (DECISIONS.md 82): the owner vouches for their own random IDs,
and the fit gives those cooks' eggs the attested tier's full weight whatever
tier they came in (`model.tier_weights`). The list is never committed: it
is read from `fit/trusted.local.txt` (gitignored; `trusted.example.txt`
shows the shape) and from `EGGFIT_TRUSTED`, pooled, and an egg the emulator
already marked `trusted` (tools/eggs.ts import) stays so. Only an egg from
the owner's own results file (`source: "export"`) is trusted by its ID: an
ID is shown on screen, so anyone who learned one could post under it.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass

import numpy as np

TRUSTED_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "trusted.local.txt")
TRUSTED_ENV = "EGGFIT_TRUSTED"


def parse_trusted(text: str) -> list[str]:
    """The IDs in a trusted list's text: `#` to the end of a line is a
    comment; commas and white space separate. tools/eggsImport.ts's
    `parseTrusted`."""
    out = []
    for line in text.split("\n"):
        out += [i for i in re.split(r"[\s,]+", line.split("#", 1)[0]) if i]
    return out


def read_trusted(path: str | None = TRUSTED_FILE, env: str | None = None) -> set[str]:
    """The trusted list: the file, if there is one, and the environment."""
    ids: set[str] = set()
    if path and os.path.exists(path):
        with open(path) as f:
            ids.update(parse_trusted(f.read()))
    env = os.environ.get(TRUSTED_ENV) if env is None else env
    if env:
        ids.update(parse_trusted(env))
    return ids


@dataclass
class Eggs:
    """Every answered egg, in order within each cook."""

    uid: list[str]
    cook: np.ndarray  # index into `cooks`, per egg
    cooks: list[str]
    tier: np.ndarray  # 1 attested, 0 open
    trusted: np.ndarray  # bool: the cook's ID is on the owner's trusted list
    seq: np.ndarray
    target: np.ndarray  # log10 yolk dose the cook asked for
    yolk: np.ndarray  # 0 too soft, 1 just right, 2 too firm, -1 not answered
    white: np.ndarray  # 0 runny, 1 tender, 2 firm, -1 not answered
    probe: np.ndarray  # C, nan when none
    log_yolk: np.ndarray  # (eggs, z)
    log_white: np.ndarray
    peak: np.ndarray
    z_grid: np.ndarray
    constants: dict

    @property
    def n(self) -> int:
        return len(self.cook)

    def subset(self, cooks: set[str]) -> "Eggs":
        """Only these cooks' eggs, re-indexed."""
        keep = np.array([u in cooks for u in self.uid])
        names = [c for c in self.cooks if c in cooks]
        index = {c: i for i, c in enumerate(names)}
        return Eggs(
            uid=[u for u, k in zip(self.uid, keep) if k],
            cook=np.array([index[u] for u, k in zip(self.uid, keep) if k], dtype=np.int32),
            cooks=names,
            tier=self.tier[keep],
            trusted=self.trusted[keep],
            seq=self.seq[keep],
            target=self.target[keep],
            yolk=self.yolk[keep],
            white=self.white[keep],
            probe=self.probe[keep],
            log_yolk=self.log_yolk[keep],
            log_white=self.log_white[keep],
            peak=self.peak[keep],
            z_grid=self.z_grid,
            constants=self.constants,
        )


def load(path: str, trusted: set[str] | None = None) -> Eggs:
    """The emulated eggs, each marked trusted if the emulator said so, or if
    it came from a results file and its cook's ID is in `trusted`."""
    with open(path) as f:
        raw = json.load(f)
    trusted = trusted or set()
    eggs = sorted(raw["eggs"], key=lambda e: (e["uid"], e["seq"]))
    cooks = sorted({e["uid"] for e in eggs})
    index = {c: i for i, c in enumerate(cooks)}
    nan = float("nan")
    return Eggs(
        uid=[e["uid"] for e in eggs],
        cook=np.array([index[e["uid"]] for e in eggs], dtype=np.int32),
        cooks=cooks,
        tier=np.array([1 if e["tier"] == "attested" else 0 for e in eggs], dtype=np.int32),
        trusted=np.array([bool(e.get("trusted")) or (e.get("source") == "export" and e["uid"] in trusted)
                          for e in eggs], dtype=bool),
        seq=np.array([e["seq"] for e in eggs], dtype=np.int32),
        target=np.array([e["logYolkTarget"] for e in eggs]),
        yolk=np.array([-1 if e["yolk"] is None else e["yolk"] + 1 for e in eggs], dtype=np.int32),
        white=np.array([-1 if e["white"] is None else e["white"] for e in eggs], dtype=np.int32),
        probe=np.array([nan if e["probe"] is None else e["probe"] for e in eggs]),
        log_yolk=np.array([e["logYolk"] for e in eggs]),
        log_white=np.array([e["logWhite"] for e in eggs]),
        peak=np.array([e["peak"] for e in eggs]),
        z_grid=np.array(raw["zGrid"]),
        constants=raw["constants"],
    )


def split(eggs: Eggs, holdout: float, salt: str = "eggfit") -> tuple[set[str], set[str]]:
    """Cooks into a fitting set and a held-out set, by a hash of the id, so
    the split is the same on every run and does not depend on order."""
    held = set()
    for c in eggs.cooks:
        h = int(hashlib.sha256((salt + c).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
        if h < holdout:
            held.add(c)
    return set(eggs.cooks) - held, held
