#!/usr/bin/env python3
"""How wrong is the equal-volume sphere for a real, ovoid egg?

A standalone numerical study; it changes nothing in the app. It solves
transient conduction in an axisymmetric egg - a Huegelschaeffer ovoid, or a
prolate spheroid - with the app's physics (constant alpha, surface clamped at
the water temperature, the yolk dose at the yolk centre with Z_YOLK and
TREF_YOLK_C), and pushes the result through the app's cook protocol (hot
start, the water's dip and recovery, the pull, the ice bath, 900 s of
carryover) to get the cook time the app would ask for if it knew the shape.

Method, in short (RESULTS.md has the long version):

1. Linear P1 finite elements on the (z, r) half-plane with the axisymmetric
   weight r, on a mesh that is polar about the egg's centroid and fitted to
   its outline (the boundary nodes lie ON the curve). Dirichlet surface.
2. Because the problem is linear and the boundary condition is a clamp, ONE
   solve per shape is enough: the unit step response U(x, Fo) at the points
   that matter, in Fourier time Fo = alpha t / R_eq^2 with R_eq the
   equal-volume radius. Any egg of that shape and any size is the same U on a
   stretched clock, and any surface schedule is a Duhamel convolution of U.
3. The cook time is found by bisection on the pull time, with the surface
   schedule sampled exactly as src/core/solve.ts samples it.

Checks: the FE sphere against the series the app integrates
(src/core/sphere.ts), and this script's protocol + dose + bisection, fed the
app's own 40-mode series, against the app's solveCookTime
(app_reference.mjs) - to within its 1 s bisection tolerance.

    python3 tools/shape-study/shape_study.py [--quick] [--app-core DIR]

Needs numpy and scipy. Writes tools/shape-study/results.json.
"""

import json
import math
import os
import re
import subprocess
import sys
import time

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from scipy.optimize import brentq
from scipy.signal import fftconvolve
from scipy.special import erfc

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))


# ----------------------------------------------------------- the app's numbers

def ts_const(rel, name):
    """A numeric `export const NAME = <literal>;` read from the app's source,
    so this study cannot drift from the constants it is judging."""
    with open(os.path.join(ROOT, rel)) as f:
        txt = f.read()
    m = re.search(r'export const ' + name + r'\s*=\s*([0-9.eE+-]+)\s*;', txt)
    if not m:
        raise SystemExit('cannot read %s from %s' % (name, rel))
    return float(m.group(1))


C = 'src/core/constants.ts'
ALPHA = ts_const(C, 'ALPHA_DEFAULT')
Z_YOLK = ts_const(C, 'Z_YOLK')
TREF_YOLK = ts_const(C, 'TREF_YOLK_C')
Z_WHITE = ts_const(C, 'Z_WHITE')
TREF_WHITE = ts_const(C, 'TREF_WHITE_C')
KV_APP = ts_const(C, 'EGG_VOLUME_COEFF')
Q_APP = ts_const(C, 'EGG_LENGTH_RATIO')
RHO = ts_const(C, 'RHO_EGG')
TAU_PLUNGE = ts_const(C, 'TAU_PLUNGE')
T_ICE = ts_const(C, 'T_ICE_BATH_C')
CARRY = ts_const(C, 'CARRYOVER_WINDOW')
YOLK_FRAC = ts_const(C, 'YOLK_RADIUS_FRAC')
DT = ts_const(C, 'DT_SIM')
TAU_DIP = ts_const(C, 'TAU_DIP_RECOVERY')
C_WATER = ts_const(C, 'C_WATER')
C_EGG = ts_const(C, 'C_EGG')
MODES = int(ts_const(C, 'MODE_COUNT'))
S = 'src/core/solve.ts'
DOSE_RUNNY = ts_const(S, 'YOLK_DOSE_RUNNY')
DOSE_HARD = ts_const(S, 'YOLK_DOSE_HARD')
WHITE_TARGET = ts_const(S, 'WHITE_DOSE_TARGET')
with open(os.path.join(ROOT, S)) as f:
    ANCHORS = {k: float(v) for k, v in
               re.findall(r"key: 'doneness\.(\w+)', level: ([0-9.]+)", f.read())}
LEVELS = [('soft', ANCHORS['soft']), ('jammy', ANCHORS['jammy']), ('hard', ANCHORS['hard'])]

