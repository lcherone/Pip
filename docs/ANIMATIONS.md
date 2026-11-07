# Animation catalogue

Pip’s body is a numeric pose, not a sprite sheet. Clips sample that pose over time. The behaviour engine chooses a posture, a gait, and an emote. The director turns that into one base clip, and the engine plays it.

Clips are registered in `src/core/animation/clips.ts`. The large pose sets added for sadness, standing, and window reactions live in `src/core/animation/extra.ts` and are spread into the same catalogue. Each clip records an id, category, duration, loop flag, interruptibility, priority, legal starting states, ending state, and playback speed.

## How a frame is chosen

Base clips replace the body pose. Additive clips (blinks, ear twitches, a slow tail wag, gentle breathing) stack on top, so Pip can sit, breathe, blink, and twitch an ear at once. Springs on the head, ears, and tail add follow-through. Breathing and blinking also run on their own while he is awake.

`src/core/director.ts` prefers physical motion over a full-body emote. A jump, climb, landing, skid, or run keeps its movement clip. A walk keeps `walk_left` or `walk_right` unless the emote is one of the two travel clips, `approach_window` or `sidestep`. When the gait is `none`, a base emote replaces the idle pose. If a clip cannot start from the current posture, the engine inserts a bridge such as sit-to-stand or wake.

Turning passes through a front view instead of popping from left to right. Sleep can only be interrupted by a click, a pet, becoming active, or an explicit wake. Gait phase advances from distance travelled, so a stationary sit does not shuffle its feet and a run covers more ground per step than a walk.

Pose samples stay inside the catalogue limits: head turn under 40 degrees, head tilt under 30, body roll under 30, squash above 0.6, and stretch under 1.4. The engine then clamps the displayed pose again. New clips should stay inside those ranges. Widening the limits to fit a pose will fail `tests/animation.test.ts`.

## Playback variation

`src/core/animation/variation.ts` adds one of ten small flavors to every settled base clip: a lean, a head tilt, a higher or lower tail, or a slight crouch. Ears are left to the clip, so an ear twitch can release back to a neutral rest.

A flavor is chosen when the clip starts, and a clip that keeps playing picks another about every 2.4 seconds. The flavor stays off during the crossfade, then eases in, so the blend itself does not jump. Being picked up does not take a flavor. Sleep flavors are smaller and do not open the eyes.

This is variation on top of a clip. It is separate from the named pose sets below. A sit style such as `sit_loaf` is a different clip. The flavor only nudges it.

## Pose sets the behaviour actually uses

The behaviour engine does not pick a random clip from the whole catalogue. Long rests rotate through a named list. The index comes from Pip’s age, so the sequence is stable and tests can see every member.

| Set | Clips | When it shows | Rotation |
| --- | --- | --- | --- |
| Sit | 10 | Idle sitting, an asked-for sit, and staying | Every 6 seconds |
| Lie | 10 | Idle rest when he is tired enough to lie down | Every 8 seconds |
| Sleep | 10 | While asleep, including snore and both dream clips | Every 4 seconds |
| Sad | 10 | The desk has been quiet and he still has energy to feel left out, or for a few seconds after a window closes | Every 5 seconds |
| Stand | 25 | A rested idle, in place of sitting, about one stretch in three | Every 4 seconds |
| Window, floor | 15 | Noticing a window, arriving at the glass, standing watch, and resting beside a window | Every 3–4 seconds |
| Window, ledge | 10 | Resting on a perch, and the small motions he makes while he stays there | Every 5 seconds |

Sadness does not replace sleep, a chase, or a window expedition. It replaces an ordinary sit when idle time is past 50 seconds, his attention need is low, and he is not already exhausted. Closing a window still plays `window_closed` first, then holds a sad mood for about eight seconds.

Standing replaces that same ordinary sit when his energy is high, he is not ready for a nap, and the current age bucket says stand. If windows are open and he is on the floor, that standing time uses a floor window reaction (`stand_watch`) instead of a plain standing pose.

Arriving on a perch still plays `look_over_edge` first. The ledge set takes over once he is resting there. Floor arrivals rotate through the fifteen floor reactions rather than repeating the same sniff.

Short reactions stay specific. A greeting is `greet`. A finished Codex task is `celebrate`. A failed one is `react_failure`. Focus mode, a covering window, a display change, a resize above him, and quiet typing keep `duck`, `perk`, `peek_up`, and `listen`. Those exact clips are what the behaviour tests lock.

**More of that** and **Not that** learn the activity, not the individual pose. Sadness counts as resting. Standing, standing watch, and resting on a window count as idle expressions.

## Sit, lie, and sleep

