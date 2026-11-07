import AppKit
import CoreGraphics
import Foundation
import IOKit

struct OutRect: Codable {
    var x: Double
    var y: Double
    var w: Double
    var h: Double
}

struct OutWindow: Codable {
    var id: String
    var app: String
    var bundleId: String?
    var displayId: String
    var layer: Int
    var kind: String
    var bounds: OutRect
    var focused: Bool
    var title: String?
    var onScreen: Bool
}

struct OutDisplay: Codable {
    var id: String
    var bounds: OutRect
    var workArea: OutRect
    var scaleFactor: Double
}

struct OutFront: Codable {
    var name: String
    var bundleId: String
    var pid: Int32
}

struct CursorSample: Codable {
    var type: String
    var x: Double
    var y: Double
}

struct TypingSample: Codable {
    var active: Bool
    var pace: String
}

struct Snapshot: Codable {
    var type: String
    var displays: [OutDisplay]
    var windows: [OutWindow]
    var frontmost: OutFront?
    var idleSeconds: Double
    var typing: TypingSample?
    var fullscreen: Bool
    var trusted: Bool
    var permission: String
}

struct AppEvent: Codable {
    var type: String
    var name: String
    var app: String
    var bundleId: String?
}

let includeTyping = CommandLine.arguments.contains("--typing")
let includeTitles = CommandLine.arguments.contains("--titles")
let promptAX = CommandLine.arguments.contains("--prompt-ax")
let parent = getppid()
let encoder = JSONEncoder()

func emit<T: Encodable>(_ value: T) {
    guard let data = try? encoder.encode(value), var text = String(data: data, encoding: .utf8) else { return }
    text.append("\n")
    FileHandle.standardOutput.write(Data(text.utf8))
}

func primaryHeight() -> CGFloat {
    let screens = NSScreen.screens
    let primary = screens.first { $0.frame.origin == .zero } ?? screens.first
    return primary?.frame.height ?? 0
}

func topLeft(_ rect: CGRect, height: CGFloat) -> OutRect {
    OutRect(x: rect.origin.x, y: height - rect.origin.y - rect.height, w: rect.width, h: rect.height)
}

