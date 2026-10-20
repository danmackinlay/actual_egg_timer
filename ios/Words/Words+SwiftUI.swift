import SwiftUI
import EggTimerShared

// SwiftUI's own text calls, given `Words`: what `tr` renders, put on screen
// as it is, never looked up again in a strings table. Compiled into the app
// and the widget (project.yml), whose screens are SwiftUI; EggTimerShared,
// which makes `Words`, imports only Foundation and ActivityKit.
//
// A string literal in one of SwiftUI's own calls (`Text("…")`) is a
// `LocalizedStringKey`, which `npm run ios:build` refuses (tools/iosBuild.ts);
// what is not words is `Text(verbatim:)`.

extension Text {
    init(_ words: Words) { self.init(verbatim: words.string) }
}

extension View {
    func accessibilityLabel(_ words: Words) -> some View { accessibilityLabel(Text(words)) }
    func accessibilityValue(_ words: Words) -> some View { accessibilityValue(Text(words)) }
    func accessibilityHint(_ words: Words) -> some View { accessibilityHint(Text(words)) }
}

extension Button where Label == Text {
    init(_ words: Words, role: ButtonRole? = nil, action: @escaping () -> Void) {
        self.init(role: role, action: action) { Text(words) }
    }
}

extension Toggle where Label == Text {
    init(_ words: Words, isOn: Binding<Bool>) {
        self.init(isOn: isOn) { Text(words) }
    }
}

extension LabeledContent where Label == Text, Content: View {
    init(_ words: Words, @ViewBuilder content: () -> Content) {
        self.init(content: content) { Text(words) }
    }
}

extension Label where Title == Text, Icon == Image {
    init(_ words: Words, systemImage: String) {
        self.init { Text(words) } icon: { Image(systemName: systemImage) }
    }
}

extension Link where Label == Text {
    init(_ words: Words, destination: URL) {
        self.init(destination: destination) { Text(words) }
    }
}
