"""Build Pocket QB's calibration tables from nflverse data (2023-2025 regular season).

Sources (all from github.com/nflverse/nflverse-data releases):
  play_by_play_{y}.parquet   play-by-play with EP/EPA, air yards, YAC, kicks, drives
  pbp_participation_{y}.csv  formation, personnel, box count, pass rushers, coverage, time to throw
  ftn_charting_{y}.parquet   play-action, blitzers, box (FTN charting)
  teams.csv     team names and colors
Coverage labels drift between seasons (2023-24 tag far more Cover 1 than 2025), so
coverage mixes use 2025 only; everything else pools all three seasons.
Output: calib.json (compact) and a printed report."""
import json, math
import numpy as np, pandas as pd

YEARS = [2023, 2024, 2025]
pbp = pd.concat([pd.read_parquet(f"pbp_{y}.parquet") for y in YEARS], ignore_index=True)
pbp = pbp[pbp.season_type == "REG"].copy()
part = pd.concat([pd.read_csv(f"part_{y}.csv", usecols=["nflverse_game_id", "play_id", "offense_formation", "offense_personnel",
    "defense_personnel", "defenders_in_box", "number_of_pass_rushers", "time_to_throw", "was_pressure",
    "defense_man_zone_type", "defense_coverage_type"]).assign(season=y) for y in YEARS], ignore_index=True)
ftn = pd.concat([pd.read_parquet(f"ftn_{y}.parquet") for y in YEARS], ignore_index=True)
ftn = ftn.rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})[["game_id", "play_id", "is_play_action", "n_blitzers", "n_defense_box", "is_screen_pass", "is_rpo"]]
part = part.rename(columns={"nflverse_game_id": "game_id"}).drop(columns=["season"])
df = pbp.merge(part, on=["game_id", "play_id"], how="left").merge(ftn, on=["game_id", "play_id"], how="left")
out, rep = {"source": "nflverse play-by-play, participation and FTN charting, NFL regular seasons 2023-2025", "years": YEARS}, []
def say(*a): rep.append(" ".join(str(x) for x in a))

def opers(s):
    if not isinstance(s, str): return None
    c = {}
    for part_ in s.split(","):
        n, pos = part_.strip().split(" ", 1); c[pos] = c.get(pos, 0) + int(n)
    rb, te, wr = c.get("RB", 0) + c.get("FB", 0), c.get("TE", 0), c.get("WR", 0)
    if rb + te + wr != 5: return None
    return f"{rb}{te}"
def dpkg(s):
    if not isinstance(s, str): return None
    c = {}
    for part_ in s.split(","):
        n, pos = part_.strip().split(" ", 1); c[pos] = c.get(pos, 0) + int(n)
    db = c.get("CB", 0) + c.get("FS", 0) + c.get("SS", 0) + c.get("DB", 0) + c.get("S", 0)
    return "base" if db <= 4 else ("nickel" if db == 5 else "dime")
df["pers"] = df.offense_personnel.map(opers)
df["pkg"] = df.defense_personnel.map(dpkg)
scrim = df[(df.play_type.isin(["pass", "run"])) & (df.qb_kneel == 0) & (df.qb_spike == 0) & df.down.notna()].copy()
scrim["yl"] = scrim.yardline_100
def sitb(r):
    if r.half_seconds_remaining <= 120 and r.qtr in (2, 4): return "two"
    if r.yl <= 5: return "goal"
    if r.yl <= 20: return "red"
    if r.down == 3 or r.down == 4: return "3s" if r.ydstogo <= 3 else ("3m" if r.ydstogo <= 6 else "3l")
    return "early"
scrim["sb"] = scrim.apply(sitb, axis=1)
say("scrimmage plays", len(scrim))

# ---------- 1. real situations to sample from (downs 1-3, not two-minute) ----------
s = scrim[(scrim.down <= 3) & (scrim.sb != "two")].sample(2500, random_state=7)
out["sits"] = [[int(d), int(min(t, y)), int(y)] for d, t, y in zip(s.down, s.ydstogo, s.yl)]

# ---------- 2. personnel usage and the defense's package against it ----------
known = scrim[scrim.pers.notna() & scrim.pkg.notna()]
pers_use = (known.pers.value_counts(normalize=True) * 100).round(1)
say("offense personnel %", pers_use.head(8).to_dict())
out["persUse"] = {k: float(v) for k, v in pers_use.items() if k in ("11", "12", "21", "10", "13", "22")}
pk = {}
for p in ("11", "12", "21", "10"):
    sub = known[known.pers == p]
    pk[p] = {}
    for sb in ("early", "3s", "3m", "3l", "red", "goal", "two"):
        ss = sub[sub.sb == sb]
        if len(ss) < 40: ss = sub
        pk[p][sb] = {k: round(float(v), 3) for k, v in ss.pkg.value_counts(normalize=True).items()}
    say("pkg vs", p, pk[p]["early"], "3rd long", pk[p]["3l"])
