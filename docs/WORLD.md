# Pip’s living desktop

Pip uses the existing behaviour engine, movement controller, animation director and Assistant Brain. Environmental behaviour works locally with Codex disabled.

## Perception and space

All geometry uses top-left screen points, with positive y down. Core Graphics already supplies window rectangles in this space; AppKit cursor/display rectangles are converted once by the helper. Display scale affects rendering, not navigation distances. The display resolver supports negative origins and vertically stacked displays; disconnected displays trigger a visible ground recovery.

The helper receives application launch/activation/termination notifications and refreshes geometry immediately after them. Window movement has a bounded 1.2-second polling fallback. Observations are validated, deduplicated and capped at 64 windows. Each record has observation/change times, stacking position and measured displacement. Events include focus and conservative coverage changes. The behaviour engine selects one relevant spatial response from each batch, prioritising supporting surfaces and nearby hazards.

`world.ts` constructs displays, windows, edges, corners, title bars, intersections, ground and Pip. It labels measured rectangles separately from inferred surfaces and desktop chrome. Dock/menu regions are work-area inferences. Floating application windows are classified conservatively as possible popovers and never used as platforms. There is no screenshot capture or arbitrary application-content recognition. The model does not claim to know the words inside a window.

## Goals, navigation and movement

Window affordances describe investigation, looking up, leaning, climbing/jumping, edge walking, perching, resting and descent. Width, headroom, visibility, stability, energy and personality constrain their availability.

A lightweight A* graph connects ground positions, platform centres and endpoints. Transitions include cost, risk, orientation, animation and visible-ground recovery. Adventurous platform crossings require sufficient energy and confidence. Ground connections reject vertically disconnected monitors. An unreachable top can still receive a ground-level visit.

An environmental goal progresses through anticipation, approach, investigation, settlement and rest. The approach investigates a lower corner before ascending when the route allows. Noticing a window and arriving beside it on the floor use the fifteen floor reactions in [ANIMATIONS.md](ANIMATIONS.md). Reaching a perch still starts with a look over the edge. Perch rests last 45–150 seconds before personality/mode scaling, and while he stays he rotates through the ten ledge poses. Interest and cooldowns prevent constant revisits. Focus, sleep, dragging and explicit user actions take priority. The climb and the walk keep their movement clips; a window pose does not replace them mid-step.

The movement controller owns physical contact. It crouches before a jump, integrates gravity and descending surface crossings, alternates climb motion through the existing rig, and lands into a ledge pose. Attached motion follows window displacement in both axes. Missing, narrowed or covered supports detach safely. Occlusion is tested at Pip’s contact position as well as the route’s platform centre. A disappeared destination cancels the route. Stale renderer observations expire after five seconds. Large display changes can use a controlled visible relocation instead of indefinite falling.

Attention has hysteresis: eyes respond first, head follows after 120ms, and a stationary body may turn after 550ms. Ordinary competing targets need a meaningful score advantage to interrupt it. The director composes attention and micro-expressions with the physical gait.

## Habits and the assistant

Environmental memory stores bounded application associations, visit familiarity, instability counts and relative resting positions. Native window IDs are transient. Restoring a place resolves the application and relative position against current geometry. Settings → Reset environmental memory clears these habits independently of activity learning and Assistant Brain memory. Turning off remembering prevents persistence.

Assistant Brain receives only a concise validated surroundings summary. Normal exploration makes no AI requests. AI intentions continue through the existing validated behaviour contract; they cannot supply arbitrary screen coordinates.

Typing reactions use aggregate activity only. Actual words require the explicit **React to copied text** action, are handled by fixed local reactions, and are neither saved nor sent to Codex.

## World debugger

Open the playground and use **World source**:

- **Simulation** runs the production world, behaviour, director and physics against repeatable fixtures. It hides the desktop pet to avoid two independently moving representations.
- **Live desktop (read only)** displays reports from the actual desktop pet, including its pose, support, action and goal. It restores the real pet and does not drive it with simulated movement.

Overlays toggle objects, surfaces, graph, current path and attention. Expand **World debugger details** for confidence, provenance, stacking, recovery transitions, active goal, bounded goal history, perception events and rebuild count. Settings also reports available desktop capabilities.

Thirteen scenarios cover one window, overlap, scattered windows, moving/resizing/closing support, multiple displays, no windows, fullscreen, offscreen geometry, rapid focus changes, dynamic overlap and missing Accessibility. Restarting a scenario resets its controller and seeded behaviour. The simulation banner remains explicit when switching away from live mode.

Stable geometry is cached for 450ms rather than reconstructed every animation frame. Geometry changes invalidate the cache. Debug reports run at most twice per second and only while the debugger is open. Event/history queues and persisted habits are bounded. Existing quality settings lower idle/sleep rendering rates.

## Verification

`tests/living-world.test.ts` covers observation validation, focus/coverage, inferred objects, navigation constraints, display connections, moving attachment, close/resize/occlusion recovery, partial coverage at the paws, cross-platform jumps, jump anticipation, attention timing/hysteresis, habit restoration, interruption, focus and five simulated minutes of autonomous behaviour. Every scenario uses the production world model. Existing animation catalogue and facing tests exercise all registered clips; those checks establish playback and finite poses, not subjective visual quality for every frame.

Local macOS acceptance on 7 November 2026:

| Scenario | Evidence |
| --- | --- |
| A: curiosity | Passed with a separate real application window: anticipate → approach → investigate → settle → rest. |
| B: climbing | Passed: actual helper geometry, actual support reached, rendered perched pose captured. |
| C: moving support | Passed: real window translated horizontally and vertically; Pip retained his offset. |
| D: closing support | Passed: closing that real supporting window returned Pip to visible ground. |
| E: autonomy | Passed over five simulated minutes through production behaviour, director, animation and physics, including long rests and micro-movements. Real elapsed multi-minute desktop observation was not run. |
| F: overlaps | Passed in automated geometry/physics tests and rendered overlapping-window scenarios. |
| G: focus | Passed in behaviour tests and rendered simulator. |
| H: no Accessibility | Passed with controlled native-shaped input and rendered capability fallback. Actual OS permission revocation was not performed; this Mac had Accessibility granted. |
| Multiple monitors | Negative coordinates/different scales passed in tests and rendered simulation. Physical multi-monitor/disconnect testing was not available. |

Native run receipts and screenshots are in `/tmp/pip-living-world-qa/`. These are local test artifacts, not a packaged release. `npm run typecheck`, `npm test` and `npm run build` are the repeatable project checks. The optional live Codex integration test is separate from environmental acceptance.
