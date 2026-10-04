#!/usr/bin/env python3
"""Print the tables in RESULTS.md from results.json (and, if it is there,
results-quick.json for the mesh-convergence line).

    python3 tools/shape-study/report.py
"""

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, 'results.json')))
quick_path = os.path.join(HERE, 'results-quick.json')
rq = json.load(open(quick_path)) if os.path.exists(quick_path) else None
QS = [1.25, 1.30, 1.35, 1.40, 1.45]


def mmss(s):
    return '%d:%02d' % (int(s // 60), int(round(s % 60)) if round(s % 60) < 60 else 59)


def d(v, a):
    return '%+.1f s (%+.1f%%)' % (v - a, 100 * (v / a - 1))


def table(head, rows):
    print('| ' + ' | '.join(head) + ' |')
    print('|' + '|'.join(['---'] * len(head)) + '|')
    for row in rows:
        print('| ' + ' | '.join(str(c) for c in row) + ' |')
    print()


def fm(mass, start, level, src=r):
    for row in src['fixed_mass']:
        if row['mass_g'] == mass and row['start'] == start and row['level'] == level:
            return row
    raise KeyError((mass, start, level))


print('## Verification\n')
v = r['verify_sphere']
table(['check', 'value'], [
    ['FE mesh (radial x angular), nodes', '%d x %d, %d nodes, dFo = %g' % (r['mesh'][0], r['mesh'][1], v['nodes'], r['dfo'])],
    ['centre step response, max abs error vs exact (images) series', '%.1e (of a 0-1 response)' % v['max_abs_dU_centre']],
    ['yolk boundary x = 0.693, max abs error vs 400-term series (Fo > 0.005)', '%.1e' % v['max_abs_dU_yolk_boundary_fo_gt_0.005']],
] + [['Fo for the centre to go %s of the way: exact / FE' % k[6:],
      '%.5f / %.5f (%+.3f%%)' % tuple(v[k])] for k in ('fo_to_0.50', 'fo_to_0.75', 'fo_to_0.90')] + [
    ['app 40-mode series vs exact, Fo > 0.01', '%.0e' % v['series40_vs_images_after_fo_0.01']],
])
if 'verify_pipeline' in r:
    rows = r['verify_pipeline']
    worst = max(max(abs(a[3] - a[4]), abs(a[5] - a[6])) for a in rows)
    print('This script\'s protocol, dose and bisection, fed the app\'s own 40-mode series, '
          'against the app\'s `solveCookTime` (compiled `src/core`, `app_reference.mjs`): '
          '%d cases (50/62/75 g, 4/20 C, soft/jammy/hard, plus the white floor), worst '
          'difference %.3f s.\n' % (len(rows), worst))
    table(['g', 'start C', 'level', 'app cook s', 'this script s', 'app white floor s', 'this script s'],
          [[a[0], a[1], a[2], '%.2f' % a[3], '%.2f' % a[4], '%.2f' % a[5], '%.2f' % a[6]] for a in rows if a[0] == 62])
fe = r['verify_fe_cook']
print('The FE sphere through the same pipeline against the series sphere: worst cook-time '
      'difference %.2f s over %d cases.\n' % (max(abs(a[3] - a[4]) for a in fe), len(fe)))
if rq:
    worst = 0.0
    for row in r['fixed_mass']:
        rowq = fm(row['mass_g'], row['start'], row['level'], rq)
        for k in row:
            if k.startswith('ovoid') or k.startswith('spheroid'):
                worst = max(worst, abs((row[k] - row['app_sphere']) - (rowq[k] - rowq['app_sphere'])))
    print('Mesh convergence: halving the mesh (%d x %d, dFo %g) moves no shape difference in the '
          'fixed-mass table by more than %.2f s.\n' % (rq['mesh'][0], rq['mesh'][1], rq['dfo'], worst))

print('## Shapes\n')
table(['shape', 'L/B', 'SI', 'k_v = V/(L B^2)', 'w/L', 'centroid from mid-length, %L', 'R_eq/B', '(3V/A)/B', 'slowest axis point, R_eq'],
      [[s['kind'], '%.3f' % s['q'], '%.1f' % s['SI'], '%.4f' % s['kv'], '%.3f' % s['w_over_L'],
        '%+.1f' % (100 * s['zc_over_L']), '%.4f' % s['Req_over_B'], '%.4f' % s['R3VA_over_B'],
        '%+.3f' % s['slowest_axis_z_over_Req']] for s in r['shapes']])

print('## Fixed mass: cook time, true shape minus the app\'s equal-volume sphere\n')
for mass in (62.0,):
    for start in (4.0, 20.0):
        rows = []
        app = [fm(mass, start, lv)['app_sphere'] for lv in ('soft', 'jammy', 'hard')]
        rows.append(['app sphere'] + ['%.1f s (%s)' % (a, mmss(a)) for a in app])
        for kind, kv in (('ovoid', 0.510), ('spheroid', 0.524)):
            for q in QS:
                key = '%s_%.2f_%.3f' % (kind, q, kv)
                rows.append(['%s L/B %.2f' % (kind, q)] + [d(fm(mass, start, lv)[key], fm(mass, start, lv)['app_sphere']) for lv in ('soft', 'jammy', 'hard')])
        for kv in (0.500, 0.515, 0.520):
            key = 'ovoid_1.35_%.3f' % kv
            rows.append(['ovoid L/B 1.35, k_v %.3f' % kv] + [d(fm(mass, start, lv)[key], fm(mass, start, lv)['app_sphere']) for lv in ('soft', 'jammy', 'hard')])
        print('**%g g, from %g C**\n' % (mass, start))
        table(['egg', 'soft', 'jammy', 'hard'], rows)

print('**Jammy, every mass and start**\n')
rows = []
for mass in (50.0, 62.0, 75.0):
    for start in (4.0, 20.0):
        row = fm(mass, start, 'jammy')
        a = row['app_sphere']
        ov = [row['ovoid_%.2f_0.510' % q] - a for q in QS]
        sp = [row['spheroid_%.2f_0.524' % q] - a for q in QS]
        rows.append(['%g g, %g C' % (mass, start), '%.1f' % a,
                     '%+.1f (%+.1f%%)' % (ov[2], 100 * ov[2] / a), '%+.1f to %+.1f' % (ov[0], ov[-1]),
                     '%+.1f (%+.1f%%)' % (sp[2], 100 * sp[2] / a), '%+.1f to %+.1f' % (sp[0], sp[-1])])
table(['egg', 'app sphere s', 'ovoid 1.35', 'ovoid 1.25 to 1.45', 'spheroid 1.35', 'spheroid 1.25 to 1.45'], rows)

print('## Comparator spheres, 62 g from 4 C, jammy\n')
row = fm(62.0, 4.0, 'jammy')
a = row['app_sphere']
rows = []
for kind, kv in (('ovoid', 0.510), ('spheroid', 0.524)):
    for q in (1.25, 1.35, 1.45):
        true = row['%s_%.2f_%.3f' % (kind, q, kv)]
        rows.append(['%s %.2f' % (kind, q), '%.1f' % true, '%+.1f' % (a - true),
                     '%+.1f' % (row['sphereB2_%s_%.2f' % (kind, q)] - true),
                     '%+.1f' % (row['sphere3VA_%s_%.2f' % (kind, q)] - true)])
table(['egg', 'true cook s', 'equal-volume sphere minus true', 'radius B/2 minus true', 'radius 3V/A minus true'], rows)

print('## Centre time to temperature, pure clamp at 100 C (no dip, no pull), true shape vs equal-volume sphere\n')
rows = []
for row in r['time_to_centre']:
    if row['mass_g'] != 62.0:
        continue
    a = row['sphere_eqV']
    rows.append(['%g C -> %g C' % (row['start'], row['Tc']), '%.1f' % a] +
                ['%+.1f%%' % (100 * (row['ovoid_%.2f' % q] / a - 1)) for q in QS] +
                ['%+.1f%%' % (100 * (row['spheroid_1.35'] / a - 1))])
table(['62 g', 'sphere s'] + ['ovoid %.2f' % q for q in QS] + ['spheroid 1.35'], rows)

print('## Fixed minor diameter (the ruler path, R = 0.5477 B)\n')
for row in r['fixed_B']:
    if row['B_mm'] != 43.4 or row['level'] != 'jammy':
        continue
    a = row['app_ruler']
    rows = []
    for kind in ('ovoid', 'spheroid'):
        for q in QS:
            rows.append(['%s %.2f' % (kind, q), '%.1f' % row['mass_g_%s_%.2f' % (kind, q)],
                         '%.1f' % row['%s_%.2f' % (kind, q)], d(row['%s_%.2f' % (kind, q)], a),
                         d(row['sphereEqV_%s_%.2f' % (kind, q)], a)])
    print('**B = 43.4 mm, from %g C, jammy; the app asks for %.1f s**\n' % (row['start'], a))
    table(['egg', 'its mass g', 'true cook s', 'true minus app', 'its equal-volume sphere minus app'], rows)

print('## Measurement error on the app\'s sphere\n')
rows = []
for row in r['measurement']:
    if row['level'] != 'jammy':
        continue
    a = row['base']
    rows.append(['%g g (B %.1f mm), %g C' % (row['mass_g'], row['B_mm'], row['start']), '%.1f' % a,
                 '%+.1f / %+.1f' % (row['mass-0.5g'] - a, row['mass+0.5g'] - a),
                 '%+.1f / %+.1f' % (row['B-0.5mm'] - a, row['B+0.5mm'] - a),
                 '%+.1f / %+.1f' % (row['B-1.0mm'] - a, row['B+1.0mm'] - a)])
table(['jammy', 'cook s', 'mass -/+0.5 g', 'B -/+0.5 mm', 'B -/+1 mm'], rows)

print('## Yolk off the centroid (62 g ovoid, 4 C, jammy)\n')
rows = []
for q in (1.25, 1.35, 1.45):
    pts = [o for o in r['off_centre'] if o['q'] == q]
    c = pts[0]['centroid_cook_s']
    rows.append(['%.2f' % q, '%.1f' % c] + ['%+.1f' % (o['cook_s'] - c) for o in pts])
table(['L/B', 'centroid cook s'] + ['%+.1f mm' % o['mm'] for o in r['off_centre'][:7]], rows)

print('## White floor (shortest cook that sets the innermost white), 62 g\n')
for row in r['white_floor']:
    if row['mass_g'] != 62.0:
        continue
    a = row['app_sphere']
    rows = []
    for kind in ('ovoid', 'spheroid'):
        for q in (1.25, 1.35, 1.45):
            rows.append(['%s %.2f' % (kind, q)] + ['%+.1f' % (row['%s_%.2f_%s' % (kind, q, t)] - a) for t in ('equator', 'blunt', 'pointed')])
    print('**from %g C; the app\'s white floor %.1f s**\n' % (row['start'], a))
    table(['egg', 'at the yolk\'s equator', 'blunt-end pole', 'pointed-end pole'], rows)

print('## Buay et al. (2006)\n')
b = r['buay']
table(['model, alpha = %.2e' % r['alpha'], 'centre to 85 C', 'vs measured 750 s', 'alpha to hit 750 s'], [
    ['equal-volume sphere (the app)', '%.1f s' % b['app_sphere'], '%+.1f%%' % (100 * (b['app_sphere'] / 750 - 1)), '%.3e' % b['alpha_for_750_sphere']],
    ['prolate spheroid, their semi-axes', '%.1f s' % b['spheroid'], '%+.1f%%' % (100 * (b['spheroid'] / 750 - 1)), '%.3e' % b['alpha_for_750_spheroid']],
    ['ovoid k_v 0.51, same L and B', '%.1f s' % b['ovoid_same_LB'], '%+.1f%%' % (100 * (b['ovoid_same_LB'] / 750 - 1)), '%.3e' % (r['alpha'] * b['ovoid_same_LB'] / 750)],
])

# --- derived numbers for the answers
print('## Derived\n')
row = fm(62.0, 4.0, 'jammy')
a = row['app_sphere']
for kind, kv in (('ovoid', 0.510), ('spheroid', 0.524)):
    t = [row['%s_%.2f_%.3f' % (kind, q, kv)] for q in QS]
    slope = (t[-1] - t[0]) / (QS[-1] - QS[0])
    print('- %s: d(cook)/d(L/B) at fixed mass = %.1f s per unit L/B; sd for sd(L/B) = 0.05: %.1f s' % (kind, slope, abs(slope) * 0.05))
t = [row['ovoid_1.35_%.3f' % kv] for kv in (0.500, 0.510, 0.515, 0.520)]
print('- ovoid L/B 1.35: d(cook)/d(k_v) = %.1f s per 0.01 of k_v' % ((t[-1] - t[0]) / 2.0))
for db in (0.1, 0.5, 1.0):
    dq = 3 * 1.35 * db / 43.4
    print('- B read to +-%.1f mm on a 43.4 mm egg, with mass known: L/B to +-%.3f' % (db, dq))