out["pkg"] = pk

# ---------- 3. coverage mix by package and situation (2025 labels) ----------
COV_MAP = {"COVER_0": "c0", "COVER_1": "c1", "COVER_2": "c2", "2_MAN": "m2", "COVER_3": "c3", "COVER_4": "c4", "COVER_6": "c6"}
cv = scrim[(scrim.season == 2025) & scrim.defense_coverage_type.isin(COV_MAP)].copy()
cv["cov"] = cv.defense_coverage_type.map(COV_MAP)
cv["rush"] = cv.number_of_pass_rushers
def mix(sub):
    """our coverage keys: Cover 3 splits into fire zone (5+ rushers) and Sky/Buzz (half each,
    an assumption: the data does not tell them apart); Cover 2 splits into Cover 2 and Tampa 2
    at 70/30 (also an assumption); Cover 1 carries its blitz rate."""
    n = len(sub); w = {}
    for c, g in sub.groupby("cov"):
        f = len(g) / n
        if c == "c3":
            fire = (g.rush >= 5).mean(); w["fire"] = f * fire; w["c3sky"] = w["c3buzz"] = f * (1 - fire) / 2
        elif c == "c2": w["c2"] = f * 0.7; w["tampa2"] = f * 0.3
        else: w[c] = f
    return {k: round(float(v), 4) for k, v in w.items()}
covt = {}
for pkg_ in ("base", "nickel", "dime"):
    covt[pkg_] = {}
    for sb in ("early", "3s", "3m", "3l", "red", "goal", "two"):
        ss = cv[(cv.pkg == pkg_) & (cv.sb == sb)]
        if len(ss) < 60: ss = cv[cv.sb == sb] if len(cv[cv.sb == sb]) >= 60 else cv[cv.pkg == pkg_]
        covt[pkg_][sb] = mix(ss)
out["cov"] = covt
lg = mix(cv)
out["covLeague"] = lg
say("league coverage 2025", lg)
say("cover 1 with 5+ rushers", round(float((cv[cv["cov"] == "c1"].rush >= 5).mean()), 3))
out["c1blitz"] = round(float((cv[cv["cov"] == "c1"].rush >= 5).mean()), 3)
out["covRaw"] = {k: round(float(v), 4) for k, v in scrim[(scrim.season == 2025) & scrim.defense_coverage_type.notna()].defense_coverage_type.value_counts(normalize=True).items()}

# ---------- 4. teams: colors and 2025 defensive tendencies ----------
teams = pd.read_csv("teams.csv")
cur = teams[teams.team_abbr.isin(scrim[scrim.season == 2025].defteam.unique())]
tt = {}
for _, t in cur.iterrows():
    sub = cv[cv.defteam == t.team_abbr]
    d25 = scrim[(scrim.season == 2025) & (scrim.defteam == t.team_abbr) & (scrim.play_type == "pass")]
    if len(sub) < 200: continue
    blitz = float((d25.number_of_pass_rushers >= 5).mean())
    man = float((d25.defense_man_zone_type == "MAN_COVERAGE").sum() / max(1, d25.defense_man_zone_type.notna().sum()))
    epa_play = float(scrim[(scrim.season == 2025) & (scrim.defteam == t.team_abbr)].epa.mean())
    tt[t.team_abbr] = {"name": t.team_name, "nick": t.team_nick, "c1": t.team_color, "c2": t.team_color2,
                       "mix": mix(sub), "blitz": round(blitz, 3), "man": round(man, 3), "epa": round(epa_play, 3), "n": int(len(sub))}
out["teams"] = tt
lgblitz = float((scrim[(scrim.season == 2025) & (scrim.play_type == "pass")].number_of_pass_rushers >= 5).mean())
out["blitzLeague"] = round(lgblitz, 3)
ranked = sorted(tt.items(), key=lambda kv: kv[1]["epa"])
say("best 2025 defenses by EPA/play:", [(k, v["epa"]) for k, v in ranked[:5]], "worst:", [(k, v["epa"]) for k, v in ranked[-3:]])
say("highest blitz:", sorted(((k, v["blitz"]) for k, v in tt.items()), key=lambda x: -x[1])[:4])

# ---------- 5. runs: by box count ----------
runs = scrim[(scrim.play_type == "run") & (scrim.qb_scramble == 0) & scrim.defenders_in_box.between(4, 10)]
rb = {}
for b, g in runs.groupby("defenders_in_box"):
    if len(g) < 200: continue
    y = g.yards_gained
    rb[int(b)] = {"n": int(len(g)), "ypc": round(float(y.mean()), 2), "med": float(y.median()), "ten": round(float((y >= 10).mean()), 3),
                  "neg": round(float((y < 0).mean()), 3), "stuff": round(float((y <= 0).mean()), 3), "epa": round(float(g.epa.mean()), 3)}