# The cook every row below is: hot start into a held boil at sea level, two
# eggs in 2 L (the app's defaults), straight into an ice bath.
BOIL = 100.0
WATER_L = 2.0
EGG_COUNT = 2


def yolk_target(level):
    lo, hi = math.log10(DOSE_RUNNY), math.log10(DOSE_HARD)
    return 10.0 ** (lo + (hi - lo) * level)


# ------------------------------------------------------------------ the shapes

class Shape:
    """An axisymmetric egg outline with length q and maximum breadth 1, its
    long axis on z. `half_width(z)` is the outline's radius at z, with z
    measured from the middle of the long axis."""

    def __init__(self, name, q, w):
        self.name, self.q, self.w = name, q, w
        zz = np.linspace(-q / 2, q / 2, 400001)
        raw = self._raw(zz)
        self.scale = 0.5 / raw.max()
        y2 = (raw * self.scale) ** 2
        self.volume = math.pi * np.trapezoid(y2, zz)
        self.kv = self.volume / q               # V / (L B^2), B = 1
        self.zc = np.trapezoid(zz * y2, zz) / np.trapezoid(y2, zz)
        self.z_widest = zz[np.argmax(raw)]

    def _raw(self, z):
        # Huegelschaeffer's ovoid (Narushin et al. 2021): w = 0 is the ellipse.
        q, w = self.q, self.w
        num = np.clip(q * q - 4 * z * z, 0, None)
        return 0.5 * np.sqrt(num / (q * q + 8 * w * z + 4 * w * w))

    def half_width(self, z):
        return self._raw(z) * self.scale

    def boundary_rho(self, phi):
        """Distance from the centroid to the outline along a ray at angle phi
        from the +z axis (the pointed end for w > 0)."""
        lo = np.zeros_like(phi)
        hi = np.full_like(phi, self.q)
        for _ in range(80):
            mid = 0.5 * (lo + hi)
            z = self.zc + mid * np.cos(phi)
            r = mid * np.sin(phi)
            inside = (np.abs(z) < self.q / 2) & (r < self.half_width(z))
            lo = np.where(inside, mid, lo)
            hi = np.where(inside, hi, mid)
        return 0.5 * (lo + hi)

    def area(self):
        if getattr(self, '_area', None) is None:
            self._area = self._compute_area()
        return self._area

    def _compute_area(self):
        phi = np.linspace(0, math.pi, 200001)
        rho = self.boundary_rho(phi)
        z, r = rho * np.cos(phi), rho * np.sin(phi)
        ds = np.hypot(np.diff(z), np.diff(r))
        return 2 * math.pi * np.sum(0.5 * (r[1:] + r[:-1]) * ds)


def ovoid(q, kv):
    """The Huegelschaeffer ovoid of length/breadth q whose volume coefficient
    V/(L B^2) is kv. kv = pi/6 is the prolate spheroid."""
    if abs(kv - math.pi / 6) < 1e-9:
        return Shape('spheroid', q, 0.0)
    w = brentq(lambda w: Shape('', q, w).kv - kv, 1e-6, 0.45 * q, xtol=1e-10)
    return Shape('ovoid', q, w)


def sphere_shape():
    return Shape('sphere', 1.0, 0.0)


# -------------------------------------------------------------------- the FEM