**Sit:** idle_sit, sit_lean, sit_sprawl, sit_side, sit_tall, sit_curl, sit_lazy, sit_cocked, sit_loaf, sit_proud

He can sit upright, lean, sprawl, sit sideways, sit tall, curl, go lazy, cock his head, loaf, or look proud. The intro’s first and last sits stay on the plain idle pose so the introduction itself does not drift.

**Lie:** idle_lie, lie_flat, lie_side, lie_curl, lie_belly, lie_stretch, lie_chin, lie_sprawl, lie_tuck, lie_lazy

**Sleep:** sleep_breathe, sleep_curl, sleep_sprawl, sleep_side, sleep_belly, sleep_tuck, sleep_loaf, snore, dream_paws, dream_run

Sleep clips keep the eyes closed. Ordinary cursor movement and window events do not wake him. A click, a pet, or an explicit wake does.

## Sad

**Sad:** sad, sad_sigh, sad_paw, sad_aside, sad_curl, sad_whimper, sad_chin, sad_shuffle, sad_ear, sad_wait

These are seated poses: a sigh, a look at one paw, a turn away, a curl, a whimper, a chin on the paws, a shuffle, one ear trying to perk, and a small hopeful wait. The tail stays low. They are moods, not a request for the user to do anything.

## Standing

**Stand:** stand_square, stand_left_paw, stand_right_paw, stand_lean_left, stand_lean_right, stand_tall, stand_crouch, stand_alert, stand_soft, stand_nose_down, stand_look_up, stand_look_back, stand_wide, stand_crossed, stand_one_ear, stand_tail_high, stand_tail_low, stand_forward, stand_back, stand_side_eye, stand_panting, stand_sniffing, stand_proud, stand_shy, stand_ready

Each one is a different way of being on his paws: square, one paw lifted, a lean, tall, crouched, alert, soft, nose down, looking up or back, wide, weight shifted, one ear up, tail high or low, forward or back, a side eye, panting, sniffing, proud, shy, or ready. Walking, trotting, running, jumping, and climbing still use the movement clips. A standing style only plays when the gait is `none`.

## Window reactions

**On the floor:** win_sniff_left, win_sniff_right, win_paw_left, win_paw_right, win_both_paws, win_tilt_left, win_tilt_right, win_peek_low, win_stretch_up, win_step_back, win_nose_press, win_double_take, win_tail_watch, win_hop_look, win_slow_watch

**On a ledge:** ledge_chin, ledge_paw_dangle, ledge_lean_left, ledge_lean_right, ledge_peek_down, ledge_ears_up, ledge_tail_hang, ledge_shift, ledge_sniff, ledge_doze

He sniffs either side of a frame, taps with one paw or both, tilts, peeks low, stretches toward the title bar, steps back, presses his nose, double-takes, watches with his tail, hops, or settles into a slow watch. From a perch he rests his chin, dangles a paw, leans, peeks down, perks, hangs his tail, shifts his weight, sniffs the edge, or dozes.

These do not replace the climb. While he is walking or climbing, the movement clip wins. The window pose plays when he is noticing, when he has arrived, or while he is staying.

The older desktop reactions are still in the catalogue and still used for specific events:

notice_app, approach_window, look_over_edge, jump_ledge, land_ledge, rest_ledge, sit_ledge, walk_ledge, prepare_jump_down, jump_down, investigate_cursor, follow_window, lose_interest, window_closed, watch_progress, celebrate_work, react_failure, perk, peek_up, sniff_frame, paw_glass, settle_paws, listen, duck, sidestep, shake_off, peek_along

## The rest of the catalogue

**Idle and small habits:** gentle_breathing, slow_blink, double_blink, ear_twitch_left, ear_twitch_right, nose_twitch, head_subtle, look_left, look_right, look_up, look_down, look_behind, tail_slow_wag, paw_adjust, weight_shift, head_tilt, body_shake, sniff_ground, sneeze, knead, lick_nose

**Movement:** walk_left, walk_right, trot, run, accelerate, decelerate, skid_stop, turn_around, reverse, jump, land, hop, bounce, careful_approach, back_away, follow_cursor, chase_cursor, walk_to, investigate, recover_balance, climb_window

**Rest and bridges:** stand_to_sit, sit_to_stand, sit_to_lie, lie_to_sit, curl_up, fall_asleep, sleep_twitch, yawn, wake, stretch_front, stretch_full, scratch_ear, scratch_neck, shake_wake, roll_shoulder, lick_paw, doze, stretch_side, pant

**Emotion:** happy_wag, excited_jump, curious, confused_tilt, surprised, startled, frustrated, proud, celebrate, request_attention, play_bow, bark, whimper, look_expectant, beg, dig, greet, held, tail_chase, paw_wave, wiggle, pounce

