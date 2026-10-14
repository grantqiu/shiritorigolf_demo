# 常用スポーツセンター — Kanji Golf & ことば相撲

Browser word-sport games built on a JMdict/KANJIDIC compound dictionary. No build step: open `index.html` (or serve the folder) in a browser.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

## What's here

| Path | What |
| --- | --- |
| `index.html` | The sports-center hub: ⛳ Kanji Golf (熟語しりとり 9 holes), range, course builder, 🎾 tennis rally, gym/notes. |
| `data/dict.js` | Dictionary blob used by the hub (word lists, readings, rare words, courses). |
| `sumo/` | **ことば相撲** — the rebuilt sumo game, now a standalone page (linked from the hub's 🤼 tab/card). |
| `tools/generate_course.py` | Golf course generator (mines the 2-kanji compound graph for par-N holes). |
| `tools/build_sumo_data.py` | Validates `sumo/bank.txt` and writes `sumo/data.js`. |
| `tests/` | Engine tests: `node --test tests/*.test.js` |

`media/` (park map image, MP3 sound effects) is referenced by the hub but not checked in; the hub falls back to a drawn map and synth sounds without it.

## ことば相撲 (sumo)

A 16-bit-style bout against the CPU. Every exchange is a **slow-motion pressure moment**: time slows, the camera zooms onto the targeted body part (胸・喉・廻し・腰・足), it pings, and you have a few seconds to respond.

- **立合い** — hit any key / tap on 「はっけよい！」. Too early (or faster than 100 ms) is 待った; twice loses the charge.
- **Moves** (`1`–`4`): 押し / 差し ask for the word from its **reading** (type it in kanji); 突き / 投げ ask from a **description** — harder, stronger. 投げ needs a mawashi grip (差し first).
- **Defense** — when the CPU attacks you get a reading clue; answer fast and exact to いなし (counter).
- **Edge** — driven to the tawara you **mash** to dig in; drive them there and you **time** the finish ring.
- HUD bars: **体** stamina (spent by moves), **気** spirit (spent by 突き/投げ), **安** balance (0 = you fall).
- Pick & ban one topic before each bout; the CPU bans the topic you're best at.
- **本場所**: 5-bout tournaments; 3+ wins promotes you up the banzuke (序ノ口 → 横綱). Progress is saved in `localStorage`.
- Missed words go into a post-bout report and can be saved to the hub's gym notes (`kanjigolf_notes`).

### Code layout

- `sumo/engine.js` — pure rules (no DOM). The opponent is a controller object (`makeCpu`) with `nextDelay / chooseMove / blockChance`, so a network opponent can replace it for PvP later.
- `sumo/render.js` — 384×216 canvas renderer (arena, rikishi, slow-mo camera, pings).
- `sumo/audio.js` — WebAudio synth SFX (no files).
- `sumo/main.js` — screens, career, input (IME-aware), report.
- `sumo/bank.txt` — the clue bank. Edit it, then run `python3 tools/build_sumo_data.py`.
