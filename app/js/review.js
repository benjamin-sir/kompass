/* Kompass – Wochenrückblick: Fokus- gegen Meetingzeit, Fokus pro Bereich,
 * Erledigtes, was liegen geblieben ist, Abschluss-Checkliste und Wochenfokus. */
(function (K) {
  'use strict';

  var S = K.store, U = K.util;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function h(sec) { return (sec / 3600).toLocaleString('de-DE', { maximumFractionDigits: 1 }); }
  function dayStart(day) { return new Date(day + 'T00:00:00').getTime(); }
  function plusDays(day, n) { return U.dayKey(U.addDays(new Date(day + 'T12:00:00'), n)); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }

  var CHECKS = [
    { id: 'inbox', label: 'Inbox leeren', hint: 'Alles einsortieren oder löschen.' },
    { id: 'waiting', label: '„Warten auf“ durchgehen', hint: 'Nachfassen oder Datum neu setzen.' },
    { id: 'agenda', label: 'Agenda für die Termine der nächsten Woche prüfen', hint: '' },
    { id: 'later', label: '„Später“ durchsehen', hint: 'Was ist nicht mehr wichtig?' },
    { id: 'focus', label: 'Wochenfokus für nächste Woche festlegen', hint: 'Höchstens drei Punkte.' }
  ];

  function weekDays(monday) {
    var n = S.state.settings.showWeekend ? 7 : 5;
    var out = [];
    for (var i = 0; i < n; i++) out.push(plusDays(monday, i));
    return out;
  }

  function stats(monday) {
    var from = dayStart(monday), to = dayStart(plusDays(monday, 7));
    var days = weekDays(monday).map(function (d) {
      return { day: d, focus: S.secondsOnDay(d), meeting: K.cal.capacity(d).meeting / 1000 };
    });
    var focus = 0, meeting = 0;
    days.forEach(function (d) { focus += d.focus; meeting += d.meeting; });

    // Fokus pro Bereich aus den Zeiteinträgen
    var byArea = {};
    var add = function (taskId, s, e) {
      var a = Math.max(from, s), b = Math.min(to, e);
      if (b <= a) return;
      var t = S.state.tasks.find(function (x) { return x.id === taskId; });
      var key = (t && t.areaId && S.area(t.areaId)) ? t.areaId : '';
      byArea[key] = (byArea[key] || 0) + (b - a) / 1000;
    };
    S.state.timeEntries.forEach(function (e) { add(e.taskId, new Date(e.start).getTime(), new Date(e.end).getTime()); });
    if (S.state.activeTimer) add(S.state.activeTimer.taskId, new Date(S.state.activeTimer.start).getTime(), Date.now());

    var done = S.tasks().filter(function (t) { return t.done && t.doneAt && new Date(t.doneAt).getTime() >= from && new Date(t.doneAt).getTime() < to; });
    var now = Date.now();
    var pastBlocks = S.blocksBetween(from, Math.min(to, now)).filter(function (b) { return new Date(b.end).getTime() <= now; });
    var keptBlocks = pastBlocks.filter(function (b) { var t = S.task(b.taskId); return t && t.done; });
    return { days: days, focus: focus, meeting: meeting, byArea: byArea, done: done, pastBlocks: pastBlocks, keptBlocks: keptBlocks };
  }

  function focusTarget() {
    var sum = S.areas().reduce(function (acc, a) { return acc + (Number(a.weeklyTarget) || 0); }, 0);
    if (sum > 0) return { hours: sum, source: 'Summe der Bereichsziele' };
    var daily = Number(S.state.settings.dailyFocusTarget) || 3;
    return { hours: daily * 5, source: daily.toLocaleString('de-DE') + ' h pro Tag' };
  }

  // ------------------------------------------------------------------ Bausteine
  function tile(label, value, unit, sub, meterPct) {
    return '<div class="tile"><div class="tile-label">' + esc(label) + '</div>' +
      '<div class="tile-value">' + value + (unit ? '<span>' + esc(unit) + '</span>' : '') + '</div>' +
      (meterPct != null ? '<div class="meter"><i style="width:' + Math.min(100, meterPct) + '%"></i></div>' : '') +
      (sub ? '<div class="tile-sub">' + sub + '</div>' : '') + '</div>';
  }

  /* Gestapelte Säulen pro Tag: Meetings unten, Fokus oben */
  function dayChart(st) {
    var w = K.cal.capacity(st.days[0].day).total / 1000;
    var max = Math.max(w, 3600);
    st.days.forEach(function (d) { max = Math.max(max, d.focus + d.meeting); });
    max = Math.ceil(max / 3600) * 3600;
    var today = U.dayKey();
    var cols = st.days.map(function (d) {
      var date = new Date(d.day + 'T12:00:00');
      var label = date.toLocaleDateString('de-DE', { weekday: 'short' });
      var mPct = d.meeting / max * 100, fPct = d.focus / max * 100;
      var tip = date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' }) + ': Fokus ' + h(d.focus) + ' h, Meetings ' + h(d.meeting) + ' h';
      return '<div class="dc-col' + (d.day === today ? ' is-today' : '') + (d.day > today ? ' is-future' : '') + '" title="' + esc(tip) + '" tabindex="0" aria-label="' + esc(tip) + '">' +
        '<div class="dc-bar">' +
          (d.focus ? '<span class="dc-val" style="bottom:' + (fPct + mPct) + '%">' + h(d.focus) + ' h</span>' : '') +
          (d.focus ? '<i class="dc-focus" style="height:' + fPct + '%"></i>' : '') +
          (d.meeting ? '<i class="dc-meet" style="height:' + mPct + '%"></i>' : '') +
        '</div><div class="dc-day">' + esc(label) + '</div></div>';
    }).join('');
    var workLine = '<div class="dc-work" style="bottom:' + (w / max * 100) + '%"></div>';
    return '<section class="card chart-card"><div class="card-head"><h2>Fokus und Meetings pro Tag</h2>' +
      '<div class="legend"><span><i class="sw sw-focus"></i>Fokus</span><span><i class="sw sw-meet"></i>Meetings</span><span><i class="sw-line"></i>Arbeitszeit ' + h(w) + ' h</span></div></div>' +
      '<div class="dc"><div class="dc-axis"><span>' + h(max) + ' h</span><span>0</span></div><div class="dc-plot">' + workLine + cols + '</div></div>' +
      '<details class="table-view"><summary>Als Tabelle</summary><table><thead><tr><th>Tag</th><th>Fokus</th><th>Meetings</th></tr></thead><tbody>' +
      st.days.map(function (d) { return '<tr><td>' + esc(new Date(d.day + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' })) + '</td><td>' + h(d.focus) + ' h</td><td>' + h(d.meeting) + ' h</td></tr>'; }).join('') +
      '</tbody></table></details></section>';
  }

  /* Fokus pro Bereich mit Wochenziel als Marke */
  function areaChart(st) {
    var rows = S.areas().map(function (a) { return { name: a.name, color: a.color, sec: st.byArea[a.id] || 0, target: Number(a.weeklyTarget) || 0 }; });
    if (st.byArea['']) rows.push({ name: 'Ohne Bereich', color: '', sec: st.byArea[''], target: 0 });
    var max = 3600;
    rows.forEach(function (r) { max = Math.max(max, r.sec, r.target * 3600); });
    var html = rows.map(function (r) {
      var pct = r.sec / max * 100;
      var reached = r.target && r.sec >= r.target * 3600;
      return '<div class="ac-row">' +
        '<div class="ac-name"><i class="dot" style="background:' + esc(r.color || 'var(--fg-faint)') + '"></i>' + esc(r.name) + '</div>' +
        '<div class="ac-track" title="' + esc(r.name + ': ' + h(r.sec) + ' h' + (r.target ? ' von ' + r.target + ' h Ziel' : '')) + '">' +
          (r.sec ? '<i class="ac-bar" style="width:' + pct + '%;--c:' + esc(r.color || 'var(--fg-faint)') + '"></i>' : '') +
          (r.target ? '<b class="ac-target" style="left:' + (r.target * 3600 / max * 100) + '%" aria-hidden="true"></b>' : '') +
        '</div>' +
        '<div class="ac-val">' + h(r.sec) + ' h' + (r.target ? '<small>' + (reached ? ' ✓ Ziel ' : ' von ') + r.target.toLocaleString('de-DE') + ' h</small>' : '') + '</div>' +
      '</div>';
    }).join('');
    return '<section class="card chart-card"><div class="card-head"><h2>Fokus pro Bereich</h2>' +
      '<span class="muted small">Strich = Wochenziel · <a href="#optionen" data-act="nav" data-view="optionen">Ziele festlegen</a></span></div>' +
      '<div class="ac">' + html + '</div></section>';
  }

  function attention(monday) {
    var today = U.dayKey();
    var items = [];
    var late = S.openIn('waiting').filter(function (t) { return t.followUp && t.followUp < today; });
    late.forEach(function (t) { var n = daysBetween(t.followUp, today); items.push({ t: t, why: 'Nachfassen seit ' + n + (n === 1 ? ' Tag' : ' Tagen') + ' überfällig', sev: 'late' }); });
    var now = Date.now();
    var weekFrom = dayStart(monday);
    var seen = {};
    S.blocksBetween(weekFrom, now).forEach(function (b) {
      if (new Date(b.end).getTime() > now) return;
      var t = S.task(b.taskId);
      if (!t || t.done || seen[t.id]) return;
      seen[t.id] = true;
      items.push({ t: t, why: 'Eingeplant am ' + new Date(b.start).toLocaleDateString('de-DE', { weekday: 'short' }) + ', noch offen', sev: 'warn' });
    });
    S.openIn('today').forEach(function (t) {
      var d = daysBetween(U.dayKey(t.listChangedAt), today);
      if (d >= 3 && !seen[t.id]) items.push({ t: t, why: 'Seit ' + d + ' Tagen auf „Heute“', sev: 'warn' });
    });
    S.openIn('later').forEach(function (t) {
      var d = daysBetween(U.dayKey(t.updatedAt), today);
      if (d >= 30) items.push({ t: t, why: 'Seit ' + d + ' Tagen unberührt in „Später“', sev: 'info' });
    });
    var inbox = S.openIn('inbox');
    var oldest = inbox.reduce(function (m, t) { return !m || t.createdAt < m ? t.createdAt : m; }, null);
    var html = '<section class="card"><h2>Braucht Aufmerksamkeit</h2>';
    if (inbox.length) {
      html += '<p class="attn-inbox"><a href="#inbox" data-act="nav" data-view="inbox">' + inbox.length + (inbox.length === 1 ? ' Eintrag' : ' Einträge') + ' in der Inbox</a>' +
        (oldest ? (function (n) { return n < 1 ? ', alle von heute' : ', der älteste seit ' + n + (n === 1 ? ' Tag' : ' Tagen'); })(daysBetween(U.dayKey(oldest), today)) : '') + '.</p>';
    }
    if (!items.length) return html + (inbox.length ? '' : '<p class="muted">Nichts liegen geblieben. Gute Woche.</p>') + '</section>';
    return html + '<ul class="attn">' + items.slice(0, 20).map(function (it) {
      return '<li class="attn-item is-' + it.sev + '"><button type="button" class="linkbtn attn-title" data-act="reveal" data-id="' + esc(it.t.id) + '">' + esc(it.t.title) + '</button><span>' + esc(it.why) + '</span></li>';
    }).join('') + '</ul></section>';
  }

  function doneList(st) {
    var html = '<section class="card"><h2>Erledigt <span class="count">' + st.done.length + '</span></h2>';
    if (!st.done.length) return html + '<p class="muted">In dieser Woche noch nichts abgehakt.</p></section>';
    var groups = {};
    st.done.forEach(function (t) { var k = t.areaId && S.area(t.areaId) ? t.areaId : ''; (groups[k] = groups[k] || []).push(t); });
    var order = S.areas().map(function (a) { return a.id; }).concat(['']);
    order.forEach(function (k) {
      if (!groups[k]) return;
      var a = k && S.area(k);
      html += '<h3 class="done-area"><i class="dot" style="background:' + esc(a ? a.color : 'var(--fg-faint)') + '"></i>' + esc(a ? a.name : 'Ohne Bereich') + ' <span>' + groups[k].length + '</span></h3>' +
        '<ul class="done-list">' + groups[k].map(function (t) { return '<li>' + esc(t.title) + '</li>'; }).join('') + '</ul>';
    });
    return html + '</section>';
  }

  function goalsEditor(monday, title, editable, placeholder) {
    var w = S.week(monday);
    var goals = w.goals || [];
    var html = '<div class="goals" data-week="' + monday + '"><h3>' + esc(title) + '</h3>';
    html += '<ul class="goal-list">' + goals.map(function (g) {
      return '<li class="goal' + (g.done ? ' is-done' : '') + '">' +
        '<button type="button" class="check' + (g.done ? ' is-checked' : '') + '" data-act="goal-toggle" data-week="' + monday + '" data-goal="' + esc(g.id) + '" aria-label="' + (g.done ? 'Wieder öffnen' : 'Erreicht') + '"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg></button>' +
        '<span class="goal-text">' + esc(g.text) + '</span>' +
        (editable ? '<button type="button" class="ibtn" data-act="goal-del" data-week="' + monday + '" data-goal="' + esc(g.id) + '" aria-label="Entfernen" title="Entfernen">✕</button>' : '') +
      '</li>';
    }).join('') + '</ul>';
    if (editable && goals.length < 3) {
      html += '<form class="goal-add" data-act-form="goal-add" data-week="' + monday + '"><input id="goal-new-' + monday + '" type="text" placeholder="' + esc(placeholder || 'Was soll diese Woche wirklich vorankommen?') + '" aria-label="Neuer Wochenfokus" /><button type="submit" class="btn">Hinzufügen</button></form>';
    }
    if (!goals.length && !editable) html += '<p class="muted small">Kein Wochenfokus festgelegt.</p>';
    return html + '</div>';
  }

  function checklist(monday) {
    var w = S.week(monday);
    var inboxEmpty = !S.openIn('inbox').length;
    var html = '<section class="card"><h2>Wochenabschluss</h2><p class="muted">Zehn Minuten am Freitag, damit der Montag ruhig anfängt.</p><ul class="checks">';
    CHECKS.forEach(function (c) {
      var on = !!(w.checks && w.checks[c.id]);
      var auto = c.id === 'inbox' && inboxEmpty && !on;
      html += '<li><label class="check-row"><input type="checkbox" data-week-check="' + c.id + '" data-week="' + monday + '"' + (on ? ' checked' : '') + ' />' +
        '<span><strong>' + esc(c.label) + '</strong>' + (c.hint ? ' <em>' + esc(c.hint) + '</em>' : '') + (auto ? ' <em class="ok">Inbox ist schon leer.</em>' : '') + '</span></label></li>';
    });
    html += '</ul><label class="field"><span>Was nehme ich aus dieser Woche mit?</span><textarea id="week-note" data-week="' + monday + '" rows="3" placeholder="Was lief gut, was ändere ich nächste Woche?">' + esc(w.note || '') + '</textarea></label></section>';
    return html;
  }

  function isoWeek(day) {
    var d = new Date(day + 'T12:00:00');
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    var jan4 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - jan4) / 864e5 - 3 + (jan4.getDay() + 6) % 7) / 7);
  }

  function view(monday) {
    var thisMonday = K.cal.mondayOf(U.dayKey());
    var isCurrent = monday === thisMonday;
    var isPast = monday < thisMonday;
    var st = stats(monday);
    var target = focusTarget();
    var last = plusDays(monday, 6);
    var range = new Date(monday + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) + ' – ' + new Date(last + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
    var ratio = st.focus + st.meeting ? Math.round(st.focus / (st.focus + st.meeting) * 100) : 0;

    var html = '<header class="view-head"><div><h1>Wochenrückblick</h1><p class="sub">KW ' + isoWeek(monday) + ' · ' + esc(range) + (isCurrent ? ' · laufende Woche' : '') + '</p></div>' +
      '<div class="cal-nav"><button type="button" class="btn" data-act="review-prev" aria-label="Vorige Woche">‹</button>' +
      '<button type="button" class="btn" data-act="review-today">Diese Woche</button>' +
      '<button type="button" class="btn" data-act="review-next" aria-label="Nächste Woche"' + (isCurrent ? ' disabled' : '') + '>›</button></div></header>';

    html += '<div class="tiles">' +
      tile('Fokuszeit', h(st.focus), 'h', 'Ziel ' + target.hours.toLocaleString('de-DE') + ' h <span class="muted">(' + esc(target.source) + ')</span>', st.focus / (target.hours * 3600) * 100) +
      tile('Meetings', h(st.meeting), 'h', 'in der Arbeitszeit, laut Kalender') +
      tile('Fokus-Anteil', ratio, '%', 'Fokus geteilt durch Fokus plus Meetings') +
      tile('Erledigt', st.done.length, '', st.pastBlocks.length ? st.keptBlocks.length + ' von ' + st.pastBlocks.length + ' eingeplanten Blöcken erledigt' : 'Keine vergangenen Blöcke in dieser Woche') +
    '</div>';

    html += '<div class="review-grid">' + dayChart(st) + areaChart(st) + '</div>';

    html += '<section class="card"><h2>Wochenfokus</h2>' +
      goalsEditor(monday, isCurrent ? 'Diese Woche' : 'Fokus dieser Woche', !isPast) +
      (isCurrent ? goalsEditor(plusDays(monday, 7), 'Nächste Woche', true, 'Was soll nächste Woche vorankommen?') : '') +
    '</section>';

    html += '<div class="review-grid">' + doneList(st) + (isCurrent ? attention(monday) : '') + '</div>';
    if (isCurrent || isPast) html += checklist(monday);
    return html;
  }

  /* Kurzanzeige auf „Heute“ */
  function todayStrip() {
    var monday = K.cal.mondayOf(U.dayKey());
    var goals = S.week(monday).goals || [];
    if (!goals.length) return '';
    return '<div class="week-strip"><span class="week-strip-label">Wochenfokus</span>' + goals.map(function (g) {
      return '<button type="button" class="week-goal' + (g.done ? ' is-done' : '') + '" data-act="goal-toggle" data-week="' + monday + '" data-goal="' + esc(g.id) + '" title="' + (g.done ? 'Als offen markieren' : 'Als erreicht markieren') + '">' +
        '<i aria-hidden="true">' + (g.done ? '✓' : '○') + '</i>' + esc(g.text) + '</button>';
    }).join('') + '<a class="linkbtn" href="#rueckblick" data-act="nav" data-view="rueckblick">Rückblick ›</a></div>';
  }

  /* Hinweis am Freitagnachmittag */
  function reviewDue() {
    var now = new Date();
    if (now.getDay() !== 5 || now.getHours() < 14) return false;
    var w = S.week(K.cal.mondayOf(U.dayKey()));
    return !CHECKS.every(function (c) { return w.checks && w.checks[c.id]; });
  }

  K.review = { view: view, todayStrip: todayStrip, reviewDue: reviewDue, CHECKS: CHECKS };
})(window.K = window.K || {});