The playground can play every id, including a full cycle. A clip in the catalogue is not a promise that every desktop moment will choose it. The pose sets above are the ones the behaviour engine rotates on its own.

## Verifying the catalogue

Run `npm test -- tests/animation-catalogue.test.ts --reporter=verbose` for a named result for every registered clip and every declared starting posture. The checks exercise actual engine playback, finite and bounded poses, changing poses, event markers, the expected ending posture, exactly-once completion, and pickup/landing interruption for every clip. A separate sequence runs the entire catalogue without resetting between entries, including additive clips.

`tests/animation.test.ts` checks pose ranges and that the ten playback flavors are distinct. `tests/core.test.ts` checks that sitting, sleeping, sadness, and standing actually rotate through their sets, and that the pinned reactions (`greet`, `celebrate`, `react_failure`, `duck`, `perk`, `peek_up`, `listen`, `notice_app`, `look_over_edge`) stay put. `tests/ears.test.ts` checks that ear poses release after a clip finishes, which is why playback flavors do not offset the ears.

Regression checks also cover low-frame-rate timing, playback speed, pause, continuous tail phase, movement preparation, braking, and recovery after resetting the playground pose. Ordinary elapsed frames up to one second are integrated in small steps. Longer suspension gaps are capped to avoid simulating an unbounded backlog.

For rendered inspection, run `npm run playground` and choose **Cycle every animation**. Each completed clip receives a **played** label and the status shows the running count and final playback result. A timeout or invalid pose marks the clip **failed** and continues with the next entry. Pause freezes the animation clock, including breathing and tail motion. Changing speed affects that same clock. Selecting another clip or simulator event stops the cycle cleanly.

Playback checks do not certify artistic quality. Inspect the puppy through each clip, against both light and dark backgrounds, with particular attention to paw contact, silhouettes, ear visibility, and transitions. The playground and desktop pet share the same engine, movement preparation, and drawing code.

## Suspended pose and animation coaching

Pickup uses a separate suspended-leg rig (`src/core/rig.ts`), with two relaxed segments per leg and gravity compensation for body rotation. All four paws hang downward with small independent sways. This is separate from the seated ledge pose. Releasing clears the held behaviour immediately and allows gravity to continue during the autonomy delay.

`src/core/animation/coach.ts` runs deterministic playback trials for every clip, checks raw samples as well as engine poses, and compares peak normalised pose changes during the initial blend. Only improvements of at least 10% are retained. Blend durations remain between 180 and 480 ms and below 60% of a clip's duration. Pickup and clips with takeoff, land, or impact markers retain their original timing. This is a numerical continuity check, not visual or anatomical certification. Results and calibration are local memory, shared by the desktop pet and playground, and removable through Clear memory.

## Adding a clip

1. Add the clip to `clips.ts`, or to a pose set in `extra.ts` if it belongs to sit, lie, sleep, sad, stand, or window reactions.
2. If behaviour should choose it on its own, add the id to the matching style list and to the rotation in `src/core/behaviour.ts`. A clip that is only in the catalogue can still be played from the playground or by `force: { action: 'emote' }`.
3. Keep the sample inside the pose limits above. Looping rests should change a little over the clip so the catalogue sees motion.
4. Add the id to the group in this file.
5. Run the catalogue test, `tests/animation.test.ts`, and `npx tsc --noEmit -p tsconfig.json`.

Do not point a walking or climbing plan at a full-body rest clip. The director will prefer the gait, and a rest emote on a travel plan can make a climb look like it never started.

## Window ascent performances

Pip now selects a springing approach, an alternating scramble or a careful crawl once per window visit. The choice considers the height, energy, confidence and playfulness. Low ledges use a real crouch and jump arc. A springing climb begins with a short jump before catching the frame; careful approaches may test the window with one paw first.

The physical controller reports anticipation, leap, climb and pull-up progress. The animation director uses that report to choose `window_ready`, `jump_paws_up`, `climb_scramble`, `climb_careful` and `climb_pull_up`. `window_paw_test` is the separate frame-investigation gesture. Alternating articulated forelegs now reach above the shoulders and remain visible in front of the muzzle. The last 90 screen points use a slower pull-up, then the existing ledge landing takes over after actual contact.

These poses remain on the existing movement, rig and animation pipeline. Their paw reaches follow physical progress rather than a repeating clip timer. Missing windows, dragging and landing clear the ascent state; pickup immediately replaces reaching paws with the held rig. Generic playback variations no longer override ear gestures, and the coach preserves physical ascent timing.

The desktop panel disables Chromium background throttling so another active application does not stall the sequence. Pip retains the renderer's existing quality and idle/sleep frame budgets. Movement integrates delayed frames in bounded substeps.
