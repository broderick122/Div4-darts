/* Clemins board. Reads data/league.json. No build step. */
(function () {
  "use strict";

  const SORTS = [
    { key: "name", label: "Name" },
    { key: "ppr_3da", label: "3-Dart Average" },
    { key: "mpr", label: "MPR" },
    { key: "wins", label: "Wins" },
    { key: "ppd", label: "PPD" },
    { key: "checkout_pct", label: "Checkout %" },
    { key: "tons_100", label: "Tons" },
    { key: "win_pct", label: "Win %" },
    { key: "games", label: "Games" },
    { key: "high_turn", label: "High Turn" },
  ];

  const state = {
    data: null,
    sortKey: "ppr_3da",
    sortDir: "desc",
    playerId: null,
    compareA: null,
    compareB: null,
    chart: null,
  };

  const $ = (id) => document.getElementById(id);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fmt(value, digits) {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return Number(value).toFixed(digits);
  }
  function dash(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }
  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return n + "TH";
    switch (n % 10) {
      case 1: return n + "ST";
      case 2: return n + "ND";
      case 3: return n + "RD";
      default: return n + "TH";
    }
  }
  function prettyDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  function mapLink(address) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
  }
  function playerById(id) {
    return state.data.players.find((p) => p.id === id);
  }
  function seasonValue(player, key) {
    if (key === "name") return player.name;
    return player.season[key];
  }
  function sortedPlayers() {
    const list = state.data.players.slice();
    const dir = state.sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (state.sortKey === "name") {
        return a.name.localeCompare(b.name) * (state.sortDir === "asc" ? 1 : -1);
      }
      const av = seasonValue(a, state.sortKey);
      const bv = seasonValue(b, state.sortKey);
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull && bNull) return a.name.localeCompare(b.name);
      if (aNull) return 1;
      if (bNull) return -1;
      if (av === bv) return a.name.localeCompare(b.name);
      return av > bv ? dir : -dir;
    });
    return list;
  }

  function trendOf(player) {
    const weeks = player.weeks.filter((w) => w.played && w.ppr_3da != null);
    if (weeks.length < 2 || !player.season.ppr_3da) return null;
    const latest = weeks[weeks.length - 1].ppr_3da;
    const ratio = latest / player.season.ppr_3da;
    if (ratio >= 1.05) return { cls: "hot", label: "Hot" };
    if (ratio <= 0.95) return { cls: "cold", label: "Cold" };
    return { cls: "steady", label: "Steady" };
  }

  function renderHero() {
    const team = state.data.team;
    $("record-pill").innerHTML =
      "<strong>" + team.wins + "–" + team.losses + "</strong><span>" + ordinal(team.rank) + "</span>";
    $("hero-stats").innerHTML = [
      [team.wins + "–" + team.losses, "Record"],
      [ordinal(team.rank), "Of " + team.teams_in_division],
      [String(team.points), "Points"],
    ].map(([num, lbl]) => "<article><div class='num'>" + num + "</div><span class='lbl'>" + lbl + "</span></article>").join("");
    $("hero-form").innerHTML = state.data.matches
      .filter((m) => m.result)
      .map((m) => "<i class='" + m.result + "' title='Week " + m.week + " " + m.result + "'>" + m.result + "</i>")
      .join("");
    const next = team.next_match;
    const last = team.last_match;
    if (!next) {
      $("hero-next").innerHTML = "<p>Schedule is complete.</p>";
      return;
    }
    const series = seriesLine(next.opponent);
    $("hero-next").innerHTML =
      "<div class='eyebrow'><span>Week " + next.week + " · " + next.home_away + "</span><span>" + next.time + "</span></div>" +
      "<h2>" + escapeHtml(next.opponent_captain.toUpperCase()) + "</h2>" +
      "<p class='next-meta'>" + prettyDate(next.date) + " · " + escapeHtml(next.venue_name) + "<br>" + escapeHtml(next.venue_address) + "</p>" +
      "<div class='next-actions'>" +
        "<a class='btn solid' href='" + mapLink(next.venue_address) + "' target='_blank' rel='noopener'>Map</a>" +
        (next.venue_phone ? "<a class='btn' href='tel:" + next.venue_phone.replace(/[^\d+]/g, "") + "'>" + escapeHtml(next.venue_phone) + "</a>" : "") +
        "<a class='btn' href='#night'>Full card</a>" +
      "</div>" +
      (series ? "<p class='board-note' style='margin-top:10px'>" + series + "</p>" : "") +
      (last
        ? "<div class='last-line'><span class='lbl'>Last result</span><strong class='" + last.result + "'>" +
          last.result + " " + last.clemins_score + "–" + last.opponent_score + "</strong></div>" +
          "<p class='board-note'>Week " + last.week + " vs " + escapeHtml(last.opponent_captain) + " · " + prettyDate(last.date) + " · " + last.home_away + "</p>"
        : "");
  }

  function seriesLine(opponent) {
    const games = state.data.matches.filter((m) => m.opponent === opponent && m.result);
    if (!games.length) return "First meeting this half.";
    let w = 0, l = 0;
    games.forEach((m) => (m.result === "W" ? w++ : l++));
    const last = games[games.length - 1];
    return "Season series " + w + "–" + l + ". Last meeting " + last.result + " " +
      last.clemins_score + "–" + last.opponent_score + " on " + prettyDate(last.date) + " (" + last.home_away + ").";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildSorts() {
    $("sorts").innerHTML = SORTS.map((s) => {
      const on = s.key === state.sortKey;
      const arrow = on ? (state.sortDir === "asc" ? "↑" : "↓") : "";
      return "<button type='button' data-sort='" + s.key + "' aria-pressed='" + on + "'>" +
        s.label + " <span class='arrow'>" + arrow + "</span></button>";
    }).join("");
  }

  function focusStat(player) {
    const s = player.season;
    const shown = {
      ppr_3da: [fmt(s.ppr_3da, 2), "3DA"],
      mpr: [fmt(s.mpr, 2), "MPR"],
      wins: [String(s.wins), "Wins"],
      ppd: [fmt(s.ppd, 2), "PPD"],
      checkout_pct: [fmt(s.checkout_pct, 1) + "%", "CO"],
      tons_100: [dash(s.tons_100), "100+"],
      win_pct: [fmt(s.win_pct, 1) + "%", "Win"],
      games: [String(s.games), "GP"],
      high_turn: [dash(s.high_turn), "High"],
      name: [fmt(s.ppr_3da, 2), "3DA"],
    };
    return shown[state.sortKey] || shown.ppr_3da;
  }

  function rowHtml(player, rank) {
    const s = player.season;
    const cap = player.captain ? "<span class='cap'>CAP</span>" : "";
    const div = s.ppr_rank ? "#" + s.ppr_rank.place : "—";
    const focus = focusStat(player);
    return {
      card:
        "<article class='player-card" + (player.id === state.playerId ? " is-selected" : "") + "' data-id='" + player.id + "'>" +
          "<div class='rank-no'>" + rank + "</div>" +
          "<div class='who'><b>" + escapeHtml(player.name) + cap + "</b><small>" +
            s.wins + "–" + s.losses + " · " + s.games + " GP" +
          "</small></div>" +
          "<div class='big-stat'>" + focus[0] + "<span>" + focus[1] + "</span></div>" +
          "<div class='mini-stats'>" +
            "<span>MPR <b>" + fmt(s.mpr, 2) + "</b></span>" +
            "<span>PPD <b>" + fmt(s.ppd, 2) + "</b></span>" +
            "<span>CO <b>" + fmt(s.checkout_pct, 1) + "%</b></span>" +
            "<span>100+ <b>" + dash(s.tons_100) + "</b></span>" +
            "<span>High <b>" + dash(s.high_turn) + "</b></span>" +
            "<span>Div <b>" + div + "</b></span>" +
          "</div>" +
        "</article>",
      tr:
        "<tr data-id='" + player.id + "'" + (player.id === state.playerId ? " class='is-selected'" : "") + ">" +
          "<td class='rank-no'>" + rank + "</td>" +
          "<td class='name'><button type='button' class='name-btn' data-open='" + player.id + "'>" + escapeHtml(player.name) + "</button>" + cap + "</td>" +
          "<td>" + s.wins + "–" + s.losses + "</td>" +
          "<td>" + fmt(s.win_pct, 1) + "</td>" +
          "<td>" + fmt(s.ppr_3da, 2) + "</td>" +
          "<td>" + fmt(s.ppd, 2) + "</td>" +
          "<td>" + fmt(s.mpr, 2) + "</td>" +
          "<td>" + fmt(s.checkout_pct, 1) + "</td>" +
          "<td>" + dash(s.tons_100) + "</td>" +
          "<td>" + dash(s.high_turn) + "</td>" +
          "<td>" + (s.ppr_rank ? s.ppr_rank.place + "/" + s.ppr_rank.of : "—") + "</td>" +
        "</tr>",
    };
  }

  function paintBoard(animate) {
    const players = sortedPlayers();
    const cards = $("board-cards");
    const tbody = $("board-table").querySelector("tbody");
    const before = animate && !reduced ? measure(cards, tbody) : null;
    const cardHtml = [];
    const rowHtmls = [];
    players.forEach((p, i) => {
      const built = rowHtml(p, i + 1);
      cardHtml.push(built.card);
      rowHtmls.push(built.tr);
    });
    cards.innerHTML = cardHtml.join("");
    tbody.innerHTML = rowHtmls.join("");
    if (before) flip(cards, tbody, before);
    const sort = SORTS.find((s) => s.key === state.sortKey);
    $("sort-status").textContent = "Sorted by " + sort.label + ", " + (state.sortDir === "asc" ? "ascending" : "descending") + ".";
  }

  function measure(cards, tbody) {
    const map = new Map();
    cards.querySelectorAll("[data-id]").forEach((el) => {
      if (el.getClientRects().length) map.set("c:" + el.dataset.id, el.getBoundingClientRect());
    });
    tbody.querySelectorAll("[data-id]").forEach((el) => {
      if (el.getClientRects().length) map.set("t:" + el.dataset.id, el.getBoundingClientRect());
    });
    return map;
  }
  function flip(cards, tbody, before) {
    [["c", cards], ["t", tbody]].forEach(([prefix, root]) => {
      root.querySelectorAll("[data-id]").forEach((el) => {
        const prev = before.get(prefix + ":" + el.dataset.id);
        if (!prev || !el.getClientRects().length) return;
        const next = el.getBoundingClientRect();
        const dy = prev.top - next.top;
        const dx = prev.left - next.left;
        if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
        el.animate(
          [{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "translate(0,0)" }],
          { duration: 460, easing: "cubic-bezier(.2,.7,.2,1)" }
        );
      });
    });
  }

  function setSort(key) {
    if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    else {
      state.sortKey = key;
      state.sortDir = key === "name" ? "asc" : "desc";
    }
    buildSorts();
    paintBoard(true);
  }

  function optionsHtml(selected) {
    return state.data.players
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => "<option value='" + p.id + "'" + (p.id === selected ? " selected" : "") + ">" + escapeHtml(p.name) + (p.captain ? " · Captain" : "") + "</option>")
      .join("");
  }

  function openPlayer(id, scroll) {
    state.playerId = id;
    $("player-select").value = id;
    paintBoard(false);
    renderProfile();
    if (scroll) document.getElementById("player").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function renderProfile() {
    const player = playerById(state.playerId);
    const root = $("profile");
    if (!player) {
      root.innerHTML = "<p>Pick a teammate.</p>";
      return;
    }
    const s = player.season;
    const trend = trendOf(player);
    const ranks = [];
    if (s.ppr_rank) {
      ranks.push("<div class='rank-plate'><b>#" + s.ppr_rank.place + "<small>/" + s.ppr_rank.of + "</small></b><span class='lbl'>Div 3DA</span></div>");
    }
    if (s.mpr_rank) {
      ranks.push("<div class='rank-plate'><b>#" + s.mpr_rank.place + "<small>/" + s.mpr_rank.of + "</small></b><span class='lbl'>Div MPR</span></div>");
    }
    const tiles = [
      [fmt(s.ppr_3da, 2), "3-Dart avg"],
      [fmt(s.ppd, 2), "PPD"],
      [fmt(s.mpr, 2), "MPR"],
      [s.wins + "–" + s.losses, "W–L"],
      [fmt(s.checkout_pct, 1) + "%", "Checkout"],
      [fmt(s.first_nine_avg, 2), "First nine"],
      [fmt(s.win_pct, 1) + "%", "Win rate"],
      [String(s.games), "Games"],
    ];
    const bests = [
      [dash(s.high_turn), "High turn", "Weeks 1–4 log"],
      [dash(s.high_checkout), "High checkout", "Weeks 1–4 log"],
      [s.best_3da ? fmt(s.best_3da.value, 2) : "—", "Best 3DA night", s.best_3da ? "Week " + s.best_3da.week : ""],
      [s.best_mpr ? fmt(s.best_mpr.value, 2) : "—", "Best MPR night", s.best_mpr ? "Week " + s.best_mpr.week : ""],
      [dash(s.tons_100), "100+", "Weeks 1–4"],
      [dash(s.tons_140), "140+", "Weeks 1–4"],
      [dash(s.tons_180), "180s", "Weeks 1–4"],
      [s.do_hits + "/" + s.do_opps, "Checkouts", "Through week 5"],
    ];
    const marks = [];
    if (s.five_mark) marks.push(s.five_mark + " five-mark");
    if (s.seven_mark) marks.push(s.seven_mark + " seven-mark");
    if (s.nine_mark) marks.push(s.nine_mark + " nine-mark");
    if (s.hat_tricks) marks.push(s.hat_tricks + " hat trick");
    root.innerHTML =
      "<div class='profile-top'>" +
        "<div><h3>" + escapeHtml(player.name.toUpperCase()) + "</h3>" +
        "<div class='ranks'>" + ranks.join("") + (trend ? "<span class='trend " + trend.cls + "'>" + trend.label + "</span>" : "") +
        (player.captain ? "<span class='cap'>CAPTAIN</span>" : "") + "</div></div>" +
      "</div>" +
      "<div class='tiles'>" + tiles.map(([n, l]) => "<article class='tile'><div class='num'>" + n + "</div><span class='lbl'>" + l + "</span></article>").join("") + "</div>" +
      "<div class='bests'>" + bests.map(([n, l, sub]) => "<article class='tile best'><div class='num'>" + n + "</div><span class='lbl'>" + l + "</span><small>" + sub + "</small></article>").join("") + "</div>" +
      "<p class='fine'>" + attendanceLine(player) + (marks.length ? " · " + marks.join(", ") + " (DartConnect export)." : "") + "</p>" +
      attendBlocks(player) +
      "<div class='chart-box'><canvas id='form-chart' aria-label='Week by week 3-dart average and MPR'></canvas></div>" +
      "<div class='log-wrap' style='margin-top:12px'><table class='log'><thead><tr><th>Wk</th><th>Opponent</th><th>W–L</th><th>3DA</th><th>MPR</th><th>High</th><th>Outs</th></tr></thead><tbody>" +
        player.weeks.map((w) => "<tr><td>" + w.week + "</td><td>" + (w.played ? escapeHtml(w.opponent_captain) : "—") + "</td><td>" +
          (w.played ? w.wins + "–" + w.losses : "DNP") + "</td><td>" + fmt(w.ppr_3da, 2) + "</td><td>" + fmt(w.mpr, 2) + "</td><td>" +
          dash(w.high_turn) + "</td><td>" + (w.checkouts && w.checkouts.length ? w.checkouts.join(", ") : (w.played && w.do_opps != null ? w.do_hits + "/" + w.do_opps : "—")) +
          "</td></tr>").join("") +
      "</tbody></table></div>";
    drawChart(player);
  }

  function attendanceLine(player) {
    const shot = player.attendance.filter((a) => a.played).length;
    return shot + " of " + player.playoff_weeks_scheduled + " weeks shot through week " +
      state.data.meta.player_lines_through_week + ". Playoffs need " + player.playoff_weeks_required + ".";
  }
  function attendBlocks(player) {
    const map = {};
    player.attendance.forEach((a) => { map[a.week] = a.played; });
    let html = "<div class='attend' aria-label='Attendance'>";
    for (let w = 1; w <= 10; w++) {
      const known = Object.prototype.hasOwnProperty.call(map, w);
      const cls = !known ? "" : map[w] ? "on" : "off";
      html += "<i class='" + cls + "' title='Week " + w + "'>" + w + "</i>";
    }
    return html + "</div>";
  }

  function drawChart(player) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    const canvas = $("form-chart");
    if (!canvas || typeof Chart === "undefined") return;
    const through = state.data.meta.results_through_week || 6;
    const labels = [];
    const ppr = [];
    const mpr = [];
    for (let w = 1; w <= through; w++) {
      labels.push("W" + w);
      const row = player.weeks.find((x) => x.week === w);
      ppr.push(row && row.played ? row.ppr_3da : null);
      mpr.push(row && row.played ? row.mpr : null);
    }
    state.chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "3DA",
            data: ppr,
            borderColor: "#e4b44c",
            backgroundColor: "rgba(228,180,76,.15)",
            tension: 0.3,
            spanGaps: false,
            pointRadius: 4,
            pointBackgroundColor: "#ffd978",
            yAxisID: "y",
          },
          {
            label: "MPR",
            data: mpr,
            borderColor: "#d6ff4a",
            backgroundColor: "rgba(214,255,74,.08)",
            tension: 0.3,
            spanGaps: false,
            pointRadius: 4,
            pointBackgroundColor: "#d6ff4a",
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#f4f1ea", boxWidth: 12, font: { family: "Barlow" } } },
        },
        scales: {
          x: { ticks: { color: "#9aa3b2" }, grid: { color: "rgba(255,255,255,.05)" } },
          y: { position: "left", ticks: { color: "#e4b44c" }, grid: { color: "rgba(255,255,255,.05)" }, title: { display: true, text: "3DA", color: "#e4b44c" } },
          y1: { position: "right", ticks: { color: "#d6ff4a" }, grid: { drawOnChartArea: false }, title: { display: true, text: "MPR", color: "#d6ff4a" } },
        },
      },
    });
  }

  const COMPARE = [
    { key: "ppr_3da", label: "3-Dart average", digits: 2 },
    { key: "ppd", label: "PPD", digits: 2 },
    { key: "mpr", label: "MPR", digits: 2 },
    { key: "win_pct", label: "Win %", digits: 1 },
    { key: "checkout_pct", label: "Checkout %", digits: 1 },
    { key: "wins", label: "Wins", digits: 0 },
    { key: "tons_100", label: "100+", digits: 0 },
    { key: "high_turn", label: "High turn", digits: 0 },
    { key: "high_checkout", label: "High checkout", digits: 0 },
    { key: "games", label: "Games", digits: 0 },
  ];

  function renderVersus() {
    const a = playerById(state.compareA);
    const b = playerById(state.compareB);
    const root = $("versus");
    if (!a || !b) {
      root.innerHTML = "<p>Pick two teammates.</p>";
      return;
    }
    if (a.id === b.id) {
      root.innerHTML = "<p class='fine'>Pick two different teammates.</p>";
      return;
    }
    root.innerHTML = COMPARE.map((stat) => {
      const av = a.season[stat.key];
      const bv = b.season[stat.key];
      const max = Math.max(av || 0, bv || 0);
      const aw = max && av != null ? Math.round((av / max) * 100) : 0;
      const bw = max && bv != null ? Math.round((bv / max) * 100) : 0;
      const aWin = av != null && (bv == null || av > bv);
      const bWin = bv != null && (av == null || bv > av);
      const tie = av != null && bv != null && av === bv;
      return "<div class='vs-row'>" +
        "<div class='vs-num" + (aWin || tie ? " winner" : "") + "'>" + fmt(av, stat.digits) + "</div>" +
        "<div class='track'><span class='left'><i class='" + (aWin || tie ? "win" : "") + "' style='width:" + aw + "%'></i></span>" +
        "<span class='right'><i class='" + (bWin || tie ? "win" : "") + "' style='width:" + bw + "%'></i></span></div>" +
        "<div class='vs-num right" + (bWin || tie ? " winner" : "") + "'>" + fmt(bv, stat.digits) + "</div>" +
        "<div class='vs-label'>" + stat.label + "</div></div>";
    }).join("") + "<p class='fine'>100+, high turn, and high checkout cover the Weeks 1–4 DartConnect log. Averages run through Week 5.</p>";
    requestAnimationFrame(() => {
      root.querySelectorAll(".track i").forEach((bar) => {
        const width = bar.style.width;
        bar.style.width = "0%";
        if (!reduced) requestAnimationFrame(() => { bar.style.width = width; });
        else bar.style.width = width;
      });
    });
  }

  function renderNight() {
    const matches = state.data.matches;
    const nextWeek = state.data.team.next_match && state.data.team.next_match.week;
    const slate = (state.data.division_slate.find((w) => w.week === nextWeek) || {}).matches || [];
    const results = matches.filter((m) => m.status === "completed").slice().reverse();
    $("night-body").innerHTML =
      "<div class='results'>" + results.map((m) => {
        const recap = m.recap_url
          ? "<a class='btn' href='" + escapeHtml(m.recap_url) + "' target='_blank' rel='noopener'>Recap</a>"
          : "<span class='ha'>No recap link</span>";
        const sheet = (state.data.scoresheets || []).find((s) => s.week === m.week);
        const sheetBtn = sheet
          ? "<button type='button' class='btn sheet-open' data-web='" + sheet.web + "' data-full='" + sheet.full + "' data-title='Week " + m.week + " vs " + escapeHtml(m.opponent_captain) + "'>Score Sheet</button>"
          : "";
        const ppr = m.team_ppr != null ? "<div class='ha'>Team " + fmt(m.team_ppr, 2) + " PPR · " + fmt(m.team_mpr, 2) + " MPR</div>" : "";
        return "<article class='result'>" +
          "<div class='result-main'><div class='ha'>Wk " + m.week + " · " + m.home_away + "</div><strong>" + escapeHtml(m.opponent_captain) + "</strong>" +
          "<div class='ha'>" + prettyDate(m.date) + " · " + escapeHtml(m.venue_name) + "</div>" + ppr + "</div>" +
          "<div class='result-actions'>" + recap + sheetBtn + "</div>" +
          "<div class='result-score score " + m.result + "'>" + m.result + " " + m.clemins_score + "–" + m.opponent_score + "</div>" +
        "</article>";
      }).join("") + "</div>" +
      (slate.length
        ? "<h3 class='section-label' style='margin-top:18px'>Also week " + nextWeek + "</h3><div class='slate'>" +
          slate.map((g) => "<article class='" + (g.involves_us ? "us" : "") + "'><span>" +
            escapeHtml(g.away_captain) + " at " + escapeHtml(g.home_captain) + "</span><span class='ha'>" +
            escapeHtml(g.venue_name) + "</span></article>").join("") + "</div>"
        : "");
  }

  function standRow(t) {
    return "<tr class='" + (t.is_us ? "us" : "") + "'>" +
      "<td>" + t.rank + "</td>" +
      "<td class='team'><strong>" + escapeHtml(t.captain) + "</strong><div class='ha'>" + escapeHtml(t.bar) + "</div></td>" +
      "<td>" + t.wins + "</td><td>" + t.losses + "</td><td>" + t.points + "</td><td>" + t.legs_against + "</td>" +
      "<td>" + fmt(t.leg_win_pct, 1) + "</td><td>" + t.matches + "</td></tr>";
  }

  function standChip(t) {
    return "<article class='stand-chip" + (t.is_us ? " us" : "") + "'>" +
      "<div class='rk'>" + t.rank + "</div>" +
      "<div><strong>" + escapeHtml(t.captain) + "</strong><div class='ha'>" + escapeHtml(t.bar) + "</div></div>" +
      "<div class='wl'>" + t.wins + "–" + t.losses + "</div>" +
      "<div class='pts'>" + t.points + "<span>Pts</span></div></article>";
  }

  function renderStandings() {
    const meta = state.data.meta;
    const table = state.data.standings;
    const preview = table.slice(0, 2);
    const us = table.find((t) => t.is_us);
    if (us && !preview.some((t) => t.is_us)) preview.push(us);
    $("stand-blurb").textContent =
      "Through week " + meta.results_through_week + ". Points are legs won. Clemins is highlighted.";
    $("stand-body").innerHTML =
      "<div class='stand-compact'>" + preview.map(standChip).join("") + "</div>" +
      "<button type='button' class='btn stand-toggle' id='stand-toggle' aria-expanded='false' aria-controls='stand-more'><span class='stand-toggle-label'>Show full standings</span><i class='chev' aria-hidden='true'></i></button>" +
      "<div class='stand-more' id='stand-more' aria-hidden='true'>" +
        "<div class='stand-more-inner'><div class='stand-wrap'><table class='stand-table' id='stand-table'><thead><tr>" +
          "<th>Rank</th><th class='team'>Team</th><th>W</th><th>L</th><th>Pts</th><th>Against</th><th>Leg%</th><th>Played</th>" +
          "</tr></thead><tbody>" + table.map(standRow).join("") + "</tbody></table></div></div></div>";
  }

  function renderSheets() {
    $("gallery").innerHTML = state.data.scoresheets.map((s) =>
      "<figure class='shot'>" +
        "<button type='button' class='sheet-open' data-full='" + s.full + "' data-title='Week " + s.week + " vs " + escapeHtml(s.opponent_captain) + "' style='all:unset;cursor:zoom-in;display:block'>" +
          "<img src='" + s.web + "' alt='Week " + s.week + " scoresheet, Clemins vs " + escapeHtml(s.opponent_captain) + " on " + s.date + "'>" +
        "</button>" +
        "<figcaption><div><h3>WEEK " + s.week + "</h3><p>" + prettyDate(s.date) + " · " + (s.result || "") + " " +
          (s.clemins_score != null ? s.clemins_score + "–" + s.opponent_score : "") + " vs " + escapeHtml(s.opponent_captain) + "</p></div>" +
          "<a class='btn' href='" + s.full + "' target='_blank' rel='noopener'>Full size</a></figcaption></figure>"
    ).join("");
  }

  function renderFooter() {
    const notes = state.data.meta.notes.map((n) => "<li>" + escapeHtml(n) + "</li>").join("");
    $("colophon").innerHTML =
      "<p>Unlisted team page for 5-Curran's Irish Inn (Clemins). Share the link, don't expect it in search.</p>" +
      "<ul>" + notes + "</ul>" +
      "<p>Numbers are generated by <code>scripts/build_data.py</code> from the files in <code>sources/</code>. " +
      "To add a week, replace those exports, drop the new scoresheet in, and run the script. See the README.</p>";
    $("board-blurb").textContent =
      "3DA, MPR, PPD, and checkout % are weighted through week " + state.data.meta.player_lines_through_week +
      ". Tons and high scores are the DartConnect log, weeks 1–4. Division ranks are that same export. Team results run through week " +
      state.data.meta.results_through_week + ".";
  }

  function openLightbox(src, title, fullHref) {
    $("lightbox-img").src = src;
    $("lightbox-img").alt = title || "Score sheet";
    $("lightbox-title").textContent = title || "Score sheet";
    $("lightbox-full").href = fullHref || src;
    $("lightbox").hidden = false;
    $("lightbox-close").focus();
  }
  function closeLightbox() {
    $("lightbox").hidden = true;
    $("lightbox-img").src = "";
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-sort]");
      if (!btn) return;
      setSort(btn.dataset.sort);
    });
    document.body.addEventListener("click", (event) => {
      const card = event.target.closest(".player-card");
      const row = event.target.closest("#board-table tbody tr");
      const sheet = event.target.closest(".sheet-open");
      const standToggle = event.target.closest("#stand-toggle");
      if (standToggle) {
        const more = $("stand-more");
        const open = more.classList.toggle("is-open");
        standToggle.setAttribute("aria-expanded", open ? "true" : "false");
        more.setAttribute("aria-hidden", open ? "false" : "true");
        standToggle.querySelector(".stand-toggle-label").textContent = open ? "Hide full standings" : "Show full standings";
        return;
      }
      if (card) openPlayer(card.dataset.id, true);
      else if (row) openPlayer(row.dataset.id, true);
      else if (sheet) openLightbox(sheet.dataset.web || sheet.dataset.full, sheet.dataset.title, sheet.dataset.full);
    });
    $("player-select").addEventListener("change", (event) => openPlayer(event.target.value, false));
    $("compare-a").addEventListener("change", (event) => { state.compareA = event.target.value; renderVersus(); });
    $("compare-b").addEventListener("change", (event) => { state.compareB = event.target.value; renderVersus(); });
    $("lightbox-close").addEventListener("click", closeLightbox);
    $("lightbox").addEventListener("click", (event) => {
      if (event.target === $("lightbox")) closeLightbox();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeLightbox();
    });
    const links = document.querySelectorAll(".top-nav a, .dock a");
    const sections = ["board", "player", "compare", "night", "standings", "sheets"].map((id) => $(id));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === "#" + visible.target.id);
      });
    }, { rootMargin: "-30% 0px -55% 0px", threshold: [0.1, 0.3] });
    sections.forEach((section) => observer.observe(section));
  }

  async function boot() {
    const response = await fetch("data/league.json");
    if (!response.ok) throw new Error("Could not load league.json");
    state.data = await response.json();
    const byAvg = state.data.players.slice().sort((a, b) => (b.season.ppr_3da || 0) - (a.season.ppr_3da || 0));
    state.playerId = (byAvg[0] && byAvg[0].id) || state.data.players[0].id;
    const mike = state.data.players.find((p) => p.id === "mike-broderick");
    const jeff = state.data.players.find((p) => p.id === "jeff-broderick");
    state.compareA = (jeff && jeff.id) || byAvg[0].id;
    state.compareB = (mike && mike.id) || (byAvg[1] && byAvg[1].id);
    $("player-select").innerHTML = optionsHtml(state.playerId);
    $("compare-a").innerHTML = optionsHtml(state.compareA);
    $("compare-b").innerHTML = optionsHtml(state.compareB);
    buildSorts();
    renderHero();
    paintBoard(false);
    renderProfile();
    renderVersus();
    renderNight();
    renderStandings();
    renderSheets();
    renderFooter();
    bind();
  }

  boot().catch((error) => {
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      "<p class='panel' style='padding:16px'>The board couldn't load data/league.json. " + escapeHtml(error.message) + "</p>");
  });
})();