def solve_step_response(shape, ns, nphi, dfo, fo_max):
    """Unit step response U = (T - T0)/(Ts - T0) on the axis and the equator
    ray, the shape scaled to an equal-volume radius of 1 and alpha = 1, so
    time is Fo = alpha t / R_eq^2. Crank-Nicolson after four backward-Euler
    half-steps (Rannacher), which damp the step's high modes."""
    k = (4 * math.pi / 3 / shape.volume) ** (1 / 3)   # to R_eq = 1
    phi = np.linspace(0, math.pi, nphi + 1)
    rb = shape.boundary_rho(phi) * k
    s = np.linspace(0, 1, ns + 1)

    def nid(i, j):
        return 1 + (i - 1) * (nphi + 1) + j

    n = 1 + ns * (nphi + 1)
    zc = np.zeros(n)
    rc = np.zeros(n)
    for i in range(1, ns + 1):
        sl = slice(nid(i, 0), nid(i, nphi) + 1)
        zc[sl] = s[i] * rb * np.cos(phi)
        rc[sl] = s[i] * rb * np.sin(phi)
    rc[rc < 0] = 0.0
    tris = []
    for j in range(nphi):
        tris.append((0, nid(1, j), nid(1, j + 1)))
    for i in range(1, ns):
        for j in range(nphi):
            a, b, c, d = nid(i, j), nid(i + 1, j), nid(i + 1, j + 1), nid(i, j + 1)
            tris.append((a, b, c))
            tris.append((a, c, d))
    t = np.array(tris)
    x = zc[t]
    y = rc[t]
    two_a = (x[:, 1] - x[:, 0]) * (y[:, 2] - y[:, 0]) - (x[:, 2] - x[:, 0]) * (y[:, 1] - y[:, 0])
    area = 0.5 * np.abs(two_a)
    bb = np.stack([y[:, 1] - y[:, 2], y[:, 2] - y[:, 0], y[:, 0] - y[:, 1]], 1)
    cc = np.stack([x[:, 2] - x[:, 1], x[:, 0] - x[:, 2], x[:, 1] - x[:, 0]], 1)
    rbar = y.mean(1)
    rows, cols, kv, mv = [], [], [], []
    for i in range(3):
        for j in range(3):
            kij = rbar * (bb[:, i] * bb[:, j] + cc[:, i] * cc[:, j]) / (4 * area)
            mij = np.zeros_like(area)
            for m in range(3):
                distinct = len({i, j, m})
                coef = 1 / 10 if distinct == 1 else (1 / 30 if distinct == 2 else 1 / 60)
                mij += y[:, m] * coef
            mij *= area
            rows.append(t[:, i]); cols.append(t[:, j]); kv.append(kij); mv.append(mij)
    rows = np.concatenate(rows); cols = np.concatenate(cols)
    K = sp.coo_matrix((np.concatenate(kv), (rows, cols)), shape=(n, n)).tocsr()
    M = sp.coo_matrix((np.concatenate(mv), (rows, cols)), shape=(n, n)).tocsr()
    interior = np.ones(n, bool)
    interior[nid(ns, 0):nid(ns, nphi) + 1] = False
    idx = np.flatnonzero(interior)
    Kii = K[idx][:, idx].tocsc()
    Mii = M[idx][:, idx].tocsc()
    lhs = spla.splu((Mii + 0.5 * dfo * Kii).tocsc())
    rhs_cn = (Mii - 0.5 * dfo * Kii).tocsr()

    # recorded: the centroid, both halves of the axis, the equator ray
    pos = np.full(n, -1)
    pos[idx] = np.arange(len(idx))
    up = [nid(i, 0) for i in range(ns - 1, 0, -1)]      # pointed end, outer->inner
    down = [nid(i, nphi) for i in range(1, ns)]          # blunt end, inner->outer
    axis_nodes = up + [0] + down
    axis_z = np.concatenate([zc[up], [0.0], zc[down]])
    axis_z = np.concatenate([[rb[0]], axis_z, [-rb[-1]]])  # with the two poles
    je = nphi // 2
    eq_nodes = [0] + [nid(i, je) for i in range(1, ns)]
    eq_r = np.concatenate([[0.0], rc[eq_nodes[1:]], [rb[je] * math.sin(phi[je])]])
    rec_axis = pos[np.array(axis_nodes)]
    rec_eq = pos[np.array(eq_nodes)]

    steps = int(round(fo_max / dfo))
    theta = -np.ones(len(idx))
    out_axis = np.empty((steps + 1, len(axis_z)))
    out_eq = np.empty((steps + 1, len(eq_r)))

    def record(row, th):
        out_axis[row, 1:-1] = 1 + th[rec_axis]
        out_axis[row, 0] = out_axis[row, -1] = 1.0
        out_eq[row, :-1] = 1 + th[rec_eq]
        out_eq[row, -1] = 1.0

    out_axis[0] = 0.0
    out_eq[0] = 0.0
    out_axis[0, 0] = out_axis[0, -1] = out_eq[0, -1] = 1.0
    for _ in range(4):                       # 4 BE steps of dfo/2 = 2 dfo
        theta = lhs.solve(Mii @ theta)
        if _ == 1:
            record(1, theta)
    record(2, theta)
    for step in range(3, steps + 1):
        theta = lhs.solve(rhs_cn @ theta)
        record(step, theta)
    fo = np.arange(steps + 1) * dfo
    return {
        'fo': fo, 'axis_z': axis_z, 'axis_U': out_axis, 'eq_r': eq_r, 'eq_U': out_eq,
        'centre_col': len(up) + 1, 'nodes': n,
    }


