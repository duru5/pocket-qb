/* Pocket QB Study: the curriculum. Content only; study.js renders it.
   Every board is a film from the game's engine (lab.js), so what a lesson
   shows is what Play will do. Throw checks are graded by the same grader as
   Play. Tap checks name a defender or receiver by job (his zone, his number),
   so they stay right if the engine assigns a different player to the job. */
(function (root) {
  "use strict";

  /* ---------- films used in several places ---------- */
  const F = {
    floodQ:   { cid: "flood", cov: "c4" },
    meshC1:   { cid: "mesh", cov: "c1" },
    meshC3:   { cid: "mesh", cov: "c3sky" },
    meshC4:   { cid: "mesh", cov: "c4" },
    cfSky:    { cid: "curlflat", cov: "c3sky" },
    cfBuzz:   { cid: "curlflat", cov: "c3buzz" },
    smashC2:  { cid: "smash", cov: "c2" },
    smashC4:  { cid: "smash", cov: "c4" },
    smashC6:  { cid: "smash", cov: "c6" },
    smashT2:  { cid: "smash", cov: "tampa2", pkg: "base" },
    vertsT2:  { cid: "verts", cov: "tampa2", pkg: "base" },
    vertsBuzz:{ cid: "verts", cov: "c3buzz" },
    vertsQ:   { cid: "verts", cov: "c4" },
    meshM2:   { cid: "mesh", cov: "m2" },
    driveC1:  { cid: "drive", cov: "c1" },
    floodSky: { cid: "flood", cov: "c3sky" },
    daggerC3: { cid: "dagger", cov: "c3sky" },
    spin:     { cid: "dagger", cov: "c3sky", shown: "two", declare: null },
    lateSpin: { cid: "dagger", cov: "c3sky", shown: "two", declare: 0.35 },
    unspin:   { cid: "smash", cov: "c2", shown: "one", declare: null },
    c0Hot:    { cid: "slantflat", cov: "c0", pocket: "real" },
    c0Safe:   { cid: "slantflat", cov: "c0", pocket: "real", prot: { slide: "L", keepRB: true } },
    fireHot:  { cid: "slantflat", cov: "fire", pocket: "real" },
    paBoot:   { cid: "paboot", cov: "c3sky", pers: "12" },
    stickQ:   { cid: "stick", cov: "c4" },
    stickC3:  { cid: "stick", cov: "c3sky" },
    ycrossC3: { cid: "ycross", cov: "c3sky" },
    levelsC3: { cid: "levels", cov: "c3buzz" }
  };

  const tapDB = "Tap a defender on the field.";
  const tapOff = "Tap a receiver on the field.";

  /* ---------- the plan ---------- */
  const PHASES = [
    /* ================================================================ */
    { id: "p1", n: 1, title: "The language",
      goal: "Count a formation, name a front and a package, and say what the defense's personnel lets it call.",
      lessons: [
        { id: "l11", title: "Strength, numbers and leverage", mins: 7,
          why: "Every coverage rule and every read in this plan is written in these words.",
          blocks: [
            { p: `Coaches on both sides of the ball count the same way, and the defense's rules are written in that count. If you can count it the way the defense does, you can predict what each defender has before the ball is snapped.` },
            { h: "Strength" },
            { p: `The strong side is the side with more receivers. With a tight end attached to the line, many staffs call his side strong instead; in this game strength is the side with more receivers, and the tight end's side breaks a tie. The defense sets its front, its rotation and its pressure from that call, so it is the first thing you check.` },
            { h: "Numbers" },
            { p: `Receivers are numbered from the sideline in, on each side: the widest is #1, the next #2, then #3. A back who releases becomes the next number on the side he goes to. Zone rules are written in these numbers ("the curl/flat player takes #2 to the flat"), so the number tells you which defender is responsible.` },
            { board: { films: [{ label: "Trips right vs Cover 4", spec: F.floodQ }], opts: { nums: true, routes: false, rules: false, zones: false, depth: true },
              chapters: [
                { t: -1.2, title: "Strength", text: "Three receivers right, one left. Right is the strong side.", hl: { num: [["R", 1], ["R", 2], ["R", 3]] } },
                { t: -1.2, title: "Numbers", text: "Right side: Z is #1, H #2, Y #3. Left side: X is #1. The back is not numbered until he releases.", hl: { num: [["R", 2]] } },
                { t: -0.6, title: "Leverage", text: "Each corner sits a yard inside his #1: inside leverage. He is taking away the slant and the post and inviting the out and the fade.", hl: { def: ["LCB", "RCB"] } }
              ] } },
            { h: "Leverage" },
            { p: `Leverage is which side of a receiver a defender sits on: inside, outside or head-up. A defender protects the side he is on and gives you the other one. Outside leverage invites the in-breaking route; inside leverage invites the out and the fade. Leverage plus depth is most of what a corner tells you before the snap.` },
            { tap: { film: F.floodQ, at: -0.8, opts: { nums: false, routes: false }, prompt: "Tap #2 on the trips side.", answer: { num: ["strong", 2] },
              why: "Count from the sideline in: Z is #1, H is #2, Y is #3." } },
            { tap: { film: F.floodQ, at: -0.8, opts: { nums: false, routes: false }, prompt: "Tap #3 on the trips side.", answer: { num: ["strong", 3] },
              why: "The innermost of the three is #3. Against trips, many rules hand #3 to a linebacker or a safety." } },
            { mc: { q: "A corner lines up on the outside shoulder of #1. Which route is he inviting?", opts: ["The fade", "The out", "The slant", "The comeback"], a: 2,
              why: "Outside leverage protects the outside. He is giving you the inside: slant, dig, post." } },
            { note: `Field and boundary (the wide and short sides when the ball is on a hash) matter in real games. Pocket QB snaps every ball from the middle of the field, so that part of the count does not change here.` }
          ] },
        { id: "l12", title: "Personnel: the first read is in the huddle", mins: 8,
          why: "The defense's package limits what it can call. You know it before you break the huddle.",
          blocks: [
            { p: `Personnel is written as two digits: running backs, then tight ends. The rest are wide receivers. 11 is one back and one tight end (three receivers), 12 is one back and two tight ends, 21 is two backs, 10 is four receivers.` },
            { p: `Defenses substitute to match. More defensive backs cover better and stop the run worse; more linebackers do the reverse. Below is what NFL defenses put on the field against each grouping in 2023-2025, by situation.` },
            { widget: "pkgByPers" },
            { p: `Read it as a menu. Nickel against 11 on first down is the normal answer, so it tells you little. Dime on third and long tells you a lot: two-high shells and defensive-back pressure. Base against 11 (about 5% of early downs) means a linebacker is covering a slot or a back.` },
            { h: "The box" },
            { p: `The box is the area between the tackles, about five yards deep. The box count is how many defenders are in it. More bodies there helps the run defense and takes them out of coverage. NFL runs by box count:` },
            { widget: "boxRuns" },
            { note: `This is a correlation, not a controlled experiment: defenses load the box when they expect a run, often in short yardage, which pulls the numbers down for heavy boxes. The direction is still the lesson.` },
            { mc: { q: "You come out in 12 personnel on first and 10 and the defense stays in nickel. Where is the advantage?", opts: ["Four verticals", "The run and play-action, against a light box", "Screens to the slot", "Nowhere; nickel is the right answer"], a: 1,
              why: "Nickel takes a linebacker off the field. Two tight ends and a back against a light box favors the run, and the run sets up play-action." } },
            { mc: { q: "Third and 9. You are in 11 personnel and the defense brings on a sixth defensive back. What should you expect?", opts: ["Cover 0", "A heavy run front", "Two-high shells, or pressure from a defensive back", "A goal-line front"], a: 2,
              why: "Dime is the third-and-long package. Its menu is two-high coverage and defensive-back pressure." } },
            { drill: { name: "12 personnel, early downs", text: "Single snaps from first and second down in 12 personnel: watch the package that comes on and test the box with the run game and play-action.", d: { pers: "12", sit: "early", level: 2 } } }
          ] },
        { id: "l13", title: "Fronts, gaps and techniques", mins: 7,
          why: "The front decides who must be blocked and where pressure can come from.",
          blocks: [
            { p: `Gaps are lettered outward from the center on each side: A (center to guard), B (guard to tackle), C (tackle to tight end), D (outside the tight end). Techniques number a defender's alignment on a blocker: even numbers head-up, odd numbers on an outside shoulder, an "i" for an inside shoulder. Most staffs use a version of this system.` },
            { widget: "gaps" },
            { table: { head: ["Front", "Alignment", "What it tells you"], rows: [
              ["4-3 Over", "5 and 3 to the strength; 1 and 5 away", "The 3-technique is on the strong guard; slide protection usually goes to him"],
              ["4-3 Under", "Shade (1) to strength; 3 and 5 away; Sam on the line strong", "Five on the line to the strong side: watch the Sam as a fifth rusher"],
              ["3-4 Odd", "5, 0, 5 with edge linebackers", "Either edge can rush or drop: you do not know the fourth rusher until the snap"],
              ["Tite / Mint", "4i, 0, 4i", "Squeezes the B gaps; edge pressure comes from linebackers or the nickel"],
              ["Bear / 46", "3, 0, 3", "Every interior lineman is covered: no free double teams; get it out or keep the back in"],
              ["Wide 9", "Ends far outside", "Speed off the edge; inside runs and screens open up"]] } },
            { p: `The quickest single clue to extra rushers is the number of defenders on or near the line: five or six instead of four. Count before you think about coverage.` },
            { note: `Pocket QB lines up one four-man 4-3 front and adds blitzers on top of it. Fronts change the protection count in real games before any blitz; here the count comes from the blitzers you can see walking down.` },
            { mc: { q: "Six defenders are on or within a yard of the line, with two linebackers in the A gaps. What is the first concern?", opts: ["The run", "Who blocks the extra rushers", "Cover 2", "A screen"], a: 1,
              why: "Six near the line is more rushers than five linemen can block. Set the protection first; then think about coverage." } }
          ] }
      ] },

    /* ================================================================ */
    { id: "p2", n: 2, title: "Coverage identification",
      goal: "Name the coverage family from the safeties and the exact coverage from the corners and the snap.",
      lessons: [
        { id: "l21", title: "Man, zone and match", mins: 8,
          why: "Every coverage is one of three ways of covering. Each one has its own beaters.",
          blocks: [
            { table: { head: ["Style", "Each defender has", "Beat it with"], rows: [
              ["Man", "One receiver, wherever he goes", "Rubs, crossers, a fast receiver on a slow defender"],
              ["Zone", "An area; he drops to a landmark and reads the QB", "Seams between zones, floods (more receivers than defenders in an area)"],
              ["Match", "A zone at the snap that turns into man once the routes declare", "Route combinations that switch who is responsible"]] } },
            { p: `Modern NFL coverage is mostly match. A Cover 3 or Cover 4 in a pro playbook is rarely a pure spot drop: each zone defender has a rule written in receiver numbers that tells him whom to take once the routes declare. Pocket QB's zones play those rules.` },
            { p: `Watch the same play against three coverages. The lines show each defender's job right now: solid for man and for a match rule that has become man, dashed for a zone defender keeping an eye on the nearest receiver.` },
            { board: { films: [{ label: "vs Cover 1", spec: F.meshC1 }, { label: "vs Cover 3", spec: F.meshC3 }, { label: "vs Cover 4", spec: F.meshC4 }],
              opts: { rules: true, zones: true, routes: true },
              chapters: [
                { t: 0.3, title: "The snap", text: "Cover 1: every line is fixed to one receiver from the snap. Cover 3 and 4: defenders open to their landmarks first." },
                { t: 1.4, title: "Crossers", text: "Man defenders run through the traffic with their man. Zone defenders hand crossers off to each other as they pass from one area to the next." },
                { t: 2.3, title: "Top of the drop", text: "Against man the open man is the one who beat his defender. Against zone it is the one sitting between two defenders." }
              ] } },
            { mc: { q: "Your slot motions across the formation and the nickel runs with him. What does that suggest?", opts: ["Zone", "Man", "Cover 2", "Nothing"], a: 1,
              why: "A defender who follows motion across the field is playing man. In zone the defense bumps or shifts a few steps instead." } },
            { mc: { q: "Why does a match defense hurt Four Verts more than a spot-drop zone?", opts: ["It rushes more", "Curl/flat and hook defenders carry #2 and #3 up the seams, so two receivers do not end up in one deep zone", "It plays more press", "It has more deep defenders"], a: 1,
              why: "Spot-drop Cover 3 leaves the seams to the deep defenders, and four verticals put two receivers on one of them. Match rules carry the seams." } }
          ] },
        { id: "l22", title: "Count the safeties", mins: 6,
          why: "Two deep, one deep or none narrows the defense to a family before you think about anything else.",
          blocks: [
            { p: `After the snap, count the deep safeties. Two deep (middle of the field open, MOFO) means Cover 2, Tampa 2, 2-Man, Cover 4 or Cover 6. One deep (middle closed, MOFC) means Cover 1 or Cover 3. None deep means Cover 0.` },
            { widget: "covTree" },
            { key: `The pre-snap shell can lie. The count after the snap does not. Use the first to pick a side and a play, the second to pick the throw.` },
            { board: { films: [{ label: "Two deep", spec: F.smashC2 }, { label: "One deep", spec: F.cfSky }, { label: "None deep", spec: Object.assign({}, F.c0Hot, { pocket: "clean" }) }],
              opts: { depth: true, routes: false, rules: false, zones: false },
              chapters: [
                { t: -0.8, title: "Before the snap", text: "The numbers next to the defensive backs are their depth off the ball. Two at 12 to 14 yards: two-high. One deep in the middle: one-high. Both inside 8 yards: zero." , hl: { def: ["FS", "SS"] } },
                { t: 0.8, title: "After the snap", text: "Count again once they move. Here the shell was honest, so the count matches." }
              ] } },
            { idrun: { mode: "shell", n: 6, level: 1, title: "Count it: six snaps" } }
          ] },
        { id: "l23", title: "Single-high: Cover 1, Cover 3 and Cover 0", mins: 12,
          why: "One deep safety means an extra defender near the line: for the run, a blitz or a robber.",
          blocks: [
            { h: "Cover 1 (man-free)" },
            { p: `One free safety in the deep middle, five defenders in man on the five eligible receivers, and one extra player. The extra player sits in the hole at 8 to 10 yards reading your eyes on crossers and digs (a "rat" or robber), or he rushes as a fifth or sixth man (Cover 1 blitz). NFL defenses blitzed out of Cover 1 on about 45% of their Cover 1 calls in 2025.` },
            { p: `Identify it by one high safety and every other defender aligned on a receiver, often pressed with inside leverage. Beat it with routes that make a man defender change direction or run through traffic: crossers, rubs, slants against off coverage, and any receiver matched on a linebacker.` },
            { board: { films: [{ label: "Drive vs Cover 1", spec: F.driveC1 }], opts: { rules: true, routes: true, zones: false },
              chapters: [
                { t: -0.5, title: "The look", text: "One deep safety. Everyone else is over a receiver.", hl: { def: ["FS"] } },
                { t: 1.0, title: "The rat", text: "The hole player starts in the middle and reads the crossers.", hl: { zone: ["Hole (rat)"] } },
                { t: 2.3, title: "The throw", text: "The dig and the shallow make their defenders turn and chase. The deeper crosser is behind the rat by the top of the drop." }
              ] } },
            { h: "Cover 3" },
            { p: `Three deep (the corners and the free safety split the field in thirds) and four underneath: two curl/flat defenders outside and two hook defenders inside. In Sky the strong safety rotates down to the curl/flat. In Buzz he drops to the hook and a linebacker or the nickel takes the flat. Buzz puts a safety where digs and seams live; Sky puts one in the flat.` },
            { board: { films: [{ label: "Sky", spec: F.cfSky }, { label: "Buzz", spec: F.cfBuzz }], opts: { rules: true, zones: true, routes: true },
              chapters: [
                { t: -0.5, title: "Same shell", text: "Both start one-high with the strong safety down at about 7 yards. You cannot tell them apart yet." },
                { t: 0.9, title: "Who has the flat", text: "Sky: the strong safety runs to the flat. Buzz: he drops to the hook, and the nickel takes the flat.", hl: { zone: ["Flat strong", "Curl/flat strong"] } },
                { t: 2.3, title: "Curl-Flat", text: "The curl/flat defender takes the flat route, so the curl sits behind him. This is the hi-lo that beats Cover 3." }
              ] } },
            { tap: { film: F.cfBuzz, at: 1.0, opts: { zones: false, rules: false }, prompt: "Cover 3 Buzz. Tap the defender who has the strong-side flat.", answer: { zone: ["Curl/flat strong"] },
              why: "In Buzz the strong safety drops to the hook, so a linebacker or the nickel (here the nickel) takes the curl/flat." } },
            { tap: { film: F.cfSky, at: 1.0, opts: { zones: false, rules: false }, prompt: "Cover 3 Sky. Tap the defender who has the strong-side flat.", answer: { zone: ["Flat strong"] },
              why: "In Sky the strong safety rotates down to the flat." } },
            { h: "Cover 0" },
            { p: `No deep safety. Every coverage player is in man and the rest rush, usually six. Identify it by both safeties inside about 8 yards, defenders in the A and B gaps, and pressed corners with nothing behind them. The ball has to be out before the free rusher arrives: about 1.5 seconds.` },
            { board: { films: [{ label: "Cover 0, default protection", spec: F.c0Hot }], opts: { rules: true, routes: true },
              chapters: [
                { t: -0.4, title: "The look", text: "Both safeties down, linebackers walked into the gaps. Six rushers against five linemen and a back on a route." },
                { t: 0.8, title: "Free rusher", text: "The red rusher is unblocked. The ring around the quarterback is the time left.", hl: { free: true } }
              ] } },
            { tap: { film: F.c0Hot, at: 0.6, opts: { rules: false }, prompt: "Tap the unblocked rusher.", answer: { free: true },
              why: "Six rush, five block (the back is on a route). The extra rusher comes free on the side the slide went away from." } },
            { throw: { film: F.c0Hot, at: 0.7, prompt: "Cover 0, free rusher. Decide now: tap the throw.",
              why: "The slants beat man with no help inside, and they are the first routes open. The ball has to be out before the rusher arrives." } }
          ] },
        { id: "l24", title: "Two-high: Cover 2, Tampa 2 and 2-Man", mins: 12,
          why: "Two deep takes away the big play and leaves fewer defenders near the line.",
          blocks: [
            { h: "Cover 2" },
            { p: `Two safeties split the deep field in halves and five defenders play underneath: both corners in the flats, two hooks and a middle hook. Identify it by two safeties at 12 to 14 yards wider than the hashes and corners at about 5 yards with outside leverage who sit at the snap instead of bailing.` },
            { p: `The holes: the sideline between the squatting corner and the half safety (18 to 22 yards, where Smash's corner route lands), the deep middle between the safeties, and the hook defenders, who can be put in a hi-lo.` },
            { board: { films: [{ label: "Smash vs Cover 2", spec: F.smashC2 }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: -0.5, title: "The shell", text: "Two high, wide of the hashes. Corners shallow with outside leverage.", hl: { def: ["FS", "SS"] } },
                { t: 0.9, title: "The corner's rule", text: "#1 is not vertical, so the corner walls the hitch. The corner route runs past him into the hole.", hl: { zone: ["Flat L", "Flat R"] } },
                { t: 1.6, title: "Top of the drop", text: "The corner route is open between the squatting corner and the half safety." }
              ] } },
            { h: "Tampa 2" },
            { p: `Cover 2 with one change: at the snap the middle linebacker turns and runs down the middle, closing the deep hole between the safeties. It looks like two-high before the snap and plays like three deep after it. It needs a Mike who can run with a tight end or slot up the seam. The idea traces back to the 1970s Steelers; it became famous at Tampa Bay in the late 1990s under Tony Dungy and Monte Kiffin.` },
            { board: { films: [{ label: "Four Verts vs Tampa 2", spec: F.vertsT2 }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: -0.5, title: "Same shell as Cover 2", text: "You cannot see the difference before the snap." },
                { t: 1.2, title: "The Mike opens", text: "He turns and runs instead of dropping to his hook: Tampa 2.", hl: { zone: ["Deep hole (pipe)"] } },
                { t: 2.3, title: "One seam, not two", text: "He can carry only one seam. The other is one-on-one with a half safety." }
              ] } },
            { tap: { film: F.vertsT2, at: 1.4, opts: { zones: false, rules: false }, prompt: "Tap the defender running the pipe.", answer: { zone: ["Deep hole (pipe)"] },
              why: "The Mike. His first steps straight down the middle are the Tampa 2 tell." } },
            { h: "2-Man" },
            { p: `Two deep halves and five underneath in man. With help over the top, the underneath defenders play trail technique: on the receiver's hip and under him, taking away anything short and in-breaking. Identify it by a two-high shell with defenders tight on receivers. Beat it with crossers and rubs, a back or tight end on a linebacker, and scrambles: every underneath defender has his back to you.` },
            { board: { films: [{ label: "Mesh vs 2-Man", spec: F.meshM2 }], opts: { rules: true, routes: true },
              chapters: [
                { t: 0.6, title: "Trail", text: "Underneath defenders run with their men; the two safeties stay deep." },
                { t: 2.3, title: "Crossers", text: "The mesh crossers pull their defenders through traffic." }
              ] } },
            { mc: { q: "Two safeties at 13 yards outside the hashes, corners at 5 with outside leverage. At the snap the Mike turns and runs straight downfield. Where is the open grass?", opts: ["The flats", "The intermediate middle he left, and the sideline hole behind the corners", "The deep middle", "Nowhere"], a: 1,
              why: "Tampa 2. The Mike's departure opens the dig and curl area behind the hooks, and the corner route still lands behind the squatting corners." } }
          ] },
        { id: "l25", title: "Quarters and Cover 6", mins: 10,
          why: "Two-high defenses that can still put nine in the run fit.",
          blocks: [
            { p: `Cover 4 gives each of four deep defenders a quarter of the field, with three underneath. Real quarters is pattern-matched: each safety reads #2. If #2 goes vertical, the safety takes him. If #2 goes out or under, the safety helps on #1 and an underneath defender takes #2. The corners play #1 man-only-deep (MOD): man if he goes deep, zone if he does not.` },
            { p: `Identify it by two safeties at about 10 to 12 yards, closer to the hashes than in Cover 2, and corners off at 7 to 8 yards with inside leverage. It takes away Four Verts and lets the safeties fit the run from 9 to 10 yards. It is thin in the flats.` },
            { board: { films: [{ label: "vs Four Verts", spec: F.vertsQ }, { label: "vs Smash", spec: F.smashC4 }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: -0.5, title: "The shell", text: "Safeties shallower and tighter than Cover 2. Corners off with inside leverage.", hl: { def: ["FS", "SS", "LCB", "RCB"] } },
                { t: 1.6, title: "The safety's read", text: "Four Verts: #2 goes vertical, so each safety locks on #2 and each corner carries #1. Four receivers, four men over the top." }
              ] } },
            { throw: { film: F.vertsQ, at: 2.3, prompt: "Four Verts against Cover 4, top of the drop. Tap the throw.",
              why: "Every vertical has a defender over the top. The check-down is the only positive play. Quarters is the coverage built to take this concept away." } },
            { h: "Cover 6 (quarter-quarter-half)" },
            { p: `Quarters to one side and Cover 2 to the other, with a cloud corner squatting in the flat on the half side. The two corners give it away: one shallow with outside leverage (the half side), the other off with inside leverage (the quarters side). Attack the half side with Smash, and the quarters side with flats and short outs.` },
            { board: { films: [{ label: "Smash vs Cover 6", spec: F.smashC6 }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: -0.5, title: "Two different corners", text: "Left corner shallow: the half side. Right corner off: the quarters side.", hl: { def: ["LCB", "RCB"] } },
                { t: 1.6, title: "The half side", text: "The cloud corner walls the hitch, and the corner route sits behind him." }
              ] } },
            { tap: { film: F.smashC6, at: 0.8, opts: { zones: false, rules: false }, prompt: "Tap the cloud corner (the flat player on the half side).", answer: { zone: ["Flat weak"] },
              why: "The shallow corner on the Cover 2 side plays the flat. Smash's corner route is built to sit behind him." } },
            { mc: { q: "You call Flood. The defense shows two-high with safeties at 10 yards near the hashes and corners off with inside leverage. Stay or kill?", opts: ["Stay: Flood beats everything two-high", "Kill: this looks like quarters, which Flood struggles against", "Kill to Four Verts", "Stay and throw the go route"], a: 1,
              why: "The depth, width and corner leverage say quarters. Kill to something quarters gives up, like a flat-heavy or a stick concept." } }
          ] },
        { id: "l26", title: "Disguise and rotation", mins: 10,
          why: "Defenses show one shell and play another. The snap tells the truth.",
          blocks: [
            { p: `The most common disguise is the spin: two safeties align high, and at the snap one rotates down to a flat or the box while the other drives to the middle, turning a two-high look into Cover 3 or Cover 1. The reverse also exists: one high and one down, and the down safety bails to a deep half at the snap.` },
            { board: { films: [{ label: "Spin to Cover 3", spec: F.spin }, { label: "Rotate to Cover 2", spec: F.unspin }], opts: { depth: true, rules: false, zones: true, routes: false },
              chapters: [
                { t: -0.6, title: "The look", text: "Spin: two high. Rotate: one high, one down. Pick your side and play from this look, knowing it may change." },
                { t: 0.0, title: "The snap", text: "Take your eyes to the safeties now." },
                { t: 0.7, title: "The answer", text: "Spin: one safety runs down to the flat and the other drives to the middle: one-high. Rotate: the down safety bails to a half: two-high.", hl: { def: ["FS", "SS"] } }
              ] } },
            { tap: { film: F.spin, at: 0.5, opts: { depth: false }, prompt: "The defense showed two high. Tap the safety who rotated down.", answer: { def: ["SS"] },
              why: "The strong safety spins down to the flat (Cover 3 Sky). The free safety drives to the middle third." } },
            { h: "Tells that hold up when the shell lies" },
            { table: { head: ["What to watch", "Usually means"], rows: [
              ["Safeties 12 to 14 yards, wide of the hashes", "Cover 2 or Tampa 2: they must reach the sideline"],
              ["Safeties 9 to 11 yards, near the hashes", "Quarters: they fit the run and read #2"],
              ["A safety moving late, or weight on his toes", "A rotation is coming; read his direction at the snap"],
              ["Corner at about 5 yards, outside leverage, not bailing", "A flat-player corner: Cover 2, Cover 6's half side, or Cloud"],
              ["Corner off at 7 to 9 yards, outside leverage, bailing", "A deep-third corner: Cover 3"],
              ["Corner off with inside leverage", "Quarters, or man with help"],
              ["Defenders follow motion across the field", "Man"],
              ["Linebackers walked into the A gaps", "Pressure, or a simulated pressure that drops them"]] } },
            { h: "Snap early against a late rotation" },
            { p: `A defense caught mid-rotation has players out of their landmarks. Below, the same spin, once early and once started 0.35 seconds before the snap: the rotating safeties are still moving sideways when the ball is snapped and have to redirect.` },
            { board: { films: [{ label: "Rotated early", spec: Object.assign({}, F.spin, { declare: 1.4 }) }, { label: "Caught mid-rotation", spec: F.lateSpin }], opts: { depth: true, zones: true, rules: false, routes: true }, ev: true,
              chapters: [
                { t: -0.1, title: "At the snap", text: "Early: everyone set. Late: the safeties are in motion when the ball is snapped.", hl: { def: ["FS", "SS"] } },
                { t: 0.9, title: "After", text: "Compare where the safeties are. A late rotation costs them steps they need." }
              ] } },
            { note: `In this engine the late rotation costs the defense a little, mostly on throws to the area the rotating safety is leaving. Real defenses vary: a well-coached late spin can be close to free.` },
            { idrun: { mode: "cov", n: 8, level: 3, title: "Name it: eight snaps with disguise" } },
            { drill: { name: "Disguise reps", text: "Level 3 single snaps: real-time, 45% disguised. Name the coverage at the line, then confirm it at the snap.", d: { level: 3 } } }
          ] }
      ] },

    /* ================================================================ */
    { id: "p3", n: 3, title: "Match rules",
      goal: "Know each zone defender's rule well enough to predict where he goes before he goes there.",
      lessons: [
        { id: "l31", title: "Cover 3 match: the seam carry", mins: 9,
          why: "Why Four Verts does not beat modern Cover 3 the way it beat spot drops.",
          blocks: [
            { p: `Pocket QB's Cover 3 plays these match rules, keyed to the receivers on each side:` },
            { list: [
              `<b>Corners</b> take #1 if he goes vertical (man over the top). If #1 does not go deep, they sit in their third and look for #2 coming outside on a vertical.`,
              `<b>Curl/flat</b>: #2 to the flat, take him. #2 vertical, wall him (inside and underneath) to about 12 to 13 yards, hand him off to the deep defender, then sink under #1's curl.`,
              `<b>Hook</b>: carry #3 if he goes vertical; otherwise rob crossers in front.`,
              `<b>Middle third</b>: the deepest inside vertical; otherwise drive on posts and digs in front of him.`] },
            { board: { films: [{ label: "Four Verts vs Cover 3 Buzz", spec: F.vertsBuzz }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: 0.8, title: "The wall", text: "#2 on each side goes vertical, so each curl/flat defender walls him: inside and underneath.", hl: { zone: ["Curl/flat strong", "Curl/flat weak"] } },
                { t: 1.6, title: "The hand-off", text: "Past about 13 yards the curl/flat defender lets him go and the middle safety takes the deeper seam." },
                { t: 2.3, title: "The throw", text: "The seam is still the throw on time in this engine, but the window is closing: late, the middle safety arrives." }
              ] } },
            { p: `The rules in that film are the defense's real logic in the game, so you can read them live: a line from a defender to a receiver with a label says whom he has and how. "wall" is inside and underneath, "over" is over the top, "man" is a rule that has turned into man coverage.` },
            { board: { films: [{ label: "Flood vs Cover 3 Sky", spec: F.floodSky }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: 0.8, title: "Three receivers, one side", text: "The flat, the sail and the go route put three levels on the strong side." },
                { t: 1.6, title: "The flat defender's problem", text: "He walls the sail and the flat route runs under him. Whatever he takes, the other one is open." , hl: { zone: ["Flat strong"] } }
              ] } },
            { throw: { film: F.floodSky, at: 2.3, prompt: "Flood vs Cover 3 Sky, top of the drop. Tap the throw.",
              why: "The flat defender has the sail walled late; the deep third corner carries the go. The sail (or the backside dig) is open on time." } },
            { mc: { q: "In match Cover 3, #2 runs a flat route. What does the curl/flat defender do?", opts: ["Sinks under #1", "Takes #2 in the flat", "Carries #2 vertically", "Rushes"], a: 1,
              why: "#2 to the flat: he takes him. Only a vertical #2 gets walled and handed off." } }
          ] },
        { id: "l32", title: "Quarters: the safety reads #2", mins: 9,
          why: "One read by one safety decides the whole coverage.",
          blocks: [
            { list: [
              `<b>Corners</b> MOD on #1, from outside leverage: man if #1 goes vertical or past 7 yards, otherwise zone. They funnel #1 inside toward the safety.`,
              `<b>Safeties</b> read #2. #2 vertical past 6 yards: man on him. #2 out or under: help over the top of #1 (a bracket). Nobody threatening: rob the dig or curl in front.`,
              `<b>Apex</b> (the flat player): wall #2, take him to the flat.`] },
            { board: { films: [{ label: "#2 goes vertical", spec: F.vertsQ }, { label: "#2 goes out", spec: { cid: "curlflat", cov: "c4" } }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: 1.0, title: "The read", text: "Watch each safety's line. He is reading #2 for his first steps.", hl: { def: ["FS", "SS"] } },
                { t: 1.8, title: "The answer", text: "Vertical #2: the safety locks on him. #2 to the flat: the safety turns to help over #1, and the curl is bracketed." }
              ] } },
            { key: `That is the weakness quarters coaches worry about: a #2 route that pulls the safety, with #1 running a post or dig behind where he was. And the flats are thin because only three play underneath.` },
            { throw: { film: F.stickQ, at: 1.6, prompt: "Stick from trips vs Cover 4, top of the drop. Check the backside before the stick side. Tap the throw.",
              why: "Against trips, quarters spends its safeties on the three-man side and leaves the single receiver alone with a corner playing from outside leverage. The slant beats him inside. On the trips side, three receivers meet three defenders and the windows are tight." } },
            { mc: { q: "In quarters, #2 runs a quick out. Whom does the safety on that side take?", opts: ["#2", "He helps over the top of #1", "The back", "Nobody; he drops to his quarter"], a: 1,
              why: "#2 out or under means the safety helps on #1, often over an in-breaking route, and the flat defender takes #2." } }
          ] },
        { id: "l33", title: "Cover 2 and Tampa 2: squat, sink and pipe", mins: 8,
          why: "The corner's rule is the whole Smash read.",
          blocks: [
            { list: [
              `<b>Corners</b> (cloud): #2 to the flat, take him. #1 vertical, sink under him to about 12 yards (squat and sink). Otherwise wall #1.`,
              `<b>Halves</b>: read #2 to #1. #2 vertical (the seam), take #2; otherwise get over the top of #1, inside-out, and follow a post across.`,
              `<b>Tampa 2</b> adds the Mike in the pipe: he runs the deep middle on any inside vertical.`] },
            { board: { films: [{ label: "Smash vs Cover 2", spec: F.smashC2 }, { label: "Smash vs Tampa 2", spec: F.smashT2 }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: 0.6, title: "The corner's first read", text: "#2 (the corner route) is not going to the flat and #1 is not vertical, so he walls the hitch.", hl: { zone: ["Flat L", "Flat R"] } },
                { t: 1.6, title: "Hi-lo", text: "He is under the corner route and on top of the hitch. The corner route lands behind him before the half safety arrives." }
              ] } },
            { throw: { film: F.smashC2, at: 1.6, prompt: "Smash vs Cover 2, top of the drop. Tap the throw.",
              why: "The corner squats on the hitch, so the corner route is open over him in the hole before the safety gets there." } }
          ] },
        { id: "l34", title: "Rules lab", mins: 10,
          why: "Predict, then watch. The fastest way to learn a rule is to be wrong about it.",
          blocks: [
            { p: `Tap any defender in the film to see his job at that moment: his zone, his rule, whom he has and how. Change the coverage and the play, then predict before you press play: whom will the hook defender take? When does the safety commit?` },
            { board: { films: [{ label: "Levels vs Buzz", spec: F.levelsC3 }, { label: "Y-Cross vs Sky", spec: F.ycrossC3 }, { label: "Stick vs Quarters", spec: F.stickQ }, { label: "Smash vs Cover 6", spec: F.smashC6 }], opts: { rules: true, zones: true, routes: true }, explore: true, ev: true } },
            { p: `The full lab is the Film room on the Study home: every concept against every coverage, with disguise and a mirror switch.` },
            { mc: { q: "Levels vs Cover 3 Buzz. #3 runs a seam. Who has him?", opts: ["The corner", "The hook defender carries him vertical, then hands him off", "Nobody", "The curl/flat defender"], a: 1,
              why: "The hook rule: carry #3 vertical (wall him) until he is deep enough to hand off to the middle safety." } }
          ] }
      ] },

    /* ================================================================ */
    { id: "p4", n: 4, title: "Pressure and protection",
      goal: "Count the rush, set the protection, and know where the hot throw is before the snap.",
      lessons: [
        { id: "l41", title: "Count the rush", mins: 7,
          why: "Every blitz is a trade: more rushers, fewer defenders in coverage.",
          blocks: [
            { p: `NFL dropbacks by the number of rushers, 2023-2025:` },
            { widget: "rushers" },
            { p: `Pressure and sacks rise with the rush, and the quarterback's time to throw falls. Yet expected points per play barely move until six rushers: offenses that get the ball out against the blitz hit the space it leaves. Six rushers is where the pressure finally wins on average.` },
            { note: `"Pressure" is the charting definition in the data (hurries, hits and sacks). These are averages over every play; they mix good and bad protections and quarterbacks.` },
            { table: { head: ["Pressure", "Rush", "Behind it", "Where it is weak"], rows: [
              ["Four-man", "4", "Any coverage", "Nothing extra; you have time"],
              ["Simulated (creeper)", "4, not the expected four", "Usually 3 under, 3 deep", "A lineman in coverage; protection may block the wrong man"],
              ["Fire zone", "5", "3 under, 3 deep", "Only three underneath: seams, curls, flats"],
              ["Cover 1 blitz", "5 or 6", "Man, one deep", "No hole player: crossers in the middle"],
              ["Cover 0", "6+", "Man, nobody deep", "No help anywhere: out in about 1.5 s"]] } }
          ] },
        { id: "l42", title: "Protection: slide, keep, check-release", mins: 9,
          why: "Find the side with more rushers than blockers, then block it or throw where the blitzer came from.",
          blocks: [
            { list: [
              `<b>Slide</b>: the line steps together toward one side and blocks gaps. The back takes the first rusher on the other side. Slide toward the most dangerous side: the overload, or the side the linebackers favor.`,
              `<b>Keep the back in</b>: one more blocker, one fewer route.`,
              `<b>Check-release</b>: the back blocks if his man rushes, then runs his route late if he does not.`,
              `<b>Hot</b>: when the protection cannot block everyone, the quarterback is responsible for the extra rusher. He throws before the rusher arrives, to the area the blitzer left.`,
              `<b>The Mike point</b>: the center or quarterback names the middle linebacker and the protection counts from him. Defenses disguise who the Mike is to break the count.`] },
            { p: `Set the protection against this Cover 0 look and watch what it does to the pocket. Five linemen block two rushers per side, and the center goes to the slide side.` },
            { widget: "prot", args: { spec: F.c0Hot } },
            { tap: { film: F.c0Hot, at: 0.4, opts: { rules: false, routes: false }, prompt: "Default protection, six rushers. Tap the rusher nobody blocks.", answer: { free: true },
              why: "The slide went right, so the left side has more rushers than blockers. The extra one is free." } },
            { mc: { q: "You keep the back in and slide toward the overload. What have you given up?", opts: ["Nothing", "A receiver: only four routes against man coverage", "The run", "The hot throw"], a: 1,
              why: "Every extra blocker is one fewer route. Against Cover 0 that is often the right trade: five rushers blocked and four men in man coverage with no help." } },
            { drill: { name: "Pressure looks", text: "Single snaps against Cover 0, Cover 1 blitz and fire zones. Slide to the blitzers, keep the back when a side is short, or throw hot.", d: { covs: ["c0", "c1", "fire"], level: 2 } } }
          ] },
        { id: "l43", title: "Hot throws", mins: 7,
          why: "The read you planned is still right. Pressure just makes you make it faster.",
          blocks: [
            { p: `Against a fire zone, five rush and three drop underneath. The blitzer's area is empty. Against Cover 1 blitz, the hole player is rushing, so nobody sits in the middle on the crossers.` },
            { board: { films: [{ label: "Slant-Flat vs fire zone", spec: F.fireHot }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: -0.3, title: "Five rushers", text: "A linebacker walks down. Five rush; three underneath, three deep." },
                { t: 0.7, title: "Where he came from", text: "The blitzer's zone is empty. The slant into that area comes open first.", hl: { free: true } }
              ] } },
            { throw: { film: F.fireHot, at: 0.8, prompt: "Fire zone, free rusher. Decide now: tap the throw.",
              why: "Throw where the blitzer came from, before he arrives. Hold it and the free rusher gets home." } },
            { key: `The order: protection first, then the hot. If you can block it, block it and run the play. If you cannot, the ball comes out on the first open route to the blitz side.` }
          ] }
      ] },

    /* ================================================================ */
    { id: "p5", n: 5, title: "Concepts and the conflict defender",
      goal: "For every concept, name the defender in conflict and throw the receiver he does not take.",
      lessons: [
        { id: "l51", title: "One defender, two receivers", mins: 8,
          why: "Every concept is built to put one defender in conflict. Find him and the read is simple.",
          blocks: [
            { p: `A pass concept puts two receivers in one defender's area: one high and one low (a hi-lo), one inside and one outside (a horizontal stretch), or three in a triangle. Whatever he takes, the other one is open. The quarterback's job is to know who that defender is before the snap, watch his first step, and throw opposite him.` },
            { table: { head: ["Stretch", "How", "Examples"], rows: [
              ["Hi-lo", "Two receivers at different depths under one defender", "Smash (corner over hitch), Curl-Flat, Levels, Drive"],
              ["Horizontal", "Two or more receivers at the same depth across zones", "Stick, Spacing, Mesh against zone"],
              ["Triangle", "Three receivers on one side, three levels", "Flood, Snag"],
              ["Vertical", "More vertical routes than deep defenders", "Four Verts against Cover 3 or Cover 2"]] } },
            { p: `The chart under this film is the engine's grader: at each moment, what each throw would be worth if you decided then, in expected points. You can see the window open, peak and close.` },
            { board: { films: [{ label: "Smash vs Cover 2", spec: F.smashC2 }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: 1.0, title: "The conflict", text: "The flat corner is under the corner route and over the hitch.", hl: { zone: ["Flat L", "Flat R"] } },
                { t: 1.6, title: "The window", text: "At the top of the drop the corner route peaks. Late, the half safety closes it." }
              ] } },
            { key: `The play design creates the conflict; the quarterback's job is to identify one defender and be on time. Every read in this phase is a one-defender read.` }
          ] },
        { id: "l52", title: "Hi-lo the flat: Smash and Curl-Flat", mins: 8,
          why: "The two oldest answers to a flat defender.",
          blocks: [
            { p: `<b>Smash</b>: hitch by #1, corner by #2. Built for two-high, where the corner squats. Key: the flat corner. He sinks with the corner route: throw the hitch. He squats on the hitch: throw the corner over him. Against single-high the corner route runs into a deep third, so the hitch becomes the answer.` },
            { p: `<b>Curl-Flat</b>: curl by #1, flat by #2. Built for Cover 3. Key: the curl/flat defender. He widens with the flat: throw the curl. He sinks under the curl: throw the flat.` },
            { board: { films: [{ label: "Smash vs Cover 2", spec: F.smashC2 }, { label: "Smash vs Cover 6", spec: F.smashC6 }, { label: "Curl-Flat vs Sky", spec: F.cfSky }], opts: { rules: true, zones: true, routes: true }, ev: true } },
            { throw: { film: F.smashC6, at: 1.6, prompt: "Smash vs Cover 6, top of the drop, working the half side. Tap the throw.",
              why: "The half side is Cover 2: the cloud corner squats on the hitch and the corner route sits behind him." } },
            { throw: { film: F.cfSky, at: 2.3, prompt: "Curl-Flat vs Cover 3 Sky, top of the drop. Tap the throw.",
              why: "The flat defender takes the flat route, so the curl sits behind him. In this engine the windows are modest: Curl-Flat is a completion play." } },
            { drill: { name: "Hi-lo the flat", text: "Smash and Curl-Flat against the coverages they are built for, plus whatever else comes.", d: { ids: ["smash", "curlflat", "stick", "slantflat"], level: 2 } } }
          ] },
        { id: "l53", title: "Three levels: Flood and Stick", mins: 8,
          why: "Too many receivers in one defender's area.",
          blocks: [
            { p: `<b>Flood</b>: a go route clears the deep third, a sail at 12 to 15 yards and a flat underneath. Key: the curl/flat defender. He widens to the flat: sail behind him. He sinks under the sail: flat. Built for Cover 3 and Cover 2; quarters and 2-Man take it away.` },
            { p: `<b>Stick</b>: a stick route at 6 yards by #3 (or #2), a flat underneath, and a fade clearing the corner. Key: the flat defender. He hangs inside on the stick: flat. He widens: stick. Built for Cover 3 and quarters, which are thin in the flats.` },
            { board: { films: [{ label: "Flood vs Sky", spec: F.floodSky }, { label: "Flood vs Quarters", spec: F.floodQ }, { label: "Stick vs Quarters", spec: F.stickQ }, { label: "Stick vs Sky", spec: F.stickC3 }], opts: { rules: true, zones: true, routes: true }, ev: true } },
            { h: "The backside" },
            { p: `A trips formation puts three receivers on one side and leaves one alone on the other. The defense has to decide how much help to send to the single receiver. Before you work the three-man side, check him: if his corner gives him the slant with nobody inside, that is the throw.` },
            { throw: { film: { cid: "stick", cov: "c2" }, at: 1.6, prompt: "Stick from trips vs Cover 2, top of the drop. Tap the throw.",
              why: "The backside slant: the Cover 2 corner on that side walls nothing inside him, and the hook defenders have slid to the trips side." } },
            { note: `Where this engine disagrees with coaching convention: in Pocket QB the stick route itself rarely wins against Cover 3, because the hook defender's landmark sits on top of it. The convention says Stick beats Cover 3 by putting the flat defender in conflict. Watch the Stick films and judge the windows yourself.` },
            { drill: { name: "Three levels", text: "Flood and Stick from trips.", d: { ids: ["flood", "stick", "snag", "spacing"], level: 2 } } }
          ] },
        { id: "l54", title: "The hook defender: Dagger, Levels and Drive", mins: 9,
          why: "Inside, the hook defender is the one in conflict.",
          blocks: [
            { p: `<b>Dagger</b>: the inside receiver runs a seam that pulls the hook and the middle safety; the outside receiver runs a deep dig behind them. Key: the middle safety or the hook. He carries the seam: dig. He stays: seam.` },
            { p: `<b>Levels</b>: two in-breaking routes at different depths (an in at 5, a dig at 12). Key: the hook defender. Throw whichever level he does not take.` },
            { p: `<b>Drive</b>: a shallow cross under a dig. Key: the hook defender. He drops: shallow. He jumps the shallow: dig.` },
            { board: { films: [{ label: "Dagger vs Sky", spec: F.daggerC3 }, { label: "Levels vs Buzz", spec: F.levelsC3 }, { label: "Drive vs Cover 1", spec: F.driveC1 }], opts: { rules: true, zones: true, routes: true }, ev: true } },
            { throw: { film: F.daggerC3, at: 2.8, prompt: "Dagger vs Cover 3 Sky, top of the drop (five steps and a hitch). Tap the throw.",
              why: "The seam pulls the hook and holds the middle safety; the dig comes open behind them at the top of the drop." } },
            { drill: { name: "Inside reads", text: "Dagger, Levels and Drive: find the hook defender.", d: { ids: ["dagger", "levels", "drive", "ycross"], level: 2 } } }
          ] },
        { id: "l55", title: "Beating man: Mesh, crossers and rubs", mins: 8,
          why: "Man coverage loses when defenders have to run through traffic or change direction.",
          blocks: [
            { p: `<b>Mesh</b>: two shallow crossers that pass each other at about 5 yards, with a sit route and a corner over them. Against man, the crossers make their defenders run through each other (a rub). Against zone, they sit in the first window between hooks.` },
            { p: `<b>Y-Cross</b>: a deep cross behind a clearing go route and a flat. Against man it is a race the defender rarely wins; against Cover 3 it attacks the curl/flat defender from the inside.` },
            { p: `<b>Slant-Flat</b>: the oldest quick answer to man and to pressure. A slant inside a flat route by #2 creates a natural rub.` },
            { board: { films: [{ label: "Mesh vs Cover 1", spec: F.meshC1 }, { label: "Mesh vs 2-Man", spec: F.meshM2 }, { label: "Y-Cross vs Sky", spec: F.ycrossC3 }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: 1.2, title: "The rub", text: "The crossers pass each other; their defenders have to go over or under the traffic. Rubbed defenders lose about a third of a second." }
              ] } },
            { throw: { film: F.meshC1, at: 2.3, prompt: "Mesh vs Cover 1, top of the drop. Tap the throw.",
              why: "The crosser who comes out of the rub has a step on his defender, away from the rat in the middle." } },
            { drill: { name: "Beat man", text: "Man coverage only: Cover 0, Cover 1 and 2-Man.", d: { covs: ["c0", "c1", "m2"], ids: ["mesh", "ycross", "slantflat", "drive", "texas"], level: 2 } } }
          ] },
        { id: "l56", title: "The middle safety: Four Verts and Sluggo", mins: 7,
          why: "More vertical routes than deep defenders.",
          blocks: [
            { p: `<b>Four Verts</b> sends four receivers deep. Against spot-drop Cover 3 the two seams split the middle safety. Against Cover 2 two receivers attack each half safety. Read the middle safety: throw the seam away from his leverage. Quarters is the coverage built to take this away, with four men over the top.` },
            { board: { films: [{ label: "vs Cover 3 Buzz", spec: F.vertsBuzz }, { label: "vs Tampa 2", spec: F.vertsT2 }, { label: "vs Quarters", spec: F.vertsQ }], opts: { rules: true, zones: true, routes: true }, ev: true } },
            { throw: { film: F.vertsBuzz, at: 2.3, prompt: "Four Verts vs Cover 3 Buzz, top of the drop. Tap the throw.",
              why: "The curl/flat defenders hand the seams off, and one middle safety cannot take both." } },
            { throw: { film: F.vertsT2, at: 2.3, prompt: "Four Verts vs Tampa 2, top of the drop. Tap the throw.",
              why: "The Mike can carry only one seam; the other is one-on-one with a half safety." } },
            { drill: { name: "Vertical stretch", text: "Four Verts, Sluggo-Seam and Post-Wheel against two-high and single-high looks.", d: { ids: ["verts", "sluggo", "postwheel", "smash"], level: 2 } } }
          ] }
      ] },

    /* ================================================================ */
    { id: "p6", n: 6, title: "Timing and the read routine",
      goal: "Throw on rhythm from the top of the drop, use your eyes, and run the same routine every snap.",
      lessons: [
        { id: "l61", title: "The drop is the clock", mins: 8,
          why: "Each drop is timed to its routes. The ball should come out at the top of the drop.",
          blocks: [
            { p: `Routes are built to break when the quarterback reaches the top of his drop. Throw then and the ball meets the receiver at the break, before the defender can react to it. Throw a beat late and the window that the play designed is gone.` },
            { widget: "drops" },
            { p: `Watch the window open and close on Dagger against Cover 3. The vertical line is the top of the drop.` },
            { board: { films: [{ label: "Dagger vs Sky", spec: F.daggerC3 }], opts: { rules: false, zones: false, routes: true }, ev: true,
              chapters: [
                { t: 2.0, title: "Too early", text: "The dig has not broken yet; the hook is still on top of it." },
                { t: 2.8, title: "On time", text: "Top of the drop with the hitch: the dig is breaking behind the hook." },
                { t: 3.0, title: "Late", text: "Every tenth after this the defenders rally." }
              ] } },
            { key: `Grade the decision time, not the completion. Play's result screen shows the best throw available when you released and the best window of the whole rep; the gap between them is your read gap.` }
          ] },
        { id: "l62", title: "Eyes move defenders", mins: 6,
          why: "Instinctive zone defenders read the quarterback's eyes.",
          blocks: [
            { p: `Zone defenders with good instincts drift toward where you are looking. Hold your eyes on one side and the middle safety leans that way; throw back the other way and he has to recover. In Play, hold a finger on the field to move your eyes.` },
            { board: { films: [{ label: "Eyes straight", spec: { cid: "verts", cov: "c3sky" } }, { label: "Eyes left, early", spec: { cid: "verts", cov: "c3sky", eye: [{ t: 0.5, x: 14, y: 18 }] } }], opts: { rules: false, zones: true, routes: true, eyes: true },
              chapters: [
                { t: 1.6, title: "The safety leans", text: "With the eyes held left, the middle safety drifts a yard or two toward them.", hl: { zone: ["Deep middle"] } }
              ] } },
            { note: `In this engine eyes move instinctive defenders a yard or two. That can turn a contested window into a clean one; it does not create an open receiver from nothing. A look-off also costs you: throwing far from where your eyes are adds 0.1 s to the release.` }
          ] },
        { id: "l63", title: "The routine, huddle to throw", mins: 10,
          why: "The same checklist every snap, until it is automatic.",
          blocks: [
            { key: `One routine, every snap, each step narrowing the next. Grade yourself on whether you ran it, not on whether the ball was caught.` },
            { widget: "routine" },
            { reveal: { q: "Why look at the middle safety first after the snap?", a: "He is the fastest single answer to the family: in the middle, one-high; split to a half, two-high. That answer overrides the pre-snap look and tells you which side of your call and kill to work." } },
            { reveal: { q: "What does a free rusher change about the read?", a: "Nothing about which receiver is right. It changes when: the ball comes out to the first open route on the blitz side, before the rusher arrives." } },
            { drill: { name: "Routine reps", text: "Level 3 snaps from the full NFL situation mix. Run the routine aloud: personnel, call and kill, safeties, corners, box, protection, read, snap.", d: { level: 3 } } }
          ] }
      ] },

    /* ================================================================ */
    { id: "p7", n: 7, title: "Situational football",
      goal: "Know what the defense calls in each situation, what each outcome costs, and when to take the safe play.",
      lessons: [
        { id: "l71", title: "Down and distance", mins: 9,
          why: "Defensive calls follow the situation. Know the menu before the play is called.",
          blocks: [
            { p: `What NFL defenses called in 2023-2025, by package and situation. Pick a package:` },
            { widget: "covBySit" },
            { note: `FTN's charting does not separate Cover 3 Sky from Buzz, or Tampa 2 from Cover 2. The game splits Cover 3 evenly between Sky and Buzz (and calls it a fire zone when five or more rushed), and gives Tampa 2 30% of Cover 2. Those splits are assumptions; the family totals are data.` },
            { table: { head: ["Situation", "What defenses tend to do", "What it means for you"], rows: [
              ["First and 10", "Honest against the run; Cover 1, Cover 3 and quarters", "Play-action and the full playbook"],
              ["Third and short", "Man, Cover 1 and pressure; tight coverage", "Rubs, slants, quick game: win one-on-one"],
              ["Third and medium", "A mix; Cover 1 is still the most common call", "Routes past the sticks with a break; crossers against man"],
              ["Third and long", "Dime, more two-high, defenders sitting at the sticks", "Routes that break past the sticks, or a check-down with room to run"],
              ["Red zone", "The field shrinks; more man and pressure inside the 10", "Fades, slants, rubs, back-shoulder throws"],
              ["Goal line", "Heavy fronts, Cover 0 and Cover 1", "Play-action, the quick fade, rubs at the goal line"]] } },
            { mc: { q: "Third and 2, the defense in nickel. Which call is most common in the NFL data?", opts: ["Cover 2", "Cover 1", "Cover 4", "Cover 0"], a: 1,
              why: "Cover 1 is called on nearly half of third-and-short snaps against nickel. Man beaters win there: rubs, slants, crossers." } },
            { drill: { name: "Third and long", text: "Single snaps from third and 7 or more.", d: { sit: "3l", level: 2 } } },
            { drill: { name: "Third and short", text: "Single snaps from third and 1 to 3.", d: { sit: "3s", level: 2 } } }
          ] },
        { id: "l72", title: "What a mistake costs", mins: 9,
          why: "Never turn a bad play into a disaster.",
          blocks: [
            { key: `Ball security is the first rule. An incompletion costs a down. A sack costs a down and yards. An interception costs the possession and usually the field. Know the price of each before the snap, and when the play is dead, take the cheapest outcome.` },
            { widget: "cost" },
            { p: `Expected points (EP) are the points a possession is worth on average from a down, distance and spot, from the nflverse model. EPA is the change a play makes. Field position changes the price: the same interception is worse at midfield than deep in your own end only because of where the other team gets the ball.` },
            { widget: "epCurve" },
            { key: `The throwaway is a play. When the read is gone and the rush is coming, an incompletion is almost always cheaper than the sack and always cheaper than a forced throw into coverage.` },
            { mc: { q: "Second and 8 at midfield, everyone covered, the rush closing. Which is usually cheapest?", opts: ["Take the sack", "Throw it away", "Force it into a tight window", "Scramble backward"], a: 1,
              why: "The throwaway costs a down. The sack costs a down and about 7 yards. A forced throw risks the possession." } }
          ] },
        { id: "l73", title: "Field, clock and fourth down", mins: 9,
          why: "The red zone, the two-minute drill and the fourth-down call.",
          blocks: [
            { h: "The red zone" },
            { p: `Inside the 20 the field shrinks: deep defenders cannot drop past the end line, so the underneath zones get crowded and windows close faster. Inside the 10 defenses play more man and pressure; at the goal line, Cover 0 becomes common. In Pocket QB the deep zones come up to the back of the end zone and nobody aligns deeper than the end line allows.` },
            { drill: { name: "Red zone", text: "Single snaps from inside the 20.", d: { sit: "red", level: 2 } } },
            { h: "Fourth down" },
            { p: `How often NFL coaches went for it, 2023-2025, by distance and field position:` },
            { widget: "go4" },
            { h: "The clock" },
            { list: [
              `The clock stops on an incompletion, when a runner goes out of bounds, and after a score or a change of possession.`,
              `In the last two minutes of a half, a timeout or a spike stops it; a spike costs a down.`,
              `Inside two minutes, completions to the sideline save time; a completion in the middle keeps the clock running.`,
              `Play's 2-minute, 4th-quarter and 2nd-half modes play these rules, with the opponent's drives drawn from NFL drive results.`] },
            { drill: { name: "Two-minute", text: "Play's two-minute mode: a drive against the clock. Sideline throws, timeouts and the spike." , d: { mode: "twomin" } } }
          ] }
      ] },

    /* ================================================================ */
    { id: "p8", n: 8, title: "Game planning",
      goal: "Build call-and-kill pairs that cover both shells, use play-action and similar looks, and scout yourself.",
      lessons: [
        { id: "l81", title: "Call and kill: one play for each shell", mins: 9,
          why: "Let the safeties choose the play for you.",
          blocks: [
            { p: `A good call-and-kill pair covers both shells: one play built for two-high, one built for single-high. Smash with Stick, Flood with Dagger, Four Verts with Levels are standard pairs. A pair where both plays beat the same shell leaves you with nothing when the safeties show the other one. Against obvious pressure, keep one quick concept available as a kill.` },
            { p: `Build a pair below. The grid shows what each play is built for and what it struggles against, from the coaching conventions in the playbook. The bar is the share of NFL calls in that situation that at least one of the two plays is built to beat.` },
            { widget: "pair" },
            { note: `"Built for" here is coaching convention, the same table as the Playbook tab. The engine agrees with it on some matchups and not others; the throw checks in Phase 5 show the engine's view on specific films.` }
          ] },
        { id: "l82", title: "Same look, different plays", mins: 9,
          why: "The illusion of complexity: few looks, many answers.",
          blocks: [
            { p: `If every play starts the same way, the defense cannot play the first two steps. Run the run game, the play-action and the dropback concepts from the same personnel and the same formations, and the defense has to wait. Waiting is a step late.` },
            { p: `Five plays from the same doubles formation against the same Cover 3. Flip between them at 0.5 seconds: the releases look alike. By the top of the drop they are five different problems.` },
            { board: { films: [{ label: "Smash", spec: { cid: "smash", cov: "c3sky" } }, { label: "Dagger", spec: F.daggerC3 }, { label: "Y-Cross", spec: F.ycrossC3 }, { label: "Four Verts", spec: { cid: "verts", cov: "c3sky" } }, { label: "Drive", spec: { cid: "drive", cov: "c3sky" } }], opts: { rules: false, zones: false, routes: false }, start: 0.5 } },
            { h: "Play-action" },
            { p: `Play-action makes linebackers and safeties take a step toward the run before they drop, which opens the intermediate windows behind them. In the NFL data, play-action passes averaged about +0.12 EPA against about +0.01 without, with the ball out later (2.9 s against 2.3). The more you run, the more defenders bite: Play's defensive coordinator sets how much it respects the run from your run rate.` },
            { board: { films: [{ label: "PA Boot vs Sky", spec: F.paBoot }], opts: { rules: true, zones: true, routes: true }, ev: true,
              chapters: [
                { t: 0.4, title: "The bite", text: "The linebackers step downhill toward the fake before they turn to drop.", hl: { arch: ["LB"] } },
                { t: 2.6, title: "Behind them", text: "The drag and the sail come open in the space the linebackers left." }
              ] } },
            { throw: { film: F.paBoot, at: 2.6, prompt: "PA Boot vs Cover 3 Sky, top of the boot. Tap the throw.",
              why: "The linebackers bit on the fake, so the drag crossing behind them is open, with the sail over the flat as the other option." } }
          ] },
        { id: "l83", title: "Self-scout", mins: 6,
          why: "The defense is scouting you. Scout yourself first.",
          blocks: [
            { p: `Opponents build their plan from your tendencies. Know them before they do: where your mistakes come from, which coverages you misread, how often you take sacks.` },
            { widget: "selfScout" },
            { p: `Play's coordinator adapts within a game: run often and he loads the box and respects play-action more; beat a coverage and he calls it less. Your tendencies are a weapon only if you know them.` }
          ] },
        { id: "l84", title: "The practice week", mins: 5,
          why: "A weekly plan that uses every part of the app.",
          blocks: [
            { p: `A week built the way most staffs build one: install and fundamentals early, situations in the middle, the whole game at the end. Each day is 20 to 30 minutes. The buttons open the right drill.` },
            { widget: "week" }
          ] }
      ] }
  ];

  /* the read routine (Phase 6), one card each */
  const ROUTINE = [
    ["Huddle", "Down, distance, field position and the defense's personnel. Personnel predicts the menu: dime on third and long means two-high or a defensive-back blitz."],
    ["Call and kill", "Pick a play for each shell so the safeties choose between them."],
    ["Walk-up", "Count the deep safeties; note their depth and width."],
    ["Corners", "Depth and leverage. Shallow and outside: a flat player. Off and inside: quarters or man."],
    ["Box and edges", "Count defenders near the line. Six or more, or linebackers in the A gaps: pressure is possible. Find the side with more rushers than blockers."],
    ["Protection", "Slide toward the threat. Keep the back in if one side is still short."],
    ["Commit", "Name the coverage, and from it the key defender for your concept and the side you will work."],
    ["Kill or stay", "If the shell matches your kill's coverage, kill to it."],
    ["Snap", "Early against a defense that rotates late; never at zero."],
    ["First look", "The middle safety. One-high or two-high confirms or overrides your read."],
    ["Key defender", "Read his first step and throw opposite him, on time with the top of your drop."],
    ["Eyes", "If the key defender is a safety with instincts, look him off before throwing away from him."],
    ["Pressure", "A free rusher means throw hot, now. The read is still right; make it faster."],
    ["After the play", "Compare what you saw with what they played. The replay shows the shell they showed and the coverage they ran."]
  ];

  /* the week (Phase 8) */
  const WEEK = [
    { day: "Mon", focus: "Film and install", items: [["lesson", "Review a Phase 2 or 3 lesson"], ["film", "Film room: this week's concepts against every coverage"]] },
    { day: "Tue", focus: "First and second down", items: [["drill", "12 personnel, early downs"], ["reps", "Throw reps: 10"]] },
    { day: "Wed", focus: "Third down", items: [["drill", "Third and long"], ["drill", "Third and short"]] },
    { day: "Thu", focus: "Red zone and pressure", items: [["drill", "Red zone"], ["drill", "Pressure looks"]] },
    { day: "Fri", focus: "Two-minute", items: [["drill", "Two-minute"], ["reps", "Coverage reps: 10"]] },
    { day: "Sat", focus: "Game", items: [["play", "A full game mode at your level"], ["lesson", "Self-scout"]] }
  ];

  const api = { PHASES, ROUTINE, WEEK, FILMS: F };
  root.PocketStudyContent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
