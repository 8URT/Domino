# Domino Lakaz — Mauritian 4-Player Domino

4-player Mauritian-rules domino for phones and browsers. Create a room code, share the link, play in teams of two.

## Play online

### Option A — Full game (recommended)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/8URT/Domino)

1. Click **Deploy to Render** and connect GitHub.
2. Click **Create Web Service** (free tier).
3. When deploy finishes, open your Render URL (e.g. `https://domino-lakaz.onrender.com`).
4. Share that **full URL** with the other 3 players.

### Option B — GitHub Pages (static mirror)

After the latest push, enable Pages once:

**Repo → Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `gh-pages` / `/ (root) → Save**

Then open: **https://8urt.github.io/Domino/mauritian-domino.html**

> GitHub Pages hosts the game files only — for cross-phone multiplayer, use **Option A (Render)** or run `node server.js` locally.

### Option C — Local network

```bash
git clone git@github.com:8URT/Domino.git
cd Domino
node server.js
# open http://localhost:8000
```

**Repo:** https://github.com/8URT/Domino (public)

---

## 1. Current state

- **Game client**: `mauritian-domino.html` — HTML + CSS + vanilla JS, no build step.
- **Game server**: `server.js` — shared room storage so phones on the same URL can join room codes.
- **Deploy**: `render.yaml` for one-click Render deploy; GitHub Actions publishes the repo to GitHub Pages (static mirror — use Render for live multiplayer).
- Fully playable end-to-end: create/join room → lobby → deal → play → score → next round → match end.

---

## 2. Game rules implemented

- 4 players, fixed teams: seats `0 & 2` ("Team Gold") vs seats `1 & 3` ("Team Teal"),
  partners sit across the table.
- Double-six set (28 tiles), 7 tiles dealt per player, **no boneyard/draw pile**.
- Whoever holds `[6,6]` must open the round with it.
- Must play a legal tile if you have one; pass is only allowed with zero legal tiles.
- Round ends by:
  - **Domino** — a player empties their hand → their team scores the sum of pips
    left in the *opposing* team's two hands.
  - **Blocked** — all 4 players pass in a row → team with fewer total pips scores
    the difference (tie = no score).
- Match ends when either team's score reaches `targetScore` (default 100,
  configurable in the lobby).
- Next round's starter = whoever dominoed last round; after a block, it's
  whoever holds double-six again (re-dealt fresh each round).

If your house rules differ (e.g. "any tile" opens rounds after the first,
different tie-break, different draw rules), that logic lives in `dealNewRound()`
and `finishRound()` — see §5.

---

## 3. File structure (all in `mauritian-domino.html`)

```
<style>            Design tokens + component CSS (felt table, wood, tile faces)
<body>
  #screen-landing   Create / Join room forms
  #screen-lobby     Room code, seat list, target score, Start button
  #screen-game      Table view: opponents strip, board chain, my hand, log
  #overlay-end      Round/match result modal
  #overlay-rules    Rules reference modal
