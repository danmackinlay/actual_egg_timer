import Foundation
import EggTimerApp
import EggTimerCore

// The debug log's events as the scenarios read them (`Screenshots.Event`):
// a field of a case, or nil for another case.

/// A plan as the checks read it: the deadlines, epoch s, exact; when the slow
/// hob lengthens it next; whether it asks if the eggs are still in the water,
/// and whether the egg is overdue.
struct Plan {
    let pull: Double
    let cooled: Double?
    let lengthened: Bool
    let surface: Bool
    let next: Double?
    let asking: Bool
    let overdue: Bool

    /// The cooling's end, which a plan made once the eggs are out always has.
    func cooledAt() throws -> Double {
        guard let cooled else { throw Stop("the plan has no cooling end") }
        return cooled
    }
}

extension Screenshots.Event {
    var phase: String? {
        guard case .phase(let p) = self else { return nil }
        return p
    }

    var plan: Plan? {
        guard case let .plan(pull, cooled, lengthened, surface, next, asking, overdue) = self else { return nil }
        return Plan(
            pull: pull, cooled: cooled, lengthened: lengthened, surface: surface, next: next, asking: asking,
            overdue: overdue
        )
    }

    /// A cook stored: the cook, in this build's format; `.some(nil)` for the
    /// cook cleared, or one in another format; nil for another event.
    var stored: StoredCook?? {
        guard case .stored(let value) = self else { return nil }
        guard let value else { return .some(nil) }
        struct Format: Decodable { let v: Int? }
        guard value.decoded(as: Format.self)?.v == StoreRegistry.cook.format else { return .some(nil) }
        return .some(value.decoded(as: StoredCook.self))
    }

    /// Whether this is a restore, picked up or dropped as too old.
    var isRestore: Bool {
        switch self {
        case .restore, .restoreTooOld: true
        default: false
        }
    }

    /// The phase a restore picked the cook up in, if it is one.
    var restoredPhase: String? {
        guard case .restore(let phase, _) = self else { return nil }
        return phase
    }

    var ring: String? {
        guard case .ring(let deadline) = self else { return nil }
        return deadline
    }
}

/// Whether this event is the phase, one of these.
func phaseIs(_ names: String...) -> (Screenshots.Event) -> Bool {
    { e in e.phase.map { names.contains($0) } ?? false }
}

/// The last plan logged in these lines, which there must be.
func planIn(_ lines: [Line]) throws -> Plan {
    guard let p = lines.last(where: { $0.event.plan != nil })?.event.plan else { throw Stop("no plan logged") }
    return p
}

/// The last cook stored in these lines: `.some(nil)` for none; nil if
/// nothing was stored.
func lastStored(_ lines: [Line]) -> StoredCook?? {
    lines.last(where: { $0.event.stored != nil })?.event.stored
}

/// The last cook stored in these lines, which there must be.
func storedIn(_ lines: [Line]) throws -> StoredCook {
    guard let stored = lastStored(lines), let cook = stored else { throw Stop("no cook stored") }
    return cook
}

/// The notifications as last scheduled, cancelled and scheduled again:
/// `["cook.pull": t, "cook.cool": t]` in cook time, exact.
func scheduled(_ lines: [Line]) -> [String: Double] {
    var now: [String: Double] = [:]
    for l in lines {
        if l.event == .alarmsCancelled { now = [:] }
        if case let .scheduled(id, at, _, _, _) = l.event { now[id] = at }
    }
    return now
}

/// The ids the last read-back found pending, sorted.
func pending(_ lines: [Line]) -> [String]? {
    for l in lines.reversed() {
        if case .pending(let alarms) = l.event { return alarms.map(\.id).sorted() }
    }
    return nil
}

/// The ids the last read-back found delivered and still shown.
func delivered(_ lines: [Line]) -> [String]? {
    for l in lines.reversed() {
        if case .delivered(let ids) = l.event { return ids }
    }
    return nil
}

/// The lines before the first that `test` holds of, or all of them.
func before(_ lines: [Line], _ test: (Screenshots.Event) -> Bool) -> [Line] {
    guard let i = lines.firstIndex(where: { test($0.event) }) else { return lines }
    return Array(lines[..<i])
}

/// Tolerances, s. A moment the clock was frozen at, or a tap a span after a
/// deadline, is exact: to a millisecond. A deadline planned again at a
/// relaunch, against the one planned before it, to the second (the plan is
/// remade from the stored cook, at another moment, before its surface is
/// built again). Neither depends on the machine: the clock does not move
/// while the app works.
let exact = 1e-3
let replan = 1.0

func near(_ a: Double?, _ b: Double?, _ tol: Double) -> Bool {
    guard let a, let b else { return false }
    return abs(a - b) <= tol
}

/// A moment as a failure message says it, from the run's first.
func plus(_ s: Double?, _ t0: Double) -> String {
    s.map { String(format: "+%.3f s", $0 - t0) } ?? "none"
}
