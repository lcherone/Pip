# PROJECT: PIP — THE LIVING DESKTOP PUPPY

## Your role

You are the lead software engineer, character animator, interaction designer and technical architect responsible for creating a complete macOS desktop application.

You must PLAN, IMPLEMENT, TEST, DEBUG and POLISH the application.

Do not stop after creating a plan, proof of concept, design mockup or project skeleton. Deliver an actual running application with a functional, animated puppy.

The current directory is a new project directory. Assume there is no existing source code, design system, artwork, sprite sheet, animation, icon or configuration.

**You are responsible for producing everything required for the application to function, including the puppy itself and all animation assets or procedural animation definitions.**

Do not request that I manually draw, download, rig or animate the puppy.

Where visual assets are needed, create them programmatically using SVG, Canvas, generated geometry or other suitable techniques available in the development environment.

Use Codex's available tools, local development environment and verification capabilities to complete as much of the implementation as possible.

Do not leave placeholder implementations, fake buttons, permanent TODOs, or features represented only by documentation.

If an operating-system permission, external authentication or unavailable tool prevents completing a specific integration, implement a working fallback and clearly document that limitation.

---

# 1. PRODUCT VISION

Create a small, adorable, animated puppy named **Pip** that lives on the user's macOS desktop.

Pip must feel like a living creature rather than a static desktop widget.

Pip can:

- Walk, trot, run, sit, sleep, stretch and play.
- Move naturally around the desktop.
- Look at, follow and chase the mouse cursor.
- React to clicks and dragging.
- Explore visible application windows.
- Sit on window edges when possible.
- React to applications opening, closing and gaining focus.
- Display emotions through body posture, ears, eyes and tail.
- Become tired, curious, excited, playful or sleepy.
- Remember simple preferences and behaviour history.
- Respond to desktop events.
- Communicate through speech bubbles.
- Optionally connect to Codex App Server to answer questions and respond to development activity.

Pip should be enjoyable to have on the desktop even when AI is disabled.

It is NOT intended to be another dashboard, productivity application or chat window.

The puppy must remain the primary interface.

The goal is to make the user occasionally notice Pip doing something unexpected, believable and charming.

Examples:

- Pip sits quietly while the user works.
- Its ears twitch when a new window opens.
- It follows the cursor with its eyes.
- It occasionally stretches before standing.
- It runs towards the pointer when excited.
- It curls up and sleeps during inactivity.
- It notices Codex finishing a task and celebrates.
- It tilts its head when something fails.
- It moves away when the user begins typing intensely.
- It gets distracted while walking towards a destination.
- It occasionally looks towards the user before returning to what it was doing.

**The primary success criterion is that Pip looks and behaves like an animated, living puppy.**

---

# 2. TECHNICAL DIRECTION

Target platform:

- macOS first.
- Local desktop application.
- Apple Silicon and Intel compatibility where practical.

Preferred technologies:

- Electron
- TypeScript
- PixiJS or another suitable performant 2D rendering engine
- HTML/CSS for application controls
- Swift/AppKit helper for native macOS capabilities
- SQLite or lightweight local persistence
- Codex App Server using its documented protocol

These are preferences, not hard constraints.

Evaluate the actual project requirements and choose the simplest maintainable implementation that delivers good animation performance and reliable desktop integration.

Prefer a modular monolith over unnecessary services, microservices or elaborate plugin frameworks.

Use strict TypeScript where practical.

Avoid large frontend frameworks unless they add clear value.

Do not depend on hosted APIs or subscription services for basic puppy animation and behaviour.

Pip must run offline.

## Essential architecture

Separate the following responsibilities:

1. Desktop Shell
2. Character Renderer
3. Character Rig
4. Animation System
5. Movement Controller
6. Behaviour Engine
7. Desktop Awareness
8. Interaction Manager
9. AI Integration
10. Memory and Persistence
11. Settings
12. Development Playground

Each system should have a clear contract.

The renderer should not decide which behaviours occur.

The AI integration should not manipulate low-level animation primitives directly.

The behaviour engine should select actions, while the animation and movement systems execute them.

---

# 3. CHARACTER DESIGN — CREATE PIP PROGRAMMATICALLY

**Critical: No puppy graphics currently exist.**

