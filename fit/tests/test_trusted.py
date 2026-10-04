"""The owner's trusted IDs (DECISIONS.md 82): read from a gitignored file and
the environment, and given the attested tier's full weight whatever tier
their eggs came in.

    uv run --project fit python -m pytest fit/tests
"""

import json
import pathlib

import numpy as np

from eggfit import data, model

SAMPLE = pathlib.Path(__file__).parent / "emulated-sample.json"


def test_the_list_reads_like_the_tools():
    # tools/eggsImport.ts `parseTrusted`, line for line.
    assert data.parse_trusted("# mine\nabc  # the phone\n\n def,ghi\n") == ["abc", "def", "ghi"]


def test_a_file_and_the_environment_are_pooled(tmp_path):
    f = tmp_path / "trusted.local.txt"
    f.write_text("abc\n# not this\n")
    assert data.read_trusted(str(f), env="") == {"abc"}
    assert data.read_trusted(str(f), env="x, y") == {"abc", "x", "y"}
    assert data.read_trusted(str(tmp_path / "none.txt"), env="") == set()


def test_the_example_file_trusts_nobody():
    example = pathlib.Path(__file__).parent.parent / "trusted.example.txt"
    assert data.read_trusted(str(example), env="") == set()


def test_a_trusted_cook_counts_once_whatever_its_tier(tmp_path):
    raw = json.loads(SAMPLE.read_text())
    cooks = sorted({e["uid"] for e in raw["eggs"]})
    # Every egg open, so only trust can lift one; the emulator's own mark
    # counts too.
    for e in raw["eggs"]:
        e["tier"] = "open"
        e.pop("trusted", None)
    raw["eggs"][-1]["trusted"] = True
    marked = raw["eggs"][-1]["uid"]
    path = tmp_path / "emulated.json"
    path.write_text(json.dumps(raw))

    plain = data.load(str(path))
    assert set(np.array(plain.uid)[plain.trusted]) == {marked}

    mine = next(c for c in cooks if c != marked)
    eggs = data.load(str(path), {mine})
    assert set(np.array(eggs.uid)[eggs.trusted]) == {mine, marked}
    w = model.tier_weights(eggs, open_power=0.5, open_cap=1.0)
    assert np.all(w[eggs.trusted] == 1.0)
    rest = ~eggs.trusted
    n_full, n_open = int(np.sum(eggs.trusted)), int(np.sum(rest))
    # The others are open, at a power below one and capped by the trusted.
    assert np.allclose(w[rest], min(0.5, n_full / n_open))
    # Without the list nothing but the marked cook counts once.
    w0 = model.tier_weights(plain, open_power=0.5, open_cap=1.0)
    assert np.sum(w0 == 1.0) == int(np.sum(plain.trusted))
    # And a subset keeps the mark.
    sub = eggs.subset({mine})
    assert np.all(sub.trusted)