out["runBox"] = rb
y = runs.yards_gained
out["runAll"] = {"ypc": round(float(y.mean()), 2), "ten": round(float((y >= 10).mean()), 3), "neg": round(float((y < 0).mean()), 3), "stuff": round(float((y <= 0).mean()), 3)}
say("runs by box", rb); say("all runs", out["runAll"])

# ---------- 6. passing: completion and YAC by air yards; pressure and time to throw ----------
pa = scrim[(scrim.play_type == "pass") & (scrim.pass_attempt == 1) & (scrim.sack == 0) & scrim.air_yards.notna()]
bins = [-10, 0, 5, 10, 15, 20, 30, 40, 70]
pa = pa.assign(ab=pd.cut(pa.air_yards, bins, right=False))
ct = []
for b, g in pa.groupby("ab", observed=True):
    ct.append({"lo": int(b.left), "hi": int(b.right), "n": int(len(g)), "comp": round(float(g.complete_pass.mean()), 3),
               "int": round(float(g.interception.mean()), 4), "yac": round(float(g[g.complete_pass == 1].yards_after_catch.mean()), 2)})
out["passAir"] = ct
say("completion by air yards", [(c["lo"], c["comp"], c["yac"]) for c in ct])
drop = scrim[scrim.qb_dropback == 1]
out["dropback"] = {"sack": round(float(drop.sack.mean()), 4), "pressure": round(float(drop.was_pressure.mean()), 3),
                   "ttt": round(float(drop.time_to_throw.median()), 2), "scramble": round(float(drop.qb_scramble.mean()), 3)}
pr = {}
for n, g in drop[drop.number_of_pass_rushers.between(3, 7)].groupby("number_of_pass_rushers"):
    if len(g) < 300: continue
    pr[int(n)] = {"n": int(len(g)), "press": round(float(g.was_pressure.mean()), 3), "sack": round(float(g.sack.mean()), 4),
                  "ttt": round(float(g.time_to_throw.median()), 2), "epa": round(float(g.epa.mean()), 3)}
out["rushers"] = pr
say("dropbacks", out["dropback"]); say("by rushers", pr)
byc = {}
for c, g in drop[(drop.season == 2025) & drop.defense_coverage_type.isin(COV_MAP)].groupby("defense_coverage_type"):
    byc[COV_MAP[c]] = {"n": int(len(g)), "epa": round(float(g.epa.mean()), 3), "comp": round(float(g[g.pass_attempt == 1].complete_pass.mean()), 3),
                       "ttt": round(float(g.time_to_throw.median()), 2)}
out["passCov"] = byc
say("dropback EPA by coverage 2025", byc)

# ---------- 7. play-action ----------
dp = drop[drop.is_play_action.notna()]
p1, p0 = dp[dp.is_play_action == True], dp[dp.is_play_action == False]
out["pa"] = {"rate": round(float(dp.is_play_action.mean()), 3), "epa": round(float(p1.epa.mean()), 3), "epaNo": round(float(p0.epa.mean()), 3),
             "ttt": round(float(p1.time_to_throw.median()), 2), "tttNo": round(float(p0.time_to_throw.median()), 2)}
say("play-action", out["pa"])

# ---------- 8. kicking ----------
fg = df[(df.field_goal_attempt == 1) & df.kick_distance.notna() & (df.season_type == "REG")]
X = fg.kick_distance.values.astype(float); Y = (fg.field_goal_result == "made").values.astype(float)
a, b = 0.0, 50.0
for _ in range(3000):   # logistic p = 1/(1+exp((d-b)/a')) fit by gradient steps on (k, d0)
    pass
from math import exp
best = None
for d0 in np.arange(50, 66, 0.25):
    for k in np.arange(3, 9, 0.1):
        p = 1 / (1 + np.exp((X - d0) / k)); p = np.clip(p, 1e-6, 1 - 1e-6)
        ll = float((Y * np.log(p) + (1 - Y) * np.log(1 - p)).sum())
        if best is None or ll > best[0]: best = (ll, float(d0), float(k))
