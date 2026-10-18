import SwiftUI
import EggTimerCopy
import EggTimerShared

/// The (i), one component everywhere (UI.md sections 4 and 7): a circled *i*
/// beside a short label, which opens a paragraph in place, under the line it
/// sits on. No sheet, no popover, no triangle, no second kind of disclosure.
///
/// `InfoRow` is the whole of it: the line, its (i), and what the (i) opens.
/// `InfoButton` and `MoreText` are its two halves, for the one place the
/// paragraph has to go somewhere other than straight under the line (the
/// setup panels, where the title row also holds Done).
struct InfoRow<Label: View, Trailing: View>: View {
    /// What VoiceOver calls the (i): "About {label}", or a name of its own.
    let name: String
    /// What it opens, one paragraph per entry.
    let more: [String]
    /// Where the line sits: leading in a list, centred under the time.
    var alignment: HorizontalAlignment = .leading
    let label: () -> Label
    /// The control, at the end of the line, when the line has one: a
    /// stepper's value and its buttons.
    let trailing: () -> Trailing
    @State private var expanded = false
    @Environment(\.dynamicTypeSize) private var size

    init(
        name: String, more: [String], alignment: HorizontalAlignment = .leading,
        @ViewBuilder label: @escaping () -> Label, @ViewBuilder trailing: @escaping () -> Trailing
    ) {
        self.name = name
        self.more = more
        self.alignment = alignment
        self.label = label
        self.trailing = trailing
    }

    var body: some View {
        // At the accessibility sizes the control goes to a line of its own,
        // at the end: beside it the label was left a column so narrow that
        // "Number of eggs" broke inside a word.
        let below = Trailing.self != EmptyView.self && size.isAccessibilitySize
        VStack(alignment: alignment, spacing: 0) {
            HStack(alignment: .center, spacing: 2) {
                label()
                InfoButton(expanded: $expanded, name: name)
                if Trailing.self != EmptyView.self && !below {
                    Spacer(minLength: 8)
                    trailing()
                }
            }
            if below {
                HStack {
                    Spacer(minLength: 0)
                    trailing()
                }
                .padding(.top, 4)
            }
            if expanded {
                MoreText(more)
                    .padding(.top, 4)
                    .transition(.opacity)
            }
        }
    }
}

extension InfoRow where Trailing == EmptyView {
    init(
        name: String, more: [String], alignment: HorizontalAlignment = .leading,
        @ViewBuilder label: @escaping () -> Label
    ) {
        self.init(name: name, more: more, alignment: alignment, label: label, trailing: { EmptyView() })
    }
}

extension InfoRow where Label == Text, Trailing == EmptyView {
    /// The common case: a label from the catalogue, named "About {label}".
    init(_ labelKey: CopyKey, more: [String]) {
        self.init(name: about(labelKey), more: more) {
            Text(tr(labelKey))
        }
    }
}

extension InfoRow where Label == Text {
    /// A catalogue label with its control at the end of the line.
    init(_ labelKey: CopyKey, more: [String], @ViewBuilder trailing: @escaping () -> Trailing) {
        self.init(name: about(labelKey), more: more, label: { Text(tr(labelKey)) }, trailing: trailing)
    }
}

/// "About {label}": the (i)'s name when its control's label reads inside it.
func about(_ labelKey: CopyKey) -> String {
    tr(.`more.about`, ["label": .text(tr(labelKey))])
}

/// The circled *i*. A thumb's hit area around a small circle; filled while
/// what it opens is open, as the web's is. VoiceOver reads its name and
/// whether it is expanded. The circle grows with the text, and its frame
/// with it: a fixed frame let the large circle spill over the last letter of
/// the label beside it.
struct InfoButton: View {
    @Binding var expanded: Bool
    let name: String

    var body: some View {
        Button {
            withAnimation(.snappy) { expanded.toggle() }
        } label: {
            Image(systemName: expanded ? "info.circle.fill" : "info.circle")
                .font(.body)
                .padding(.horizontal, 4)
                .frame(minWidth: 36, minHeight: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(expanded ? Color.primary : Color.secondary)
        .accessibilityLabel(name)
        .accessibilityValue(tr(expanded ? .`more.expanded` : .`more.collapsed`))
    }
}

/// What an (i) opens: the web's `.disclosed`, a paragraph set off by a rule
/// down its left edge. Catalogue links (`[label](https://…)`) are tappable.
struct MoreText: View {
    let paragraphs: [String]

    init(_ paragraphs: [String]) { self.paragraphs = paragraphs }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(paragraphs, id: \.self) { p in
                Text(linked(p))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .appFont(.footnote)
        .foregroundStyle(.primary)
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(Color.primary.opacity(0.05), in: UnevenRoundedRectangle(
            bottomTrailingRadius: 8, topTrailingRadius: 8
        ))
        .overlay(alignment: .leading) {
            Rectangle().fill(Color.secondary.opacity(0.4)).frame(width: 3)
        }
    }
}

/// A catalogue text whose `[label](https://…)` pieces become links, and
/// everything else plain text: the web's `data-copy-links` rule
/// (src/ui/copy.ts). Nothing else is parsed, so a `*` or an `_` in the copy
/// stays a character, and only https is linked; anything else stays as
/// written.
func linked(_ text: String) -> AttributedString {
    let link = /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/
    var out = AttributedString()
    var rest = Substring(text)
    while let m = rest.firstMatch(of: link) {
        out += AttributedString(String(rest[..<m.range.lowerBound]))
        var piece = AttributedString(String(m.1))
        if let url = URL(string: String(m.2)), url.scheme == "https" {
            piece.link = url
            piece.underlineStyle = .single
        }
        out += piece
        rest = rest[m.range.upperBound...]
    }
    out += AttributedString(String(rest))
    return out
}
