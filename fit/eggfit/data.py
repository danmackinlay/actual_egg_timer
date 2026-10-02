"""The fit's input: emulated eggs (tools/eggs.ts emulate), as arrays.

Each egg carries its own emulator column - log yolk and white dose and the
peak yolk temperature at its scored cook time, on a grid of time-scales in
literature sds (`zGrid`) - so the likelihood never runs the physics, only
interpolates (INFERENCE.md section 9).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

import numpy as np


@dataclass
class Eggs:
    """Every answered egg, in order within each cook."""

    uid: list[str]
    cook: np.ndarray  # index into `cooks`, per egg
    cooks: list[str]
    tier: np.ndarray  # 1 attested, 0 open
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


def load(path: str) -> Eggs:
    with open(path) as f:
        raw = json.load(f)
    eggs = sorted(raw["eggs"], key=lambda e: (e["uid"], e["seq"]))
    cooks = sorted({e["uid"] for e in eggs})
    index = {c: i for i, c in enumerate(cooks)}
    nan = float("nan")
    return Eggs(
        uid=[e["uid"] for e in eggs],
        cook=np.array([index[e["uid"]] for e in eggs], dtype=np.int32),
        cooks=cooks,
        tier=np.array([1 if e["tier"] == "attested" else 0 for e in eggs], dtype=np.int32),
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