You must design, draw and render Pip as part of this implementation.

Do not use placeholder emojis, static text characters, generic circles representing a dog, or externally required asset packs.

Create a polished, recognisable cartoon puppy with enough anatomical detail to support convincing animation.

## Visual identity

Pip should be:

- Small and adorable.
- Clearly recognisable as a puppy.
- Expressive rather than photorealistic.
- Soft and friendly in appearance.
- Suitable for a desktop application.
- Readable at approximately 100–180 logical pixels tall.
- Attractive against both dark and light backgrounds.

Suggested appearance:

- Warm golden or tan fur.
- Cream muzzle, chest and belly.
- Soft floppy ears.
- Large expressive eyes.
- Small dark nose.
- Short paws.
- Flexible tail.
- Rounded body proportions.
- Subtle fur details.
- Soft shading or gradients.
- Friendly facial expressions.

The design should be consistent from every supported angle.

Do not settle for a minimally detailed geometric prototype as the final character.

Prioritise polished character design, sensible proportions and smooth silhouettes.

## Character rig

Implement a reusable procedural 2D character rig.

Recommended conceptual parts:

- Root/body transform
- Torso
- Chest
- Neck
- Head
- Muzzle
- Nose
- Mouth
- Left eye
- Right eye
- Eyelids
- Pupils
- Eyebrows/expression controls
- Left ear
- Right ear
- Front left leg
- Front right leg
- Rear left leg
- Rear right leg
- Individual paws
- Tail
- Optional shadow

Each part must support relevant transformations:

- Position
- Rotation
- Scale
- Opacity
- Pivot
- Deformation where appropriate

Use nested transforms, skeletal animation, procedural paths or equivalent techniques.

Support side-view and front-facing poses, plus intermediate orientations where practical.

Do not implement turning as an instantaneous flip unless the transition is intentionally stylised.

Mirroring may be used for symmetry, but avoid obvious anatomical artefacts.

## Asset generation

Generate the original puppy artwork within the project.

Possible approaches:

- Procedurally authored SVG components
- Canvas paths
- Generated vector files
- Programmatically generated textures
- Reusable geometric meshes

Choose the approach that delivers the highest visual quality while remaining fully editable through code.

A hybrid of generated vector artwork and skeletal/procedural animation is encouraged.

If sprite sheets would improve specific animation sequences, provide scripts that generate them from project-owned source artwork.

All generated artwork must be included in the project or reproducible through its build scripts.

---

# 4. ANIMATION ENGINE

This is one of the most important systems in the entire project.

Pip must NOT behave like a slideshow switching between unrelated poses.

Create a proper animation engine supporting:

- Named animation clips
- Keyframes
- Procedural animation
- Easing curves
- Timing
- Looping
- Animation priorities
- Interruptibility
- Transition rules
- Blending
- Layering
- Event markers
- Recovery animations
- Animation cancellation
- Playback speed
- Directional variants

## Animation layering

Support multiple animation layers where reasonable.

Example:

Base state: sitting

Secondary motion: breathing

Facial expression: curious

Attention direction: looking towards cursor

Tail: slow wag

Ear movement: occasional twitch

These should be able to operate simultaneously without conflicting.

Do not require a separate animation for every combination of facial expression, body pose and tail movement.

## Procedural motion

Implement reusable motion utilities for:

- Smooth interpolation
- Spring motion
- Follow-through
- Damping
- Anticipation
- Overshoot
- Secondary motion
- Oscillation
- Blended poses
- Animation curves
- Optional inverse kinematics where useful

Use elapsed time rather than frame counts so behaviour remains consistent at different frame rates.

Target smooth animation around 60 FPS on suitable hardware.

Make performance adaptive when the application is idle, hidden or the display is sleeping.

---

# 5. REQUIRED ANIMATION LIBRARY

Implement an extensive animation catalogue.

The animation names below are conceptual identifiers. You may improve their internal structure, but the resulting behaviours must be demonstrable.

Aim for **at least 50 distinct meaningful animation behaviours**, with natural transitions and layered micro-animations.

Do not satisfy this requirement by creating dozens of visually identical animations with different names.

## A. Idle animations

