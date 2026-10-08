import SwiftUI
import EggTimerCore
import EggTimerCopy

/// Where the egg screen can push to: Settings, and Help, at a section or at
/// the top.
enum Route: Hashable {
    case settings
    case help(HelpSection?)
}

/// The egg: the web's one screen (UI.md section 3, design/one-screen.md
/// section 2), and the phase machine that runs it.
///
/// One layout from idle to Done, top to bottom: the time, with the line
/// under it and how sure I am; the doneness slider; the egg in cross-section
/// beside the setup sentence, whose clauses open their choices in place under
/// both; one slot for the longer line; and the action. At the start nothing
/// moves and nothing goes: only the readout's words and the buttons change.
/// Settings and Help are rare visits, so they sit in the bar at the top, out
/// of the thumb's way.
struct ContentView: View {
    @State private var model = AppModel()
    @State private var path: [Route] = []
    /// The clause whose choice is open under the sentence, if any. One at a
    /// time.
    @State private var openClause: Clause?
    /// Half the slider's thumb, pt, as the slider reports it.
    @State private var thumbInset: CGFloat = 14
    /// Whether the certainty line under the time is open.
    @State private var certaintyOpen = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var planner: Planner { model.planner }
    private var cook: Cook { model.cook }

    var body: some View {
        // One clock read for everything outside the timelines. `cook.phase(at:)`
        // takes the instant rather than sampling the clock itself, so a phase
        // boundary cannot land between two reads and leave the label describing
        // one phase while the button below it describes the next.
        let outerPhase = cook.phase(at: AppClock.now)
        // The English of 1750: read here, so this body depends on it and
        // a change of language redraws the page in place.
        let period = isPeriod(Copy.activeLocale)
        // The sous-vide estimate, once for the inputs as they stand: it is a
        // bisection, and nothing in it reads the clock. Nil for a pan.
        let sousVide = planner.isSousVide ? planner.sousVide : nil
        // How often the timelines redraw. Every second while a cook runs, and
        // in sous-vide, whose start time is read off the clock. The pan's idle
        // screen reads nothing off the clock at all - what it shows changes
        // only when an input or an answer does, and observation redraws it
        // then - so its once a minute is only a backstop. The period is also
        // the timelines' identity, so a change of it starts them afresh on the
        // new schedule with a fresh date, rather than on a date up to a minute old.
        let tick: TimeInterval = outerPhase == .idle && sousVide == nil ? 60 : 1
        // The timelines run on the system's clock; each date they hand over
        // is read in cook time (`AppClock`), which a debug build can run fast.
        let every = AppClock.period(tick)

        return NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 22) {
                    // In every phase, so nothing moves at the start.
                    if period { titlePage }
                    // The readout and the action are functions of the CLOCK,
                    // not of any stored property, so nothing the observation
                    // system watches ever changes while a cook counts down.
                    // TimelineView is what redraws them: it asks for a new body
                    // once a `tick`, and hands over the date it drew for -
                    // which is the date the phase is computed from.
                    TimelineView(.periodic(from: AppClock.system, by: every)) { context in
                        let now = AppClock.app(context.date)
                        let phase = cook.phase(at: now)
                        ReadoutView(
                            model: model, phase: phase, now: now,
                            sousVide: sousVideAt(now, sousVide, phase: phase),
                            certaintyOpen: $certaintyOpen
                        )
                    }
                    .id(tick)
                    DonenessControl(model: model, phase: outerPhase, thumbInset: $thumbInset)
                        // Not yet open to correction while a cook runs.
                        .disabled(outerPhase != .idle)
                        #if DEBUG
                        .logTop("slider")
                        #endif
                    setup(phase: outerPhase, every: every, tick: tick)
                    TimelineView(.periodic(from: AppClock.system, by: every)) { context in
                        let now = AppClock.app(context.date)
                        let phase = cook.phase(at: now)
                        VStack(spacing: 18) {
                            PhaseActions(
                                model: model, phase: phase, now: now,
                                sousVide: sousVideAt(now, sousVide, phase: phase)
                            )
                            // Inside the TimelineView for the same reason as
                            // the readout: reaching DONE changes no stored
                            // property, so nothing outside would redraw and
                            // the question would never appear.
                            if phase == .done { FeedbackPanel(model: model) }
                        }
                    }
                    .id(tick)
                }
                .padding(20)
            }
            .navigationTitle(tr("app.name"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // A running cook is always the egg, as on the web.
                if outerPhase == .idle {
                    ToolbarItem(placement: .topBarLeading) {
                        NavigationLink(value: Route.settings) { Text(tr("controls.settings")) }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: Route.help(nil)) { Text(tr("help.link")) }
                    }
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .settings: SettingsView(planner: planner)
                case .help(let section): HelpView(planner: planner, start: section)
                }
            }
        }
        // 1750 is set in its period face, as on the web (`PeriodFace`):
        // here for whatever sets no style of its own, and through
        // `appFont` for whatever does. The clock keeps its own face.
        .periodFace()
        .onAppear {
            model.appear()
            #if DEBUG
            showScreenshotScene()
            #endif
        }
        // Back in the foreground: a cook no longer open is ended first, so
        // its egg is final before sharing sends what it owes, the web's
        // "online".
        .onChange(of: scenePhase) { _, now in
            guard now == .active else { return }
            model.endIfNoLongerOpen()
            Sharing.shared.resume()
        }
    }

    /// What the sous-vide screen says at one tick of a timeline, once for
    /// everything in it: nil for a pan, and while a cook runs.
    private func sousVideAt(_ now: Date, _ estimate: SousVideEstimate?, phase: Phase) -> SousVideCopy? {
        guard phase == .idle, let estimate else { return nil }
        return sousVideCopy(estimate, now: now, units: planner.units)
    }

    #if DEBUG
    /// The screen a debug build was launched onto (Screenshots.swift).
    private func showScreenshotScene() {
        // The taps a script asked for, as each comes due.
        Screenshots.drive(model)
        // A cook restored at Done, answered as soon as asked: before its
        // pot's surface is built again, with `-uiAnswerAfter 0`.
        if Screenshots.scene != "done", cook.phase == .done, let answer = Screenshots.answer {
            Task {
                try? await Task.sleep(for: .seconds(Screenshots.answerAfter))
                model.answer(yolk: answer.yolk, white: answer.white)
            }
        }
        guard let scene = Screenshots.scene else { return }
        switch scene {
        case "settings": path = [.settings]
        case "help": path = [.help(nil)]
        case "help-reliable": path = [.help(.reliable)]
        case "certainty-open": certaintyOpen = true
        case "heating":
            guard cook.phase == .idle else { return }
            model.eggsIn()
            guard Screenshots.cookAgo > 0 else { return }
            Task {
                await startedCook()
                cook.moveBack(Screenshots.cookAgo)
            }
        case "done":
            guard cook.phase == .idle else { return }
            model.eggsIn()
            Task {
                await startedCook()
                cook.skipToDone(ago: Screenshots.doneAgo)
                guard let answer = Screenshots.answer else { return }
                try? await Task.sleep(for: .seconds(Screenshots.answerAfter))
                model.answer(yolk: answer.yolk, white: answer.white)
            }
        default:
            if scene.hasPrefix("clause-"), let clause = Clause(rawValue: String(scene.dropFirst(7))) {
                openClause = clause
            }
        }
    }

    /// Once the cook has started, which waits on a solve.
    private func startedCook() async {
        for _ in 0..<50 where cook.phase == .idle {
            try? await Task.sleep(for: .milliseconds(200))
        }
    }
    #endif

    // MARK: - The title page

    /// The egg's page in 1750 is headed by a title page after the
    /// Dictionary's, while idle (LANGUAGE.md section 6). The one place the
    /// long s is drawn; VoiceOver reads it without, since a screen reader
    /// would announce every one.
    private var titlePage: some View {
        let title = tr("app.titlePage")
        return Text(title)
            .appFont(.body, italic: true)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 8)
            .accessibilityLabel(withoutLongS(title))
            .accessibilityAddTraits(.isHeader)
    }

    // MARK: - The egg and the setup sentence

    /// The egg in cross-section and the setup sentence beside it, from the
    /// top, in every phase (DECISIONS.md 52, 91): the egg on the left costs
    /// the column no height of its own. Under both, the choice of the clause
    /// that is open. A clause the sentence no longer has - sous-vide drops
    /// two - closes with it. Sous-vide draws no egg: it starts no cook.
    private func setup(phase: Phase, every: TimeInterval, tick: TimeInterval) -> some View {
        let running = phase == .idle ? nil : cook.running
        let size = eggSize
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 14) {
                if let running, let plan = cook.plan {
                    TimelineView(.periodic(from: AppClock.system, by: every)) { context in
                        EggSectionView(
                            running: running, plan: plan,
                            calibration: planner.calibration, now: AppClock.app(context.date)
                        )
                    }
                    .id(tick)
                    .frame(width: size.width, height: size.height)
                    #if DEBUG
                    .logTop("egg")
                    #endif
                } else if !planner.isSousVide {
                    EggDrawing(view: nil)
                        .frame(width: size.width, height: size.height)
                        #if DEBUG
                        .logTop("egg")
                        #endif
                }
                SetupSentence(
                    planner: planner, open: $openClause, startedAt: running.map { Date(timeIntervalSince1970: $0.startedAtS) },
                    editable: phase == .idle
                )
                #if DEBUG
                .logTop("sentence")
                #endif
            }
            if let clause = openClause, phase == .idle,
               !(planner.isSousVide && (clause == .from || clause == .cooling)) {
                ClausePanel(planner: planner, clause: clause) {
                    withAnimation(.snappy) { openClause = nil }
                }
                .id(clause)
                .transition(.opacity)
            }
        }
    }

    /// The egg's drawing: 120 by 156 pt, a little smaller at the
    /// accessibility text sizes, so the sentence beside it keeps a column
    /// wide enough for its words.
    private var eggSize: CGSize {
        dynamicTypeSize.isAccessibilitySize ? CGSize(width: 84, height: 109) : CGSize(width: 120, height: 156)
    }
}

#if DEBUG
extension View {
    /// The view's top in the window, pt, to the debug log whenever it moves
    /// ("layout slider 312.0"): what the scripted checks read to see that
    /// nothing moves at the start.
    func logTop(_ name: String) -> some View {
        onGeometryChange(for: Double.self) { proxy in
            (proxy.frame(in: .global).minY * 2).rounded() / 2
        } action: { y in
            Screenshots.log("layout \(name) \(y)")
        }
    }
}
#endif

#Preview {
    ContentView()
}