<script>            All game logic (IIFE, "use strict")
```

### Key JS sections (in order)

| Section | Purpose |
|---|---|
| Session helpers (`saveSession`/`loadSession`/`clearSession`) | Personal (per-user) storage: which room/seat/name *this browser* is in |
| Room helpers (`getRoom`/`setRoom`/`newRoomState`) | Shared (per-room) storage: the entire game state, JSON blob |
| Deck helpers (`fullDeck`, `shuffle`, `seatHand`, `handPips`, `boardEnds`) | Pure functions computing hands/pips/chain-ends **derived from** `deck` + `board`, never stored directly |
| Landing actions | Create room (`btn-create`), Join room (`btn-join`, `joinRoom()` with retry-on-collision) |
| Lobby | Render seats, target score, `dealNewRound()`, Start button |
| Game render (`renderGame`) | Full re-render on each poll tick: scores, opponents, board, hand, turn banner, log |
| Play logic (`onTileClick`, `renderSideChoice`, `commitPlay`) | Validates + writes a tile play to shared room state |
| Scoring (`finishRound`, `showEndOverlay`) | Round/match resolution |
| Polling (`startPolling`/`stopPolling`) | `setInterval` loop calling `getRoom` + a render function |
| `boot()` | On load, restores session from personal storage and jumps to lobby/game if already in a room |

### Data model — shared room object (one per room code)

```js
{
  code: "ABCD",
  status: "waiting" | "playing" | "roundEnd" | "matchEnd",
  players: [{ seat: 0, name: "Kevin" }, ...],   // up to 4
  targetScore: 100,
  deck: [[a,b], ...],        // 28 shuffled tiles, set once per round
                              // seat N's dealt hand = deck.slice(N*7, N*7+7)
  board: [                   // the played chain, in order
    { seat: 0, tile: [6,6], leftVal: 6, rightVal: 6 },
    ...
  ],
  turnSeat: 0,
  passStreak: 0,
  scores: [0, 0],             // [teamGold, teamTeal]
  roundNum: 1,
  roundStarterSeat: 0,
  lastRoundResult: { reason, winningTeam, awarded, winningSeat } | null,
  log: ["..."],                // capped ~40 entries, last 12 shown
  lastUpdated: <timestamp>
}
```

Important: **a player's hand is never stored explicitly.** It's always derived
as `deck.slice(seat*7, seat*7+7)` minus tiles that seat has already played
(found by scanning `board`). This is what lets any client compute anyone's
hand/pip-count from the shared blob — see the privacy caveat below.

### Data model — personal session object (one per user)

```js
{ code: "ABCD", seat: 2, name: "Priya" }
```

---

## 4. Known limitations / things to fix in a real port

1. **No real backend.** `window.storage` is a Claude.ai-artifact-only API. To
   run this anywhere else you need to swap `getRoom`/`setRoom`/`saveSession`/
   `loadSession`/`clearSession` for real calls — e.g. Firebase Realtime DB /
   Supabase / a small WebSocket server. Polling every 1.5s should become a
   subscription/push if you move to sockets (removes latency + the "last
   write wins" race risk on simultaneous plays).

2. **Hands are not private from a technical standpoint.** Because `deck` (the
   full shuffle order) is in the shared room object, a nosy player could read
   the room's storage and reconstruct everyone's hand. The UI just doesn't
   show it to them. If you want real hidden information:
   - Move each player's hand to a per-player private channel, OR
   - Give each client only the tiles relevant to them from a server that
     holds the real deck (i.e. move dealing server-side).
   This is the single biggest thing worth fixing if this becomes a "real" app.

3. **Last-write-wins concurrency.** Two clients writing to the same room at
   nearly the same instant (e.g. both racing to click "Start" or "Deal next
   round") can clobber each other. Turn-based play is mostly safe since only
   the active player's client writes during play, but lobby/round-transition
   buttons are shared-tap and should probably be made idempotent or
   host-only. Look at `btn-start`, `btn-next-round`.

4. **No reconnect/spectator handling** beyond the basic `boot()` session
   restore. If a player closes the tab mid-round there's no "kick inactive
   player" or AI-takeover flow.

5. **No animations for tile placement**, no sound, no drag-and-drop (tiles
   are tap-to-play with a left/right chooser when both ends match).

6. **Room codes never expire.** Add TTL/cleanup once on a real DB.

7. **Validation is client-trusting.** Any client could, in principle, craft a
   bad write to shared storage. Fine for a friendly game, not for anything
   adversarial — move validation server-side if that matters.

---

## 5. Good places to extend

- `dealNewRound(r, starterSeatOverride)` — change opening rules here (e.g.
  "any tile opens rounds after round 1").
- `finishRound(r, reason, winningSeat)` — change scoring rules here (e.g.
  count partner's leftover pips too, different tie-break).
- `canPlayTile(tile, ends)` — chain-matching logic; extend here if you want
  spinner/branching doubles instead of a single linear chain.
- `pipGridHtml(n)` — dot layout per pip count, 0–6, if you want a different
  tile art style.
- CSS custom properties at the top of `<style>` (`--felt-1`, `--gold`,
  `--team-a`, `--team-b`, etc.) control the whole palette — safe to reskin
  without touching layout.

---

## 6. Suggested next steps in Cursor

1. Decide on a backend (Supabase is probably fastest for realtime + a KV-ish
   `rooms` table matching the JSON shape above almost 1:1).
2. Extract the JS out of the single file into modules: `deck.js`, `room.js`
   (storage adapter), `render.js`, `rules.js` (deal/play/score) — the pure
   functions in §3's table are already mostly side-effect-free and should
   port cleanly.
3. Replace polling with realtime subscriptions once on a real backend.
4. Add a lightweight test suite around `seatHand`, `boardEnds`,
   `canPlayTile`, and `finishRound` — they're pure and easy to unit test.
5. Only after the above: worry about animation/polish/sound.