1. Idle standing
2. Idle sitting
3. Idle lying down
4. Gentle breathing
5. Slow blinking
6. Double blinking
7. Ear twitch left
8. Ear twitch right
9. Nose twitch
10. Subtle head movement
11. Look left
12. Look right
13. Look up
14. Look down
15. Look behind
16. Slow tail wag
17. Paw adjustment
18. Weight shifting
19. Curious head tilt
20. Short body shake

## B. Movement animations

21. Walk left
22. Walk right
23. Trot
24. Run
25. Accelerate
26. Decelerate
27. Skid to a stop
28. Turn around
29. Reverse direction
30. Jump
31. Land
32. Small hop
33. Excited bounce
34. Carefully approach
35. Back away
36. Follow cursor
37. Chase cursor
38. Walk towards a destination
39. Investigate a nearby object
40. Recover after losing balance

## C. Resting animations

41. Stand to sit
42. Sit to stand
43. Sit to lie down
44. Curl up
45. Fall asleep
46. Sleeping breathing
47. Sleep twitch
48. Dreaming paw movement
49. Yawn
50. Wake up
51. Stretch front paws
52. Full-body stretch
53. Scratch ear
54. Scratch neck
55. Shake after waking

## D. Emotional animations

56. Happy tail wag
57. Excited jumping
58. Curious investigation
59. Confused head tilt
60. Surprised reaction
61. Startled jump
62. Sad posture
63. Frustrated reaction
64. Proud posture
65. Celebrate
66. Request attention
67. Playful bow
68. Bark
69. Whimper
70. Look expectantly at user

## E. Desktop-specific animations

71. Notice new application
72. Approach active window
73. Look over window edge
74. Jump onto reachable ledge
75. Sit on window edge
76. Carefully walk along ledge
77. Prepare to jump down
78. Jump down and land
79. Investigate mouse cursor
80. Follow a moving window
81. Lose interest and wander away
82. React to window closing
83. Watch a task progress
84. Celebrate completed work
85. React to a failure

## Acceptance requirements

Not every behaviour requires a completely unique full-body clip.

Some can be implemented through combinations of base poses, procedural motions and expressions.

However:

- Each behaviour must have a visually distinguishable result.
- Important transitions must animate naturally.
- No abrupt teleporting between incompatible poses.
- Feet should not visibly slide during stationary poses.
- Movement speed should correspond to the gait.
- Tail movement should respond to emotion.
- Head and eyes should track targets smoothly.
- Ears should exhibit secondary movement.
- Breathing must be subtle and continuous.
- Animation layers should not produce broken geometry.
- The puppy should remain recognisable throughout motion.

Create an animation registry containing metadata:

- Identifier
- Category
- Duration
- Loop setting
- Interruptibility
- Priority
- Supported starting states
- Ending state
- Playback parameters

---

# 6. LOCOMOTION AND PHYSICS

Pip must move like a small living creature rather than a sprite translated across the desktop.

Implement a lightweight 2D movement system.

## Movement characteristics

- Acceleration
- Deceleration
- Max walking speed
- Running speed
- Direction changes
- Jump arcs
- Gravity for jumping/falling
- Landing recovery
- Ground alignment
- Destination arrival thresholds
- Screen boundary handling
- Obstacle and ledge awareness where available

Movement animations must correspond to physical movement.

For example:

When Pip begins running:

1. Look towards destination.
2. Shift posture.
3. Anticipate movement.
4. Accelerate.
5. Transition into running gait.
6. Slow near destination.
7. Stop.
8. Settle into an idle pose.

Avoid simply setting position directly to the destination.

## Desktop navigation

Pip should be able to:

- Wander along screen boundaries.
- Move across the lower desktop area.
- Approach visible window edges.
- Sit on reachable window boundaries.
- React when its supporting window moves.
- Return to a safe location when geometry changes.
- Avoid disappearing off-screen.
- Handle different monitor resolutions and scale factors.

Model supporting surfaces and destinations explicitly.

Support multiple monitors if feasible.

Recognise that windows are visual geometry, not actual physical platforms. Implement believable visual movement without pretending macOS has native collision physics for application windows.

When a desired path is not possible, use a safe recovery behaviour.

---

# 7. PERSONALITY AND AUTONOMOUS BEHAVIOUR

Pip should make decisions independently.

Build a lightweight behaviour engine that operates continuously while the application is running.

