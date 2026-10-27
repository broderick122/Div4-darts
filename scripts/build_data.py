#!/usr/bin/env python3
"""Build data/league.json (and compressed scoresheets) for the Clemins site.

Weekly update
-------------
1. Replace the files in sources/ with the new export:
   - roster_stats.csv          DartConnect season totals
   - roster_weekly.csv         DartConnect week-by-week (high turn, tons, outs)
   - schedule.csv              our match list, including DartConnect recap URLs
   - standings.csv             DartConnect division standings snapshot
   - division_schedule.csv     full division slate (authoritative scores)
   - clemins-half.xlsx         team workbook; Stats sheet (player lines)
   - attendance.json           who shot each week, through the latest recorded week
2. Optional: drop a new photo at sources/scoresheets/week-07.jpg
   and add a row to SCORESHEET_SOURCES below (rotate if the photo is sideways).
   On the attendance file, mark that week played or missed for each player
   and set the week's status to "recorded". Weeks still ahead stay "upcoming".
3. From the repo root:

       python3 scripts/build_data.py

   Needs openpyxl, and Pillow only if you are recompressing photos
   (pip install openpyxl pillow).
4. Commit data/league.json and any new files under scoresheets/, then push main.

What the script trusts
-----------------------
- Player 01 / cricket / checkout / W-L lines come from the workbook Stats sheet
  (keyed through Week 5 in the 2026-10-27 drop). 3DA, PPD, and MPR are
  points-per-dart and marks-per-dart, same formulas as the sheet.
- High turn, 100+, 140+, 180s, and the checkout scores come from
  roster_weekly.csv. That export currently stops at Week 4, so those
  personal bests are labeled as such. They are not guessed off the photos.
- Match scores, venues, and who is next come from division_schedule.csv,
  which is complete through Week 6. schedule.csv still has Weeks 5–6 as
  "scheduled"; recap links are taken from it when the match id matches.
- Division standings are recomputed from division_schedule.csv because
  standings.csv is the Week 4 snapshot (Clemins 3–1). Points are legs won,
  which is how that snapshot ranked the division.
- Week 6 player lines are not in the workbook. The team score (11–4) is.
  The scoresheet image is published; individual Week 6 numbers are not invented.
- Attendance and playoff eligibility come from sources/attendance.json.
  A player is present only when that file marks the week played (he shot
  on the paper scoresheet). The workbook Attendance sheet is not the
  source for the site; it is only checked so a disagreement is printed.
"""

from __future__ import annotations

import ast
import csv
import json
import re
from collections import defaultdict
from datetime import datetime, date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "sources"
DATA_OUT = ROOT / "data" / "league.json"
SHEETS_OUT = ROOT / "scoresheets"

OUR_TEAM_ID = "380923"
OUR_NAME = "5-Curran's Irish Inn (Clemins)"

# Originals live outside the repo (large phone photos). Rotate is degrees
# counter-clockwise, chosen so the printed header reads upright.
SCORESHEET_SOURCES = [
    {
        "week": 4,
        "rotate": 90,
        "upload_names": [
            "QCEDL_Week_4_Scoresheet_-_Clemins_vs_Zepp_2026-10-08_618c.jpg",
        ],
    },
    {
        "week": 5,
        "rotate": 0,
        "upload_names": [
            "QCEDL_Week_5_Scoresheet_-_Clemins_vs_Higgins_2026-10-15_b198.jpg",
        ],
    },
    {
        "week": 6,
        "rotate": 0,
        "upload_names": [
            "Week6_2026-10-22_scoresheet_9a3e.jpg",
        ],
    },
]

