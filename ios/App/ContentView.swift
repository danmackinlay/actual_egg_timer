import SwiftUI
import EggTimerCore
import EggTimerCopy

/// Where the egg screen can push to: Settings, and Help, at a section or at
/// the top.
enum Route: Hashable {
    case settings
    case help(HelpSection?)
}

/// The egg: the web's layout (UI.md sections 3 and 8), and the phase machine
/// that runs it.
///
/// While idle, two controls and a sentence: the time, with the line under it;
/// the doneness slider; the setup sentence, whose clauses open their choices
/// in place; one slot for the longer line; and Start. Settings and Help are
/// rare visits, so they sit in the bar at the top, out of the thumb's way.
///
/// The controls disappear once a cook starts. Mid-cook they would be a lie -
/// the egg is already in the water and the answer is already fixed - and the
/// screen is better spent on the one number that matters.
struct ContentView: View {
    @State private var model = AppModel()
    @State private var path: [Route] = []
    /// The clause whose choice is open under the sentence, if any. One at a
    /// time.
    @State private var openClause: Clause?
    /// Half the slider's thumb, pt, as the slider reports it. Kept here rather
    /// than in the control, which leaves the screen while a cook runs, so the
    /// control comes back with the inset it had.
    @State private var thumbInset: CGFloat = 14
    /// Whether the direction's (i) is open.
    @State private var directionInfoOpen = false
    @Environment(\.scenePhase) private var scenePhase

    private var planner: Planner { model.planner }
    private var cook: Cook { model.cook }

    var body: some View {
        // One clock read for everything outside the timelines. `cook.phase(at:)`
        // takes the instant rather than sampling `Date.now` itself, so a phase
        // boundary cannot land between two reads and leave the label describing
        // one phase while the button below it describes the next.
        let outerPhase = cook.phase(at: .now)
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

        return NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 22) {
                    // A newer version has run on this phone, and this one
                    // leaves every store alone (`Stores`, DECISIONS.md 100):
                    // said first, before a setting is changed that will not
                    // be kept.
                    if Stores.readOnly { NewerNote() }
                    if outerPhase == .idle && period { titlePage }
                    // The readout and the action are functions of the CLOCK,
                    // not of any stored property, so nothing the observation
                    // system watches ever changes while a cook counts down.
                    // TimelineView is what redraws them: it asks for a new body
                    // once a `tick`, and hands over the date it drew for -
                    // which is the date the phase is computed from.
                    TimelineView(.periodic(from: .now, by: tick)) { context in
                        let phase = cook.phase(at: context.date)
                        ReadoutView(
                            model: model, phase: phase, now: context.date,
                            sousVide: sousVideAt(context.date, sousVide, phase: phase),
                            directionInfoOpen: $directionInfoOpen
                        )
                    }
                    .id(tick)
                    if outerPhase == .idle {
                        DonenessControl(planner: planner, thumbInset: $thumbInset)
                        setup
                    } else if let ticket = cook.ticket {
                        // The cook in the pan, where the controls were: the
                        // first thing under the time, and never pushed down
                        // by the probe offer or the two questions at Done.
                        // Beside it the egg in cross-section, which costs no
                        // height of its own (DECISIONS.md 52), on the clock
                        // as the readout is.
                        HStack(alignment: .center, spacing: 14) {
                            TimelineView(.periodic(from: .now, by: tick)) { context in
                                EggSectionView(
                                    cook: cook, ticket: ticket,
                                    calibration: planner.calibration, now: context.date
                                )
                            }
                            .id(tick)
                            .frame(width: 120, height: 156)
                            CookSentence(ticket: ticket, planner: planner)
                        }
                    }
                    TimelineView(.periodic(from: .now, by: tick)) { context in
                        let phase = cook.phase(at: context.date)
                        VStack(spacing: 18) {
                            PhaseActions(
                                model: model, phase: phase, now: context.date,
                                sousVide: sousVideAt(context.date, sousVide, phase: phase)
                            )
                            // Inside the TimelineView for the same reason as
                            // the readout: reaching DONE changes no stored
                            // property, so nothing outside would redraw and
                            // the question would never appear.
                            // Not while a newer build's results are left
                            // alone (`Stores`): no answer could be kept.
                            if phase == .done && !Stores.readOnly { FeedbackPanel(model: model) }
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
        // Back in the foreground: whatever sharing owes, the web's "online".
        .onChange(of: scenePhase) { _, now in
            if now == .active { Sharing.shared.resume() }
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
        guard let scene = Screenshots.scene else { return }
        switch scene {
        case "settings": path = [.settings]
        case "help": path = [.help(nil)]
        case "help-reliable": path = [.help(.reliable)]
        case "direction-info": directionInfoOpen = true
        case "heating":
            guard cook.phase == .idle else { return }
            model.eggsIn()
        case "done":
            guard cook.phase == .idle else { return }
            model.eggsIn()
            Task {
                // Once the cook has started, which waits on a solve.
                for _ in 0..<50 where cook.phase == .idle {
                    try? await Task.sleep(for: .milliseconds(200))
                }
                cook.skipToDone()
            }
        default:
            if scene.hasPrefix("clause-"), let clause = Clause(rawValue: String(scene.dropFirst(7))) {
                openClause = clause
            }
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

    // MARK: - The setup sentence

    /// The setup sentence, and under it the choice of the clause that is open.
    /// A clause the sentence no longer has - sous-vide drops two - closes with
    /// it.
    private var setup: some View {
        VStack(alignment: .leading, spacing: 10) {
            SetupSentence(planner: planner, open: $openClause)
            if let clause = openClause, !(planner.isSousVide && (clause == .from || clause == .cooling)) {
                ClausePanel(planner: planner, clause: clause) {
                    withAnimation(.snappy) { openClause = nil }
                }
                .id(clause)
                .transition(.opacity)
            }
        }
    }
}

#Preview {
    ContentView()
}

/// A newer version of the app has run on this phone, and this one leaves
/// every store alone (`Stores`, DECISIONS.md 100): the line that says so, at
/// the top of the egg screen and of Settings, in the warning's colour.
struct NewerNote: View {
    var body: some View {
        Text(tr("newer.note"))
            .appFont(.footnote)
            .foregroundStyle(.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}
