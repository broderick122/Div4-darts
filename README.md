# Clemins · Division 04

Static site for **5-Curran's Irish Inn (Clemins)**, QCEDL Division 04 (Philadelphia), 2026–27 first half. No build step. GitHub Pages serves this folder from `main`.

Live URL, once Pages is on: https://broderick122.github.io/Div4-darts/

The page is unlisted (`noindex` plus a `robots.txt` that disallows everything). Share the link. It is not meant to be searchable.

## What's on the board

- Sortable roster: name, 3-dart average, MPR, wins, PPD, checkout %, tons, win %, games, high turn. Click a sort again to flip the order.
- Player profiles: season line, division-rank plates, personal bests, attendance, and a week-by-week 3DA / MPR chart.
- Head-to-head bars for any two teammates.
- Next match (date, time, opponent, venue, map) and the season card with DartConnect recap links where we have them.
- Division 04 table with Clemins highlighted. Points are legs won.
- Score sheets for weeks 4, 5, and 6, with a full-size file next to the web image.

## Where the numbers come from

`data/league.json` is generated. Do not hand-edit it.

| File | What it feeds |
| --- | --- |
| `sources/clemins-half.xlsx` (Stats + Attendance) | Player lines through the last keyed week (Week 5 in this drop): points, darts, marks, checkouts, W–L |
| `sources/roster_weekly.csv` | High turn, 100+, 140+, 180s, checkout scores (Weeks 1–4) |
| `sources/roster_stats.csv` | First-nine average, division ranks, 5/7/9-mark rounds |
| `sources/division_schedule.csv` | Scores, venues, and the division table through Week 6 |
| `sources/schedule.csv` | DartConnect recap URLs and that night's team PPR/MPR |
| `sources/standings.csv` | Kept as the Week 4 DartConnect snapshot. The site ranks the division from the schedule instead, because this file is behind. |

Week 6 player lines are not in the workbook. The 11–4 team score is in the division schedule, and the photo is in `scoresheets/`. Those individual lines are not guessed off the picture.

`sources/final-data.csv` and `sources/clemins-player-stats.xlsx` are the earlier partial exports. The script reads the half workbook, which has Weeks 1–5.

## Update it next week

1. Replace the CSVs and `sources/clemins-half.xlsx` with the new export. Keep the filenames.
2. Put the new photo at `sources/scoresheets/week-07.jpg`. In `scripts/build_data.py`, add a row to `SCORESHEET_SOURCES` (`rotate` is degrees counter-clockwise if the phone saved it sideways).
3. From the repo root, with `openpyxl` and `Pillow` installed:

   ```bash
   python3 scripts/build_data.py
   ```

4. Check the printed leaderboard, commit `data/league.json` and anything new under `scoresheets/`, and push `main`. Pages will pick it up. No compile step.

3DA is `points / darts × 3`. MPR is `marks / cricket darts × 3`. Checkout % is hits / opportunities. Same math as the workbook formulas.
