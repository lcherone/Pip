# Architecture

Pip is one Electron app. The puppy is drawn every frame. Decisions about what he should do live outside the renderer.

## Modules

| Piece | Where | Responsibility |
| --- | --- | --- |
| Desktop shell | `electron/main.ts` | Transparent panel window, tray, settings and playground windows, files, helper process, Codex process |
| Preload | `electron/preload.ts` | Typed bridge. The pages cannot require Node |
| Character | `src/renderer/draw/puppy.ts` | Procedural canvas puppy. No sprite sheet |
| Rig | `src/core/pose.ts` | Numeric channels: posture, face, ears, tail, legs |
| Animation | `src/core/animation` | Catalogue, crossfades, overlays, blinks, springs, interruption |
| Director | `src/core/director.ts` | Turns a posture, gait, and emote into one clip id |
| Movement | `src/core/movement.ts` | Acceleration, gait phase, jumps, screen clamps, ledges |
| Behaviour | `src/core/behaviour.ts` | Needs, personality, utility scores, cooldowns, intro |
| Desktop model | `src/core/desktop.ts` | Window records, coordinate conversion, event diffs |
| Memory | `src/core/memory.ts` | JSON state. No screenshots, no keystrokes |
| Codex | `src/core/codex.ts` | App-server session. Transport is injected so tests do not spawn a process |
| Native helper | `native/helper.swift` | Window list and idle time. One JSON object per line |

The drawing code does not choose the next action. The behaviour engine does not write joint angles. Codex returns an intention such as `celebrate` or `report_problem`, and the behaviour engine picks the clip.

## Why these choices

Canvas, not Pixi or a sprite sheet. There is one character, the art has to stay editable as code, and a rig of ellipses and springs is enough for ears, tail, and breathing.

JSON in `userData/pip-state.json`, not SQLite. The state is a single small document. A native database module would add a build that the puppy does not need.

The pet window is only as large as Pip, plus room for a bubble. It is not a fullscreen overlay. Transparent pixels use `setIgnoreMouseEvents(true, { forward: true })` until the pointer is actually on him, so the rest of the desktop stays clickable. Dragging uses pointer capture and follows the cursor across the desktop. Dropping Pip onto a visible window catches its top edge; otherwise he falls to the desktop. Window approaches walk into range, jump onto low ledges, or climb taller windows before settling on the edge. Window tops need enough headroom to keep Pip visible; maximized windows are approached from the desktop instead. A disappearing support releases him to gravity.

The helper is a separate Swift process so a crash there does not take Electron down. It is polled about once a second and exits when its parent exits. Pip does not record the screen.

Codex is a child process speaking the JSON-RPC methods generated from the installed `codex app-server`. Approval requests are shown and are not answered until you press Allow or Deny. The sandbox defaults to read-only.

## Power

Balanced quality draws at about 60fps while Pip is moving, slower while he is sitting, and slower again while he sleeps. The behaviour brain does not call a model. Desktop geometry is diffed, not polled every frame.

## Coordinates

Cocoa's global space has its origin at the bottom left. The helper converts AppKit display rectangles and cursor positions using the primary display height. Core Graphics window bounds already have a top-left origin and must not be flipped. Electron uses the same top-left convention in points. On each snapshot the main process compares helper display frames with `screen.getAllDisplays()` and applies a small translation if they disagree. HiDPI is handled by working in points on both sides. Near the menu bar the canvas anchor moves within the transparent window so macOS window-position constraints do not hold Pip below the upper desktop. Held positions keep the puppy visible at display edges. See `src/core/pet-layout.ts` and the navigation regressions in `tests/navigation.test.ts`.


## Assistant Brain (Phase 2)

`src/core/assistant/brain.ts` owns confirmed project associations, isolated conversation references, task lifecycle, bounded context memory and structured suggestions. It depends on the existing `CodexSession`; `transport.ts` is the one managed App Server process transport used by the app and live integration test. `projects.ts` reads targeted Git metadata, and `integration.ts` accepts opt-in same-user structured receipts.

The typed preload bridge exposes a closed union of Brain commands. The main process owns persistence and native folder selection. `src/renderer/conversation` is an anchored, dismissible window in the same Electron application; it renders Brain snapshots and never executes tools directly. The pet maps Brain states onto the existing animation catalogue. The playground uses a separate simulation instance of the same Brain/event pipeline, with no real filesystem or task execution.

Assistant state and character learning are separate. See `docs/ASSISTANT.md` for limits, approvals, runtime isolation boundaries and verification commands.


## Environmental visits and typing

The existing `world.ts` geometry and routes feed weighted window selection. Nearby exposed windows compete using salience and familiarity, with a bounded transient cooldown per window. `BehaviourEngine` schedules visits, chooses a small investigation style, follows the route and settles before considering a new goal. Ground routes remain available when a top is unreachable or climbing is disabled. Perched routes can descend before visiting a different window. The movement controller ignores the departing edge during that descent, rather than immediately landing on it again.

With typing reactions enabled, the helper samples only Core Graphics aggregate key-down activity and recency. It installs no event tap and reads no key codes or text. `TypingObserver` turns samples into bounded transient activity and start/pause edges; changing apps, disabling the feature or blocking an app clears its state. No activity history is persisted. The pet discards stale observations after 3.5 seconds and never treats their data as instructions.

Copied text is a separate explicit user action. Main reads the clipboard once, bounds the input, calls the existing local reply function in shared-text mode and sends only its fixed reaction through the behaviour event contract. The source text never enters assistant history, character memory, logs or Codex. This is a small local reaction vocabulary, not semantic analysis of arbitrary application contents.

## Living world engine

`world.ts` now exposes spatial objects, confidence/provenance, affordances and an enriched A* transition graph. `attention.ts` handles stable eye/head/body sequencing. Environmental goals live in the existing `BehaviourEngine`; `MovementController` owns support displacement, crouch/arc/contact and display recovery. `scenarios.ts` supplies repeatable geometry to the same production pipeline. The playground can alternatively render read-only reports from the actual desktop pet. See [WORLD.md](WORLD.md) for contracts, pacing, persistence, performance and separate native/simulated acceptance evidence.