func idleSeconds() -> Double {
    var iterator: io_iterator_t = 0
    let port = kIOMainPortDefault
    guard IOServiceGetMatchingServices(port, IOServiceMatching("IOHIDSystem"), &iterator) == KERN_SUCCESS else { return -1 }
    let entry = IOIteratorNext(iterator)
    defer {
        if entry != 0 { IOObjectRelease(entry) }
        IOObjectRelease(iterator)
    }
    guard entry != 0,
          let property = IORegistryEntryCreateCFProperty(entry, "HIDIdleTime" as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue() else {
        return -1
    }
    let nanos = property as? Int64 ?? 0
    return Double(nanos) / 1_000_000_000
}

func displays() -> [OutDisplay] {
    let height = primaryHeight()
    return NSScreen.screens.enumerated().map { index, screen in
        let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
        return OutDisplay(
            id: number.map { "\($0)" } ?? "screen-\(index)",
            bounds: topLeft(screen.frame, height: height),
            workArea: topLeft(screen.visibleFrame, height: height),
            scaleFactor: screen.backingScaleFactor
        )
    }
}

func windows(frontPid: Int32?) -> [OutWindow] {
    let selfPid = ProcessInfo.processInfo.processIdentifier
    let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
    let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
    let blocked = Set(["Window Server", "Dock", "Control Center", "Notification Center", "SystemUIServer", "Spotlight"])
    var result: [OutWindow] = []
    var focusedFound = false
    for item in info {
        let layer = item[kCGWindowLayer as String] as? Int ?? 0
        guard layer == 0 || (layer > 0 && layer <= 130) else { continue }
        let pid = item[kCGWindowOwnerPID as String] as? Int32 ?? 0
        if pid == 0 || pid == selfPid || pid == parent { continue }
        let owner = item[kCGWindowOwnerName as String] as? String ?? ""
        if blocked.contains(owner) || owner.isEmpty { continue }
        guard let dict = item[kCGWindowBounds as String] as? NSDictionary,
              let rect = CGRect(dictionaryRepresentation: dict) else { continue }
        if rect.width < (layer == 0 ? 160 : 60) || rect.height < (layer == 0 ? 80 : 30) { continue }
        let bundle = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
        let title = includeTitles ? item[kCGWindowName as String] as? String : nil
        let id = item[kCGWindowNumber as String] as? Int ?? 0
        let focused = frontPid == pid && !focusedFound
        if focused { focusedFound = true }
        result.append(OutWindow(
            id: "\(pid):\(id)",
            app: owner,
            bundleId: bundle,
            displayId: "",
            layer: layer,
            kind: layer == 0 ? "window" : "popover",
            // CGWindow bounds already use the top-left screen origin. Only AppKit needs flipping.
            bounds: OutRect(x: rect.origin.x, y: rect.origin.y, w: rect.width, h: rect.height),
            focused: focused,
            title: title,
            onScreen: true
        ))
    }
    return result
}

func fullscreen(_ windows: [OutWindow], displays: [OutDisplay], front: OutFront?) -> Bool {
    guard let front else { return false }
    return windows.contains { window in
        window.bundleId == front.bundleId && displays.contains { display in
            abs(window.bounds.w - display.bounds.w) < 12 && abs(window.bounds.h - display.bounds.h) < 12
        }
    }
}

func emitCursor() {
    let point = NSEvent.mouseLocation
    emit(CursorSample(type: "cursor", x: point.x, y: Double(primaryHeight() - point.y)))
}

var previousKeyCount: UInt32 = includeTyping ? CGEventSource.counterForEventType(.combinedSessionState, eventType: .keyDown) : 0

func typingSample(hasFront: Bool) -> TypingSample? {
    guard includeTyping else { return nil }
    // Only aggregate activity counters: no event tap, key codes or text values.
    let count = CGEventSource.counterForEventType(.combinedSessionState, eventType: .keyDown)
    let delta = count &- previousKeyCount
    previousKeyCount = count
    let quiet = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .keyDown)
    return TypingSample(active: hasFront && quiet.isFinite && quiet < 2.5, pace: delta >= 5 && delta < 1000 ? "busy" : "gentle")
}

func snapshot() {
    let frontApp = NSWorkspace.shared.frontmostApplication
    let observedFront = frontApp.flatMap { $0.processIdentifier == parent ? nil : $0 }
    let front = observedFront.map { OutFront(name: $0.localizedName ?? "", bundleId: $0.bundleIdentifier ?? "", pid: $0.processIdentifier) }
    let screenList = displays()
    let windowList = windows(frontPid: front?.pid)
    let trusted = AXIsProcessTrusted()
    let payload = Snapshot(
        type: "snapshot",
        displays: screenList,
        windows: windowList,
        frontmost: front,
        idleSeconds: idleSeconds(),
        typing: typingSample(hasFront: front != nil),
        fullscreen: fullscreen(windowList, displays: screenList, front: front),
        trusted: trusted,
        permission: windowList.isEmpty ? "limited" : "granted"
    )
    emit(payload)
}

func emitApp(_ name: Notification.Name, note: Notification) {
    let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
    if app?.processIdentifier == parent { return }
    let payload = AppEvent(
        type: "event",
        name: name.rawValue,
        app: app?.localizedName ?? "",
        bundleId: app?.bundleIdentifier
    )
    emit(payload)
    snapshot()
}

let center = NSWorkspace.shared.notificationCenter
center.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { note in
    emitApp(NSWorkspace.didLaunchApplicationNotification, note: note)
}
center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { note in
    emitApp(NSWorkspace.didActivateApplicationNotification, note: note)
}
center.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { note in
    emitApp(NSWorkspace.didTerminateApplicationNotification, note: note)
}

if promptAX {
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    let options = [key: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(options)
}

emitCursor()
snapshot()
Timer.scheduledTimer(withTimeInterval: 1.2, repeats: true) { _ in
    if getppid() != parent { exit(0) }
    snapshot()
}
Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
    emitCursor()
}
RunLoop.main.run()