def series_centre_U(fo, modes):
    """1 - seriesTheta(0, Fo), the app's 40-term series at the centre."""
    n = np.arange(1, modes + 1)
    sign = np.where(n % 2 == 1, 1.0, -1.0)
    th = 2 * np.sum(sign[None, :] * np.exp(-np.outer(fo, n * n * math.pi ** 2)), 1)
    return 1 - th


def series_U(x, fo, modes):
    n = np.arange(1, modes + 1)
    sign = np.where(n % 2 == 1, 1.0, -1.0)
    u = n * math.pi * x
    sinc = np.sin(u) / u if x > 1e-12 else np.ones_like(u, dtype=float)
    th = 2 * np.sum((sign * sinc)[None, :] * np.exp(-np.outer(fo, n * n * math.pi ** 2)), 1)
    return 1 - th


def images_centre_U(fo):
    """The exact centre response by the method of images (sphere.ts's
    erfcTheta, taken to x -> 0 analytically): converges fastest at small Fo."""
    fo = np.maximum(fo, 1e-12)
    s = np.sqrt(fo)
    total = np.zeros_like(fo)
    for k in range(60):
        a = 2 * k + 1
        # d/dx [erfc((a-x)/2s) - erfc((a+x)/2s)] at x = 0
        total += 2 * np.exp(-(a / (2 * s)) ** 2) / (math.sqrt(math.pi) * s)
    return total


# ----------------------------------------------- the app's cook, by Duhamel

class Point:
    """A point's unit step response on the egg's own clock, in seconds."""

    def __init__(self, fo, U, tau_s):
        t = fo * tau_s
        self.t_end = t[-1]
        W = np.concatenate([[0.0], np.cumsum(0.5 * (U[1:] + U[:-1]) * np.diff(t))])
        self._t, self._U, self._W = t, U, W

    def grid(self, n):
        """U at k*DT and D_k = integral of U over ((k-1)DT, kDT), k = 0..n."""
        tg = np.arange(n + 1) * DT
        U = np.interp(tg, self._t, self._U)
        W = np.interp(tg, self._t, self._W)
        # Past the end the response is flat (within 3e-4 of 1 at Fo = 0.9);
        # only bisection's first, far-too-long guesses ever look there.
        late = tg > self.t_end
        W[late] = self._W[-1] + self._U[-1] * (tg[late] - self.t_end)
        return U, np.diff(W)


def dip_C(mass_kg, start_C):
    water = WATER_L * C_WATER
    eggs = EGG_COUNT * mass_kg * C_EGG
    return eggs * (BOIL - start_C) / (water + eggs)


def surface_schedule(n, pull_s, dip):
    """The surface temperature at k*DT, k = 0..n, sampled as solve.ts samples
    it: the bath while in the pan, then the blend into the ice from the
    surface's value at the last sample before the pull."""
    tg = np.arange(n + 1) * DT
    ts = BOIL - dip * np.exp(-tg / TAU_DIP)
    after = tg >= pull_s
    after[0] = False
    if after.any():
        k = np.argmax(after)
        at_pull = ts[k - 1]
        ts[after] = T_ICE + (at_pull - T_ICE) * np.exp(-(tg[after] - pull_s) / TAU_PLUNGE)
    return ts


class Cook:
    """One egg's cook: the point responses it is dosed at, the start."""

    def __init__(self, points, start_C, mass_kg, z, tref, combine=min):
        self.points, self.start, self.z, self.tref, self.combine = points, start_C, z, tref, combine
        self.dip = dip_C(mass_kg, start_C)
        self._cache = {}

    def _resp(self, n):
        if n not in self._cache:
            self._cache = {n: [p.grid(n) for p in self.points]}
        return self._cache[n]

    def temps(self, pull_s):
        n = int(math.ceil((pull_s + CARRY) / DT))
        ts = surface_schedule(n, pull_s, self.dip)
        m = np.diff(ts) / DT
        out = []
        for U, D in self._resp(n):
            T = self.start + (ts[0] - self.start) * U
            T[1:] += fftconvolve(m, D)[:n]
            out.append(T)
        return out

    def dose(self, pull_s):
        doses = [np.sum(10.0 ** ((T[1:] - self.tref) / self.z)) * DT / 60.0
                 for T in self.temps(pull_s)]
        return self.combine(doses)

    def solve(self, target, tol=0.01, lo=20.0, hi=3600.0, app=False):
        if app:
            tol = 1.0   # solve.ts: SOLVE_TOL_S over [20, 3600], returns hi
        while hi - lo > tol:
            mid = 0.5 * (lo + hi)
            if self.dose(mid) < target:
                lo = mid
            else:
                hi = mid
        return hi if app else 0.5 * (lo + hi)


