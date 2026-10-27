/* Next-match scouting. Reads data/scouting.json. Replace that file for a new week. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cellText(cell) {
    if (cell == null) return "";
    return typeof cell === "string" ? cell : cell.text || "";
  }

  function formClass(text) {
    if (text.indexOf("Hot") === 0) return "form-hot";
    if (text.indexOf("Cold") === 0) return "form-cold";
    if (text.indexOf("Steady") === 0) return "form-steady";
    return "";
  }

  function cellHtml(cell) {
    const text = cellText(cell);
    const role = cell && cell.role ? "<span class='cap'>" + escapeHtml(cell.role) + "</span>" : "";
    const tone = cell && cell.tone === "win" ? "tone-win" : cell && cell.tone === "loss" ? "tone-loss" : "";
    const form = formClass(text);
    const cls = [tone, form].filter(Boolean).join(" ");
    const body = cls ? "<span class='" + cls + "'>" + escapeHtml(text) + "</span>" : escapeHtml(text);
    return body + role;
  }

  function mapLink(address) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
  }

  function renderCards(cards) {
    return "<div class='scout-summary'>" + cards.map((card) =>
      "<article><span class='lbl'>" + escapeHtml(card.label) + "</span><div class='num'>" +
      escapeHtml(card.value) + "</div><p class='sub'>" + escapeHtml(card.sub || "") + "</p></article>"
    ).join("") + "</div>";
  }

  function renderTable(table) {
    const headers = table.headers || [];
    const minWidth = Math.max(640, headers.length * 92);
    const head = headers.map((header, index) =>
      "<th scope='col'" + (index === 0 ? " class='name'" : "") + ">" + escapeHtml(header) + "</th>"
    ).join("");
    const rows = (table.rows || []).map((row) => {
      const cells = (row.cells || []).map((cell, index) => {
        const span = cell && cell.colspan ? " colspan='" + cell.colspan + "'" : "";
        const cls = index === 0 ? " class='name'" : "";
        return "<td" + cls + span + ">" + cellHtml(cell) + "</td>";
      }).join("");
      return "<tr class='" + escapeHtml(row.mark || "") + "'>" + cells + "</tr>";
    }).join("");
    return "<div class='scout-scroll'><table class='scout-table' style='min-width:" + minWidth + "px'><thead><tr>" +
      head + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function renderMobile(table) {
    const headers = table.headers || [];
    return "<div class='scout-mobile'>" + (table.rows || []).map((row) => {
      const cells = row.cells || [];
      let skip = 1;
      let title = cellHtml(cells[0]);
      if ((headers[0] === "#" || headers[0] === "Wk") && cells[1] && cellText(cells[1])) {
        title = escapeHtml(cellText(cells[0])) + " · " + cellHtml(cells[1]);
        skip = 2;
      }
      const pairs = cells.map((cell, index) => ({ cell: cell, index: index }))
        .filter((item) => item.index >= skip && cellText(item.cell) !== "")
        .map((item) =>
          "<div><dt>" + escapeHtml(headers[item.index] || "") + "</dt><dd>" + cellHtml(item.cell) + "</dd></div>"
        ).join("");
      return "<article class='scout-row " + escapeHtml(row.mark || "") + "'><h3>" + title + "</h3><dl>" + pairs + "</dl></article>";
    }).join("") + "</div>";
  }

  function renderNotes(notes) {
    if (!notes || !notes.length) return "";
    return "<div class='scout-notes'>" + notes.map((note) => "<p>" + escapeHtml(note) + "</p>").join("") + "</div>";
  }

  function renderBullets(items) {
    if (!items || !items.length) return "";
    return "<ul class='scout-list'>" + items.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul>";
  }

  function renderSection(section) {
    const tables = (section.tables || []).map((table) => renderTable(table) + renderMobile(table)).join("");
    const groups = (section.groups || []).map((group) =>
      "<div class='scout-group'><h3>" + escapeHtml(group.title) + "</h3>" + renderBullets(group.bullets) + "</div>"
    ).join("");
    return "<section class='scout-block'>" +
      "<h2>" + escapeHtml(section.title) + "</h2>" +
      (section.intro ? "<p class='intro'>" + escapeHtml(section.intro) + "</p>" : "") +
      tables +
      renderBullets(section.bullets) +
      groups +
      renderNotes(section.notes) +
      "</section>";
  }

  function render(report) {
    document.title = "Week " + report.week + " · " + report.opponent + " · Clemins scouting";
    $("scout-kicker").textContent = report.kicker || "";
    $("scout-title").textContent = report.title || "SCOUT";
    $("scout-bar").textContent = report.bar || "";
    if (report.previous) {
      const box = $("scout-prev");
      box.hidden = false;
      box.innerHTML = "<span class='lbl'>" + escapeHtml(report.previous.label) + "</span><strong>" +
        escapeHtml(report.previous.value) + "</strong><p>" + escapeHtml(report.previous.detail || "") + "</p>";
    }
    const where = $("scout-where");
    where.innerHTML =
      "<div class='eyebrow'><span>Week " + escapeHtml(report.week) + "</span><span>" + escapeHtml(report.home_away || "") + "</span></div>" +
      "<h2>" + escapeHtml(report.title || "") + "</h2>" +
      "<p class='next-meta'>" + escapeHtml(report.banner || "") + "</p>" +
      (report.venue_address
        ? "<div class='next-actions'><a class='btn solid' href='" + mapLink(report.venue_address) + "' target='_blank' rel='noopener'>Map</a><a class='btn' href='index.html#attendance'>Attendance</a></div>"
        : "");
    $("scout-body").innerHTML =
      renderCards(report.cards || []) +
      (report.sections || []).map(renderSection).join("");
    $("scout-foot").innerHTML =
      "<p>Scouting breakdown for the Clemins roster. Replace <code>data/scouting.json</code> to publish the next week.</p>" +
      (report.sources ? "<p>" + escapeHtml(report.sources) + "</p>" : "");
  }

  fetch("data/league.json")
    .then((response) => response.ok ? response.json() : null)
    .then((league) => {
      if (!league || !league.team) return;
      const team = league.team;
      $("record-pill").innerHTML = "<strong>" + team.wins + "–" + team.losses + "</strong><span>DIV 04</span>";
    })
    .catch(() => {});

  fetch("data/scouting.json")
    .then((response) => {
      if (!response.ok) throw new Error("Could not load data/scouting.json");
      return response.json();
    })
    .then(render)
    .catch((error) => {
      $("scout-body").innerHTML = "<p class='panel' style='padding:16px'>The scouting report couldn't load. " +
        escapeHtml(error.message) + "</p>";
    });
})();
