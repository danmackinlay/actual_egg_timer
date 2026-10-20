import SwiftUI
import EggTimerCore
import EggTimerCopy
import EggTimerApp
import EggTimerShared

/// Where the egg screen can push to: Settings, and Help, at a section or at
/// the top.
enum Route: Hashable {
    case settings
    case help(HelpSection?)
}

/// The egg: the web's one screen (UI.md section 3), the same in every phase,
/// and the phase machine that runs it.
///
/// One layout from idle to Done, top to bottom: the time, with the line
/// under it and how sure I am; the hint and the action, with Cancel while a
/// cook runs; the doneness slider; the egg in cross-section beside the setup
/// sentence, whose clauses open their choices in place under both; one slot
/// for the longer line; and at Done the questions after an egg. At the start
/// nothing moves and nothing goes: only the readout's words and the buttons
/// change. Settings and Help are rare visits, so they sit in the bar at the
/// top, out of the thumb's way.
struct ContentView: View {
    @State private var model = AppModel()
    @State private var path: [Route] = []
    /// The clause whose choice is open under the sentence, if any. One at a
    /// time.
    @State private var openClause: Clause?
    /// The clause the cook has just opened, whose panel is scrolled into view
    /// once it is laid out (`reveal`). Never one opened otherwise, by a
    /// launch argument.
    @State private var revealing: Clause?
    /// Where the screen shows the page, in the window: the scroll view's
    /// frame, between the bars.
    @State private var screen: CGRect = .zero
    /// Half the slider's thumb, pt, as the slider reports it.
    @State private var thumbInset: CGFloat = 14
    /// Whether the certainty line under the time is open.
    @State private var certaintyOpen = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var planner: Planner { model.planner }
    private var cook: Cook { model.cook }

