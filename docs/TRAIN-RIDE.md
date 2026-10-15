# Maglev ride: walkable train + station hook

Files: `public/world-train-v2.js` (the train model), `public/world-transit.js` (the ride), host wiring in
`public/SHADDAI-WORLD-3D.html`. Tests: `tools/tests/world-train-ride.test.cjs` and `tools/tests/world-train-v2.test.cjs`
(run with `node <file> < /dev/null`).

## What the player gets

1. **Board.** Press E at a station pad, pick a destination, and the mouse is grabbed again. The train parks at the platform
   with the platform-side doors open, and you start on the platform next to the nearest door. Walk in. About 1.5 s after
   you're inside, the doors shut and the train leaves. If you haven't boarded after 30 s, you're put aboard automatically.
2. **Walk.** WASD moves you along the aisle and through the gangways between all 4 cars. Walls, seat rows, sofas, tables,
   the bar counter, stools and the closed doors are solid. The view turns with the train as it goes round the ring.
   The cabin switches you to first person; V still toggles the view, and your old setting comes back when you leave.
3. **Sit.** E puts you in the nearest free seat within 1.8 m. Press E again to stand up in the aisle. Seat classes:
   - `standard`: 2+2 rows in cars 1, 2 and 4.
   - `lounge`: 3-seat sofas against the walls of car 3, facing across the car, each with a low table.
   - `bar`: stools at a counter along the windows of car 3, facing out.
   - `pilot`: one seat at each nose, behind a console. View only; it doesn't drive the train.
4. **Arrive.** The train stops, the platform-side doors slide open, and you walk out onto the platform. You're then set
   down at the station pad by the lift. If you stay aboard, you're stepped off automatically 45 s after the doors open.
5. **The HUD stays live.** The ride only takes the E key. M (map), C (chat), T (talk), Tab, N, and any phone or inventory
   key pass straight through. The walkable ride makes no DOM overlay and doesn't override the camera. While you're aboard,
   the host blocks the dragon (H), bike (B) and hoverboard (O) keys.

The downloaded-GLB fallback (`maglev-train.glb`, no interior data) keeps the old camera-follow ride.

## Train-local model

While you're aboard, the player's position is kept in **model metres** of the trainset: x runs across the car, y is up,
z runs along the train, and z=0 is the train's centre. Every frame the position is converted to world space through the
moving car (`toWorld`), so standing and sitting both track the train exactly. The host calls `update()` at the top of
the frame, before player movement, so there's no one-frame lag.

`buildMaglevTrainV2().userData` provides:

| field | meaning |
|---|---|
| `seats[i]` | `{x,y,z,kind,yaw,car,ax,az,pilot?}`. `yaw` is the facing direction (0 = +Z). `ax/az` is the aisle spot you stand up to. |
| `floors` | `[{min,max}]` walkable boxes (cabins, cockpits, gangways). The floor height is `min.y`. |
| `colliders` | `[{min,max}]` solid boxes: walls with gaps at the doors, end walls, seats, tables, the counter. |
| `doors` | `[{z, side, car}]`. The door panels are meshes with `userData.doorIdx`. |
| `cabin` | `{floorY, halfW, A, doorW, cars}` |

## Host API (`window.__worldTransitApi`)

- `aboard()` returns true while you're on a walkable ride.
- `walk(dt, {fwd,back,left,right,sprint}, camYaw)` returns the world velocity in u/s. `camYaw` is `atan2(fwd.x, fwd.z)`.
- `aboardYawDelta()` gives the change in train heading this frame; the host adds it to `_look.yaw/tYaw`.
- `seatYaw()` gives the world facing of the occupied seat, or null.
- `sit()` toggles sit/stand, the same as E.
- `aboardInfo()` returns `{phase, seat, kind, x, y, z, side, doors}`, where phase is `board`, `run` or `arrive`.

## Station hook: `addStation` (for colosseum-underground.js)

```js
var T = window.__worldTransitApi;
if (T && T.addStation) T.addStation({
  id: 'colosseum', name: 'Colosseum Underground',
  x: padX, z: padZ,              // world units: where the rider is set down
  underground: true, y: -8 * U,  // optional: set down at this height (the basement platform floor)
  onArrive: function (st) { /* e.g. enter the basement / show the arrival board */ }
});
```

- The stop shows up in every station's destination menu (marked ⤓ if it's underground). Standing within about 16 m of
  (x, z) and pressing E opens the menu from it.
- The ring train serves the stop at its **bearing** (`atan2(z, x)`): it runs the ring to that angle, opens its doors,
  and when you walk out it sets you down at (x, z, y) and calls `onArrive(st)`. There's no separate spur track yet. A
  visible spur or trench is the caller's job; if one is added later, it can reuse the same stop record.
- Calling `addStation` again with the same id replaces the stop. `removeStation(id)` removes stops added through the
  hook; the built-in stations can't be removed.
- The dragon gate still applies. `window.__dragons.isOpen(id)` can refuse the ride.

## Needs a real browser to confirm

- How the cabin looks from inside: the open gangway tubes, the door openings, and the panels sliding open.
- Pointer lock being grabbed again after clicking a destination.
- Sitting shows your normal standing avatar. There's no sit clip yet; the avatar only turns to face along the seat.
- Being set down at the pad is instant. The world-space platform isn't walkable, so the lift is implied.