Do not use AI to select every animation.

Ordinary behaviour must work fully offline.

## Personality attributes

Implement configurable internal characteristics:

- Curiosity
- Playfulness
- Energy
- Confidence
- Sociability
- Attention-seeking
- Sleepiness
- Excitability

Use these attributes to influence behaviour probability and intensity.

## Internal needs

Track:

- Energy
- Attention
- Curiosity
- Rest
- Stimulation

These are simulation variables, not medical or biological claims.

They should change gradually and influence action selection.

Example:

If energy is low:
- Prefer walking over running.
- Yawn more frequently.
- Find somewhere to rest.
- Eventually sleep.

If curiosity is high:
- Investigate newly opened windows.
- Watch cursor movement.
- Approach unfamiliar desktop activity.

If playful:
- Occasionally invite interaction.
- Chase the mouse.
- Bounce when excited.

## Behaviour selection

Prefer a utility-based behaviour selection system or hierarchical state machine.

Evaluate:

- Current state
- Needs
- Desktop events
- Current target
- Available actions
- Personality
- Cooldowns
- User preferences
- Recent behaviour history

Avoid purely random action selection.

Randomness should provide variation within believable decision-making.

## Behaviour interruption

Design explicit interruption rules.

Examples:

- Sleeping should not be interrupted by ordinary cursor movement.
- A direct click may wake Pip.
- A major desktop geometry change should interrupt an unsafe jump.
- An AI completion event may interrupt idle behaviour.
- Dragging must override automatic movement.
- Fullscreen work mode may suppress attention-seeking behaviour.

Keep action transitions coherent.

---

# 8. DESKTOP PRESENCE

Pip must appear to live directly on the macOS desktop.

It should not feel like an application running inside a large visible rectangular window.

## Window requirements

- Transparent background.
- Frameless presentation.
- Always-on-top mode where appropriate.
- No visible rectangular application window around Pip.
- Optional menu bar or tray control.
- No standard Dock presence while in pet-only mode, where supported.
- Adjustable character size.
- Configurable screen position.
- Support for multiple displays where practical.

## Mouse interaction

Transparent portions of the application must not block normal interaction with underlying desktop applications.

The visible character should remain interactive.

Implement reliable hit testing and coordinate the native overlay's click-through behaviour with the renderer.

Do not assume transparent pixels automatically support native click-through.

The implementation must allow normal clicking, dragging and typing in underlying applications.

Important:

Never use a permanently full-screen, mouse-capturing transparent overlay.

If the architecture requires a screen-sized rendering surface, solve the input pass-through problem explicitly.

## Dragging

The user should be able to pick Pip up and move it.

While dragging:

- Suspend autonomous navigation.
- Apply a held or dangling pose.
- Move smoothly with the pointer.
- Display appropriate reactions.
- Restore a safe pose when released.
- Resume autonomy after a configurable delay.

---

# 9. NATIVE MACOS INTEGRATION

Implement a native helper if required for macOS window awareness.

Prefer supported APIs.

Relevant capabilities include:

- NSWorkspace
- Accessibility APIs
- Window geometry APIs
- ScreenCaptureKit when required and explicitly permitted
- Screen and display information

## Desktop events

Detect where possible:

- Application activated
- Application launched
- Application terminated
- Active window changed
- Window moved
- Window resized
- Display geometry changed
- System idle state changed
- Application entered fullscreen
- Permission state changed

Normal window-awareness functionality should not require continuous screenshots.

Use accessibility metadata and window geometry first.

Do not capture keyboard input or collect typed content.

## Permissions

Request only permissions required for enabled features.

Explain why they are needed.

Support limited functionality when permissions are denied.

The puppy must remain usable without Accessibility or Screen Recording permissions.

Offer a dedicated permission/settings screen.

Do not repeatedly prompt the user after denial.

## Window geometry model

Normalise OS window information into a model containing:

- Window identifier
- Application identifier
- Display identifier
- Bounds
- Visible state
- Focus state
- Optional title if permitted
- Eligible surface edges

Create a safe coordinate mapping between macOS display coordinates and Electron rendering coordinates.

Account for HiDPI scaling and multi-monitor offsets.

---

# 10. DESKTOP REACTIONS