NAME_FIX = {
    "Captain (Vince Clemins)": "Vince Clemins",
    "Vince Clemins": "Vince Clemins",
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def captain_of(team: str) -> str:
    match = re.search(r"\(([^)]+)\)\s*$", team or "")
    return match.group(1) if match else team


def bar_of(team: str) -> str:
    text = re.sub(r"^\d+\s*-\s*", "", team or "")
    text = re.sub(r"\s*\([^)]*\)\s*$", "", text)
    return text.strip()


def num(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip().replace("%", "").replace(",", "")
    if text == "":
        return None
    try:
        return float(text) if "." in text else int(text)
    except ValueError:
        return None


def rnd(value, places):
    if value is None:
        return None
    return round(float(value) + 0.0, places)


def parse_checkouts(raw):
    if raw is None or str(raw).strip() == "":
        return []
    try:
        value = ast.literal_eval(str(raw).strip())
    except (SyntaxError, ValueError):
        return []
    if not isinstance(value, (list, tuple)):
        return []
    outs = []
    for item in value:
        n = num(item)
        if n is not None:
            outs.append(int(n))
    return outs


def parse_rank(raw):
    if not raw or "/" not in str(raw):
        return None
    place, total = str(raw).split("/", 1)
    if not place.strip() or not total.strip():
        return None
    return {"place": int(place), "of": int(total)}


def iso_date(value) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return text


def read_csv(path: Path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_workbook_stats():
    import openpyxl

    path = SOURCES / "clemins-half.xlsx"
    wb = openpyxl.load_workbook(path, data_only=False)
    ws = wb["Stats"]
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        player = row[0]
        if not player:
            continue
        name = NAME_FIX.get(str(player).strip(), str(player).strip())
        points = num(row[4])
        darts = num(row[5])
        marks = num(row[8])
        cricket_darts = num(row[9])
        do_hits = num(row[11])
        do_opps = num(row[12])
        wins = num(row[14])
        losses = num(row[15])
        played = points is not None or darts is not None or wins is not None
        rows.append(
            {
                "player": name,
                "week": int(row[1]),
                "date": iso_date(row[2]),
                "opponent": row[3],
                "played": played,
                "points_01": int(points) if points is not None else None,
                "darts_01": int(darts) if darts is not None else None,
                "marks": int(marks) if marks is not None else None,
                "cricket_darts": int(cricket_darts) if cricket_darts is not None else None,
                "do_hits": int(do_hits) if do_hits is not None else None,
                "do_opps": int(do_opps) if do_opps is not None else None,
                "wins": int(wins) if wins is not None else None,
                "losses": int(losses) if losses is not None else None,
            }
        )
    attendance = {}
    att = wb["Attendance"]
    header = [c.value for c in next(att.iter_rows(min_row=1, max_row=1))]
    week_cols = []
    for idx, label in enumerate(header):
        if isinstance(label, str) and re.match(r"W\d+", label):
            week_cols.append((idx, int(re.match(r"W(\d+)", label).group(1))))
    for row in att.iter_rows(min_row=2, values_only=True):
        if not row[0] or str(row[0]).startswith("Rule"):
            continue
        name = NAME_FIX.get(str(row[0]).strip(), str(row[0]).strip())
        marks = {}
        for idx, week in week_cols:
            cell = row[idx] if idx < len(row) else None
            if cell in ("✓", "✔", "Y", "Yes", True):
                marks[week] = True
            elif cell in ("✗", "✘", "N", "No", False):
                marks[week] = False
        attendance[name] = marks
    return rows, attendance


def load_weekly_detail():
    detail = {}
    for row in read_csv(SOURCES / "roster_weekly.csv"):
        name = NAME_FIX.get(row["player"].strip(), row["player"].strip())
        week = int(row["week"])
        played = str(row["played"]).strip().lower() == "true"
        detail[(name, week)] = {
            "played": played,
            "high_turn": num(row["high_turn_01"]),
            "tons_100": num(row["tons_100_plus"]),
            "tons_140": num(row["tons_140_plus"]),
            "tons_180": num(row["ton80s"]),
            "checkouts": parse_checkouts(row["checkouts"]) if played else [],
            "busts": num(row["busts"]),
            "ppr_3da": num(row["ppr_3da"]),
            "mpr": num(row["mpr"]),
        }
    return detail


def load_roster_export():
    players = {}
    for row in read_csv(SOURCES / "roster_stats.csv"):
        name = NAME_FIX.get(row["player"].strip(), row["player"].strip())
        players[name] = {
            "first_nine_avg": num(row["first_nine_avg"]),
            "ppr_rank": parse_rank(row["ppr_rank_div04"]),
            "mpr_rank": parse_rank(row["mpr_rank_div04"]),
            "five_mark": num(row["five_mark_rounds"]),
            "seven_mark": num(row["seven_mark_rounds"]),
            "nine_mark": num(row["nine_mark_rounds"]),
            "hat_tricks": num(row["hat_tricks"]),
            "export_high_checkout": num(row["high_checkout"]),
            "export_high_turn": num(row["high_turn"]),
            "export_3da": num(row["ppr_3da"]),
            "export_games": num(row["games_played"]),
        }
    return players


def avg(total, divisor, scale, places):
    if divisor in (None, 0):
        return None
    return rnd(total / divisor * scale, places)


def build_players(stats_rows, weekly, export, attendance):
    by_player = defaultdict(list)
    for row in stats_rows:
        by_player[row["player"]].append(row)

    players = []
    for name in by_player:
        weeks_out = []
        sum_points = sum_darts = 0
        sum_marks = sum_cdarts = 0
        sum_hits = sum_opps = 0
        sum_wins = sum_losses = 0
        sum_100 = sum_140 = sum_180 = 0
        tons_weeks = 0
        high_turn = None
        logged_checkouts = []
        best_3da = None
        best_mpr = None
        weeks_played = 0

        for row in sorted(by_player[name], key=lambda r: r["week"]):
            extra = weekly.get((name, row["week"]), {})
            played = bool(row["played"])
            ppr = avg(row["points_01"], row["darts_01"], 3, 2) if played else None
            ppd = avg(row["points_01"], row["darts_01"], 1, 2) if played else None
            mpr = avg(row["marks"], row["cricket_darts"], 3, 2) if played else None
            co = avg(row["do_hits"], row["do_opps"], 100, 1) if played else None
            week_obj = {
                "week": row["week"],
                "date": row["date"],
                "opponent": row["opponent"],
                "opponent_captain": captain_of(row["opponent"]) if row["opponent"] else None,
                "played": played,
                "games": (row["wins"] or 0) + (row["losses"] or 0) if played else None,
                "wins": row["wins"] if played else None,
                "losses": row["losses"] if played else None,
                "points_01": row["points_01"] if played else None,
                "darts_01": row["darts_01"] if played else None,
                "ppr_3da": ppr,
                "ppd": ppd,
                "marks": row["marks"] if played else None,
                "cricket_darts": row["cricket_darts"] if played else None,
                "mpr": mpr,
                "do_hits": row["do_hits"] if played else None,
                "do_opps": row["do_opps"] if played else None,
                "checkout_pct": co,
                "high_turn": int(extra["high_turn"]) if extra.get("high_turn") else None,
                "tons_100": int(extra["tons_100"]) if extra.get("tons_100") is not None and played else None,
                "tons_140": int(extra["tons_140"]) if extra.get("tons_140") is not None and played else None,
                "tons_180": int(extra["tons_180"]) if extra.get("tons_180") is not None and played else None,
                "checkouts": extra.get("checkouts") or [],
                "busts": int(extra["busts"]) if extra.get("busts") is not None and played else None,
            }
            weeks_out.append(week_obj)
            if not played:
                continue
            weeks_played += 1
            sum_points += row["points_01"] or 0
            sum_darts += row["darts_01"] or 0
            sum_marks += row["marks"] or 0
            sum_cdarts += row["cricket_darts"] or 0
            sum_hits += row["do_hits"] or 0
            sum_opps += row["do_opps"] or 0
            sum_wins += row["wins"] or 0
            sum_losses += row["losses"] or 0
            if week_obj["tons_100"] is not None:
                tons_weeks += 1
                sum_100 += week_obj["tons_100"]
                sum_140 += week_obj["tons_140"] or 0
                sum_180 += week_obj["tons_180"] or 0
            if week_obj["high_turn"]:
                high_turn = max(high_turn or 0, week_obj["high_turn"])
            logged_checkouts.extend(week_obj["checkouts"])
            if ppr is not None and (best_3da is None or ppr > best_3da["value"]):
                best_3da = {"value": ppr, "week": row["week"], "date": row["date"]}
            if mpr is not None and (best_mpr is None or mpr > best_mpr["value"]):
                best_mpr = {"value": mpr, "week": row["week"], "date": row["date"]}

        exp = export.get(name, {})
        high_out = max(logged_checkouts) if logged_checkouts else None
        if exp.get("export_high_checkout") is not None:
            exported_out = int(exp["export_high_checkout"])
            if high_out is None or exported_out > high_out:
                high_out = exported_out
        games = sum_wins + sum_losses
        parts = name.split()
        players.append(
            {
                "id": slug(name),
                "name": name,
                "first": parts[0],
                "last": " ".join(parts[1:]) if len(parts) > 1 else "",
                "captain": name == "Vince Clemins",
                "weeks_played": weeks_played,
                "playoff_weeks_required": 6,
                "playoff_weeks_scheduled": 10,
                "attendance": [
                    {"week": week, "played": shot}
                    for week, shot in sorted(attendance.get(name, {}).items())
                ],
                "season": {
                    "games": games,
                    "wins": sum_wins,
                    "losses": sum_losses,
                    "win_pct": rnd(100 * sum_wins / games, 1) if games else None,
                    "points_01": sum_points,
                    "darts_01": sum_darts,
                    "ppr_3da": avg(sum_points, sum_darts, 3, 2),
                    "ppd": avg(sum_points, sum_darts, 1, 2),
                    "marks": sum_marks,
                    "cricket_darts": sum_cdarts,
                    "mpr": avg(sum_marks, sum_cdarts, 3, 2),
                    "do_hits": sum_hits,
                    "do_opps": sum_opps,
                    "checkout_pct": rnd(100 * sum_hits / sum_opps, 1) if sum_opps else None,
                    "tons_100": sum_100 if tons_weeks else None,
                    "tons_140": sum_140 if tons_weeks else None,
                    "tons_180": sum_180 if tons_weeks else None,
                    "tons_weeks_covered": tons_weeks,
                    "high_turn": high_turn,
                    "high_checkout": high_out,
                    "best_3da": best_3da,
                    "best_mpr": best_mpr,
                    "first_nine_avg": exp.get("first_nine_avg"),
                    "ppr_rank": exp.get("ppr_rank"),
                    "mpr_rank": exp.get("mpr_rank"),
                    "five_mark": exp.get("five_mark"),
                    "seven_mark": exp.get("seven_mark"),
                    "nine_mark": exp.get("nine_mark"),
                    "hat_tricks": exp.get("hat_tricks"),
                },
                "weeks": weeks_out,
            }
        )
    players.sort(key=lambda p: (p["last"], p["first"]))
    return players


def load_schedule_extras():
    extras = {}
    for row in read_csv(SOURCES / "schedule.csv"):
        extras[str(row["match_id"])] = row
    return extras


def build_matches(extras):
    rows = []
    for row in read_csv(SOURCES / "division_schedule.csv"):
        if row["home_team_id"] != OUR_TEAM_ID and row["away_team_id"] != OUR_TEAM_ID:
            continue
        home = row["home_team_id"] == OUR_TEAM_ID
        opponent = row["away_team"] if home else row["home_team"]
        our_score = num(row["home_score"] if home else row["away_score"])
        opp_score = num(row["away_score"] if home else row["home_score"])
        status = row["status"]
        completed = status == "completed" and our_score is not None
        result = None
        if completed:
            if our_score > opp_score:
                result = "W"
            elif our_score < opp_score:
                result = "L"
            else:
                result = "T"
        extra = extras.get(str(row["match_id"]), {})
        recap = (extra.get("recap_url") or "").strip() or None
        rows.append(
            {
                "week": int(row["week"]),
                "round": row["round_label"],
                "match_id": row["match_id"],
                "date": row["date"],
                "day": row["day"],
                "time": row["time"],
                "status": "completed" if completed else "scheduled",
                "raw_status": status,
                "home_away": "home" if home else "away",
                "opponent": opponent,
                "opponent_captain": captain_of(opponent),
                "opponent_bar": bar_of(opponent),
                "venue_name": row["venue_name"],
                "venue_address": row["venue_address"],
                "venue_phone": row["venue_phone"] or None,
                "clemins_score": int(our_score) if our_score is not None else None,
                "opponent_score": int(opp_score) if opp_score is not None else None,
                "result": result,
                "recap_url": recap,
                "team_ppr": num(extra.get("team_ppr")) if extra else None,
                "team_mpr": num(extra.get("team_mpr")) if extra else None,
                "opponent_ppr": num(extra.get("opponent_ppr")) if extra else None,
                "opponent_mpr": num(extra.get("opponent_mpr")) if extra else None,
            }
        )
    rows.sort(key=lambda m: m["week"])
    return rows


def build_standings():
    teams = {}
    for row in read_csv(SOURCES / "division_schedule.csv"):
        for side in ("home", "away"):
            tid = row[f"{side}_team_id"]
            name = row[f"{side}_team"]
            teams.setdefault(
                tid,
                {
                    "team_id": tid,
                    "team_name": name,
                    "captain": captain_of(name),
                    "bar": bar_of(name),
                    "wins": 0,
                    "losses": 0,
                    "points": 0,
                    "legs_against": 0,
                    "matches": 0,
                    "is_us": tid == OUR_TEAM_ID,
                },
            )
        if row["status"] != "completed":
            continue
        hs, aws = num(row["home_score"]), num(row["away_score"])
        if hs is None or aws is None:
            continue
        home = teams[row["home_team_id"]]
        away = teams[row["away_team_id"]]
        home["matches"] += 1
        away["matches"] += 1
        home["points"] += int(hs)
        away["points"] += int(aws)
        home["legs_against"] += int(aws)
        away["legs_against"] += int(hs)
        if hs > aws:
            home["wins"] += 1
            away["losses"] += 1
        elif aws > hs:
            away["wins"] += 1
            home["losses"] += 1
    # DartConnect snapshot, kept so a weekly update can be compared.
    snapshot = {}
    for row in read_csv(SOURCES / "standings.csv"):
        snapshot[row["team_name"]] = {
            "rank": int(row["rank"]),
            "wins": int(row["win"]),
            "losses": int(row["loss"]),
            "points": int(row["league_points"]),
            "matches": int(row["matches"]),
            "ppr": num(row["ppr"]),
            "mpr": num(row["mpr"]),
        }
    table = list(teams.values())
    for team in table:
        played_legs = team["points"] + team["legs_against"]
        team["leg_win_pct"] = rnd(100 * team["points"] / played_legs, 2) if played_legs else None
        snap = snapshot.get(team["team_name"])
        if snap:
            team["dartconnect_snapshot"] = snap
    table.sort(key=lambda t: (-t["points"], -(t["leg_win_pct"] or 0), t["captain"]))
    for idx, team in enumerate(table, start=1):
        team["rank"] = idx
    return table


def division_slate():
    slate = defaultdict(list)
    for row in read_csv(SOURCES / "division_schedule.csv"):
        slate[int(row["week"])].append(
            {
                "match_id": row["match_id"],
                "date": row["date"],
                "time": row["time"],
                "status": row["status"],
                "away": row["away_team"],
                "away_captain": captain_of(row["away_team"]),
                "away_score": num(row["away_score"]),
                "home": row["home_team"],
                "home_captain": captain_of(row["home_team"]),
                "home_score": num(row["home_score"]),
                "venue_name": row["venue_name"],
                "involves_us": row["home_team_id"] == OUR_TEAM_ID or row["away_team_id"] == OUR_TEAM_ID,
            }
        )
    return [{"week": week, "matches": matches} for week, matches in sorted(slate.items())]


def find_upload(names):
    candidates = [
        Path("/home/ubuntu/.cursor/projects/workspace/uploads"),
        SOURCES / "scoresheets",
    ]
    for folder in candidates:
        if not folder.exists():
            continue
        for name in names:
            path = folder / name
            if path.exists():
                return path
        # also accept week-N.jpg dropped in sources/scoresheets
    return None


def compress_scoresheets(matches):
    try:
        from PIL import Image
    except ImportError:
        print("Pillow not installed; leaving existing scoresheets/ as-is")
        return
    by_week = {m["week"]: m for m in matches}
    SHEETS_OUT.mkdir(parents=True, exist_ok=True)
    for spec in SCORESHEET_SOURCES:
        src = find_upload(spec["upload_names"])
        week = spec["week"]
        local = SOURCES / "scoresheets" / f"week-{week:02d}.jpg"
        if local.exists():
            src = local
        if src is None:
            print(f"no source photo for week {week}")
            continue
        image = Image.open(src).convert("RGB")
        if spec.get("rotate"):
            image = image.rotate(spec["rotate"], expand=True)
        full = image.copy()
        full.thumbnail((2800, 2800), Image.Resampling.LANCZOS)
        web = image.copy()
        web.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
        full_name = f"week-{week:02d}-full.jpg"
        web_name = f"week-{week:02d}.jpg"
        full.save(SHEETS_OUT / full_name, "JPEG", quality=82, optimize=True)
        web.save(SHEETS_OUT / web_name, "JPEG", quality=74, optimize=True)
        match = by_week.get(week, {})
        print(
            f"week {week}: {src.name} -> {web_name} {web.size} / {full_name} {full.size} "
            f"({(SHEETS_OUT / web_name).stat().st_size // 1024}KB / {(SHEETS_OUT / full_name).stat().st_size // 1024}KB)"
            f" result={match.get('result')} {match.get('clemins_score')}-{match.get('opponent_score')}"
        )


def scoresheet_meta(matches):
    by_week = {m["week"]: m for m in matches}
    sheets = []
    for spec in SCORESHEET_SOURCES:
        week = spec["week"]
        web = SHEETS_OUT / f"week-{week:02d}.jpg"
        full = SHEETS_OUT / f"week-{week:02d}-full.jpg"
        if not web.exists():
            continue
        match = by_week.get(week, {})
        sheets.append(
            {
                "week": week,
                "date": match.get("date"),
                "opponent": match.get("opponent"),
                "opponent_captain": match.get("opponent_captain"),
                "result": match.get("result"),
                "clemins_score": match.get("clemins_score"),
                "opponent_score": match.get("opponent_score"),
                "home_away": match.get("home_away"),
                "venue_name": match.get("venue_name"),
                "web": f"scoresheets/week-{week:02d}.jpg",
                "full": f"scoresheets/week-{week:02d}-full.jpg",
                "web_bytes": web.stat().st_size,
                "full_bytes": full.stat().st_size if full.exists() else None,
            }
        )
    return sheets


def load_attendance_board():
    """Team attendance from sources/attendance.json.

    Marks on recorded weeks are played or missed. Upcoming weeks are not
    played yet. A recorded week with no mark, or a week listed in
    not_recorded_weeks, is not recorded. Playoffs need required_weeks of
    regular_season_weeks. Clinched once played hits the requirement.
    Otherwise the player needs that many of the weeks still upcoming, or
    can't make it when the weeks left are fewer than that.
    """
    path = SOURCES / "attendance.json"
    if not path.exists():
        print("no sources/attendance.json; player attendance stays on the workbook sheet")
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    weeks = []
    for row in raw["weeks"]:
        weeks.append(
            {
                "week": int(row["week"]),
                "date": row["date"],
                "status": row["status"],
            }
        )
    required = int(raw["required_weeks"])
    season_weeks = int(raw["regular_season_weeks"])
    unrecorded = {int(week) for week in raw.get("not_recorded_weeks") or []}
    players_out = []
    for person in raw["players"]:
        name = NAME_FIX.get(str(person["name"]).strip(), str(person["name"]).strip())
        given = {str(key): value for key, value in (person.get("marks") or {}).items()}
        marks = []
        played = missed = 0
        for week in weeks:
            number = week["week"]
            key = str(number)
            if week["status"] == "upcoming":
                status = "upcoming"
            elif week["status"] == "not_recorded" or number in unrecorded:
                status = "unrecorded"
            elif given.get(key) in ("played", "missed"):
                status = given[key]
            else:
                status = "unrecorded"
            if status == "played":
                played += 1
            elif status == "missed":
                missed += 1
            marks.append({"week": number, "status": status})
        remaining = sum(1 for week in weeks if week["status"] == "upcoming")
        needs = max(0, required - played)
        if played >= required:
            eligibility = "clinched"
            needs = 0
        elif needs > remaining:
            eligibility = "out"
        else:
            eligibility = "needs"
        file_status = person.get("status")
        if file_status and file_status != eligibility:
            print(f"attendance status recomputed for {name}: file {file_status} -> {eligibility}")
        players_out.append(
            {
                "name": name,
                "marks": marks,
                "played": played,
                "missed": missed,
                "status": eligibility,
                "needs": needs,
                "remaining": remaining,
            }
        )
    recorded = [week["week"] for week in weeks if week["status"] == "recorded"]
    summary = {
        "clinched": sum(1 for person in players_out if person["status"] == "clinched"),
        "needs": sum(1 for person in players_out if person["status"] == "needs"),
        "out": sum(1 for person in players_out if person["status"] == "out"),
    }
    return {
        "season": raw.get("season"),
        "rule": raw["rule"],
        "required_weeks": required,
        "regular_season_weeks": season_weeks,
        "updated": raw.get("updated"),
        "recorded_through_week": max(recorded) if recorded else None,
        "weeks_left": sum(1 for week in weeks if week["status"] == "upcoming"),
        "weeks": weeks,
        "players": players_out,
        "summary": summary,
        "corrections": raw.get("corrections") or [],
        "caveats": raw.get("caveats") or [],
        "sources": raw.get("sources") or [],
    }


def apply_attendance(players, board, workbook_attendance):
    if not board:
        return
    by_name = {player["name"]: player for player in players}
    listed = set()
    for person in board["players"]:
        name = person["name"]
        listed.add(name)
        workbook = workbook_attendance.get(name, {})
        for mark in person["marks"]:
            if mark["status"] not in ("played", "missed"):
                continue
            week = mark["week"]
            if week not in workbook:
                continue
            shot = mark["status"] == "played"
            if workbook[week] != shot:
                print(
                    f"attendance override {name} week {week}: "
                    f"workbook {'played' if workbook[week] else 'missed'} -> {mark['status']}"
                )
        player = by_name.get(name)
        if player is None:
            print(f"attendance player not on the roster: {name}")
            person["id"] = slug(name)
            person["captain"] = name == "Vince Clemins"
            continue
        person["id"] = player["id"]
        person["captain"] = bool(player["captain"])
        player["playoff_weeks_required"] = board["required_weeks"]
        player["playoff_weeks_scheduled"] = board["regular_season_weeks"]
        player["playoff_status"] = person["status"]
        player["playoff_needs"] = person["needs"]
        player["playoff_remaining"] = person["remaining"]
        player["attendance"] = [
            {
                "week": mark["week"],
                "played": mark["status"] == "played",
                "status": mark["status"],
            }
            for mark in person["marks"]
        ]
    missing = [player["name"] for player in players if player["name"] not in listed]
    if missing:
        print("roster players missing from attendance.json: " + ", ".join(missing))
    averages = {player["name"]: (player.get("season") or {}).get("ppr_3da") for player in players}
    indexed = list(enumerate(board["players"]))
    if any(averages.get(person["name"]) is not None for _, person in indexed):
        indexed.sort(
            key=lambda item: (
                averages.get(item[1]["name"]) is None,
                -(averages.get(item[1]["name"]) or 0),
                item[0],
            )
        )
        board["players"] = [person for _, person in indexed]


def main():
    stats_rows, attendance = load_workbook_stats()
    weekly = load_weekly_detail()
    export = load_roster_export()
    extras = load_schedule_extras()
    players = build_players(stats_rows, weekly, export, attendance)
    board = load_attendance_board()
    apply_attendance(players, board, attendance)
    matches = build_matches(extras)
    standings = build_standings()
    compress_scoresheets(matches)
    completed = [m for m in matches if m["status"] == "completed"]
    upcoming = [m for m in matches if m["status"] != "completed"]
    us = next(t for t in standings if t["is_us"])
    keyed_weeks = sorted({row["week"] for row in stats_rows})
    notes = [
        "Player 3DA, PPD, MPR, checkout rate, and W–L are weighted from the team workbook through Week 5.",
        "100+, 140+, 180s, high turn, and checkout scores are from the DartConnect weekly export (Weeks 1–4). Week 5–6 visit scores were not in that export.",
        "First-nine average, division ranks, and 5/7/9-mark rounds are the DartConnect roster export (through Week 4).",
        "Team results and the division table are scored from the division schedule through Week 6. The DartConnect standings file in sources/ is the Week 4 snapshot.",
        "Week 6 individual lines are on the scoresheet photo and are not in the workbook, so they are not in the player averages.",
    ]
    if board:
        ahead = board["weeks_left"]
        notes.append(
            "Attendance through Week "
            + str(board["recorded_through_week"])
            + " counts a player present only when he shot that night on the paper scoresheet. Playoffs need "
            + str(board["required_weeks"])
            + " of "
            + str(board["regular_season_weeks"])
            + " regular-season weeks."
            + (f" {ahead} weeks have not been played." if ahead else " The regular season is complete.")
        )
    payload = {
        "meta": {
            "league": "Quaker City English Dart League",
            "league_short": "QCEDL",
            "division": "Division 04",
            "season": "2026–27",
            "half": "1st half",
            "city": "Philadelphia",
            "team_name": OUR_NAME,
            "team_id": OUR_TEAM_ID,
            "captain": "Vince Clemins",
            "bar": "Curran's Irish Inn",
            "player_lines_through_week": max(keyed_weeks) if keyed_weeks else None,
            "results_through_week": max((m["week"] for m in completed), default=None),
            "generated": "2026-10-27",
            "playoff_rule": "A player must play 6 of the 10 scheduled weeks to be playoff eligible.",
            "notes": notes,
        },
        "team": {
            "name": OUR_NAME,
            "captain": "Clemins",
            "bar": "Curran's Irish Inn",
            "rank": us["rank"],
            "wins": us["wins"],
            "losses": us["losses"],
            "points": us["points"],
            "legs_against": us["legs_against"],
            "matches": us["matches"],
            "leg_win_pct": us["leg_win_pct"],
            "teams_in_division": len(standings),
            "last_match": completed[-1] if completed else None,
            "next_match": upcoming[0] if upcoming else None,
        },
        "players": players,
        "matches": matches,
        "standings": standings,
        "division_slate": division_slate(),
        "scoresheets": scoresheet_meta(matches),
        "attendance": board,
    }
    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    DATA_OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {DATA_OUT} ({DATA_OUT.stat().st_size} bytes)")
    print(f"record {us['wins']}-{us['losses']}  pts {us['points']}  rank {us['rank']}")
    print(f"{'Player':22} {'GP':>3} {'W':>3} {'3DA':>6} {'MPR':>5} {'CO%':>6} {'100+':>4} {'HT':>4}")
    for p in sorted(players, key=lambda x: -(x["season"]["ppr_3da"] or 0)):
        s = p["season"]
        print(
            f"{p['name']:22} {s['games']:3} {s['wins']:3} {s['ppr_3da']!s:>6} {s['mpr']!s:>5} "
            f"{s['checkout_pct']!s:>6} {s['tons_100']!s:>4} {s['high_turn']!s:>4}"
        )


if __name__ == "__main__":
    main()
