import SwiftUI
import EggTimerCore

/// A section of Help, which the low-odds link can open at.
enum HelpSection: String, CaseIterable, Hashable, Identifiable {
    case how, learn, reliable, odds, unsure, sources
    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .how: "help.how.title"
        case .learn: "help.learn.title"
        case .reliable: "help.reliable.title"
        case .odds: "help.odds.title"
        case .unsure: "help.unsure.title"
        case .sources: "help.sources.title"
        }
    }
}

/// Help: the whole story, opened on purpose (UI.md section 7), the web's
/// `#help` section for section and key for key. One control's meaning is its
/// (i); this is everything around it. Each section is a short gist, then a
/// smaller aside that names the method and links it.
struct HelpView: View {
    let planner: Planner
    /// Where to open: the low-odds link opens at the reliability section,
    /// whose top lists the changes that would help the setup on screen.
    var start: HelpSection?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    motto
                    contents(proxy)
                    how.id(HelpSection.how)
                    learn.id(HelpSection.learn)
                    reliable.id(HelpSection.reliable)
                    odds.id(HelpSection.odds)
                    unsure.id(HelpSection.unsure)
                    sources.id(HelpSection.sources)
                    privacy
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onAppear {
                if let start { proxy.scrollTo(start, anchor: .top) }
            }
        }
        .tint(.primary)
        .navigationTitle(tr("help.title"))
        .navigationBarTitleDisplayMode(.inline)
    }

    /// The table of contents: each title, scrolling to its section.
    private func contents(_ proxy: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(HelpSection.allCases) { section in
                Button(tr(section.titleKey)) {
                    withAnimation { proxy.scrollTo(section, anchor: .top) }
                }
                .tint(Palette.accent)
            }
        }
        .font(.subheadline.weight(.medium))
    }

    private var how: some View {
        section(.how) {
            para(tr("help.how.p1"))
            aside(tr("help.how.aside"))
            para(tr("help.how.p2"))
            aside(tr("help.how.aside2"))
        }
    }

    private var learn: some View {
        section(.learn) {
            para(tr("help.learn.p1"))
            aside(tr("help.learn.aside"))
        }
    }

    private var reliable: some View {
        section(.reliable) {
            para(tr("help.reliable.intro"))
            // Under low odds: the changes that would help the setup on
            // screen, from `protocolAdvice` in the core's Reach.swift - the
            // same list the web shows here.
            if !planner.advice.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    subhead(tr("help.reliable.forYou"))
                    ForEach(planner.advice, id: \.self) { key in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(verbatim: "•")
                            Text(tr(key)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(12)
                .background(Palette.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
            }
            subhead(tr("help.reliable.every.title"))
            para(tr("help.reliable.every"))
            subhead(tr("help.reliable.hot.title"))
            para(tr("help.reliable.hot"))
            subhead(tr("help.reliable.cold.title"))
            para(tr("help.reliable.cold"))
            subhead(tr("help.reliable.heatOff.title"))
            para(tr("help.reliable.heatOff"))
            subhead(tr("help.reliable.cooling.title"))
            para(tr("help.reliable.cooling"))
        }
    }

    private var odds: some View {
        section(.odds) {
            para(tr("help.odds.p1"))
            aside(tr("help.odds.aside"))
        }
    }

    private var unsure: some View {
        section(.unsure) {
            para(tr("help.unsure.counter"))
            para(tr("help.unsure.heatOff"))
            para(tr("help.unsure.white"))
            para(tr("help.unsure.sousVide", ["floor": .text(planner.show(.temperature, sousVideModelFloorC))]))
        }
    }

    /// As README.md section 10 and references.bib give them, and as the web
    /// links them; nothing else.
    private var sources: some View {
        section(.sources) {
            para(tr("help.sources.intro"))
            VStack(alignment: .leading, spacing: 10) {
                source("help.source.williams", "https://newton.ex.ac.uk/teaching/CDHW/egg/")
                source("help.source.buay", "https://doi.org/10.1088/0143-0807/27/1/013")
                source("help.source.abbasnezhad", "https://doi.org/10.1002/fsn3.257")
                source("help.source.denys", "https://doi.org/10.1016/j.jfoodeng.2003.06.002")
                source("help.source.vega", "https://doi.org/10.1007/s11483-010-9200-1")
                source("help.source.weijers", "https://doi.org/10.1110/ps.03242803")
                source("help.source.hoyt", "https://academic.oup.com/auk/article-pdf/96/1/73/32910692/auk0073.pdf")
                source("help.source.usda", "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/high-altitude-cooking")
            }
        }
    }

    /// The last thing on the page, as on the web: the privacy page, which
    /// lives on the web app's site (privacy/index.html), plain English and
    /// outside the catalogue. `Link` hands it to Safari; the app itself still
    /// makes no network request.
    private var privacy: some View {
        VStack(alignment: .leading, spacing: 0) {
            Divider()
            Link(destination: Self.privacyURL) {
                Text(tr("help.privacy"))
                    .font(.subheadline.weight(.semibold))
                    .underline()
            }
            .tint(Palette.accent)
            .padding(.top, 14)
            // Who made it, as on the web: the name links the owner's blog,
            // which `linked` hands to Safari like Help's other links.
            Text(linked(tr("help.credit")))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.top, 10)
        }
    }

    /// The motto, under the title, as on the web.
    private var motto: some View {
        Text(tr("help.motto"))
            .font(.subheadline.italic())
            .foregroundStyle(.secondary)
            .padding(.bottom, -12)
    }

    private static let privacyURL = URL(string: "https://actualeggtimer.netlify.app/privacy")!

    // MARK: - Pieces

    private func section<Content: View>(
        _ which: HelpSection, @ViewBuilder _ content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(tr(which.titleKey))
                .font(.title3.weight(.semibold))
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func subhead(_ text: String) -> some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .padding(.top, 4)
            .accessibilityAddTraits(.isHeader)
    }

    /// A paragraph, its links tappable.
    private func para(_ text: String) -> some View {
        Text(linked(text))
            .fixedSize(horizontal: false, vertical: true)
    }

    /// The technical aside: smaller and secondary, as the web's `p.aside`.
    private func aside(_ text: String) -> some View {
        Text(linked(text))
            .font(.footnote)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func source(_ key: String, _ url: String) -> some View {
        Link(destination: URL(string: url)!) {
            Text(tr(key))
                .font(.footnote)
                .underline()
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