Implement an event-to-behaviour mapping system.

Examples:

Event: VS Code gains focus

Potential reaction:
- Look towards VS Code.
- Walk near the window.
- Sit and observe.

Event: Terminal opens

Potential reaction:
- Perk ears.
- Look curious.
- Approach window.

Event: New browser window opens

Potential reaction:
- Notice movement.
- Investigate the new window.
- Return to previous activity.

Event: User becomes inactive

Potential reaction:
- Reduce activity.
- Yawn.
- Lie down.
- Sleep.

Event: User resumes activity

Potential reaction:
- Wake gradually.
- Stretch.
- Look towards cursor.

Event: Active window closes

Potential reaction:
- Look surprised.
- Move to a safe resting place.

These reactions should be configurable.

Rate-limit behaviour so opening several applications does not produce an uninterruptible backlog of reactions.

---

# 11. INTERACTION SYSTEM

Pip must support direct interactions.

## Mouse interactions

Single click:
- Look towards user.
- Wag tail.
- Occasionally bark or tilt head.

Double click:
- Open compact interaction menu or conversation bubble.

Mouse hover:
- Track cursor with eyes or head.
- Occasionally react.

Drag:
- Pick up and reposition.

Rapid cursor movement:
- Sometimes become playful and chase.

Cursor near nose:
- Sniff or investigate.

Repeated interaction:
- Become progressively excited, then eventually settle.

## Interaction menu

Provide contextual actions such as:

- Talk to Pip
- Pet Pip
- Play
- Sit
- Sleep
- Follow me
- Stay here
- Explore
- Open settings
- Animation playground

The menu should be small and unobtrusive.

## Interaction effects

Optional effects:

- Small heart particles.
- Subtle celebratory particles.
- Thought bubbles.
- Tiny paw prints.
- Occasional speech bubbles.

Avoid excessive visual noise.

---

# 12. CODEX APP SERVER INTEGRATION

Pip should optionally use Codex App Server as its AI reasoning system.

**This integration must be optional. The desktop puppy must function without Codex.**

Consult the current official Codex App Server documentation rather than guessing protocol details.

Official reference:
https://learn.chatgpt.com/docs/app-server

## Connection architecture

Implement a dedicated Codex connection manager.

Prefer a locally managed App Server process using stdio JSONL where appropriate.

Support:

- Detecting Codex availability.
- Starting a managed server.
- Initialisation and capability negotiation.
- Connection status.
- Authentication state.
- Starting threads.
- Resuming threads.
- Sending prompts.
- Streaming responses.
- Receiving task events.
- Handling errors.
- Reconnection.
- Process cleanup.

Generate protocol types from the installed Codex version if supported.

Do not hard-code assumed model identifiers.

Do not assume arbitrary existing Codex desktop application sessions can automatically be attached to or inspected.

The primary integration should own its App Server connection and lifecycle.

Existing-session integration should only be added when supported by documented APIs.

## AI interaction

The user can click Pip and ask questions.

Examples:

"What are you doing?"

"Can you help me with this error?"

"Why are my tests failing?"

"What was Codex working on?"

"Can you investigate this project?"

Pip should:

1. Open a compact conversation bubble.
2. Capture the user's request.
3. Include only permitted relevant context.
4. Send the request to Codex.
5. Show thinking/working animation.
6. Stream the response into the bubble.
7. Transition back to an appropriate emotional state.

## Important distinction

AI reasoning controls high-level intentions.

For example, Codex may return a structured intention:

- Investigate
- Explain
- Celebrate
- Ask question
- Offer help
- Report problem

The behaviour engine translates the intention into appropriate expressions and animation.

Do not allow raw AI responses to directly execute arbitrary internal application methods.

## Approval gates

Any action affecting the filesystem, external applications, repositories or services must respect explicit approvals.

Never silently:

- Modify project files.
- Execute shell commands.
- Commit code.
- Push branches.
- Merge PRs.
- Deploy applications.
- Send messages.
- Delete files.

Use the applicable Codex approval flow and show the requested action clearly.

The puppy should remain harmless by default.

## Offline handling

When Codex is unavailable:

- Pip continues to animate.
- Existing desktop reactions work.
- The user can still interact with Pip.
- The AI connection status is clearly represented.
- No uncontrolled retry loops occur.

