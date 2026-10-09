import CoreTransferable
import Foundation
import UniformTypeIdentifiers
import EggTimerApp

/// "Export my results" as the share sheet takes it: a file, written when the
/// cook picks where it goes, from what is stored then (DECISIONS.md 81). The
/// text is `Calibrations.exportText`, in EggTimerApp; the share sheet's side
/// of it is the app's.
struct ResultsExport: Transferable {
    let uid: String?
    let name: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .json) { item in
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(item.name)
            try Data(Calibrations.exportText(uid: item.uid).utf8).write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}
