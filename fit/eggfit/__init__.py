"""eggfit: the population fit for Actual Egg Timer (E7; INFERENCE.md section 9).

Double precision throughout: the likelihood is held to the app's own to the
digit (tests/test_likelihood.py), and JAX's default single precision is not.
"""

import numpyro

numpyro.enable_x64()