---

# 13. PIP'S MEMORY

Implement local persistent memory.

Pip should remember simple non-sensitive information, including:

- Preferred desktop location.
- Last resting position.
- Personality settings.
- Behaviour preferences.
- Animation frequency configuration.
- Recent interaction history.
- Favourite resting windows or applications.
- User-enabled integrations.

Memory should improve future behaviour.

Example:

If Pip regularly rests near VS Code, it may prefer that location when VS Code is active.

Do not store raw screenshots, keystrokes, or sensitive window contents.

Provide options to inspect, clear and disable memory.

---

# 14. SETTINGS AND CONTROL PANEL

Create a polished, minimal settings interface.

The character should remain the main experience.

The control panel should not resemble an enterprise dashboard.

## General

- Enable/disable Pip.
- Launch at login.
- Character size.
- Sound effects.
- Animation quality.
- Frame-rate/power-saving options.

## Personality

- Playfulness.
- Curiosity.
- Energy.
- Attention frequency.
- Independence.
- Sleep frequency.

## Desktop

- Follow active windows.
- Window climbing.
- Follow cursor.
- Multi-monitor support.
- Hide during fullscreen.
- Stay on current monitor.
- Enable/disable desktop awareness.

## AI

- Codex integration toggle.
- Connection status.
- Select available model if applicable.
- Conversation controls.
- Context-sharing permissions.
- Approval preferences.

## Privacy

- App permissions.
- Allowed/blocked applications.
- Disable content inspection.
- Clear memory.
- Diagnostics controls.

## Modes

Provide behavioural presets:

**Playful**
- More energetic movements.
- Frequent exploration.
- Greater interaction probability.

**Chill**
- Mostly sits, rests or wanders slowly.
- Fewer interruptions.

**Focus**
- Low activity.
- Minimal speech bubbles.
- Does not chase the cursor.
- Reacts only to meaningful events.

**Sleep**
- Pip remains resting.
- Background activity reduced.

---

# 15. ANIMATION PLAYGROUND — REQUIRED

Build a development playground for testing the puppy.

This is essential because the project has no externally supplied animation assets.

The playground must allow visual inspection of every animation without requiring a desktop event.

## Features

- Large character preview.
- Transparent/background colour options.
- Animation catalogue.
- Search animations.
- Select and play an animation.
- Play/pause.
- Loop toggle.
- Playback speed control.
- Display current state.
- Display animation layers.
- Inspect active transitions.
- Force character mood.
- Reset pose.
- Trigger arbitrary behaviour.
- Adjust personality values.
- Simulate cursor movement.
- Simulate desktop events.
- Simulate AI events.
- Display animation FPS.
- Display diagnostics.

## Animation testing

Each registered animation should be selectable.

Switching between animations should not cause corrupted character geometry or broken application state.

Create a dedicated test sequence that cycles through all animations and transitions.

The playground must use the same renderer, rig and animation engine as the desktop application.

Do not implement a separate fake preview.

---

# 16. EVENT SIMULATOR

Create a dedicated development mode to simulate desktop activity.

Examples:

- VS Code opened.
- Terminal opened.
- Browser opened.
- Active window moved.
- Window closed.
- User became inactive.
- Cursor moved rapidly.
- Codex started task.
- Codex completed task.
- Codex failed.
- Permission denied.

The simulator should display:

- Incoming event
- Behaviour selected
- Reason for selection
- Current mood
- Current animation
- Target position
- Resulting state

This will make future development significantly easier.

Ensure simulated events are clearly distinguished from real operating-system events.

---

# 17. USER INTERFACE DESIGN

Style direction:

- Minimal.
- Playful.
- Friendly.
- Soft.
- High-quality.
- Unobtrusive.

Use a coherent colour palette inspired by Pip's character design.

The main desktop experience should contain only the puppy and occasional contextual elements.

## Speech bubbles

Speech bubbles should:

- Position near the puppy.
- Follow its location when appropriate.
- Avoid clipping off-screen.
- Support streamed text.
- Support concise actions.
- Dismiss cleanly.
- Respect focus mode.
- Never permanently obstruct other applications.

## Settings

Use compact navigation with clear labels.

Prefer a small native-feeling utility window.