    var body: some View {
        // One clock read for everything outside the timelines. `cook.phase(at:)`
        // takes the instant rather than sampling the clock itself, so a phase
        // boundary cannot land between two reads and leave the label describing
        // one phase while the button below it describes the next.
        let outerPhase = cook.phase(atS: AppClock.now.timeIntervalSince1970)
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
                // The web's spacing at a phone's width (styles.css: `main`,
                // `#actions`, `#controls`), so what is under the sentence
                // is as near the top as there.
                VStack(spacing: 18) {
                    // In every phase, so nothing moves at the start.
                    if period { titlePage }
                    // The readout and the action are functions of the CLOCK,
                    // not of any stored property, so nothing the observation
                    // system watches ever changes while a cook counts down.
                    // TimelineView is what redraws them: it asks for a new body
                    // once a `tick`, and hands over the date it drew for -
                    // which is the date the phase is computed from.
                    // The action sits directly under the time it runs, in
                    // every phase, and holds its room (`PhaseActions`), so
                    // the slider and the sentence stay put as its buttons
                    // come and go.
                    TimelineView(.periodic(from: AppClock.system, by: every)) { context in
                        let now = moment(context.date)
                        let phase = cook.phase(atS: now.timeIntervalSince1970)
                        let said = sousVideAt(now, sousVide, phase: phase)
                        VStack(spacing: 14) {
                            ReadoutView(
                                model: model, phase: phase, now: now,
                                sousVide: said,
                                certaintyOpen: $certaintyOpen
                            )
                            PhaseActions(model: model, phase: phase, now: now, sousVide: said)
                        }
                    }
                    .id(tick)
                    DonenessControl(model: model, phase: outerPhase, thumbInset: $thumbInset)
                    // The reader scrolls the page to an opened panel.
                    ScrollViewReader { proxy in
                        setup(phase: outerPhase, every: every, tick: tick, proxy: proxy)
                    }
                    TimelineView(.periodic(from: AppClock.system, by: every)) { context in
                        let now = moment(context.date)
                        let phase = cook.phase(atS: now.timeIntervalSince1970)
                        VStack(spacing: 18) {
                            PhaseSlot(model: model, phase: phase, sousVide: sousVideAt(now, sousVide, phase: phase))
                            // Inside the TimelineView for the same reason as
                            // the readout: reaching DONE changes no stored
                            // property, so nothing outside would redraw and
                            // the question would never appear. At Done the
                            // questions end the page.
                            if phase == .done { FeedbackPanel(model: model) }
                        }
                    }
                    .id(tick)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 20)
            }
            .defaultScrollAnchor(scrollAnchor)
            // What the screen shows of the page, for `reveal`.
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { screen = $0 }
            .barTitle(tr(.`app.name`))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // In every phase: Settings' altitude corrects a running cook.
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink(value: Route.settings) { Text(tr(.`controls.settings`)).barItem() }
                        .accessibilityIdentifier("bar.settings")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(value: Route.help(nil)) { Text(tr(.`help.link`)).barItem() }
                        .accessibilityIdentifier("bar.help")
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .settings:
                    SettingsView(
                        planner: planner, cooking: cook.running != nil, eggOpen: cook.eggOpen(atS: AppClock.nowS)
                    )
                case .help(let section): HelpView(planner: planner, start: section)
                }
            }
        }
        // While a cook runs, a − or + is a finger down and up on its group,
        // and a control of no group is another control used (`InHand`), here
        // and in Settings.
        .environment(\.editGesture, EditGesture(
            touch: { group, down in
                if down { model.inHand.fingerDown(group) } else { model.inHand.fingerUp() }
            },
            used: { model.inHand.moveOn($0) }
        ))
        // The pull brings the egg's page back, from Settings or Help.
        .onChange(of: bringsEggBack(outerPhase)) { _, back in
            if back { path = [] }
        }
        #if DEBUG
        // A step's `idle` waits for the page drawn again (DebugLog.swift).
        .onChange(of: DebugLog.probe.drawn) { DebugLog.drawn() }
        #endif
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
        // Leaving the screen: a change in hand is committed, the web's
        // `pagehide`. Back in the foreground: a cook no longer open is ended
        // first, so its egg is final before sharing sends what it owes, the
        // web's "online".
        .onChange(of: scenePhase) { _, now in
            guard now == .active else {
                model.inHand.leaving()
                return
            }
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

    /// A timeline's date in cook time. A debug build reads the probe a
    /// step's `idle` draws the page again with, so that the timelines draw a
    /// frozen clock's new moment at once (`DebugLog.idle(after:)`).
    private func moment(_ date: Date) -> Date {
        #if DEBUG
        _ = DebugLog.probe.drawn
        #endif
        return AppClock.app(date)
    }

    /// Where the page holds its scroll, as it opens and as it grows: at its
    /// foot for a debug build launched `-uiScreen end` (DebugLog.swift), so
    /// the questions Done adds are in the picture; the system's otherwise.
    private var scrollAnchor: UnitPoint? {
        #if DEBUG
        DebugLog.scene == "end" ? .bottom : nil
        #else
        nil
        #endif
    }

    #if DEBUG
    /// The screen a debug build was launched onto (DebugLog.swift).
    private func showScreenshotScene() {
        // What a step's `idle` waits on.
        DebugLog.watch(model)
        guard let scene = DebugLog.scene else { return }
        switch scene {
        case "settings": path = [.settings]
        case "help": path = [.help(nil)]
        case "help-reliable": path = [.help(.reliable)]
        case "certainty-open": certaintyOpen = true
        case "heating":
            guard cook.phase == .idle else { return }
            model.eggsIn()
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
        let title = tr(.`app.titlePage`)
        return Text(title)
            .appFont(.body, italic: true)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 8)
            .accessibilityLabel(withoutLongS(title.string))
            .accessibilityAddTraits(.isHeader)
    }

    // MARK: - The egg and the setup sentence

    /// The egg in cross-section and the setup sentence beside it, from the
    /// top, in every phase: the egg on the left costs
    /// the column no height of its own. Under both, the choice of the clause
    /// that is open. A clause the sentence no longer has - sous-vide drops
    /// two - closes with it. Sous-vide draws no egg: it starts no cook.
    private func setup(phase: Phase, every: TimeInterval, tick: TimeInterval, proxy: ScrollViewProxy) -> some View {
        let running = phase == .idle ? nil : cook.running
        let size = eggSize
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 14) {
                if running != nil || !planner.isSousVide {
                    TimelineView(.periodic(from: AppClock.system, by: every)) { context in
                        let now = moment(context.date)
                        EggSectionView(model: model, phase: cook.phase(atS: now.timeIntervalSince1970), now: now)
                    }
                    .id(tick)
                    .frame(width: size.width, height: size.height)
                }
                SetupSentence(planner: planner, open: openClause, onTap: tapped)
            }
            if let clause = openClause, !(planner.isSousVide && (clause == .from || clause == .cooling)) {
                ClausePanel(planner: planner, clause: clause, inHand: running == nil ? nil : model.inHand) {
                    withAnimation(.snappy) { openClause = nil }
                }
                .id(OpenPanel(clause: clause))
                // Its frame, for the UI tests: a group, so its controls keep
                // their own identifiers.
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("panel.\(clause.rawValue)")
                // The panel fades in on its own, and the page grows at once:
                // under an animation the scroll view would take in its new
                // height only once the animation ended, and the scroll to a
                // panel just opened (`reveal`) would stop at the old foot.
                .transition(.opacity.animation(.snappy))
                // Laid out: the panel the cook has just opened scrolled into
                // view, once.
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
                    guard revealing == clause else { return }
                    revealing = nil
                    reveal(clause, at: frame, proxy)
                }
            }
        }
    }

    /// A clause pressed: another control than one with a change in hand,
    /// which commits it (`InHand.moveOn`); then its choice opened, or closed
    /// if it was the one open. A choice opened so, from none or from another
    /// clause, is scrolled into view once laid out (`reveal`); none is with
    /// a change still in hand.
    private func tapped(_ clause: Clause) {
        model.inHand.moveOn(.clause)
        let next: Clause? = openClause == clause ? nil : clause
        openClause = next
        revealing = model.inHand.pending ? nil : next
    }

    /// The panel just opened, at `frame` in the window, scrolled just far
    /// enough to be seen whole: its foot to the screen's. One already on
    /// screen does not move the page. One taller than the screen comes up
    /// with its head at the top, as much of it as fits. Only the page
    /// scrolls; nothing on it moves. In one step when the cook asks for less
    /// motion.
    private func reveal(_ clause: Clause, at frame: CGRect, _ proxy: ScrollViewProxy) {
        let anchor: UnitPoint
        if frame.height > screen.height || frame.minY < screen.minY {
            anchor = .top
        } else if frame.maxY > screen.maxY {
            anchor = .bottom
        } else {
            return DebugLog.log(.reveal(clause: clause.rawValue, scroll: "none"))
        }
        DebugLog.log(.reveal(clause: clause.rawValue, scroll: anchor == .top ? "top" : "bottom"))
        // On the next turn, once the scroll view has taken in the page grown
        // by the panel: in this pass it would stop the scroll at the old
        // page's foot.
        DispatchQueue.main.async {
            withAnimation(reduceMotion ? nil : .snappy) {
                proxy.scrollTo(OpenPanel(clause: clause), anchor: anchor)
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

/// The open panel's identity, which the page scrolls to (`reveal`): one for
/// each clause, so another clause's choice is drawn afresh.
private struct OpenPanel: Hashable {
    let clause: Clause
}

/// What the screen says, to the debug log, for the scripted checks
/// (`DebugLog.log`). A release build works none of it out and watches
/// nothing.
extension View {
    /// `event` to the debug log whenever it changes.
    func logged(_ event: @autoclosure () -> DebugLog.Event) -> some View {
        #if DEBUG
        onChange(of: event(), initial: true) { _, said in DebugLog.log(said) }
        #else
        self
        #endif
    }
}

#Preview {
    ContentView()
}
