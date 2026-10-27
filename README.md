# Pocket QB

A quarterback read trainer: call a play, read the coverage, throw it. Defenses play
NFL-style match rules; situations, tendencies and the expected-points model come from
nflverse NFL data (2023-2025).

- Source: the `*.js` files and `index.html` at the top level.
- Installable build: `docs/` (served by GitHub Pages). Rebuild with `python3 build_pwa.py`.
- Install on iPhone: open the Pages address in Safari, Share, Add to Home Screen.
- Tests: `tests/` (node fuzz suites, Playwright UI suite).

NFL data: nflverse play-by-play and participation data, and FTN Data via nflverse (CC BY-SA 4.0).