## Menu bar

Provide quick access to:

- Show Pip
- Hide Pip
- Pause
- Select behaviour mode
- Open settings
- Open playground
- Quit

---

# 18. PERFORMANCE REQUIREMENTS

The application should be suitable for running all day.

Priorities:

- Smooth character animation.
- Low idle CPU consumption.
- Minimal memory overhead.
- No unnecessary network requests.
- No polling at unnecessarily high frequency.
- Event-driven desktop monitoring where feasible.
- Reduced rendering when idle.
- No memory leaks.
- No unbounded event queues.
- No accumulated stale animation tasks.

Avoid spinning up AI calls for normal animation decisions.

Do not continuously screen-record the desktop.

Do not repeatedly query expensive macOS APIs when nothing has changed.

Profile rendering and movement performance.

---

# 19. PROJECT QUALITY

Provide:

- Sensible folder organisation.
- TypeScript configuration.
- Reproducible build scripts.
- Development scripts.
- Packaging configuration.
- Error handling.
- Structured local logging.
- Clear internal contracts.
- Automated tests.
- README.
- Architecture documentation.
- Animation catalogue documentation.

Avoid overengineering.

No unnecessary microservices.

No elaborate dependency injection framework unless justified.

No plugin system merely for hypothetical future extensibility.

Prefer small, understandable modules and clear event contracts.

Document important architectural decisions.

---

# 20. TESTING REQUIREMENTS

You must validate the implementation.

## Automated tests

Cover:

- Behaviour selection.
- Behaviour cooldowns.
- Mood changes.
- Animation state transitions.
- Animation interruption.
- Animation blending.
- Movement boundaries.
- Desktop coordinate conversion.
- Persistence.
- Event normalisation.
- AI connection handling.
- Approval handling.

## Visual validation

Where graphical tools are available:

- Launch the application.
- Capture screenshots.
- Inspect character proportions.
- Test the animation playground.
- Verify transparency.
- Verify the puppy is not clipped.
- Check multiple poses.
- Verify facial expressions.
- Test window resizing and display scaling.

## Desktop interaction validation

Verify:

- Pip can be dragged.
- Transparent regions pass mouse input through.
- Pip stays within visible screen bounds.
- Pip can walk without teleporting.
- Closing settings does not terminate the pet.
- Fullscreen handling works as intended.
- Permissions can be denied gracefully.

## AI validation

Verify:

- Codex unavailable.
- Codex available.
- Authentication required.
- Request started.
- Streaming response.
- Task completed.
- Task failed.
- Approval required.
- Connection lost.

Use mocks or simulations when actual Codex authentication is unavailable.

Do not claim a native feature has been verified if you could not execute it in the current environment.

---

# 21. REQUIRED ACCEPTANCE DEMONSTRATION

Before considering the project complete, the following sequence must be possible:

1. Start Pip using the documented command.
2. See an attractive puppy rendered on a transparent desktop surface.
3. Observe subtle breathing and occasional blinking.
4. Watch Pip stand, look around and walk.
5. See Pip sit naturally.
6. Move the mouse near Pip and see a reaction.
7. Click Pip and receive a reaction.
8. Drag Pip and release it.
9. Watch Pip resume autonomous activity.
10. Open the animation playground.
11. Preview every registered animation.
12. Change Pip's personality.
13. Observe the changed behaviour.
14. Simulate a window-opening event.
15. See Pip notice and investigate the event.
16. Simulate a successful Codex task.
17. See Pip celebrate.
18. Simulate a failed task.
19. See a different, appropriate reaction.
20. Restart the application and verify settings persist.

Where macOS integration and Codex are available, also verify the real event flows.

---

# 22. IMPLEMENTATION STRATEGY

You should first inspect the environment and create a brief implementation plan.

Then execute the plan.

Do not stop after planning.

Suggested order:

## Stage 1 — Foundation

Implement:

- Project setup.
- Electron shell.
- Transparent desktop rendering.
- Settings entry point.
- Development playground.
- Application lifecycle.

Validate the transparent-window behaviour early.

## Stage 2 — Character

Implement:

- Original Pip artwork.
- Procedural character rig.
- Rendering.
- Expressions.
- Idle animations.

The character must be visually convincing before expanding the system.

