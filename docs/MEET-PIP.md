# Meet Pip 🐾

**Occupation:** desktop puppy. **Speciality:** making an ordinary workday a little warmer.

Pip is a small golden puppy who lives on your Mac. He is curious about windows, interested in the cursor, fond of a comfortable perch, and impressively qualified at falling asleep nearby.

> “Mostly sitting, watching the room, and trying not to nap on the keyboard.”

That is one of his actual local replies. The imaginary job title is ours; the sitting, watching, and napping are in the code.

[Bring him home](../README.md#bring-pip-home) · [Brand kit](BRAND.md) · [Animation catalogue](ANIMATIONS.md)

## His little daily routine

On an ordinary launch in Chill or Playful mode, Pip has a roughly thirteen-second introduction: sit, look left, look right, stretch, take a short walk, sit again. He does not arrive demanding a task.

After that, his behaviour engine weighs energy, attention, curiosity, rest, and stimulation alongside his personality, mode, events, cooldowns, and learned preferences. He might wander, investigate a window, follow you, yawn, sit, or make a little idle expression. Decisions vary, but they have reasons you can inspect in the Playground.

He gets tired through activity and recovers energy while asleep. Quiet time can prompt a yawn or a nap. Returning after inactivity can earn a greeting, subject to mode and cooldowns.

Pip has no feeding schedule or hunger meter in the current app. His needs are behaviour signals, not chores for you to complete.

## A window is a destination

Pip does more than follow whichever app is focused. Visible windows compete for his attention according to salience, familiarity, geometry, and recent visits.

An expedition can unfold as a little sequence: notice something, approach, sniff the frame or adjust a paw, hop or climb if practical, then settle and watch. If his playfulness and the edge geometry allow it, he may explore along a ledge.

He remembers familiar applications and relative resting places. Recent visits have cooldowns. Covered edges, missing headroom, disabled climbing, and mode restrictions change what is possible.

Move a window into him and he may sidestep. Close the window supporting him and gravity gets its turn. Dragging him uses a held pose and suspended legs; releasing him lets movement choose a suitable landing.

## Read the ears, paws, and tail

| What you notice | What is happening |
| --- | --- |
| A glance, then a head turn, then a body turn | Attention shifts in stages instead of snapping his whole body at every event. |
| A blink and an ear twitch while sitting | Additive animation layers keep a resting puppy alive. |
| Ground sniffing, frame sniffing, peeking along an edge | His idle repertoire and desktop investigations. |
| Paw waves, kneading, wiggles, a nose lick | Expressive reactions and idle clips; not every clip is chosen in every situation. |
| A play bow or little bounce | A playful expression, also used by certain explicit reactions. |
| Slow breathing, twitches, dream paws, dream running | The rest and sleep animation repertoire. |
| A celebratory stance and sparkle | A completed Codex event can make him proud and produce “Yes!” outside Focus. |
| A puzzled failure reaction | A failed Codex event can produce “Oh.” and a confused mood outside Focus. |
| He settles after repeated clicks | A bounded excitement signal gives him a breather after too much attention. |

His animation engine recognises **calm, happy, curious, excited, sleepy, sad, playful, proud, and confused** moods. Some emerge from needs and events; others are available for explicit animation/Playground preview. A clip in the catalogue is not a guarantee that Pip will spontaneously choose it on every desktop.

Ears and tail use springs for follow-through. Gait phase advances with distance travelled, so walking feet and a sitting body do not share the same treadmill. Turns pass through a front view, and posture bridges help him get from sitting to standing or sleep to wake.

## His personality has knobs

Eight sliders are exposed in Settings:

| Slider | The part of Pip it tunes |
| --- | --- |
| **Playfulness** | Appetite for playful choices and expressions. |
| **Curiosity** | Interest in investigating the desktop world. |
| **Energy** | Activity bias and how energy affects his routine. |
| **Attention frequency** | The attention-seeking trait behind expressive choices. |
| **Independence** | How strongly he prefers doing his own thing over following. |
| **Sleep frequency** | His sleepiness bias. |
| **Sociability** | His inclination to keep you company and follow. |
| **Excitability** | His enthusiasm for playful activity such as cursor chasing. |

There is also a core **confidence** trait used in desktop decisions, without a Settings slider. Personality changes probabilities and priorities; it does not make every activity physically possible.

**Chill** makes a quieter neighbour. **Playful** turns up the puppy energy. **Focus** reduces distractions and suppresses ordinary speech and suggestions. **Sleep** prioritises resting. Modes temporarily bias saved traits instead of replacing them.

## What he hears when you type

With typing reactions enabled, Pip receives aggregate activity and recency, not characters. A sustained burst can make him sit and listen or give you space. A pause after a longer burst can make him look up or stretch. Blocked apps and Desktop awareness apply.

He does not know whether that typing was a poem, a bug fix, or a very strongly worded shopping list.

If you want to share actual words, copy them and choose **React to copied text**. This separate action uses a tiny local vocabulary:

| Copied text example | Local reply | Expression chosen for this reaction |
| --- | --- | --- |
| `tests passed` | “That deserves a tail wag!” | Happy wag and hearts. |
| `I'm stuck` | “That looks like a tricky bit. I'm here with you.” | Confused tilt. |
| `walkies` | “Did somebody say play?” | Play bow. |
| `hello` | “Hi. I saved you a wag.” | Greet. |
| `good boy` | “That one got the whole tail.” | Happy wag and hearts. |
| `a blue notebook` | “I'm listening. Curious little head tilt included.” | Head tilt. |

These are phrase rules, not open-ended language understanding. If a message contains several trigger words, matching order decides the result. Text is bounded to 4,000 characters, used once, and not saved or sent to Codex.

## His small-talk repertoire

Click Pip to open his local chat card. With Codex off, try:

> **You:** hello  
> **Pip:** Hi. I saved you a wag.

> **You:** good boy  
> **Pip:** That one got the whole tail.

> **You:** I'm tired  
> **Pip:** I could curl up. Wake me if you need a paw.

> **You:** help me  
> **Pip:** I can poke around the desktop on my own. Codex is the one who can actually read the project — enable it if you want me to ask.

For an unmatched local question he explains the limit:

> I'm listening. If you want a proper answer, enable Codex in settings and ask me again.

Saying “nap” produces a reply, not a guaranteed sleep command. Use **Sleep** mode for that. Natural-language small talk and explicit behaviour controls are different paths.

## When he puts his thinking cap on

**Talk to Pip** opens the separate assistant popover. With Codex connected, Pip can discuss a registered project, investigate it, or start explicitly approved work within the configured sandbox. Full assistant conversations require Codex; the local chat card remains the place for simple offline phrases.

The assistant’s voice is warm, brief, and concrete. Underneath the text, intentions such as `investigate`, `celebrate`, `offer_help`, and `report_problem` connect conversation to animation. A hidden intention marker is consumed by the app, rather than becoming part of his speech.

He is instructed not to claim file changes, commands, or messages without tool evidence, and not to act silently. The app’s permission controls and native Codex approvals govern actual work. A suggestion bubble does not start a task by itself.

AI answers are generated and can vary. They do not all use the fixed local lines above. For permissions, context sharing, task lifecycle, and retention, read [Assistant Brain](ASSISTANT.md).

## Teaching an old desktop new tricks

After a self-chosen activity, open his card within thirty seconds and choose **More of that** or **Not that**. He nudges that activity’s bounded score and avoids leaning too heavily on recent repeats.

He can learn about sleeping, wandering, exploring windows, chasing the cursor, following, yawning, resting quietly, and idle expressions. He cannot learn new source code, bypass a disabled feature, or overrule your mode through feedback.

His animation self-check separately measures playback and pose continuity and retains bounded transition timing improvements. It is a calibration tool, not proof that every rendered pose is artistically perfect.

## Fun things to spot

- The tiny head tilt arrives without a model call.
- Nose twitches, breathing, and blinks can live on top of another pose.
- His little bark and whimper are synthesised with Web Audio; sound starts off.
- A window ledge needs headroom. Pip cannot perch inside your menu bar just because he is enthusiastic.
- The Playground can cycle the whole catalogue and lock the preview to left, front, or right.
- Character memory and assistant memory are separate. Forgetting a project does not reset his personality sliders.
- The puppy still works when Codex is disabled or disconnected.

**Pip’s unofficial motto:** small puppy, big desktop adventures.  
**His actual reply to affection:** “That one got the whole tail.”