out["fg"] = {"d0": round(best[1], 2), "k": round(best[2], 2)}
say("FG fit p=1/(1+exp((d-%.2f)/%.2f))" % (best[1], best[2]), {d: round(float(Y[(X >= d) & (X < d + 5)].mean()), 3) for d in range(20, 65, 5) if ((X >= d) & (X < d + 5)).sum() > 20})
pu = df[(df.punt_attempt == 1) & (df.season_type == "REG") & df.kick_distance.notna() & (df.punt_blocked == 0)]
pu = pu.assign(net=pu.kick_distance - pu.return_yards.fillna(0) - 20 * pu.touchback.fillna(0))
pt = {}
for lo in range(30, 100, 10):
    g = pu[(pu.yardline_100 >= lo) & (pu.yardline_100 < lo + 10)]
    if len(g) > 50: pt[lo] = {"net": round(float(g.net.mean()), 1), "sd": round(float(g.net.std()), 1), "tb": round(float(g.touchback.mean()), 3)}
out["punt"] = pt
say("punts net by yardline", pt)

# ---------- 9. drives: outcome by start, plays and time used ----------
dr = df[(df.season_type == "REG") & df.fixed_drive_result.notna() & df.drive_start_yard_line.notna()].drop_duplicates(["game_id", "fixed_drive"])
def start_yl(r):
    s_ = str(r.drive_start_yard_line)
    if s_ == "MID 50" or s_ == "50": return 50
    parts = s_.split()
    if len(parts) != 2: return np.nan
    side, n = parts[0], int(parts[1])
    return 100 - n if side == r.posteam else n
dr = dr.assign(syl=dr.apply(start_yl, axis=1)).dropna(subset=["syl"])
RES = {"Touchdown": "td", "Field goal": "fg", "Punt": "punt", "Turnover": "to", "Turnover on downs": "downs", "Missed field goal": "miss", "Opp touchdown": "to", "Safety": "safety", "End of half": "half"}
dr["res"] = dr.fixed_drive_result.map(RES)
def top(s_):
    try: m, s2 = str(s_).split(":"); return int(m) * 60 + int(s2)
    except Exception: return np.nan
dr["secs"] = dr.drive_time_of_possession.map(top)
dz = {}
for lo in range(1, 100, 10):
    g = dr[(dr.syl >= lo) & (dr.syl < lo + 10) & (dr.res != "half")]
    if len(g) < 50: continue
    vc = g.res.value_counts(normalize=True)
    dz[lo] = {k: round(float(vc.get(k, 0)), 3) for k in ("td", "fg", "punt", "to", "downs", "miss", "safety")}
    dz[lo]["plays"] = round(float(g.drive_play_count.mean()), 1); dz[lo]["secs"] = round(float(g.secs.mean()), 0)
out["drives"] = dz
say("drive outcomes by start (yards to goal)", {k: (v["td"], v["fg"], v["punt"], v["secs"]) for k, v in dz.items()})

# ---------- 10. expected points table (nflverse EP model, binned) ----------
e = scrim[scrim.ep.notna() & scrim.down.between(1, 4)].copy()
e["tb"] = pd.cut(e.ydstogo, [0, 1, 3, 6, 10, 15, 100], labels=False)
e["yb"] = (e.yl.clip(1, 99) // 5).astype(int)
ep = e.groupby(["down", "tb", "yb"]).ep.mean()
tab = [[[None] * 20 for _ in range(6)] for _ in range(4)]
for (d, tb, yb), v in ep.items(): tab[int(d) - 1][int(tb)][int(yb)] = round(float(v), 2)
# fill gaps from the neighbor along the field
for d in range(4):
    for t_ in range(6):
        row = tab[d][t_]
        for i in range(20):
            if row[i] is None:
                near = [row[j] for j in sorted(range(20), key=lambda j: abs(j - i)) if row[j] is not None]
                row[i] = near[0] if near else 0
out["ep"] = {"togo": [1, 3, 6, 10, 15, 100], "tab": tab}
say("EP 1st&10 by yards to goal:", {yb * 5: tab[0][3][yb] for yb in range(0, 20, 3)})

# ---------- 11. fourth down: how often coaches go ----------
f4 = scrim[scrim.down == 4]
k4 = df[(df.season_type == "REG") & (df.down == 4) & df.play_type.isin(["pass", "run", "punt", "field_goal"])]
k4 = k4.assign(go=k4.play_type.isin(["pass", "run"]), tb=pd.cut(k4.ydstogo, [0, 1, 3, 6, 100], labels=False), yb=(k4.yardline_100.clip(1, 99) // 10).astype(int))
g4 = k4.groupby(["tb", "yb"]).go.agg(["mean", "size"])
out["go4"] = {f"{int(t_)}-{int(y_)}": round(float(r["mean"]), 2) for (t_, y_), r in g4.iterrows() if r["size"] >= 25}
say("4th-down go rate, 4th&1 by field tenth", {k: v for k, v in out["go4"].items() if k.startswith("0-")})

json.dump(out, open("calib.json", "w"), separators=(",", ":"))
open("calib_report.txt", "w").write("\n".join(rep))
print("\n".join(rep)); print("calib.json bytes", len(json.dumps(out, separators=(",", ":"))))