## Stage 3 — Animation

Implement:

- Animation registry.
- Animation clips.
- Layered motion.
- Transitions.
- Full animation catalogue.
- Playground controls.

Review visual quality and refine weak movements.

## Stage 4 — Behaviour

Implement:

- Personality.
- Needs.
- Autonomous behaviour.
- Movement.
- Event reactions.
- Interruption rules.
- Memory.

## Stage 5 — macOS

Implement:

- Application detection.
- Window geometry.
- Native helper.
- Permission handling.
- Desktop navigation.
- Window-specific behaviours.

## Stage 6 — Codex

Implement:

- App Server connection manager.
- AI conversation.
- Streamed responses.
- Event handling.
- Approval handling.
- Optional contextual behaviour.

## Stage 7 — Polish

Implement:

- Better animation transitions.
- Improved character expressions.
- Sound effects if appropriate.
- Power optimisation.
- Packaging.
- Automated tests.
- Documentation.

---

# 23. EXECUTION AND AGENT DELEGATION

You may delegate independent tasks to suitable sub-agents if supported by your environment.

Potential parallel workstreams:

- Electron desktop shell.
- Procedural character artwork.
- Animation engine.
- Behaviour simulation.
- Native macOS helper.
- Codex integration.
- Testing.

Minimise inter-agent communication and token usage.

Define contracts before delegation.

Keep the primary agent responsible for integration and verification.

Do not create competing implementations of the same core module.

The character rig and animation engine should have a single coherent design.

Prioritise working, integrated features rather than isolated partial implementations.

---

# 24. IMPORTANT CONSTRAINTS

You must NOT:

- Require me to create or supply sprite sheets.
- Require me to learn animation software.
- Use static emoji as the finished puppy.
- Deliver only a floating image.
- Deliver only a chatbot.
- Fake desktop awareness.
- Pretend a simulation is a real OS integration.
- Use AI for every animation decision.
- Block interaction with underlying applications.
- Require Codex connectivity for basic functionality.
- Leave the animation playground unimplemented.
- Create dozens of duplicate animations solely to satisfy the catalogue size.
- Automatically execute external actions without approval.
- Continuously capture or upload desktop screenshots.
- Mark unfinished work as complete.

If an advanced feature cannot be implemented reliably, provide a documented and functional fallback rather than an unstable implementation.

Do not silently reduce the scope.

---

# 25. DEFINITION OF DONE

The project is complete when:

- The desktop application starts successfully.
- Pip has its own original rendered artwork.
- Pip looks recognisably like a puppy.
- Pip moves naturally.
- Pip displays a wide range of distinct animations.
- Transitions are coherent.
- Pip behaves autonomously.
- Pip responds to user interaction.
- Desktop awareness works where permitted.
- Settings are functional and persistent.
- The animation playground works.
- The event simulator works.
- Codex integration is functional where available and degrades gracefully otherwise.
- The project has reproducible build and test commands.
- Tests pass.
- The app has been visually reviewed where the environment permits.
- Remaining platform limitations are documented precisely.

**The priority is delivering a believable living puppy, not simply achieving a feature checklist.**

A polished character that moves convincingly is preferable to an enormous but visually broken implementation.

However, do not use that priority as a reason to abandon the required systems.

---

# 26. FINAL DELIVERY

When finished, provide:

1. A concise summary of what was implemented.
2. Exact installation commands.
3. Exact development launch command.
4. Exact build/package command.
5. Location of generated artwork and animations.
6. How to launch the animation playground.
7. How to simulate desktop events.
8. How to connect Codex App Server.
9. What macOS permissions are required.
10. Test results.
11. Any remaining limitations.

The README should make onboarding straightforward for a developer opening the repository for the first time.

The project should be ready to run and iterate upon.

---

# START NOW

Inspect the current project directory and development environment.

Plan the architecture with particular attention to:

- Generating the puppy programmatically.
- Delivering expressive layered animations.
- Transparent desktop input behaviour.
- Separation between behaviour and rendering.
- Safe integration with macOS.
- Safe integration with Codex.

Then implement the complete application.

Do not ask me to provide missing animation assets.

Do not stop at a specification or mockup.

**Build Pip, bring him to life, test him and make him feel like a real little puppy living on my desktop.**
