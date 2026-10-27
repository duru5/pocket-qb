/* Pocket playbook: formations, route tree, drops and the 12-concept library.
   Everything here is data. Concepts reference formation slots (X, H, Y, Z, RB)
   and route ids; the engine turns them into timed runs.

   Route points are [o, d]: o = yards toward that player's sideline from his
   alignment (negative = inside), d = absolute depth from the LOS.
   brk = index of the point treated as "the break" for timing stats.
   Beater tags are first-pass coaching conventions. Phase 3's oracle tests
   each one against the simulated defense. */
(function (root) {
  "use strict";
  const BX = 53.33 / 2;

  /* ---------- formations (11 personnel, ball on the middle hash) ----------
     7 on the line: 5 OL plus the two players at y = -0.4.
     rel = extra release time (inline TE, back out of the gun). */
  /* personnel: RBs then TEs (11 = 1 RB, 1 TE, 3 WR). under: QB under center.
     Strength is to the right; a flipped call mirrors everything. */
  const FORMATIONS = {
    doubles: {
      label: "Doubles (2x2)", short: "Doubles", personnel: "11",
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        H:  { x: 17.0, y: -1.3, side: "L", arch: "SLOT" },
        Y:  { x: 36.5, y: -1.3, side: "R", arch: "TE" },
        Z:  { x: 45.0, y: -0.4, side: "R", arch: "WR" },
        RB: { x: 28.9, y: -5.0, side: "R", arch: "RB", rel: 0.25 }
      }
    },
    tripsR: {
      label: "Trips Right (3x1)", short: "Trips", personnel: "11",
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        Y:  { x: 34.0, y: -1.3, side: "R", arch: "TE" },
        H:  { x: 39.5, y: -1.3, side: "R", arch: "SLOT" },
        Z:  { x: 46.0, y: -0.4, side: "R", arch: "WR" },
        RB: { x: 24.4, y: -5.0, side: "L", arch: "RB", rel: 0.25 }
      }
    },
    ace: {
      label: "Ace (2x2, Y inline)", short: "Ace", personnel: "11",
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        H:  { x: 17.0, y: -1.3, side: "L", arch: "SLOT" },
        Y:  { x: 30.5, y: -0.6, side: "R", arch: "TE", rel: 0.15 },
        Z:  { x: 45.0, y: -1.3, side: "R", arch: "WR" },
        RB: { x: 28.9, y: -5.0, side: "R", arch: "RB", rel: 0.25 }
      }
    },
    bunchR: {
      label: "Bunch Right (3x1, tight)", short: "Bunch", personnel: "11",
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        Y:  { x: 36.0, y: -1.6, side: "R", arch: "TE" },
        Z:  { x: 38.0, y: -0.4, side: "R", arch: "WR" },
        H:  { x: 40.0, y: -1.6, side: "R", arch: "SLOT" },
        RB: { x: 24.4, y: -5.0, side: "L", arch: "RB", rel: 0.25 }
      }
    },
    spread10: {
      label: "Spread (2x2, four wide)", short: "Spread", personnel: "10",
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        H:  { x: 17.0, y: -1.3, side: "L", arch: "SLOT" },
        Y:  { x: 36.5, y: -1.3, side: "R", arch: "SLOT" },
        Z:  { x: 45.0, y: -0.4, side: "R", arch: "WR" },
        RB: { x: 28.9, y: -5.0, side: "R", arch: "RB", rel: 0.25 }
      }
    },
    trips10: {
      label: "Trips Right, four wide", short: "Trips", personnel: "10",
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        Y:  { x: 34.0, y: -1.3, side: "R", arch: "SLOT" },
        H:  { x: 39.5, y: -1.3, side: "R", arch: "SLOT" },
        Z:  { x: 46.0, y: -0.4, side: "R", arch: "WR" },
        RB: { x: 24.4, y: -5.0, side: "L", arch: "RB", rel: 0.25 }
      }
    },
    ace12: {
      label: "Ace twin tight ends (2x2)", short: "Ace Twin TE", personnel: "12",
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        H:  { x: 22.8, y: -0.6, side: "L", arch: "TE", rel: 0.15 },
        Y:  { x: 30.5, y: -0.6, side: "R", arch: "TE", rel: 0.15 },
        Z:  { x: 45.0, y: -1.3, side: "R", arch: "WR" },
        RB: { x: 26.7, y: -5.0, side: "R", arch: "RB", rel: 0.25 }
      }
    },
    wing12: {
      label: "Wing (Y inline, H on the wing)", short: "Wing", personnel: "12",
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        Y:  { x: 30.5, y: -0.6, side: "R", arch: "TE", rel: 0.15 },
        H:  { x: 33.2, y: -1.6, side: "R", arch: "TE" },
        Z:  { x: 45.0, y: -1.3, side: "R", arch: "WR" },
        RB: { x: 24.6, y: -5.0, side: "L", arch: "RB", rel: 0.25 }
      }
    },
    iform: {
      label: "I-formation (under center)", short: "I-Form", personnel: "21", under: true,
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        Y:  { x: 30.5, y: -0.6, side: "R", arch: "TE", rel: 0.15 },
        Z:  { x: 45.0, y: -1.3, side: "R", arch: "WR" },
        H:  { x: 26.7, y: -3.6, side: "R", arch: "FB", rel: 0.1 },
        RB: { x: 26.7, y: -6.6, side: "R", arch: "RB", rel: 0.2 }
      }
    },
    offset21: {
      label: "Offset I strong (under center)", short: "Offset I", personnel: "21", under: true,
      slots: {
        X:  { x: 8.5,  y: -0.4, side: "L", arch: "WR" },
        Y:  { x: 30.5, y: -0.6, side: "R", arch: "TE", rel: 0.15 },
        Z:  { x: 45.0, y: -1.3, side: "R", arch: "WR" },
        H:  { x: 28.8, y: -3.6, side: "R", arch: "FB", rel: 0.1 },
        RB: { x: 26.7, y: -6.6, side: "R", arch: "RB", rel: 0.2 }
      }
    }
  };
  const PERSONNEL = {
    "11": { label: "11", desc: "1 RB · 1 TE · 3 WR" },
    "12": { label: "12", desc: "1 RB · 2 TE · 2 WR" },
    "21": { label: "21", desc: "2 RB · 1 TE · 2 WR" },
    "10": { label: "10", desc: "1 RB · 0 TE · 4 WR" }
  };
  const OL = [-2, -1, 0, 1, 2].map(k => ({ x: BX + 1.35 * k, y: -0.7 }));

  /* ---------- route tree ---------- */
  const R = (label, pts, o) => Object.assign({ label, pts, settle: false, brk: 0 }, o || {});
  const ROUTES = {
    go:       R("Go",            [[0.5, 6], [1.0, 40]], { brk: -1, family: "vertical" }),
    fade:     R("Fade",          [[2.5, 8], [3.0, 40]], { brk: -1, family: "vertical" }),
    seam:     R("Seam",          [[0, 8], [-0.5, 40]],  { brk: -1, family: "vertical" }),
    hitch:    R("Hitch",         [[0, 6], [-0.5, 5.4]], { settle: true, family: "quick" }),
    slant:    R("Slant",         [[0, 1.5], [-9, 8]],   { family: "quick" }),
    quickout: R("Quick out",     [[0, 5], [6, 5]],      { family: "quick" }),
    out:      R("Out",           [[0, 10], [7, 9.5]],   { family: "intermediate" }),
    stick:    R("Stick",         [[0, 6], [0.8, 5.6]],  { settle: true, family: "quick" }),
    snag:     R("Snag",          [[-1.5, 4], [-3, 6]],  { settle: true, family: "quick" }),
    flat:     R("Flat",          [[2, 1.5], [9, 3]],    { family: "quick" }),
    in5:      R("In (5)",        [[0, 5], [-12, 5.5]],  { family: "quick" }),
    shallow:  R("Shallow",       [[-2, 2], [-30, 4]],   { family: "crosser" }),
    meshLow:  R("Mesh (under)",  [[-2, 2], [-30, 5]],   { family: "crosser" }),
    meshHigh: R("Mesh (over)",   [[-2, 2.5], [-28, 6]], { family: "crosser" }),
    sit:      R("Sit",           [[-3, 5], [-8, 10]],   { settle: true, brk: 1, family: "intermediate" }),
    curl:     R("Curl",          [[0, 12], [-1.5, 10.5]], { settle: true, family: "intermediate" }),
    dig12:    R("Dig (12)",      [[0, 12], [-14, 12.5]], { family: "intermediate" }),
    dig15:    R("Dig (15)",      [[0, 15], [-14, 15.5]], { family: "intermediate" }),
    sail:     R("Sail",          [[0, 10], [9, 14]],    { family: "intermediate" }),
    corner:   R("Corner",        [[0, 11], [8, 19]],    { family: "deep" }),
    cornerS:  R("Corner (short)", [[0, 8], [7, 16]],    { family: "deep" }),
    post:     R("Post",          [[0, 12], [-10, 24]],  { family: "deep" }),
    cross:    R("Deep cross",    [[0, 8], [-26, 16]],   { family: "deep" }),
    rbCheck:  R("Check-down",    [[1.5, -3], [3, 3]],   { settle: true, brk: 1, family: "back" }),
    rbFlat:   R("Flat (RB)",     [[3, -3.5], [9, 1]],   { family: "back" }),
    rbSwing:  R("Swing",         [[4, -5.5], [10, -3], [13, 0]], { brk: 1, family: "back" }),
    // the back stays in to block: steps up into the pocket and is not a target
    block:    R("Pass pro",      [[1.2, -4.3]], { settle: true, brk: -1, block: true, family: "back" }),
    blockTE:  R("Block",         [[0.6, -1.2]], { settle: true, brk: -1, block: true, family: "block" }),
    stalk:    R("Stalk block",   [[0, 3]],      { settle: true, brk: -1, block: true, family: "block" }),
    lead:     R("Lead block",    [[0.5, -0.5]], { settle: true, brk: -1, block: true, family: "block" }),
    carry:    R("Ball carrier",  [[0, -5]],     { settle: true, brk: -1, block: true, family: "back" }),   // a run's back; his path comes from the run sim
    paBlock:  R("Fake and block", [[-1.5, -3.2]], { settle: true, brk: -1, block: true, family: "back" }),
    sitIn:    R("Sit (6)",       [[-1, 6]],     { settle: true, family: "quick" }),
    hook8:    R("Hook (8)",      [[0, 8], [-1, 7]], { settle: true, family: "quick" }),
    wheel:    R("Wheel",         [[2.5, 1.5], [7, 4], [8, 40]], { brk: 1, family: "deep" }),
    angle:    R("Angle (RB)",    [[3, -3.5], [5, 0.5], [1, 5.5]], { brk: 1, family: "back" }),
    sluggo:   R("Sluggo",        [[0, 1.5], [-3, 5.5], [-2.5, 40]], { brk: 1, family: "deep" }),
    deepOver: R("Deep over",     [[0, 10], [-24, 20]], { family: "deep" }),
    drag:     R("Drag",          [[-1, 1.5], [-16, 3], [-26, 4]], { family: "crosser" }),
    comeback: R("Comeback",      [[0, 14], [2, 11.5]], { settle: true, family: "intermediate" }),
    fbFlatAway: R("Flat (away)",  [[-4, -2], [-10, 1]], { family: "back" })
  };

  /* ---------- drops (shotgun): time and depth to the top ----------
     Approximate; calibrate against time-to-throw data in Phase 7. */
  const DROPS = {
    quick: { label: "Quick (1-step)",  t: 1.1, depth: 1.0 },
    three: { label: "3-step",          t: 1.6, depth: 2.5 },
    five:  { label: "5-step",          t: 2.3, depth: 4.0 },
    fiveH: { label: "5-step + hitch",  t: 2.8, depth: 4.5 },
    pa:    { label: "Play-action",     t: 2.9, depth: 4.0, pa: true },
    boot:  { label: "Play-action boot", t: 2.6, depth: 1.5, lat: 8, pa: true }
  };

  const COVS = {
    c0: "Cover 0", c1: "Cover 1", c2: "Cover 2", tampa2: "Tampa 2",
    m2: "2-Man", c3: "Cover 3", c4: "Cover 4", c6: "Cover 6"
  };

  const KEYS = {
    flat:   "Flat defender",
    cloud:  "Cloud (flat) corner",
    mof:    "Middle-of-field safety",
    hook:   "Hook defender (Mike)",
    hookcf: "Curl/flat defender",
    lev:    "Corner's leverage (man)",
    safety: "Safety on that side",
    box:    "Box count"
  };

  /* ---------- concepts ---------- */
  const CONCEPTS = [
    { id: "smash", name: "Smash", formation: "doubles", forms: ["doubles", "spread10", "ace", "ace12"], drop: "three",
      family: "Hi-lo on the corner",
      routes: { X: "hitch", H: "corner", Y: "corner", Z: "hitch", RB: "rbCheck" },
      progression: ["H", "X", "RB"], key: "cloud",
      rule: "Pick a side pre-snap. Read the corner: if he sinks under the corner route, throw the hitch; if he squats on the hitch, throw the corner over him.",
      beats: ["c2", "tampa2", "c6"], weak: ["m2"],
      note: "Against single-high the corner route runs into the deep third, so the hitch becomes the answer." },

    { id: "flood", name: "Flood", formation: "tripsR", forms: ["tripsR", "bunchR", "trips10"], drop: "five",
      family: "Three-level stretch",
      routes: { X: "dig12", Y: "flat", H: "sail", Z: "go", RB: "rbCheck" },
      progression: ["H", "Y", "X", "RB"], key: "hookcf",
      rule: "The go clears the deep defender. Read the curl/flat player: if he widens with the flat, throw the sail behind him; if he sinks under the sail, throw the flat.",
      beats: ["c3", "c2"], weak: ["c4", "m2"],
      note: "The backside dig is the answer when the defense rolls coverage to the trips side." },

    { id: "mesh", name: "Mesh", formation: "doubles", forms: ["doubles", "spread10", "ace"], drop: "five",
      family: "Crossers",
      routes: { X: "meshLow", H: "sit", Y: "meshHigh", Z: "corner", RB: "rbSwing" },
      progression: ["Z", "H", "Y", "X", "RB"], key: "hook",
      rule: "Corner first. Against man, the crossers rub off each other at about 5 yards and run away from their defenders. Against zone, they sit in the first window past the hook defenders.",
      beats: ["c1", "c0", "c3"], weak: ["tampa2"],
      note: "Mesh varies a lot by system. This version uses X under, Y over, H sit and an RB swing." },

    { id: "dagger", name: "Dagger", formation: "doubles", forms: ["doubles", "spread10", "ace"], drop: "fiveH",
      family: "Clear and in-cut",
      routes: { X: "curl", H: "flat", Y: "seam", Z: "dig15", RB: "rbCheck" },
      progression: ["Y", "Z", "X", "RB"], key: "mof",
      rule: "The seam pulls the middle safety or the hook player. If he carries the seam, the dig opens underneath; if he stays home, throw the seam.",
      beats: ["c3", "c1"], weak: ["tampa2", "c4"],
      note: "The backside curl-flat is the outlet if the defense brackets the concept side." },

    { id: "stick", name: "Stick", formation: "tripsR", forms: ["tripsR", "bunchR", "trips10"], drop: "three",
      family: "Quick triangle",
      routes: { X: "slant", Y: "flat", H: "stick", Z: "fade", RB: "rbCheck" },
      progression: ["Y", "H", "X", "RB"], key: "flat",
      rule: "Read the flat defender. If he hangs inside on the stick, throw the flat; if he widens, the stick sits open behind him.",
      beats: ["c3", "c4"], weak: ["c2", "c1"],
      note: "The fade only matters as a clear unless the corner presses with no help." },

    { id: "snag", name: "Snag", formation: "tripsR", forms: ["tripsR", "bunchR", "trips10"], drop: "three",
      family: "Triangle",
      routes: { X: "slant", Y: "flat", H: "cornerS", Z: "snag", RB: "rbCheck" },
      progression: ["H", "Y", "Z", "RB"], key: "cloud",
      rule: "Corner and flat put the force player in a hi-lo. Whichever he leaves is the throw; if both are covered, the snag sits behind the hook defender.",
      beats: ["c2", "c3"], weak: ["c1", "c0"],
      note: "Sitting routes lose to tight man. Against press, the corner route is your best chance." },

    { id: "ycross", name: "Y-Cross", formation: "doubles", forms: ["doubles", "ace", "spread10", "wing12"], drop: "fiveH",
      family: "Deep crosser",
      routes: { X: "go", H: "flat", Y: "cross", Z: "post", RB: "rbCheck" },
      progression: ["X", "Y", "H", "RB"], key: "hookcf",
      rule: "Take the go only on a one-on-one look. Otherwise read the curl/flat player on the cross side: the cross comes open behind him when he jumps the flat.",
      beats: ["c3", "c1"], weak: ["c4"],
      note: "Y-Cross has many system variants. Here the post holds the middle safety and the go clears the deep third." },

    { id: "verts", name: "Four Verts", formation: "doubles", forms: ["doubles", "spread10", "ace", "ace12"], drop: "five",
      family: "Vertical stretch",
      routes: { X: "go", H: "seam", Y: "seam", Z: "go", RB: "rbCheck" },
      progression: ["Y", "H", "Z", "X", "RB"], key: "mof",
      rule: "Read the middle safety and throw the seam away from his leverage. Against two-high, the seams split the safeties.",
      beats: ["c3", "c2"], weak: ["c4", "tampa2"],
      note: "Four verticals against three deep defenders is the whole idea. Against four deep, check it down." },

    { id: "drive", name: "Drive", formation: "doubles", forms: ["doubles", "spread10", "ace", "wing12"], drop: "five",
      family: "Hi-lo on the hook",
      routes: { X: "shallow", H: "dig12", Y: "seam", Z: "go", RB: "rbCheck" },
      progression: ["H", "X", "RB"], key: "hook",
      rule: "Read the hook defender. If he drops under the dig, hit the shallow; if he jumps the shallow, throw the dig behind him.",
      beats: ["c3", "c1"], weak: ["c2", "tampa2"],
      note: "The seam and go are clears. They hold the deep defenders off the dig window." },

    { id: "levels", name: "Levels", formation: "tripsR", forms: ["tripsR", "trips10", "bunchR"], drop: "five",
      family: "Hi-lo on the hook",
      routes: { X: "curl", Y: "in5", H: "seam", Z: "dig12", RB: "rbCheck" },
      progression: ["H", "Z", "Y", "RB"], key: "hook",
      rule: "Alert the seam against an open middle. Then read the hook defender between the dig and the in: throw whichever level he does not take.",
      beats: ["c3", "c4"], weak: ["tampa2"],
      note: "Against quarters the dig sits underneath the inside safety once the seam carries him." },

    { id: "curlflat", name: "Curl-Flat", formation: "doubles", forms: ["doubles", "spread10", "ace", "ace12", "iform"], drop: "five",
      family: "Hi-lo on the flat",
      routes: { X: "curl", H: "flat", Y: "flat", Z: "curl", RB: "rbCheck" },
      progression: ["X", "H", "RB"], key: "hookcf",
      rule: "Pick a side. Read the curl/flat player: if he widens with the flat, throw the curl; if he sinks under the curl, throw the flat.",
      beats: ["c3"], weak: ["c2", "c6"],
      note: "A cloud corner squatting the flat plus a hook dropping under the curl takes both away." },

    { id: "slantflat", name: "Slant-Flat", formation: "doubles", forms: ["doubles", "spread10", "ace", "iform"], drop: "quick",
      family: "Hi-lo on the flat (quick)",
      routes: { X: "slant", H: "flat", Y: "flat", Z: "slant", RB: "rbCheck" },
      progression: ["X", "H", "RB"], key: "flat",
      rule: "Read the flat defender. If he sits on the slant, throw the flat; if he chases the flat, the slant is open inside him.",
      beats: ["c3", "c1", "c0"], weak: ["c2"],
      note: "The quickest answer to pressure in the book. The ball is out before the rush gets home." },

    /* ---------- build 2 ---------- */
    { id: "spacing", name: "Spacing", formation: "tripsR", forms: ["tripsR", "trips10", "bunchR"], drop: "three",
      family: "Horizontal stretch",
      routes: { X: "hitch", Y: "sitIn", H: "snag", Z: "hitch", RB: "rbFlat" },
      progression: ["H", "Z", "Y", "RB"], key: "hook",
      rule: "Five receivers spread across the field at five to six yards. Find the underneath defender who has two men in his area and throw to the one he leaves.",
      beats: ["c3", "c4", "c2"], weak: ["c1", "c0"],
      note: "Every route sits, so tight man coverage takes it away. Kill it against a one-high, press look." },

    { id: "mills", name: "Mills", formation: "doubles", forms: ["doubles", "spread10", "ace", "ace12"], drop: "fiveH",
      family: "Post-dig hi-lo on the safety",
      routes: { X: "post", H: "dig15", Y: "flat", Z: "curl", RB: "rbCheck" },
      progression: ["X", "H", "Z", "RB"], key: "safety",
      rule: "The post and the dig put the safety on that side in conflict. A quarters safety reads #2: when the dig pulls him down, the post is open behind him. If he stays deep, the dig sits under him.",
      beats: ["c4", "c6", "c1"], weak: ["tampa2", "c2"],
      note: "The classic quarters beater. The dig must clear the hook defender, so the drop includes a hitch." },

    { id: "postwheel", name: "Post-Wheel", formation: "doubles", forms: ["doubles", "spread10", "ace12"], drop: "five",
      family: "Outside-in vertical",
      routes: { X: "post", H: "wheel", Y: "curl", Z: "curl", RB: "rbCheck" },
      progression: ["H", "X", "Z", "RB"], key: "lev",
      rule: "The post pulls the corner inside and the wheel climbs the sideline behind him. Against man, the defender on #2 must run with a receiver who starts flat and turns up.",
      beats: ["c1", "c0", "c4"], weak: ["c2", "tampa2"],
      note: "Against two-high, the half safety sits on the wheel; take the curl backside." },

    { id: "scissors", name: "Scissors", formation: "doubles", forms: ["doubles", "spread10", "ace"], drop: "fiveH",
      family: "Post-corner cross",
      routes: { X: "post", H: "corner", Y: "dig12", Z: "curl", RB: "rbCheck" },
      progression: ["H", "X", "Y", "RB"], key: "safety",
      rule: "The outside receiver runs a post and the slot crosses under him to the corner. Whichever way the safety and corner turn, one of the two breaks away from them.",
      beats: ["c4", "c2", "c6"], weak: ["c1"],
      note: "The crossing paths also rub against man, but a robber in Cover 1 sits on the post." },

    { id: "texas", name: "Texas", formation: "doubles", forms: ["doubles", "ace", "wing12"], drop: "five",
      family: "Back on a linebacker",
      routes: { X: "go", H: "out", Y: "seam", Z: "curl", RB: "angle" },
      progression: ["RB", "H", "Z", "X"], key: "lev",
      rule: "The back releases to the flat and cuts back inside. Against man, a linebacker cannot stay with that cut. Against zone, the out pulls the flat defender and the angle sits behind the hook.",
      beats: ["c1", "c0", "c3"], weak: ["tampa2", "c2"],
      note: "Check where the linebackers align before the snap: one walked out over a slot leaves the back alone on the other." },

    { id: "sluggo", name: "Sluggo-Seam", formation: "doubles", forms: ["doubles", "spread10", "ace"], drop: "fiveH",
      family: "Double move",
      routes: { X: "sluggo", H: "seam", Y: "curl", Z: "hitch", RB: "rbCheck" },
      progression: ["X", "H", "Z", "RB"], key: "lev",
      rule: "Show slant, then go. A corner jumping the slant (press man, or a Cover 3 corner reading three-step) is beaten deep. The seam holds the middle safety.",
      beats: ["c1", "c0", "c3sky"], weak: ["c2", "tampa2", "c4"],
      note: "A double move needs time: the ball comes out late, so protect it. Two-high safeties take it away." },

    { id: "hank", name: "Hank", formation: "spread10", forms: ["spread10", "doubles", "trips10"], drop: "three",
      family: "Curls across the field",
      routes: { X: "hook8", H: "hook8", Y: "hook8", Z: "hook8", RB: "rbFlat" },
      progression: ["Z", "H", "RB"], key: "hookcf",
      rule: "Four hooks at eight yards and a back to the flat. Read the curl/flat defender to the call side: he widens to the flat, hit the hook; he sits, hit the back.",
      beats: ["c3", "c2", "c4"], weak: ["c1", "c0"],
      note: "A rhythm throw against zone. Every receiver turns back to the ball at the top of the drop." },

    { id: "paboot", name: "PA Boot", formation: "ace", forms: ["ace", "ace12"], drop: "boot",
      family: "Play-action rollout", pa: true,
      routes: { X: "post", H: "drag", Y: "flat", Z: "sail", RB: "paBlock" },
      progression: ["Z", "Y", "H"], key: "flat",
      rule: "Fake the run away, roll out to the right. The sail and the flat hi-lo the flat defender; the drag comes across late behind linebackers who bit on the fake.",
      beats: ["c3", "c1", "c4"], weak: ["tampa2", "c2"],
      note: "Works best after you have run the ball. A defender who stays home on the boot side takes away the flat." },

    { id: "yankee", name: "Yankee", formation: "iform", forms: ["iform", "offset21", "ace12"], drop: "pa",
      family: "Play-action deep shot", pa: true,
      routes: { X: "post", Z: "deepOver", Y: "blockTE", H: "lead", RB: "paBlock" },
      progression: ["X", "Z"], key: "mof",
      rule: "Maximum protection, two routes. The post holds the middle safety; the deep over runs behind the linebackers who bit on the fake. If the safety carries the post, the over is open.",
      beats: ["c3", "c1", "c4"], weak: ["c2", "m2"],
      note: "Seven blockers buy time. Two-high coverage has a safety over both routes, so save it for a single-high look." },

    { id: "bootI", name: "PA Boot Left", formation: "iform", forms: ["iform", "offset21"], drop: "boot", bootDir: -1,
      family: "Play-action rollout", pa: true,
      routes: { X: "sail", Y: "drag", H: "fbFlatAway", Z: "post", RB: "paBlock" },
      progression: ["X", "H", "Y"], key: "flat",
      rule: "Fake the run right, roll out left. The sail and the fullback in the flat hi-lo the flat defender; the tight end drags across behind the linebackers.",
      beats: ["c3", "c1", "c4"], weak: ["tampa2", "c2"],
      note: "Boot away from the strength: the defense flows to the fake and the backside end is the only defender who can stop the rollout." },

    { id: "paycross", name: "PA Y-Cross", formation: "iform", forms: ["iform", "offset21", "wing12"], drop: "pa",
      family: "Play-action deep crosser", pa: true,
      routes: { X: "post", Y: "cross", Z: "comeback", H: "flat", RB: "paBlock" },
      progression: ["Y", "Z", "H"], key: "hookcf",
      rule: "The fake pulls the linebackers up; the tight end crosses behind them at 16 yards. Read the curl/flat defender on the cross side: if he widens with the flat, the cross is open.",
      beats: ["c3", "c1"], weak: ["c4", "c2"],
      note: "The post clears the middle safety. Against quarters, the safety on the cross side can sit on it." },

    { id: "iz", name: "Inside Zone", formation: "ace", forms: ["ace", "doubles", "ace12", "wing12", "iform", "offset21", "spread10", "tripsR"],
      kind: "run", aim: "B", drop: "quick", family: "Run",
      routes: {}, progression: [], key: "box",
      rule: "The line steps to the right as a unit; the back reads the first down lineman past the center and cuts behind a double team or bounces.",
      beats: ["c4", "c2", "m2", "tampa2", "c6"], weak: ["c0", "fire", "c1", "c3"],
      note: "Run it against a light box (two-high, six in the box). Against eight in the box, kill to a pass." },

    { id: "oz", name: "Outside Zone", formation: "ace", forms: ["ace", "ace12", "wing12", "iform", "offset21", "doubles"],
      kind: "run", aim: "edge", drop: "quick", family: "Run",
      routes: {}, progression: [], key: "box",
      rule: "Everyone reaches to the right; the back aims outside the tight end and cuts up wherever the edge is sealed.",
      beats: ["c4", "c2", "c6", "tampa2"], weak: ["c0", "fire", "c3"],
      note: "Stretches the defense sideways; the cutback lane opens when the backside pursuit overruns." },

    { id: "power", name: "Power", formation: "iform", forms: ["iform", "offset21", "ace12", "wing12", "ace"],
      kind: "run", aim: "C", drop: "quick", family: "Run",
      routes: {}, progression: [], key: "box",
      rule: "Down blocks on the play side, the backside guard pulls through the hole and the fullback kicks out the end. More blockers at the point of attack than defenders.",
      beats: ["c4", "c2", "c1", "c6"], weak: ["c0", "fire"],
      note: "The gap scheme brings an extra blocker to the hole, so it holds up better than zone against an eight-man box." }
  ];

  COVS.c3sky = "Cover 3 Sky"; COVS.fire = "Fire zone";
  const api = { FORMATIONS, PERSONNEL, OL, ROUTES, DROPS, COVS, KEYS, CONCEPTS };
  root.PocketBook = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
