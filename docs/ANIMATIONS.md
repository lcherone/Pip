# Animation catalogue

Clips live in `src/core/animation/clips.ts`. Each entry records an id, category, duration, loop flag, interruptibility, priority, legal starting states, ending state, and playback speed.

Base clips replace the body pose. Additive clips (blinks, ear twitches, a slow tail wag, gentle breathing) stack on top, so Pip can sit, breathe, blink, and twitch an ear at once. Springs on the head, ears, and tail add follow-through. Breathing and blinking also run on their own while he is awake.

Turning passes through a front view instead of popping from left to right. Sleep can only be interrupted by a high-priority wake or an explicit user action. If a clip cannot start from the current posture, the engine inserts a bridge such as sit-to-stand or wake.

The playground can play every id, including a full cycle. These are the ids:

**Idle:** idle_stand, idle_sit, idle_lie, gentle_breathing, slow_blink, double_blink, ear_twitch_left, ear_twitch_right, nose_twitch, head_subtle, look_left, look_right, look_up, look_down, look_behind, tail_slow_wag, paw_adjust, weight_shift, head_tilt, body_shake, sniff_ground, sneeze, knead, lick_nose

**Movement:** walk_left, walk_right, trot, run, accelerate, decelerate, skid_stop, turn_around, reverse, jump, land, hop, bounce, careful_approach, back_away, follow_cursor, chase_cursor, walk_to, investigate, recover_balance, climb_window

**Rest:** stand_to_sit, sit_to_stand, sit_to_lie, lie_to_sit, curl_up, fall_asleep, sleep_breathe, sleep_twitch, dream_paws, yawn, wake, stretch_front, stretch_full, scratch_ear, scratch_neck, shake_wake, roll_shoulder, lick_paw, doze, stretch_side, pant, snore, dream_run

**Emotion:** happy_wag, excited_jump, curious, confused_tilt, surprised, startled, sad, frustrated, proud, celebrate, request_attention, play_bow, bark, whimper, look_expectant, beg, dig, greet, held, tail_chase, paw_wave, wiggle, pounce

**Desktop:** notice_app, approach_window, look_over_edge, jump_ledge, land_ledge, rest_ledge, sit_ledge, walk_ledge, prepare_jump_down, jump_down, investigate_cursor, follow_window, lose_interest, window_closed, watch_progress, celebrate_work, react_failure, perk, peek_up, sniff_frame, paw_glass, settle_paws, listen, duck, sidestep, shake_off, peek_along

Gait phase advances from distance travelled, so a stationary sit does not shuffle its feet and a run covers more ground per step than a walk.


## Verifying the catalogue

Run `npm test -- tests/animation-catalogue.test.ts --reporter=verbose` for a named result for every registered clip and every declared starting posture. The checks exercise actual engine playback, finite and bounded poses, changing poses, event markers, the expected ending posture, exactly-once completion, and pickup/landing interruption for every clip. A separate sequence runs the entire catalogue without resetting between entries, including additive clips.

Regression checks also cover low-frame-rate timing, playback speed, pause, continuous tail phase, movement preparation, braking, and recovery after resetting the playground pose. Ordinary elapsed frames up to one second are integrated in small steps; longer suspension gaps are capped to avoid simulating an unbounded backlog.

For rendered inspection, run `npm run playground` and choose **Cycle every animation**. Each completed clip receives a **played** label and the status shows the running count and final playback result. A timeout or invalid pose marks the clip **failed** and continues with the next entry. Pause freezes the animation clock, including breathing and tail motion; changing speed affects that same clock. Selecting another clip or simulator event stops the cycle cleanly.

Playback checks do not certify artistic quality. Inspect the puppy through each clip, against both light and dark backgrounds, with particular attention to paw contact, silhouettes, ear visibility and transitions. The playground and desktop pet share the same engine, movement preparation and drawing code.


## Suspended pose and animation coaching

Pickup uses a separate suspended-leg rig (`src/core/rig.ts`), with two relaxed segments per leg and gravity compensation for body rotation. All four paws hang downward with small independent sways. This is separate from the seated ledge pose. Releasing clears the held behaviour immediately and allows gravity to continue during the autonomy delay.

`src/core/animation/coach.ts` runs deterministic playback trials for every clip, checks raw samples as well as engine poses, and compares peak normalised pose changes during the initial blend. Only improvements of at least 10% are retained; blend durations remain between 180 and 480 ms and below 60% of a clip's duration. Pickup and clips with takeoff, land or impact markers retain their original timing. This is a numerical continuity check, not visual or anatomical certification. Results and calibration are local memory, shared by the desktop pet and playground, and removable through Clear memory.