# --------------------------------------------------------------------- study

def eq_radius_m(volume_m3):
    return (3 * volume_m3 / (4 * math.pi)) ** (1 / 3)


class Model:
    """A solved shape: point responses for an egg of that shape at any size."""

    def __init__(self, shape, sol):
        self.shape, self.sol = shape, sol

    def tau(self, volume_m3):
        return eq_radius_m(volume_m3) ** 2 / ALPHA

    def centre(self, volume_m3):
        s = self.sol
        return Point(s['fo'], s['axis_U'][:, s['centre_col']], self.tau(volume_m3))

    def axis_point(self, zeta):
        """U at axis position zeta (in units of R_eq, from the centroid)."""
        s = self.sol
        zs = s['axis_z'][::-1]
        Us = s['axis_U'][:, ::-1]
        j = np.searchsorted(zs, zeta)
        f = (zeta - zs[j - 1]) / (zs[j] - zs[j - 1])
        return Us[:, j - 1] * (1 - f) + Us[:, j] * f

    def eq_point(self, rr):
        s = self.sol
        j = np.searchsorted(s['eq_r'], rr)
        f = (rr - s['eq_r'][j - 1]) / (s['eq_r'][j] - s['eq_r'][j - 1])
        return s['eq_U'][:, j - 1] * (1 - f) + s['eq_U'][:, j] * f

    def white_points(self, volume_m3):
        """The innermost white: the yolk's boundary, a sphere of a third of the
        egg's volume (radius YOLK_FRAC R_eq) about the centroid, read at its
        two poles and its equator; the white is set when the least-dosed is."""
        tau = self.tau(volume_m3)
        fo = self.sol['fo']
        return [Point(fo, self.axis_point(YOLK_FRAC), tau),
                Point(fo, self.axis_point(-YOLK_FRAC), tau),
                Point(fo, self.eq_point(YOLK_FRAC), tau)]


class SeriesModel:
    """The app's own sphere: its 40-mode series."""

    def __init__(self, fo):
        self.fo = fo
        self.U = series_centre_U(fo, MODES)
        self.Uw = series_U(YOLK_FRAC, fo, MODES)

    def tau(self, volume_m3):
        return eq_radius_m(volume_m3) ** 2 / ALPHA

    def centre(self, volume_m3):
        return Point(self.fo, self.U, self.tau(volume_m3))

    def white_points(self, volume_m3):
        return [Point(self.fo, self.Uw, self.tau(volume_m3))]


def cook_time(model, volume_m3, start_C, level, app=False):
    mass = RHO * volume_m3
    c = Cook([model.centre(volume_m3)], start_C, mass, Z_YOLK, TREF_YOLK)
    return c.solve(yolk_target(level), app=app)


def white_floor(model, volume_m3, start_C, app=False):
    mass = RHO * volume_m3
    c = Cook(model.white_points(volume_m3), start_C, mass, Z_WHITE, TREF_WHITE)
    return c.solve(WHITE_TARGET, app=app)


def time_to_centre(fo, U, tau_s, frac):
    """Seconds for a step response to reach `frac` of the way (pure clamp)."""
    j = np.argmax(U >= frac)
    f = (frac - U[j - 1]) / (U[j] - U[j - 1])
    return (fo[j - 1] + f * (fo[j] - fo[j - 1])) * tau_s


