"""One CPU device a chain for the recovery check's four chains
(test_recovery.py), set before JAX first computes anything, so they run side
by side: a GitHub runner for a public repository has four cores."""

from eggfit import model

model.use_cores(4)
