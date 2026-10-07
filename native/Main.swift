import AppKit
import WebKit
import CoreText
import UniformTypeIdentifiers
import Darwin

private let productName = "Mori 蒙文书写"
private let maximumOpenBytes = 64 * 1024 * 1024
private let documentType = UTType(exportedAs: "com.mori.mongolian.document", conformingTo: .data)

private struct SmokeOptions {
    let report: URL
    let snapshot: URL?

    static func parse() throws -> SmokeOptions? {
        let arguments = Array(CommandLine.arguments.dropFirst())
        var report: URL?
        var snapshot: URL?
        var index = 0
        while index < arguments.count {
            let argument = arguments[index]
            if argument == "--smoke-test" || argument == "--snapshot" {
                guard index + 1 < arguments.count, !arguments[index + 1].hasPrefix("--") else {
                    throw ShellError.message("Missing path after " + argument)
                }
                let url = URL(fileURLWithPath: arguments[index + 1]).standardizedFileURL
                if argument == "--smoke-test" { report = url } else { snapshot = url }
                index += 2
            } else {
                index += 1
            }
        }
        guard let report else {
            if snapshot != nil { throw ShellError.message("--snapshot requires --smoke-test.") }
            return nil
        }
        guard snapshot != report else { throw ShellError.message("Report and snapshot paths must differ.") }
        return SmokeOptions(report: report, snapshot: snapshot)
    }
}

private enum ShellError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let message): return message }
    }
}

private func isBundledURL(_ url: URL, root: URL) -> Bool {
    guard url.isFileURL else { return false }
    let path = url.standardizedFileURL.resolvingSymlinksInPath().path
    let rootPath = root.standardizedFileURL.resolvingSymlinksInPath().path
    return path == rootPath || path.hasPrefix(rootPath + "/")
}

private enum DocxError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
}

private struct DocxTool { let path: String }

// LibreOffice is invoked as a separate process only. Nothing is linked or bundled,
// so its GPL-3.0 obligations do not extend to this application's MIT-licensed code.
private enum DocxSupport {
    static var candidates: [String] {
        [
            "/Applications/LibreOffice.app/Contents/MacOS/soffice",
            NSHomeDirectory() + "/Applications/LibreOffice.app/Contents/MacOS/soffice",
            "/opt/homebrew/bin/soffice",
            "/usr/local/bin/soffice"
        ]
    }

    static func locate() -> DocxTool? {
        // MORI_SOFFICE allows a non-standard install location and lets the plumbing be
        // exercised against a stub during testing.
        if let override = ProcessInfo.processInfo.environment["MORI_SOFFICE"],
           FileManager.default.isExecutableFile(atPath: override) {
            return DocxTool(path: override)
        }
        for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
            return DocxTool(path: path)
        }
        return nil
    }

    static func selfTest(tool: DocxTool) throws -> String {
        let workspace = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("mori-docx-probe-\(UUID().uuidString)", isDirectory: true)
        let profile = workspace.appendingPathComponent("profile", isDirectory: true)
        try FileManager.default.createDirectory(at: profile, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: workspace) }
        let source = workspace.appendingPathComponent("probe.html")
        try Data("<!doctype html><html><body><p>ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ probe</p></body></html>".utf8).write(to: source, options: .atomic)
        try run(tool: tool, arguments: [
            "--headless", "--norestore", "--nolockcheck", profileArgument(profile),
            "--convert-to", "docx:MS Word 2007 XML", "--outdir", workspace.path, source.path
        ], timeout: 240)
        let produced = workspace.appendingPathComponent("probe.docx")
        guard FileManager.default.fileExists(atPath: produced.path) else {
            throw DocxError.message("转换未生成 DOCX 文件。")
        }
        let size = (try FileManager.default.attributesOfItem(atPath: produced.path)[.size] as? NSNumber)?.intValue ?? 0
        guard size > 0 else { throw DocxError.message("生成的 DOCX 是空文件。") }
        try run(tool: tool, arguments: [
            "--headless", "--norestore", "--nolockcheck", profileArgument(profile),
            "--convert-to", "html", "--outdir", workspace.path, produced.path
        ], timeout: 240)
        guard FileManager.default.fileExists(atPath: source.path) else {
            throw DocxError.message("无法回读转换后的 HTML。")
        }
        let text = (try? String(contentsOf: source, encoding: .utf8)) ?? ""
        guard text.count > 0 else { throw DocxError.message("回读的 HTML 为空。") }
        return "DOCX \(size) 字节 · 回读 \(text.count) 字符"
    }

    private static func profileArgument(_ directory: URL) -> String {
        "-env:UserInstallation=file://" + directory.path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!
    }

    @discardableResult
    static func run(tool: DocxTool, arguments: [String], timeout: TimeInterval = 180) throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool.path)
        process.arguments = arguments
        process.standardInput = FileHandle.nullDevice
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        try process.run()
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline { usleep(150_000) }
        if process.isRunning {
            process.terminate()
            usleep(400_000)
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            throw DocxError.message("LibreOffice 转换超时（超过 \(Int(timeout)) 秒），进程已终止。")
        }
        let output = pipe.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: output, encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            let tail = text.split(separator: "\n").suffix(3).joined(separator: " ")
            throw DocxError.message("LibreOffice 转换失败（退出码 \(process.terminationStatus)）。\(tail)")
        }
        return text
    }

    static func exportDOCX(tool: DocxTool, html: String, destination: URL) throws {
        let workspace = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("mori-docx-\(UUID().uuidString)", isDirectory: true)
        let profile = workspace.appendingPathComponent("profile", isDirectory: true)
        try FileManager.default.createDirectory(at: profile, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: workspace) }
        let source = workspace.appendingPathComponent("document.html")
        try Data(html.utf8).write(to: source, options: .atomic)
        try run(tool: tool, arguments: [
            "--headless", "--norestore", "--nolockcheck", profileArgument(profile),
            "--convert-to", "docx:MS Word 2007 XML", "--outdir", workspace.path, source.path
        ])
        let produced = workspace.appendingPathComponent("document.docx")
        guard FileManager.default.fileExists(atPath: produced.path) else {
            throw DocxError.message("LibreOffice 未生成 DOCX 文件。")
        }
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: produced, to: destination)
    }

    static func importDOCX(tool: DocxTool, source: URL) throws -> Data {
        let workspace = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("mori-docx-\(UUID().uuidString)", isDirectory: true)
        let profile = workspace.appendingPathComponent("profile", isDirectory: true)
        try FileManager.default.createDirectory(at: profile, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: workspace) }
        let copy = workspace.appendingPathComponent("input.docx")
        try FileManager.default.copyItem(at: source, to: copy)
        try run(tool: tool, arguments: [
            "--headless", "--norestore", "--nolockcheck", profileArgument(profile),
            "--convert-to", "html", "--outdir", workspace.path, copy.path
        ])
        let produced = workspace.appendingPathComponent("input.html")
        guard FileManager.default.fileExists(atPath: produced.path) else {
            throw DocxError.message("LibreOffice 未生成 HTML 中间文件。")
        }
        return try Data(contentsOf: produced)
    }
}

