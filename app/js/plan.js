/* Kompass – Plan: eine Spalte pro Tag, waagerecht scrollbar.
 * Vergangene Tage zeigen, was erledigt wurde; heute und künftige Tage,
 * was ansteht. Karten lassen sich zwischen Tagen verschieben. */
(function (K) {
  'use strict';

  var S = K.store, U = K.util;
  var PAST = 7, FUTURE = 28;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plusDays(day, n) { return U.dayKey(U.addDays(new Date(day + 'T12:00:00'), n)); }
  function hours(ms) { return (ms / 36e5).toLocaleString('de-DE', { maximumFractionDigits: 1 }); }

  function byOrder(a, b) { return a.order - b.order || a.createdAt.localeCompare(b.createdAt); }

  function tasksFor(day, today, filter) {
    var all = S.tasks().filter(function (t) { return !filter || t.areaId === filter; });
    var open = [], done = [];
    if (day < today) {
      done = all.filter(function (t) { return t.done && t.doneAt && U.dayKey(t.doneAt) === day; });
    } else if (day === today) {
      open = all.filter(function (t) { return !t.done && t.list === 'today'; });
      done = all.filter(function (t) { return t.done && t.doneAt && U.dayKey(t.doneAt) === day; });
    } else {
      open = all.filter(function (t) { return !t.done && t.planDate === day && t.list !== 'today'; });
    }
    return { open: open.sort(byOrder), done: done.sort(function (a, b) { return a.doneAt.localeCompare(b.doneAt); }) };
  }

  function card(t, ui) {
    var area = t.areaId && S.area(t.areaId);
    var blocks = S.blocksOfTask(t.id).filter(function (b) { return !t.done && b.end >= new Date().toISOString(); });
    var meta = '';
    if (blocks.length) meta += '<span class="pc-time" title="Eingeplant">◷ ' + K.cal.hm(new Date(blocks[0].start).getTime()) + '</span>';
    if (area) meta += '<span class="pc-area"><i class="dot" style="background:' + esc(area.color) + '"></i><span class="pc-area-n">' + esc(area.name) + '</span></span>';
    if (t.repeat) meta += '<span class="pc-rep" title="' + esc(U.REPEATS[t.repeat] || 'Wiederkehrend') + '">↻</span>';
    if (t.sourceKey) meta += '<span class="pc-key">' + esc(t.sourceKey) + '</span>';
    if (t.list === 'waiting') meta += '<span class="pc-key">wartet</span>';
    return '<div class="pcard' + (t.done ? ' is-done' : '') + (ui.selectedId === t.id ? ' is-selected' : '') + '" data-id="' + esc(t.id) + '"' + (t.done ? '' : ' draggable="true"') +
      ' style="--c:' + esc(area ? area.color : 'var(--line)') + '">' +
      '<div class="pc-title">' + esc(t.title) + '</div>' +
      '<div class="pc-row"><button type="button" class="check small' + (t.done ? ' is-checked' : '') + '" data-act="' + (t.done ? 'undone' : 'done') + '" data-id="' + esc(t.id) + '" aria-label="' + (t.done ? 'Wieder öffnen' : 'Erledigt') + '"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg></button>' +
      '<div class="pc-meta">' + meta + '</div></div></div>';
  }

  function column(day, today, ui) {
    var date = new Date(day + 'T12:00:00');
    var wd = date.getDay();
    var isPast = day < today, isToday = day === today;
    var list = tasksFor(day, today, ui.planFilter);
    var cap = !isPast ? K.cal.capacity(day) : null;
    var capTxt = '';
    if (cap && (wd !== 0 && wd !== 6 || cap.meeting)) capTxt = cap.oof ? 'abwesend' : 'frei ' + hours(cap.free) + ' h';
    var html = '<section class="pcol' + (isToday ? ' is-today' : '') + (isPast ? ' is-past' : '') + (wd === 0 || wd === 6 ? ' is-weekend' : '') + (wd === 1 ? ' is-monday' : '') + '" data-day="' + day + '" aria-label="' + esc(date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })) + '">' +
      '<header class="pcol-head"><span class="pcol-wd">' + esc(date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')) + '</span> <span class="pcol-d">' + date.getDate() + '</span>' +
      (capTxt ? '<span class="pcol-cap' + (cap.over ? ' is-over' : '') + '" title="' + esc(K.cal.capacityText(cap)) + '">' + capTxt + '</span>' : '') + '</header>';
    if (!isPast) {
      html += '<form class="pcol-add" data-act-form="plan-add" data-day="' + day + '" autocomplete="off">' +
        '<input id="plan-add-' + day + '" type="text" placeholder="Aufgabe hinzufügen" aria-label="Aufgabe für ' + esc(date.toLocaleDateString('de-DE', { weekday: 'long' })) + '" />' +
        '<button type="button" class="pcol-pos" data-act="plan-add-top" data-day="' + day + '" title="Oben einfügen" aria-label="Oben einfügen">⤒</button>' +
        '<button type="submit" class="pcol-pos" title="Unten einfügen (Enter)" aria-label="Unten einfügen">⤓</button></form>';
    }
    html += '<div class="pcol-cards" data-day="' + day + '">' + list.open.map(function (t) { return card(t, ui); }).join('');
    if (ui.planShowDone) html += list.done.map(function (t) { return card(t, ui); }).join('');
    else if (list.done.length) html += '<p class="pcol-done-n">' + list.done.length + ' erledigt</p>';
    html += '</div></section>';
    return html;
  }

  function view(ui) {
    var today = U.dayKey();
    var start = plusDays(today, -PAST);
    var days = [];
    for (var i = 0; i <= PAST + FUTURE; i++) days.push(plusDays(start, i));
    var areas = S.areas();
    var filterArea = ui.planFilter && S.area(ui.planFilter);
    var recurring = S.recurring().length;

    var html = '<header class="view-head plan-head"><div class="plan-title"><h1>Woche planen</h1>' +
      '<div class="plan-filter"><button type="button" class="btn ghost small' + (filterArea ? ' is-on' : '') + '" data-act="plan-filter-toggle" aria-expanded="' + !!ui.planFilterOpen + '">' +
      (filterArea ? '<i class="dot" style="background:' + esc(filterArea.color) + '"></i>' + esc(filterArea.name) : 'Alle Bereiche') + ' ▾</button>' +
      (ui.planFilterOpen ? '<div class="menu">' + '<button type="button" class="menu-item" data-act="plan-filter" data-area="">Alle Bereiche</button>' +
        areas.map(function (a) { return '<button type="button" class="menu-item" data-act="plan-filter" data-area="' + esc(a.id) + '"><i class="dot" style="background:' + esc(a.color) + '"></i>' + esc(a.name) + '</button>'; }).join('') + '</div>' : '') +
      '</div></div>' +
      '<div class="plan-tools"><span class="plan-month" id="plan-month">' + esc(new Date(today + 'T12:00:00').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })) + '</span>' +
      '<button type="button" class="btn" data-act="plan-today">Heute</button>' +
      '<button type="button" class="btn ghost" data-act="plan-recurring">↻ Wiederkehrend' + (recurring ? ' <span class="badge">' + recurring + '</span>' : '') + '</button>' +
      '<button type="button" class="btn ghost' + (ui.planShowDone ? ' is-on' : '') + '" data-act="plan-toggle-done" aria-pressed="' + !!ui.planShowDone + '" title="Erledigte zeigen oder ausblenden">' + (ui.planShowDone ? 'Erledigte ausblenden' : 'Erledigte zeigen') + '</button></div></header>';
    html += '<div class="plan-scroll" id="plan-scroll"><div class="plan-cols">' + days.map(function (d) { return column(d, today, ui); }).join('') + '</div></div>' +
      '<p class="hint">Karten zwischen Tagen ziehen. Was für heute geplant ist, steht automatisch auf „Heute“. Erledigtes an vergangenen Tagen bleibt sichtbar.</p>';
    return html;
  }

  function recurringModal() {
    var rs = S.recurring().sort(function (a, b) { return (a.planDate || '').localeCompare(b.planDate || ''); });
    var opts = function (cur) {
      return Object.keys(U.REPEATS).map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + U.REPEATS[k] + '</option>'; }).join('');
    };
    return '<div class="modal-form"><h2>Wiederkehrende Aufgaben</h2>' +
      '<p class="muted">Wenn du eine wiederkehrende Aufgabe abhakst, legt Kompass das nächste Vorkommen an. Neue legst du im Bearbeiten-Dialog einer Aufgabe an.</p>' +
      (rs.length ? '<ul class="rep-list">' + rs.map(function (t) {
        var area = t.areaId && S.area(t.areaId);
        return '<li class="rep-row"><div class="rep-main"><strong>' + esc(t.title) + '</strong><span class="muted small">' +
          (area ? esc(area.name) + ' · ' : '') + 'nächstes Mal ' + (t.planDate ? esc(new Date(t.planDate + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })) : 'offen') + '</span></div>' +
          '<select data-repeat-for="' + esc(t.id) + '" aria-label="Rhythmus">' + opts(t.repeat) + '</select>' +
          '<button type="button" class="btn ghost small danger" data-act="repeat-stop" data-id="' + esc(t.id) + '">Nicht mehr wiederholen</button></li>';
      }).join('') + '</ul>' : '<p class="empty">Noch keine wiederkehrenden Aufgaben.</p>') +
      '<div class="modal-btns"><button type="button" class="btn primary" data-act="modal-close">Schließen</button></div></div>';
  }

  /* Monatsname passend zur ersten sichtbaren Spalte */
  function updateMonth() {
    var sc = document.getElementById('plan-scroll');
    var label = document.getElementById('plan-month');
    if (!sc || !label) return;
    var left = sc.getBoundingClientRect().left;
    var cols = sc.querySelectorAll('.pcol');
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].getBoundingClientRect().right > left + 40) {
        label.textContent = new Date(cols[i].getAttribute('data-day') + 'T12:00:00').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        return;
      }
    }
  }
  function scrollToToday(smooth) {
    var sc = document.getElementById('plan-scroll');
    var col = sc && sc.querySelector('.pcol.is-today');
    if (!col) return;
    // Vortag halb sichtbar lassen, damit klar ist, dass es nach links weitergeht
    var target = sc.scrollLeft + (col.getBoundingClientRect().left - sc.getBoundingClientRect().left) - Math.round(col.offsetWidth * 0.6);
    sc.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
    updateMonth();
  }

  document.addEventListener('scroll', function (e) { if (e.target && e.target.id === 'plan-scroll') updateMonth(); }, true);

  K.plan = { view: view, recurringModal: recurringModal, scrollToToday: scrollToToday, updateMonth: updateMonth };
})(window.K = window.K || {});