def main():
    quick = '--quick' in sys.argv
    app_core = None
    if '--app-core' in sys.argv:
        app_core = sys.argv[sys.argv.index('--app-core') + 1]
    ns, nphi = (60, 72) if quick else (120, 144)
    dfo, fo_max = (2e-4, 0.9) if quick else (1e-4, 0.9)
    res = {'mesh': [ns, nphi], 'dfo': dfo, 'alpha': ALPHA}
    t0 = time.time()

    def log(*a):
        print('[%6.1fs]' % (time.time() - t0), *a, flush=True)

    # ---- 1. the sphere, against the app's series
    fo = np.arange(int(round(fo_max / dfo)) + 1) * dfo
    exact = images_centre_U(fo)
    sph = Model(sphere_shape(), solve_step_response(sphere_shape(), ns, nphi, dfo, fo_max))
    fem = sph.sol['axis_U'][:, sph.sol['centre_col']]
    ver = {'nodes': sph.sol['nodes'], 'max_abs_dU_centre': float(np.max(np.abs(fem - exact))),
           'series40_vs_images_after_fo_0.01': float(np.max(np.abs(series_centre_U(fo, MODES) - exact)[fo > 0.01]))}
    for frac in (0.5, 0.75, 0.9):
        a = time_to_centre(fo, exact, 1.0, frac)
        b = time_to_centre(fo, fem, 1.0, frac)
        ver['fo_to_%.2f' % frac] = [a, b, 100 * (b / a - 1)]
    # the yolk boundary, x = 0.693, against the series there
    sw = series_U(YOLK_FRAC, fo, 400)
    fw = sph.axis_point(YOLK_FRAC)
    ver['max_abs_dU_yolk_boundary_fo_gt_0.005'] = float(np.max(np.abs(fw - sw)[fo > 0.005]))
    res['verify_sphere'] = ver
    log('sphere FE vs series:', json.dumps(ver))

    ser = SeriesModel(fo)
    masses = [0.050, 0.062, 0.075]
    starts = [4.0, 20.0]

    # ---- 2. this pipeline, fed the app's series, against the app itself
    if app_core:
        ref = json.loads(subprocess.check_output(
            ['node', os.path.join(HERE, 'app_reference.mjs'), app_core], cwd=ROOT))
        rows = []
        for r in ref:
            v = r['mass_g'] / 1000 / RHO
            mine = cook_time(ser, v, r['start_C'], r['level'], app=True)
            minc = white_floor(ser, v, r['start_C'], app=True)
            rows.append([r['mass_g'], r['start_C'], r['level'], r['cook_s'], mine,
                         r['minCook_s'], minc])
        res['verify_pipeline'] = rows
        worst = max(max(abs(a[3] - a[4]), abs(a[5] - a[6])) for a in rows)
        log('pipeline vs app solveCookTime: worst |diff| = %.3f s' % worst)

    # FE sphere through the pipeline vs the series through it: the FE's error
    # in cook-time units.
    fe_err = []
    for m in masses:
        v = m / RHO
        for st in starts:
            for name, lv in LEVELS:
                a = cook_time(ser, v, st, lv)
                b = cook_time(sph, v, st, lv)
                fe_err.append([m * 1000, st, name, a, b])
    res['verify_fe_cook'] = fe_err
    log('FE sphere cook times vs series: worst %.3f s' % max(abs(r[3] - r[4]) for r in fe_err))

    # ---- 3. the shapes
    qs = [1.25, 1.30, 1.35, 1.40, 1.45]
    shapes = [('ovoid', q, KV_APP) for q in qs] + [('spheroid', q, math.pi / 6) for q in qs]
    shapes += [('ovoid', Q_APP, 0.500), ('ovoid', Q_APP, 0.515), ('ovoid', Q_APP, 0.520)]
    buay_q = 0.02711 / 0.02122
    shapes += [('spheroid', buay_q, math.pi / 6), ('ovoid', buay_q, KV_APP)]
    models = {}
    for kind, q, kv in shapes:
        sh = ovoid(q, kv)
        sol = solve_step_response(sh, ns, nphi, dfo, fo_max)
        models[(kind, round(q, 4), round(kv, 4))] = Model(sh, sol)
        log('solved %s q=%.3f kv=%.4f w/L=%.4f zc/L=%.4f nodes=%d' % (
            kind, q, sh.kv, sh.w / q, sh.zc / q, sol['nodes']))

    def model(kind, q, kv):
        return models[(kind, round(q, 4), round(kv, 4))]

    shape_rows = []
    for (kind, q, kv), mo in models.items():
        sh = mo.shape
        v = sh.volume
        a = sh.area()
        r_eq = eq_radius_m(v)
        shape_rows.append({
            'kind': kind, 'q': q, 'kv': sh.kv, 'SI': 100 / q, 'w_over_L': sh.w / q,
            'zc_over_L': sh.zc / q,
            'Req_over_B': r_eq, 'R3VA_over_B': 3 * v / a, 'Rb_over_B': 0.5,
            # the slowest point on the axis: where U lags most at Fo = 0.15
            'slowest_axis_z_over_Req': float(mo.sol['axis_z'][1 + np.argmin(
                mo.sol['axis_U'][int(0.15 / dfo), 1:-1])]),
        })
    res['shapes'] = shape_rows

    # 3a. centre time to temperature, pure clamp at 100 C, fixed mass
    ttc = []
    for m in masses:
        v = m / RHO
        tau = eq_radius_m(v) ** 2 / ALPHA
        for st in starts:
            for tc in (63.0, 70.0, 85.0):
                frac = (tc - st) / (BOIL - st)
                row = {'mass_g': m * 1000, 'start': st, 'Tc': tc,
                       'sphere_eqV': time_to_centre(fo, exact, tau, frac)}
                for kind, q, kv in [('ovoid', q, KV_APP) for q in qs] + [('spheroid', 1.35, math.pi / 6)]:
                    mo = model(kind, q, kv)
                    row['%s_%.2f' % (kind, q)] = time_to_centre(
                        fo, mo.sol['axis_U'][:, mo.sol['centre_col']], tau, frac)
                ttc.append(row)
    res['time_to_centre'] = ttc
    log('time to centre done')

    # 3b. cook times (yolk dose) at fixed mass: ovoid/spheroid vs the spheres
    fixed_mass = []
    for m in masses:
        v = m / RHO
        for st in starts:
            for name, lv in LEVELS:
                row = {'mass_g': m * 1000, 'start': st, 'level': name,
                       'app_sphere': cook_time(ser, v, st, lv)}
                for kind, q, kv in shapes:
                    if abs(q - buay_q) < 1e-6:
                        continue
                    row['%s_%.2f_%.3f' % (kind, q, kv)] = cook_time(model(kind, q, kv), v, st, lv)
                # comparator spheres for each shape at this mass: radius B/2,
                # and the radius 3V/A that keeps surface-to-volume (Buay's)
                for kind, q, kv in shapes[:10]:
                    sh = model(kind, q, kv).shape
                    b = (v / (sh.kv * q)) ** (1 / 3)
                    r_3va = 3 * v / (sh.area() * b * b)     # area() is at B = 1
                    for tag, rr in (('B2', b / 2), ('3VA', r_3va)):
                        vv = 4 / 3 * math.pi * rr ** 3
                        row['sphere%s_%s_%.2f' % (tag, kind, q)] = _sphere_time(ser, vv, st, lv, m)
                fixed_mass.append(row)
            log('fixed mass %g g start %g done' % (m * 1000, st))
    res['fixed_mass'] = fixed_mass

    # 3c. white floor (the shortest cook that sets the innermost white), at
    # each of the yolk boundary's two poles and its equator separately
    wf = []
    for m in masses:
        v = m / RHO
        for st in starts:
            row = {'mass_g': m * 1000, 'start': st, 'app_sphere': white_floor(ser, v, st)}
            for kind, q, kv in shapes[:10]:
                mo = model(kind, q, kv)
                pts = mo.white_points(v)
                for tag, pt in zip(('pointed', 'blunt', 'equator'), pts):
                    c = Cook([pt], st, m, Z_WHITE, TREF_WHITE)
                    row['%s_%.2f_%s' % (kind, q, tag)] = c.solve(WHITE_TARGET)
            wf.append(row)
    res['white_floor'] = wf
    log('white floor done')

    # 3d. fixed minor diameter B: what the ruler path (R = 0.5477 B) asks for
    fixed_b = []
    for b_mm in (40.0, 43.4, 46.0):
        b = b_mm / 1000
        v_app = KV_APP * Q_APP * b ** 3
        for st in starts:
            for name, lv in LEVELS:
                row = {'B_mm': b_mm, 'start': st, 'level': name,
                       'app_ruler': cook_time(ser, v_app, st, lv)}
                for kind, q, kv in shapes[:10]:
                    mo = model(kind, q, kv)
                    v = mo.shape.kv * q * b ** 3
                    row['%s_%.2f' % (kind, q)] = cook_time(mo, v, st, lv)
                    row['mass_g_%s_%.2f' % (kind, q)] = v * RHO * 1000
                    row['sphereEqV_%s_%.2f' % (kind, q)] = cook_time(ser, v, st, lv)
                fixed_b.append(row)
    res['fixed_B'] = fixed_b
    log('fixed B done')

    # 3d'. what the inputs' own errors cost, on the app's sphere: a kitchen
    # scale read to +-0.5 g, a ruler read to +-0.5 and +-1 mm
    meas = []
    for m in masses:
        v = m / RHO
        b = (v / (KV_APP * Q_APP)) ** (1 / 3)
        for st in starts:
            for name, lv in LEVELS:
                row = {'mass_g': m * 1000, 'B_mm': b * 1000, 'start': st, 'level': name,
                       'base': cook_time(ser, v, st, lv)}
                for dm in (-0.5, 0.5):
                    vv = (m + dm / 1000) / RHO
                    row['mass%+.1fg' % dm] = _sphere_time(ser, vv, st, lv, m)
                for db in (-1.0, -0.5, 0.5, 1.0):
                    vv = KV_APP * Q_APP * (b + db / 1000) ** 3
                    row['B%+.1fmm' % db] = _sphere_time(ser, vv, st, lv, m)
                meas.append(row)
    res['measurement'] = meas
    log('measurement errors done')

    # 3e. the yolk off the centroid: dose along the axis at the jammy pull
    off = []
    for q in (1.25, 1.35, 1.45):
        mo = model('ovoid', q, KV_APP)
        v = 0.062 / RHO
        pull = cook_time(mo, v, 4.0, ANCHORS['jammy'])
        tau = mo.tau(v)
        for zeta in (-0.3, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3):
            pt = Point(fo, mo.axis_point(zeta), tau)
            c = Cook([pt], 4.0, 0.062, Z_YOLK, TREF_YOLK)
            off.append({'q': q, 'zeta_over_Req': zeta,
                        'mm': zeta * eq_radius_m(v) * 1000,
                        'cook_s': c.solve(yolk_target(ANCHORS['jammy'])), 'centroid_cook_s': pull})
    res['off_centre'] = off
    log('off-centre done')

    # ---- 4. Buay et al. (2006): a 27.11 x 21.22 mm (semi-axes) egg, 25.8 C
    # into 100.5 C, centre to 85 C, measured 750 s.
    a_m, b_m = 0.02711, 0.02122
    frac = (85.0 - 25.8) / (100.5 - 25.8)
    v_sph = 4 / 3 * math.pi * a_m * b_m * b_m
    buay = {'measured': 750.0, 'app_sphere': time_to_centre(fo, exact, eq_radius_m(v_sph) ** 2 / ALPHA, frac)}
    mo = model('spheroid', buay_q, math.pi / 6)
    buay['spheroid'] = time_to_centre(fo, mo.sol['axis_U'][:, mo.sol['centre_col']],
                                      eq_radius_m(v_sph) ** 2 / ALPHA, frac)
    mo = model('ovoid', buay_q, KV_APP)
    v_ov = KV_APP * (2 * a_m) * (2 * b_m) ** 2
    buay['ovoid_same_LB'] = time_to_centre(fo, mo.sol['axis_U'][:, mo.sol['centre_col']],
                                           eq_radius_m(v_ov) ** 2 / ALPHA, frac)
    buay['alpha_for_750_spheroid'] = ALPHA * buay['spheroid'] / 750.0
    buay['alpha_for_750_sphere'] = ALPHA * buay['app_sphere'] / 750.0
    res['buay'] = buay
    log('Buay:', json.dumps(buay))

    with open(os.path.join(HERE, 'results.json' if not quick else 'results-quick.json'), 'w') as f:
        json.dump(res, f, indent=1, default=float)
    log('wrote results')


def _sphere_time(ser, vv, st, lv, mass_kg):
    """A comparator sphere of volume vv, but with the real egg's mass for the
    water's dip, so only the conduction radius differs."""
    c = Cook([ser.centre(vv)], st, mass_kg, Z_YOLK, TREF_YOLK)
    return c.solve(yolk_target(lv))


if __name__ == '__main__':
    main()
