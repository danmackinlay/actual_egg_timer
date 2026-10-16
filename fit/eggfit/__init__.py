"""eggfit: the population fit for Actual Egg Timer (INFERENCE.md section 9).

Double precision throughout: the likelihood is held to the app's own to the
digit (tests/test_likelihood.py), and JAX's default single precision is not.
"""

import numpyro

numpyro.enable_x64()