@MainActor
private final class PrintJob: NSObject, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    private let root: URL
    private weak var window: NSWindow?
    private let completion: (Bool, String?) -> Void
    private var operation: NSPrintOperation?
    private var deadline: Timer?
    private var finished = false
    private var startedPrinting = false

    init(configuration: WKWebViewConfiguration, root: URL, window: NSWindow,
         completion: @escaping (Bool, String?) -> Void) {
        self.root = root
        self.window = window
        self.completion = completion
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1122, height: 794), configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
    }

    func start(html: String) {
        deadline = Timer.scheduledTimer(timeInterval: 30, target: self,
                                        selector: #selector(timedOut), userInfo: nil, repeats: false)
        webView.loadHTMLString(html, baseURL: root)
    }

    @objc private func timedOut() { finish(false, "Print content did not finish loading.") }

    private func finish(_ success: Bool, _ error: String?) {
        guard !finished else { return }
        finished = true
        deadline?.invalidate()
        webView.stopLoading()
        completion(success, error)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, navigationAction.targetFrame != nil else {
            decisionHandler(.cancel)
            return
        }
        let allowed = url.absoluteString == "about:blank" || (url.scheme ?? "").lowercased() == "about"
            || isBundledURL(url, root: root)
        decisionHandler(allowed ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !startedPrinting, !finished else { return }
        startedPrinting = true
        webView.callAsyncJavaScript("""
            await Promise.race([
                Promise.all([
                    document.fonts.ready,
                    ...Array.from(document.images).map(image => image.complete ? Promise.resolve() :
                        new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))
                ]),
                new Promise(resolve => setTimeout(resolve, 8000))
            ]);
            return true;
            """, arguments: [:], in: nil, in: .page) { [weak self] result in
                guard let self, !self.finished else { return }
                if case .failure(let error) = result {
                    self.finish(false, error.localizedDescription)
                    return
                }
                self.presentPrintPanel()
            }
    }

    private func presentPrintPanel() {
        guard let window, !finished else { finish(false, "The editor window is unavailable."); return }
        deadline?.invalidate()
        let info = NSPrintInfo(dictionary: [:])
        info.paperSize = NSSize(width: 595.276, height: 841.890)
        info.orientation = .landscape
        info.topMargin = 24
        info.bottomMargin = 24
        info.leftMargin = 24
        info.rightMargin = 24
        info.horizontalPagination = .fit
        info.verticalPagination = .automatic
        info.isHorizontallyCentered = false
        info.isVerticallyCentered = false
        let operation = webView.printOperation(with: info)
        self.operation = operation
        operation.jobTitle = productName
        operation.showsPrintPanel = true
        operation.showsProgressPanel = true
        operation.printPanel.options.formUnion([.showsPaperSize, .showsOrientation, .showsScaling])
        operation.runModal(for: window, delegate: self,
                           didRun: #selector(printDidRun(_:success:contextInfo:)), contextInfo: nil)
    }

    @objc private func printDidRun(_ operation: NSPrintOperation, success: Bool,
                                   contextInfo: UnsafeMutableRawPointer?) {
        finish(success, nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(false, error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(false, error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        finish(false, "The print renderer stopped unexpectedly.")
    }
}

@MainActor
private final class MoriApplication: NSObject, NSApplicationDelegate, NSWindowDelegate,
                                     WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let smoke: SmokeOptions?
    private var window: NSWindow!
    private var webView: WKWebView!
    private var webRoot: URL!
    private var rules: WKContentRuleList?
    private var fontCache: [[String: Any]]?
    private var dirty = false
    private var allowClose = false
    private var confirmingClose = false
    private var terminating = false
    private var modalAction = false
    private var navigationFinished = false
    private var printJob: PrintJob?
    private var isolatedDraft: String?
    private var smokePoll: Timer?
    private var smokeDeadline: Timer?
    private var snapshotDeadline: Timer?
    private var smokeChecking = false
    private var smokeRunning = false
    private var smokeReady = false
    private var smokeFinishing = false
    private var smokeWritten = false
    private var smokeReport: [String: Any] = [:]
    var exitCode: Int32 = 0

    init(smoke: SmokeOptions?) { self.smoke = smoke }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.appearance = NSAppearance(named: .darkAqua)
        installMenus()
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 940),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = productName
        window.contentMinSize = NSSize(width: 1150, height: 740)
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.center()
        if smoke == nil { window.setFrameAutosaveName("MoriEditorWindow") }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard let resources = Bundle.main.resourceURL else {
            failLoading("The application resources are missing.")
            return
        }
        webRoot = resources.appendingPathComponent("web", isDirectory: true).standardizedFileURL
        let entry = webRoot.appendingPathComponent("index.html")
        guard isBundledURL(entry, root: webRoot), FileManager.default.fileExists(atPath: entry.path) else {
            failLoading("Resources/web/index.html is missing. Build the web UI and package the application again.")
            return
        }
        if smoke != nil {
            smokeDeadline = Timer.scheduledTimer(timeInterval: 45, target: self,
                                                 selector: #selector(smokeTimedOut), userInfo: nil, repeats: false)
        }
        // Deny network requests, including fetches and subresources, not just navigations.
        // about: must stay allowed: a srcdoc iframe (used by the page preview) loads with
        // the URL about:srcdoc, and blocking it leaves the frame stuck on about:blank.
        let ruleObjects: [[String: Any]] = [
            ["trigger": ["url-filter": ".*"], "action": ["type": "block"]],
            ["trigger": ["url-filter": "^file://"], "action": ["type": "ignore-previous-rules"]],
            ["trigger": ["url-filter": "^data:"], "action": ["type": "ignore-previous-rules"]],
            ["trigger": ["url-filter": "^blob:"], "action": ["type": "ignore-previous-rules"]],
            ["trigger": ["url-filter": "^about:"], "action": ["type": "ignore-previous-rules"]]
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: ruleObjects)
            guard let source = String(data: data, encoding: .utf8) else {
                throw ShellError.message("Could not encode the local-only resource policy.")
            }
            WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "MoriLocalOnlyV2",
                                                                   encodedContentRuleList: source) { [weak self] rules, error in
                guard let self, !self.smokeFinishing else { return }
                guard let rules else {
                    self.failLoading(error?.localizedDescription ?? "Could not install the local-only resource policy.")
                    return
                }
                self.rules = rules
                self.createWebView(entry: entry)
            }
        } catch { failLoading(error.localizedDescription) }
    }

    private func configuration(forPrint: Bool = false) -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.defaultWebpagePreferences.allowsContentJavaScript = !forPrint
        if let rules { configuration.userContentController.add(rules) }
        if !forPrint { configuration.userContentController.add(self, name: "mori") }
        return configuration
    }

    private func createWebView(entry: URL) {
        webView = WKWebView(frame: window.contentView?.bounds ?? .zero, configuration: configuration())
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        if smoke == nil {
            let zoom = UserDefaults.standard.double(forKey: "EditorPageZoom")
            if zoom >= 0.5 && zoom <= 2 { webView.pageZoom = zoom }
        }
        window.contentView = webView
        window.makeFirstResponder(webView)
        webView.loadFileURL(entry, allowingReadAccessTo: webRoot)
        if smoke != nil {
            smokePoll = Timer.scheduledTimer(timeInterval: 0.2, target: self,
                                             selector: #selector(pollSmokeReady), userInfo: nil, repeats: true)
        }
    }

    private func installMenus() {
        let bar = NSMenu()
        NSApp.mainMenu = bar
        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let menu = NSMenu(title: title)
            item.submenu = menu
            bar.addItem(item)
            return menu
        }
        func command(_ title: String, _ name: String, _ key: String, _ menu: NSMenu,
                     modifiers: NSEvent.ModifierFlags = .command) {
            let item = NSMenuItem(title: title, action: #selector(menuCommand(_:)), keyEquivalent: key)
            item.target = self
            item.representedObject = name
            item.keyEquivalentModifierMask = modifiers
            menu.addItem(item)
        }
        let application = submenu(productName)
        application.addItem(withTitle: "About " + productName, action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        application.addItem(.separator())
        application.addItem(withTitle: "Hide Mori", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = application.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        application.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        application.addItem(.separator())
        application.addItem(withTitle: "Quit Mori", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let file = submenu("File")
        command("New", "new", "n", file)
        command("Open…", "open", "o", file)
        command("Save…", "save", "s", file)
        command("Export Text…", "exportText", "e", file, modifiers: [.command, .shift])
        file.addItem(.separator())
        command("Print / Save PDF…", "print", "p", file)
        file.addItem(.separator())
        file.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let edit = submenu("Edit")
        command("Undo", "undo", "z", edit)
        command("Redo", "redo", "z", edit, modifiers: [.command, .shift])
        edit.addItem(.separator())
        for (title, selector, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"),
                                       ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: NSSelectorFromString(selector), keyEquivalent: key)
        }
        let view = submenu("View")
        let zoomInItem = view.addItem(withTitle: "Zoom In", action: #selector(zoomIn(_:)), keyEquivalent: "=")
        zoomInItem.target = self
        let zoomOutItem = view.addItem(withTitle: "Zoom Out", action: #selector(zoomOut(_:)), keyEquivalent: "-")
        zoomOutItem.target = self
        let help = submenu("Help")
        command("Mongolian Compatibility…", "compatibility", "", help)
        NSApp.helpMenu = help
    }

    @objc private func menuCommand(_ sender: NSMenuItem) {
        guard let command = sender.representedObject as? String, let webView else { return }
        webView.callAsyncJavaScript("""
            if (typeof window.moriCommand !== 'function') return false;
            window.moriCommand(command);
            return true;
            """, arguments: ["command": command], in: nil, in: .page) { [weak self] result in
                switch result {
                case .success(let value):
                    if (value as? Bool) != true { self?.showMessage("The editor is not ready yet.") }
                case .failure(let error): self?.showMessage(error.localizedDescription)
                }
            }
    }

    @objc private func zoomIn(_ sender: Any?) { changeZoom(0.1) }
    @objc private func zoomOut(_ sender: Any?) { changeZoom(-0.1) }
    private func changeZoom(_ delta: Double) {
        guard let webView else { return }
        webView.pageZoom = min(2, max(0.5, ((webView.pageZoom + delta) * 10).rounded() / 10))
        if smoke == nil { UserDefaults.standard.set(webView.pageZoom, forKey: "EditorPageZoom") }
    }

    private func reply(id: Any, result: Any = NSNull(), error: String? = nil) {
        let object: [String: Any] = ["id": id, "result": result, "error": error as Any? ?? NSNull()]
        do {
            let data = try JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed])
            guard let json = String(data: data, encoding: .utf8) else {
                throw ShellError.message("Could not encode the native reply.")
            }
            // Only serialized JSON crosses this boundary; no payload is a JavaScript string literal.
            webView.evaluateJavaScript("window.moriNativeReply(" + json + ");") { [weak self] _, error in
                if let error, self?.smoke != nil {
                    self?.finishSmoke(result: nil, error: "Native reply failed: " + error.localizedDescription)
                }
            }
        } catch {
            if smoke != nil { finishSmoke(result: nil, error: error.localizedDescription) }
            else { showMessage(error.localizedDescription) }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "mori", message.webView === webView, message.frameInfo.isMainFrame,
              let source = message.frameInfo.request.url, isBundledURL(source, root: webRoot) else { return }
        guard let body = message.body as? [String: Any] else {
            reply(id: NSNull(), error: "Expected a bridge message object.")
            return
        }
        let id = body["id"] ?? NSNull()
        guard id is String || id is NSNumber || id is NSNull,
              let action = body["action"] as? String else {
            reply(id: NSNull(), error: "Expected an action and a string or numeric request ID.")
            return
        }
        let payload = body["payload"] as? [String: Any] ?? [:]
        switch action {
        case "fonts": reply(id: id, result: fonts())
        case "open": openDocument(id: id)
        case "save": saveDocument(id: id, payload: payload)
        case "draftLoad":
            do { reply(id: id, result: ["content": try loadDraft() as Any? ?? NSNull()]) }
            catch { reply(id: id, error: error.localizedDescription) }
        case "draftSave":
            guard let content = payload["content"] as? String, content.utf8.count <= maximumOpenBytes else {
                reply(id: id, error: "draftSave requires a content string within the 64 MB limit."); return
            }
            do {
                if smoke != nil { isolatedDraft = content }
                else { try content.write(to: draftURL(createDirectory: true), atomically: true, encoding: .utf8) }
                reply(id: id, result: ["saved": true])
            } catch { reply(id: id, error: error.localizedDescription) }
        case "dirty":
            guard let value = payload["dirty"] as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else {
                reply(id: id, error: "dirty requires a boolean."); return
            }
            dirty = value.boolValue
            window.isDocumentEdited = dirty
            reply(id: id, result: ["dirty": dirty])
        case "confirm":
            guard let message = payload["message"] as? String else {
                reply(id: id, error: "confirm requires a message string."); return
            }
            guard beginModal(id: id) else { return }
            let alert = NSAlert()
            alert.messageText = message
            alert.informativeText = payload["detail"] as? String ?? ""
            alert.addButton(withTitle: "Continue")
            alert.addButton(withTitle: "Cancel")
            alert.beginSheetModal(for: window) { [weak self] response in
                self?.modalAction = false
                self?.reply(id: id, result: response == .alertFirstButtonReturn)
            }
        case "print":
            guard let html = payload["html"] as? String else {
                reply(id: id, error: "print requires an HTML string."); return
            }
            guard beginModal(id: id) else { return }
            let job = PrintJob(configuration: configuration(forPrint: true), root: webRoot, window: window) { [weak self] success, error in
                guard let self else { return }
                self.modalAction = false
                self.printJob = nil
                self.reply(id: id, result: ["printed": success, "cancelled": !success && error == nil], error: error)
            }
            printJob = job
            job.start(html: html)
        case "docxProbe":
            guard let tool = DocxSupport.locate() else { reply(id: id, error: "未检测到 LibreOffice。"); return }
            guard beginModal(id: id) else { return }
            modalAction = false
            DispatchQueue.global(qos: .userInitiated).async {
                let outcome: Result<String, Error> = Result { try DocxSupport.selfTest(tool: tool) }
                Task { @MainActor in
                    switch outcome {
                    case .success(let detail): self.reply(id: id, result: ["ok": true, "detail": detail])
                    case .failure(let error): self.reply(id: id, result: ["ok": false, "detail": error.localizedDescription])
                    }
                }
            }
        case "docxAvailable":
            let tool = DocxSupport.locate()
            reply(id: id, result: ["available": tool != nil, "path": tool?.path as Any? ?? NSNull()])
        case "docxPick":
            guard beginModal(id: id) else { return }
            let panel = NSOpenPanel()
            panel.title = "选择要导入的 DOCX"
            panel.allowedContentTypes = [UTType(filenameExtension: "docx") ?? .data]
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = false
            panel.canChooseFiles = true
            panel.beginSheetModal(for: window) { [weak self] response in
                guard let self else { return }
                self.modalAction = false
                guard response == .OK, let url = panel.url else { self.reply(id: id, result: ["cancelled": true]); return }
                self.reply(id: id, result: ["name": url.lastPathComponent, "path": url.path])
            }
        case "docxExport":
            guard let html = payload["html"] as? String, let requested = payload["name"] as? String else {
                reply(id: id, error: "docxExport requires html and name."); return
            }
            guard html.utf8.count <= maximumOpenBytes else { reply(id: id, error: "内容过大，无法导出 DOCX。"); return }
            guard let tool = DocxSupport.locate() else { reply(id: id, error: "未检测到本机安装的 LibreOffice。"); return }
            guard beginModal(id: id) else { return }
            let panel = NSSavePanel()
            panel.title = "导出 DOCX（经本机 LibreOffice 转换）"
            panel.allowedContentTypes = [UTType(filenameExtension: "docx") ?? .data]
            panel.canCreateDirectories = true
            let stem = ((requested as NSString).lastPathComponent as NSString).deletingPathExtension
            panel.nameFieldStringValue = (stem.isEmpty || stem == "." ? "Untitled" : stem) + ".docx"
            panel.beginSheetModal(for: window) { [weak self] response in
                guard let self else { return }
                self.modalAction = false
                guard response == .OK, let url = panel.url else { self.reply(id: id, result: ["cancelled": true]); return }
                DispatchQueue.global(qos: .userInitiated).async {
                    let outcome: Result<Void, Error> = Result { try DocxSupport.exportDOCX(tool: tool, html: html, destination: url) }
                    Task { @MainActor in
                        switch outcome {
                        case .success: self.reply(id: id, result: ["name": url.lastPathComponent, "path": url.path])
                        case .failure(let error): self.reply(id: id, error: error.localizedDescription)
                        }
                    }
                }
            }
        case "docxImport":
            guard let path = payload["path"] as? String else { reply(id: id, error: "docxImport requires path."); return }
            guard let tool = DocxSupport.locate() else { reply(id: id, error: "未检测到本机安装的 LibreOffice。"); return }
            let source = URL(fileURLWithPath: path)
            guard source.pathExtension.lowercased() == "docx" else { reply(id: id, error: "仅支持 .docx 文件。"); return }
            guard beginModal(id: id) else { return }
            modalAction = false
            DispatchQueue.global(qos: .userInitiated).async {
                let outcome: Result<Data, Error> = Result { try DocxSupport.importDOCX(tool: tool, source: source) }
                Task { @MainActor in
                    switch outcome {
                    case .success(let data) where data.count <= maximumOpenBytes:
                        self.reply(id: id, result: ["base64": data.base64EncodedString()])
                    case .success:
                        self.reply(id: id, error: "转换结果超过 64MB 限制。")
                    case .failure(let error):
                        self.reply(id: id, error: error.localizedDescription)
                    }
                }
            }
        default: reply(id: id, error: "Unsupported native action: " + action)
        }
    }

    private func beginModal(id: Any) -> Bool {
        guard !modalAction, window.attachedSheet == nil, !confirmingClose, !terminating else {
            reply(id: id, error: "Finish the current dialog before opening another.")
            return false
        }
        modalAction = true
        return true
    }

    private func openDocument(id: Any) {
        guard beginModal(id: id) else { return }
        let panel = NSOpenPanel()
        panel.title = "Open Mongolian Document"
        panel.allowedContentTypes = [.plainText, documentType]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            self.modalAction = false
            guard response == .OK, let url = panel.url else {
                self.reply(id: id, result: ["cancelled": true]); return
            }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                guard ["txt", "mglx"].contains(url.pathExtension.lowercased()) else {
                    throw ShellError.message("Choose a .txt or .mglx file.")
                }
                let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                guard values.isRegularFile == true else { throw ShellError.message("Choose a regular file.") }
                guard (values.fileSize ?? 0) <= maximumOpenBytes else {
                    throw ShellError.message("The selected file exceeds the 64 MB document limit.")
                }
                let handle = try FileHandle(forReadingFrom: url)
                defer { try? handle.close() }
                let data = try handle.read(upToCount: maximumOpenBytes + 1) ?? Data()
                guard data.count <= maximumOpenBytes else { throw ShellError.message("The selected file exceeds the 64 MB document limit.") }
                self.reply(id: id, result: ["name": url.lastPathComponent, "base64": data.base64EncodedString()])
            } catch { self.reply(id: id, error: error.localizedDescription) }
        }
    }

    private func saveDocument(id: Any, payload: [String: Any]) {
        guard let kind = payload["kind"] as? String,
              ["mglx", "txt", "html", "docx"].contains(kind), let requestedName = payload["name"] as? String else {
            reply(id: id, error: "save requires name and kind (mglx, txt, html or docx)."); return
        }
        let data: Data
        if let content = payload["content"] as? String { data = Data(content.utf8) }
        else if ["txt", "docx"].contains(kind), let base64 = payload["base64"] as? String, let decoded = Data(base64Encoded: base64), decoded.count <= maximumOpenBytes { data = decoded }
        else { reply(id: id, error: "save requires valid content or original bytes."); return }
        guard data.count <= maximumOpenBytes else { reply(id: id, error: "The exported document exceeds the 64 MB limit. Split the content before saving."); return }
        guard beginModal(id: id) else { return }
        let panel = NSSavePanel()
        panel.title = "Save Mongolian Document"
        panel.canCreateDirectories = true
        panel.allowedContentTypes = [kind == "mglx" ? documentType : (kind == "txt" ? .plainText : (kind == "docx" ? (UTType(filenameExtension: "docx") ?? .data) : .html))]
        panel.allowsOtherFileTypes = false
        let basename = (requestedName as NSString).lastPathComponent
        let stem = (basename as NSString).deletingPathExtension
        panel.nameFieldStringValue = (stem.isEmpty || stem == "." || stem == ".." ? "Untitled" : stem) + "." + kind
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            self.modalAction = false
            guard response == .OK, let url = panel.url else {
                self.reply(id: id, result: ["cancelled": true]); return
            }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                try data.write(to: url, options: .atomic)
                self.reply(id: id, result: ["name": url.lastPathComponent, "path": url.path])
                // The editor clears dirty state only after it receives this successful reply.
            } catch { self.reply(id: id, error: error.localizedDescription) }
        }
    }

    private func draftURL(createDirectory: Bool) throws -> URL {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: createDirectory)
        let directory = support.appendingPathComponent("Mori", isDirectory: true)
        if createDirectory { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        return directory.appendingPathComponent("draft.mglx")
    }

    private func loadDraft() throws -> String? {
        if smoke != nil { return isolatedDraft }
        let url = try draftURL(createDirectory: false)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func fonts() -> [[String: Any]] {
        if let fontCache { return fontCache }
        let manager = NSFontManager.shared
        var result: [[String: Any]] = []
        for family in manager.availableFontFamilies.sorted(by: { $0.localizedStandardCompare($1) == .orderedAscending }) {
            var names = (manager.availableMembers(ofFontFamily: family) ?? []).compactMap { $0.first as? String }
            if names.isEmpty, let font = manager.font(withFamily: family, traits: [], weight: 5, size: 16) {
                names = [font.fontName]
            }
            if names.isEmpty, let font = NSFont(name: family, size: 16) { names = [font.fontName] }
            if names.isEmpty {
                result.append(["family": family, "postscript": "", "hasMongolian": false, "hasPUA": false])
            }
            for name in Set(names).sorted() {
                let font = CTFontCreateWithName(name as CFString, 16, nil)
                let letters: [UniChar] = [0x1820, 0x182E]
                let privateLetters: [UniChar] = [0xE264]
                let punctuation: [UniChar] = [0x2018, 0x2019, 0x201C, 0x201D, 0x1802, 0x1803, 0x3002, 0xFF0C]
                var glyphs = [CGGlyph](repeating: 0, count: letters.count)
                var privateGlyphs = [CGGlyph](repeating: 0, count: privateLetters.count)
                var punctuationGlyphs = [CGGlyph](repeating: 0, count: punctuation.count)
                let mongolian = CTFontGetGlyphsForCharacters(font, letters, &glyphs, letters.count) && glyphs.allSatisfy { $0 != 0 }
                let pua = CTFontGetGlyphsForCharacters(font, privateLetters, &privateGlyphs, privateLetters.count) && privateGlyphs[0] != 0
                _ = CTFontGetGlyphsForCharacters(font, punctuation, &punctuationGlyphs, punctuation.count)
                var missing: [String] = []
                for (index, glyph) in punctuationGlyphs.enumerated() where glyph == 0 {
                    missing.append(String(format: "U+%04X", punctuation[index]))
                }
                result.append(["family": family, "postscript": CTFontCopyPostScriptName(font) as String,
                               "hasMongolian": mongolian, "hasPUA": pua,
                               "hasPunctuation": missing.isEmpty, "missingPunctuation": missing])
            }
        }
        fontCache = result
        return result
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.targetFrame != nil, let url = navigationAction.request.url else {
            decisionHandler(.cancel); return
        }
        // Sub-frames may hold local about: documents: the paginated preview is a srcdoc
        // iframe whose URL is about:srcdoc, which is never a bundled file URL.
        if (url.scheme ?? "").lowercased() == "about" { decisionHandler(.allow); return }
        guard isBundledURL(url, root: webRoot) else { decisionHandler(.cancel); return }
        // The single editor document never navigates away, including to another local document.
        if navigationAction.targetFrame?.isMainFrame == true, navigationFinished {
            guard let current = webView.url,
                  url.standardizedFileURL.path == current.standardizedFileURL.path,
                  url.query == current.query, url.fragment != current.fragment,
                  navigationAction.navigationType != .reload else {
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let url = navigationResponse.response.url, isBundledURL(url, root: webRoot),
              navigationResponse.canShowMIMEType else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { navigationFinished = true }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { failLoading(error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { failLoading(error.localizedDescription) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        failLoading("The editor renderer stopped. Reopen the app to restore the last saved draft; unsaved changes may be unavailable.")
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = productName
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        if window.attachedSheet != nil { alert.runModal(); completionHandler() }
        else { alert.beginSheetModal(for: window) { _ in completionHandler() } }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        if window.attachedSheet != nil { completionHandler(alert.runModal() == .alertFirstButtonReturn) }
        else { alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) } }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) { completionHandler(nil) }

    private func showMessage(_ message: String) {
        if smoke != nil { finishSmoke(result: nil, error: message); return }
        let alert = NSAlert()
        alert.messageText = productName
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        if let window, window.attachedSheet == nil { alert.beginSheetModal(for: window) }
        else { alert.runModal() }
    }

    private func failLoading(_ message: String) {
        if smoke != nil { finishSmoke(result: nil, error: message) }
        else { showMessage(message) }
    }

    private func confirmDiscard(_ completion: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Discard unsaved changes?"
        alert.informativeText = "Your document has unsaved changes. Choose Keep Editing, then use File > Save to save them before closing."
        alert.addButton(withTitle: "Keep Editing")
        alert.addButton(withTitle: "Discard Changes")
        alert.beginSheetModal(for: window) { completion($0 == .alertSecondButtonReturn) }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if smoke != nil || allowClose { return true }
        guard !modalAction, sender.attachedSheet == nil, !confirmingClose, !terminating else { return false }
        if !dirty { return true }
        confirmingClose = true
        confirmDiscard { [weak self] discard in
            guard let self else { return }
            self.confirmingClose = false
            if discard {
                self.allowClose = true
                self.window.performClose(nil)
            }
        }
        return false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if smoke != nil || allowClose { return .terminateNow }
        guard !modalAction, window?.attachedSheet == nil, !confirmingClose, !terminating else { return .terminateCancel }
        if !dirty { return .terminateNow }
        terminating = true
        confirmDiscard { [weak self] discard in
            self?.terminating = false
            self?.allowClose = discard
            sender.reply(toApplicationShouldTerminate: discard)
        }
        return .terminateLater
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        return true
    }

    @objc private func pollSmokeReady() {
        guard !smokeFinishing, !smokeRunning, !smokeChecking, navigationFinished,
              let webView, window.isVisible, webView.window === window else { return }
        smokeChecking = true
        webView.evaluateJavaScript("window.moriReady === true && typeof window.moriSmokeTest === 'function'") { [weak self] value, error in
            guard let self else { return }
            self.smokeChecking = false
            guard !self.smokeFinishing else { return }
            if let error { self.finishSmoke(result: nil, error: error.localizedDescription); return }
            guard value as? Bool == true else { return }
            self.smokeReady = true
            self.smokeRunning = true
            self.smokePoll?.invalidate()
            webView.callAsyncJavaScript("return await window.moriSmokeTest();", arguments: [:], in: nil, in: .page) { [weak self] result in
                switch result {
                case .success(let value): self?.finishSmoke(result: value, error: nil)
                case .failure(let error): self?.finishSmoke(result: nil, error: error.localizedDescription)
                }
            }
        }
    }

    @objc private func smokeTimedOut() {
        finishSmoke(result: nil, error: smokeRunning ? "moriSmokeTest exceeded the 45-second test deadline." :
                    "The existing editor window did not become moriReady with moriSmokeTest within 45 seconds.")
    }

    private func finishSmoke(result: Any?, error: String?) {
        guard let smoke, !smokeFinishing else { return }
        smokeFinishing = true
        smokePoll?.invalidate()
        smokeDeadline?.invalidate()
        var failure = error
        let serializable = JSONSerialization.isValidJSONObject(["result": result ?? NSNull()])
        if !serializable { failure = "moriSmokeTest returned a value that is not JSON serializable." }
        let returnedObject = result as? [String: Any]
        let reportedFailure = (returnedObject?["ok"] as? Bool == false) ||
            (returnedObject?["passed"] as? Bool == false) || (result as? Bool == false)
        let fontList = fonts()
        smokeReport = [
            "ok": failure == nil && !reportedFailure,
            "ready": smokeReady,
            "result": serializable ? (result ?? NSNull()) : NSNull(),
            "error": failure as Any? ?? NSNull(),
            "fontFaceCount": fontList.count,
            "mongolianFontFaceCount": fontList.filter { $0["hasMongolian"] as? Bool == true }.count,
            "puaFontFaceCount": fontList.filter { $0["hasPUA"] as? Bool == true }.count,
            "isolatedDraft": true,
            "windowVisible": window?.isVisible ?? false,
            "webViewAttached": webView?.window != nil
        ]
        guard let snapshot = smoke.snapshot else { writeSmokeReport(); return }
        guard let webView, webView.window != nil else {
            smokeReport["ok"] = false
            smokeReport["snapshotError"] = "No attached WKWebView is available for a snapshot."
            writeSmokeReport()
            return
        }
        snapshotDeadline = Timer.scheduledTimer(timeInterval: 15, target: self,
                                                selector: #selector(snapshotTimedOut), userInfo: nil, repeats: false)
        let configuration = WKSnapshotConfiguration()
        configuration.rect = webView.bounds
        configuration.afterScreenUpdates = true
        webView.takeSnapshot(with: configuration) { [weak self] image, error in
            guard let self, !self.smokeWritten else { return }
            self.snapshotDeadline?.invalidate()
            do {
                if let error { throw error }
                guard let image, let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
                      let png = NSBitmapImageRep(cgImage: cgImage).representation(using: .png, properties: [:]) else {
                    throw ShellError.message("WKWebView did not produce a PNG snapshot.")
                }
                try png.write(to: snapshot, options: .atomic)
                self.smokeReport["snapshot"] = snapshot.path
            } catch {
                self.smokeReport["ok"] = false
                self.smokeReport["snapshotError"] = error.localizedDescription
            }
            self.writeSmokeReport()
        }
    }

    @objc private func snapshotTimedOut() {
        smokeReport["ok"] = false
        smokeReport["snapshotError"] = "WKWebView snapshot exceeded 15 seconds."
        writeSmokeReport()
    }

    private func writeSmokeReport() {
        guard let smoke, !smokeWritten else { return }
        smokeWritten = true
        snapshotDeadline?.invalidate()
        exitCode = smokeReport["ok"] as? Bool == true ? 0 : 1
        do {
            let data = try JSONSerialization.data(withJSONObject: smokeReport, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: smoke.report, options: .atomic)
        } catch {
            exitCode = 1
            FileHandle.standardError.write(Data(("Could not write smoke report: " + error.localizedDescription + "\n").utf8))
        }
        allowClose = true
        window?.orderOut(nil)
        NSApp.stop(nil)
        if let event = NSEvent.otherEvent(with: .applicationDefined, location: .zero, modifierFlags: [],
                                         timestamp: 0, windowNumber: 0, context: nil, subtype: 0, data1: 0, data2: 0) {
            NSApp.postEvent(event, atStart: false)
        }
    }
}

@main
struct MoriMain {
    @MainActor static func main() {
        let application = NSApplication.shared
        application.setActivationPolicy(.regular)
        do {
            let delegate = MoriApplication(smoke: try SmokeOptions.parse())
            application.delegate = delegate
            withExtendedLifetime(delegate) { application.run() }
            exit(delegate.exitCode)
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(2)
        }
    }
}
