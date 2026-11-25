/* Kompass – Kalender: Outlook-Termine (nur lesend) als Hintergrund,
 * darüber die eigenen Zeitblöcke. Berechnet freie Zeit und die nächste Lücke. */
(function (K) {
  'use strict';

  var S = K.store, U = K.util;
  var SNAP = 15;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function minutesOf(str, fallback) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(str || '');
    return m ? (+m[1]) * 60 + (+m[2]) : fallback;
  }
  function dayStart(day) { return new Date(day + 'T00:00:00').getTime(); }
  function dayEnd(day) { return dayStart(U.dayKey(U.addDays(new Date(day + 'T12:00:00'), 1))); }
  function atMin(day, min) { var d = new Date(day + 'T00:00:00'); d.setMinutes(min); return d.getTime(); }
  function hours(ms) { return (ms / 36e5).toLocaleString('de-DE', { maximumFractionDigits: 1 }); }
  function work(day) {
    var s = S.state.settings;
    var ws = minutesOf(s.workStart, 480), we = minutesOf(s.workEnd, 1020);
    if (we <= ws) we = ws + 60;
    return { ws: ws, we: we, from: atMin(day, ws), to: atMin(day, we) };
  }

  function merge(intervals) {
    intervals.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    intervals.forEach(function (iv) {
      if (iv[1] <= iv[0]) return;
      var last = out[out.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else out.push([iv[0], iv[1]]);
    });
    return out;
  }
  function clipSum(intervals, from, to) {
    return intervals.reduce(function (sum, iv) { return sum + Math.max(0, Math.min(to, iv[1]) - Math.max(from, iv[0])); }, 0);
  }

  function dayEvents(day) {
    var from = dayStart(day), to = dayEnd(day);
    return S.eventsBetween(from, to).filter(function (e) {
      if (!e.allDay) return true;
      return e.startDay <= day && e.endDay > day;
    });
  }
  function meetingIntervals(day) {
    return dayEvents(day).filter(function (e) { return !e.allDay && e.busy !== 'free'; })
      .map(function (e) { return [new Date(e.start).getTime(), new Date(e.end).getTime()]; });
  }
  function blockIntervals(day, exceptId) {
    return S.blocksBetween(dayStart(day), dayEnd(day)).filter(function (b) { return b.id !== exceptId; })
      .map(function (b) { return [new Date(b.start).getTime(), new Date(b.end).getTime()]; });
  }

  /* Arbeitszeit, Meetings, freie Zeit und eingeplante Zeit eines Tages */
  function capacity(day) {
    var w = work(day);
    var total = w.to - w.from;
    var oof = dayEvents(day).some(function (e) { return e.allDay && e.busy === 'oof'; });
    var meeting = oof ? total : clipSum(merge(meetingIntervals(day)), w.from, w.to);
    var free = Math.max(0, total - meeting);
    var planned = clipSum(merge(blockIntervals(day)), dayStart(day), dayEnd(day));
    return { total: total, meeting: meeting, free: free, planned: planned, over: planned > free + 5 * 6e4, oof: oof };
  }
  function capacityText(c) {
    if (c.oof) return 'Abwesend';
    return 'Meetings ' + hours(c.meeting) + ' h · frei ' + hours(c.free) + ' h · eingeplant ' + hours(c.planned) + ' h';
  }

  /* Nächste freie Lücke ab jetzt (heute) bzw. ab Arbeitsbeginn */
  function nextFreeSlot(day, wantMin) {
    var w = work(day);
    var start = w.from;
    if (day === U.dayKey()) {
      var now = Date.now();
      var rounded = Math.ceil(now / (SNAP * 6e4)) * SNAP * 6e4;
      start = Math.max(start, rounded);
    }
    var busy = merge(meetingIntervals(day).concat(blockIntervals(day)));
    var cursor = start;
    var minGap = Math.min(30, wantMin) * 6e4;
    for (var i = 0; i <= busy.length; i++) {
      var gapEnd = i < busy.length ? Math.min(busy[i][0], w.to) : w.to;
      if (i < busy.length && busy[i][1] <= cursor) continue;
      if (gapEnd - cursor >= minGap) return [cursor, Math.min(gapEnd, cursor + wantMin * 6e4)];
      if (i < busy.length) cursor = Math.max(cursor, busy[i][1]);
      if (cursor >= w.to) break;
    }
    return null;
  }

  // ------------------------------------------------------------------ Darstellung
  function hourRange(days) {
    var w = work(days[0]);
    var h0 = Math.max(0, Math.floor(w.ws / 60) - 1), h1 = Math.min(24, Math.ceil(w.we / 60) + 1);
    days.forEach(function (day) {
      var ds = dayStart(day);
      dayEvents(day).filter(function (e) { return !e.allDay; }).concat(S.blocksBetween(ds, dayEnd(day))).forEach(function (e) {
        var s = (new Date(e.start).getTime() - ds) / 36e5, en = (new Date(e.end).getTime() - ds) / 36e5;
        if (s >= 0) h0 = Math.min(h0, Math.floor(s));
        if (en <= 24) h1 = Math.max(h1, Math.ceil(en));
      });
    });
    return [h0, Math.max(h1, h0 + 4)];
  }

  /* Nebeneinanderliegende Spuren für überlappende Termine */
  function lanes(items) {
    items.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var clusters = [], cur = null, curEnd = -Infinity;
    items.forEach(function (it) {
      if (!cur || it.s >= curEnd) { cur = []; clusters.push(cur); curEnd = it.e; }
      else curEnd = Math.max(curEnd, it.e);
      cur.push(it);
    });
    clusters.forEach(function (c) {
      var laneEnds = [];
      c.forEach(function (it) {
        var l = laneEnds.findIndex(function (end) { return end <= it.s; });
        if (l < 0) { l = laneEnds.length; laneEnds.push(it.e); } else laneEnds[l] = it.e;
        it.lane = l;
      });
      c.forEach(function (it) { it.lanes = laneEnds.length; });
    });
    return items;
  }

  function column(day, h0, h1, px) {
    var ds = dayStart(day);
    var w = work(day);
    var top = function (ms) { return ((ms - ds) / 36e5 - h0) * px; };
    var html = '<div class="tl" data-day="' + day + '" data-h0="' + h0 + '" data-px="' + px + '" style="height:' + ((h1 - h0) * px) + 'px">';
    var offTop = Math.max(0, (w.ws / 60 - h0) * px), offBottom = Math.max(0, (w.we / 60 - h0) * px);
    if (offTop > 0) html += '<div class="tl-off" style="top:0;height:' + offTop + 'px"></div>';
    if (offBottom < (h1 - h0) * px) html += '<div class="tl-off" style="top:' + offBottom + 'px;bottom:0"></div>';
    for (var h = h0 + 1; h < h1; h++) html += '<div class="tl-hour" style="top:' + ((h - h0) * px) + 'px"></div>';

    var evs = lanes(dayEvents(day).filter(function (e) { return !e.allDay; }).map(function (e) {
      return { ev: e, s: new Date(e.start).getTime(), e: new Date(e.end).getTime() };
    }));
    evs.forEach(function (it) {
      var y = Math.max(0, top(it.s)), y2 = Math.min((h1 - h0) * px, top(it.e));
      var hgt = Math.max(14, y2 - y - 1);
      var wPct = 100 / it.lanes;
      var short = hgt < 30;
      html += '<div class="ev ev-' + esc(it.ev.busy) + (short ? ' is-short' : '') + '" style="top:' + y + 'px;height:' + hgt + 'px;left:calc(' + (it.lane * wPct) + '% + 2px);width:calc(' + wPct + '% - 4px)" title="' + esc(hm(it.s) + '–' + hm(it.e) + ' ' + it.ev.title + (it.ev.location ? ' · ' + it.ev.location : '')) + '">' +
        '<span class="ev-t">' + esc(it.ev.title) + '</span>' + (short ? '' : '<span class="ev-time">' + hm(it.s) + '–' + hm(it.e) + (it.ev.location ? ' · ' + esc(it.ev.location) : '') + '</span>') + '</div>';
    });

    lanes(S.blocksBetween(ds, dayEnd(day)).map(function (b) {
      return { b: b, s: new Date(b.start).getTime(), e: new Date(b.end).getTime() };
    })).forEach(function (it) {
      var b = it.b, s = it.s, e = it.e;
      var t = S.task(b.taskId);
      var laneW = 74 / it.lanes;
      var y = top(s), hgt = Math.max(16, top(e) - y - 1);
      var area = t.areaId && S.area(t.areaId);
      var running = S.state.activeTimer && S.state.activeTimer.taskId === t.id;
      html += '<div class="blk' + (t.done ? ' is-done' : '') + (running ? ' is-running' : '') + (hgt < 34 ? ' is-short' : '') + '" data-block="' + esc(b.id) + '" style="top:' + y + 'px;height:' + hgt + 'px;left:calc(' + (26 + it.lane * laneW) + '% + 1px);width:calc(' + laneW + '% - 4px);--c:' + esc(area ? area.color : 'var(--accent)') + '" title="' + esc(hm(s) + '–' + hm(e) + ' ' + t.title) + '" tabindex="0">' +
        '<span class="blk-t">' + esc(t.title) + '</span><span class="blk-time">' + hm(s) + '–' + hm(e) + '</span><i class="blk-resize" aria-hidden="true"></i></div>';
    });

    if (day === U.dayKey()) html += '<div class="tl-now" style="top:' + top(Date.now()) + 'px"></div>';
    return html + '</div>';
  }

  function gutter(h0, h1, px) {
    var html = '<div class="tl-gutter" style="height:' + ((h1 - h0) * px) + 'px">';
    for (var h = h0 + 1; h < h1; h++) html += '<span style="top:' + ((h - h0) * px) + 'px">' + pad(h) + ':00</span>';
    return html + '</div>';
  }

  function allDayChips(day) {
    var ad = dayEvents(day).filter(function (e) { return e.allDay; });
    if (!ad.length) return '';
    return '<div class="allday">' + ad.map(function (e) { return '<span class="ev-chip ev-' + esc(e.busy) + '" title="' + esc(e.title) + '">' + esc(e.title) + '</span>'; }).join('') + '</div>';
  }

  function statusLine(inSettings) {
    var c = S.state.calendar;
    var link = function (label) { return inSettings ? '' : ' <a href="#optionen" data-act="nav" data-view="optionen">' + label + '</a>'; };
    if (c.error) return '<span class="cal-status is-error">' + (c.error === 'cors' ? 'Outlook-Link konnte nicht direkt geladen werden.' : 'Kalender: ' + esc(c.error)) + link('Einstellungen') + '</span>';
    if (!c.source) return '<span class="cal-status">Kein Outlook-Kalender verbunden.' + link('Verbinden') + '</span>';
    var when = c.syncedAt ? new Date(c.syncedAt) : null;
    var whenTxt = when ? (U.dayKey(when) === U.dayKey() ? 'heute ' + hm(when.getTime()) : when.toLocaleDateString('de-DE') + ' ' + hm(when.getTime())) : '';
    var label = { url: 'Outlook-Link', file: 'Outlook-Datei', example: 'Beispielkalender' }[c.source] || 'Kalender';
    var stale = c.source === 'file' && when && Date.now() - when.getTime() > 20 * 36e5;
    return '<span class="cal-status' + (stale ? ' is-warn' : '') + '">' + label + (whenTxt ? ' · Stand ' + whenTxt : '') + (stale ? ' · bitte neu importieren' : '') +
      (c.source === 'url' ? ' <button type="button" class="linkbtn" data-act="cal-sync">Aktualisieren</button>' : '') + '</span>';
  }

  /* Tagesansicht als Seitenspalte auf „Heute“ */
  function dayPanel(day) {
    var r = hourRange([day]);
    var px = 46;
    var c = capacity(day);
    return '<aside class="day-panel" aria-label="Kalender heute">' +
      '<div class="day-panel-head"><h2>Kalender</h2><a class="linkbtn" href="#kalender" data-act="nav" data-view="kalender">Woche ›</a></div>' +
      '<p class="cap' + (c.over ? ' is-over' : '') + '">' + capacityText(c) + (c.over ? '<br><strong>Mehr eingeplant, als frei ist.</strong>' : '') + '</p>' +
      allDayChips(day) +
      '<div class="day-scroll" id="day-scroll"><div class="tl-row">' + gutter(r[0], r[1], px) + column(day, r[0], r[1], px) + '</div></div>' +
      '<p class="day-panel-foot">' + statusLine() + '</p>' +
      '<p class="hint">Aufgabe aus der Liste hierher ziehen oder <kbd>P</kbd> für die nächste Lücke.</p>' +
    '</aside>';
  }

  function mondayOf(day) {
    var d = new Date(day + 'T12:00:00');
    var wd = (d.getDay() + 6) % 7;
    return U.dayKey(U.addDays(d, -wd));
  }
  function isoWeek(day) {
    var d = new Date(day + 'T12:00:00');
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    var jan4 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - jan4) / 864e5 - 3 + (jan4.getDay() + 6) % 7) / 7);
  }

  /* Wochenansicht */
  function weekView(weekStart, planTasks) {
    var n = S.state.settings.showWeekend ? 7 : 5;
    var days = [];
    for (var i = 0; i < n; i++) days.push(U.dayKey(U.addDays(new Date(weekStart + 'T12:00:00'), i)));
    var r = hourRange(days);
    var px = 44;
    var today = U.dayKey();
    var last = days[days.length - 1];
    var range = new Date(weekStart + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) + ' – ' + new Date(last + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

    var html = '<header class="view-head"><div><h1>Kalender</h1><p class="sub">KW ' + isoWeek(weekStart) + ' · ' + esc(range) + '</p></div>' +
      '<div class="cal-nav"><button type="button" class="btn" data-act="week-prev" aria-label="Vorige Woche">‹</button>' +
      '<button type="button" class="btn" data-act="week-today">Diese Woche</button>' +
      '<button type="button" class="btn" data-act="week-next" aria-label="Nächste Woche">›</button>' +
      '<button type="button" class="btn ghost" data-act="toggle-weekend">' + (n === 7 ? 'Ohne Wochenende' : 'Mit Wochenende') + '</button></div></header>';

    html += '<div class="plan-strip"><span class="plan-label">Zum Einplanen</span>' +
      (planTasks.length ? planTasks.map(function (t) {
        var area = t.areaId && S.area(t.areaId);
        var has = S.blocksOfTask(t.id).some(function (b) { return b.start >= weekStart; });
        return '<span class="plan-chip' + (has ? ' is-planned' : '') + '" draggable="true" data-id="' + esc(t.id) + '" title="In den Kalender ziehen">' +
          '<i class="dot" style="background:' + esc(area ? area.color : 'var(--fg-faint)') + '"></i>' + esc(t.title) + '</span>';
      }).join('') : '<span class="muted small">Nichts auf „Heute“ oder „Diese Woche“.</span>') + '</div>';

    html += '<div class="wk-scroll"><div class="wk" style="grid-template-columns:48px repeat(' + n + ', minmax(150px, 1fr))">';
    html += '<div class="wk-corner"></div>';
    days.forEach(function (d) {
      var c = capacity(d);
      var date = new Date(d + 'T12:00:00');
      html += '<div class="wk-head' + (d === today ? ' is-today' : '') + '"><div class="wk-date"><span>' + date.toLocaleDateString('de-DE', { weekday: 'short' }) + '</span> ' + date.getDate() + '.</div>' +
        '<div class="wk-cap' + (c.over ? ' is-over' : '') + '" title="' + esc(capacityText(c)) + '">' + (c.oof ? 'Abwesend' : 'frei ' + hours(c.free) + ' h · geplant ' + hours(c.planned) + ' h') + '</div>' +
        allDayChips(d) + '</div>';
    });
    html += gutter(r[0], r[1], px);
    days.forEach(function (d) { html += column(d, r[0], r[1], px); });
    html += '</div></div><p class="day-panel-foot">' + statusLine() + '</p>';
    return html;
  }

  // ------------------------------------------------------------------ Position ↔ Zeit
  function timeAt(tl, clientY) {
    var rect = tl.getBoundingClientRect();
    var px = +tl.getAttribute('data-px'), h0 = +tl.getAttribute('data-h0');
    var min = ((clientY - rect.top) / px + h0) * 60;
    min = Math.round(min / SNAP) * SNAP;
    return Math.max(0, Math.min(24 * 60 - SNAP, min));
  }

  function showGhost(tl, clientY, durMin) {
    hideGhost();
    var px = +tl.getAttribute('data-px'), h0 = +tl.getAttribute('data-h0');
    var min = timeAt(tl, clientY);
    var g = document.createElement('div');
    g.className = 'tl-ghost';
    g.style.top = ((min / 60 - h0) * px) + 'px';
    g.style.height = ((durMin || 60) / 60 * px) + 'px';
    g.textContent = pad(Math.floor(min / 60)) + ':' + pad(min % 60);
    tl.appendChild(g);
  }
  function hideGhost() { var g = document.querySelector('.tl-ghost'); if (g) g.remove(); }

  function dropTask(taskId, tl, clientY) {
    hideGhost();
    var day = tl.getAttribute('data-day');
    var min = timeAt(tl, clientY);
    var s = atMin(day, min);
    var b = S.addBlock(taskId, s, s + 60 * 6e4);
    var t = S.task(taskId);
    if (t && t.list !== 'today' && day === U.dayKey()) S.updateTask(taskId, { list: 'today' });
    return b;
  }

  // ------------------------------------------------------------------ Verschieben und Größe ändern
  var drag = null;
  function onPointerDown(e) {
    if (e.button !== 0) return;
    var blk = e.target.closest('.blk');
    if (!blk) return;
    var tl = blk.closest('.tl');
    var b = S.block(blk.getAttribute('data-block'));
    if (!b) return;
    drag = {
      el: blk, tl: tl, id: b.id, mode: e.target.classList.contains('blk-resize') ? 'resize' : 'move',
      startY: e.clientY, startX: e.clientX, moved: false,
      s: new Date(b.start).getTime(), e: new Date(b.end).getTime(),
      px: +tl.getAttribute('data-px'), h0: +tl.getAttribute('data-h0')
    };
    blk.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (!drag) return;
    var dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 4 && Math.abs(e.clientX - drag.startX) < 4) return;
    drag.moved = true;
    drag.el.classList.add('is-dragging');
    var deltaMin = Math.round(dy / drag.px * 60 / SNAP) * SNAP;
    if (drag.mode === 'resize') {
      var dur = Math.max(SNAP, Math.round((drag.e - drag.s) / 6e4) + deltaMin);
      drag.newS = drag.s; drag.newE = drag.s + dur * 6e4;
      drag.el.style.height = (dur / 60 * drag.px - 1) + 'px';
      drag.el.querySelector('.blk-time').textContent = hm(drag.newS) + '–' + hm(drag.newE);
      drag.target = drag.tl;
      return;
    }
    // Spalte unter dem Zeiger (Wochenansicht)
    drag.el.style.visibility = 'hidden';
    var under = document.elementFromPoint(e.clientX, e.clientY);
    drag.el.style.visibility = '';
    var target = under && under.closest('.tl');
    if (!target || target.getAttribute('data-px') !== String(drag.px)) target = drag.target || drag.tl;
    if (target !== drag.el.parentElement) target.appendChild(drag.el);
    drag.target = target;
    var dayShift = Math.round((dayStart(target.getAttribute('data-day')) - dayStart(drag.tl.getAttribute('data-day'))) / 864e5);
    var startMin = new Date(drag.s).getHours() * 60 + new Date(drag.s).getMinutes() + deltaMin;
    var dur2 = (drag.e - drag.s) / 6e4;
    startMin = Math.max(0, Math.min(24 * 60 - dur2, startMin));
    var base = atMin(U.dayKey(U.addDays(new Date(drag.s), dayShift)), startMin);
    drag.newS = base; drag.newE = base + dur2 * 6e4;
    var h0 = +target.getAttribute('data-h0');
    drag.el.style.top = ((startMin / 60 - h0) * drag.px) + 'px';
    drag.el.querySelector('.blk-time').textContent = hm(drag.newS) + '–' + hm(drag.newE);
  }
  function onPointerUp() {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (!d.moved) { K.app.openModal({ type: 'block', blockId: d.id }); return; }
    if (d.newS != null) S.updateBlock(d.id, d.newS, d.newE);
    else K.app.render();
  }

  // ------------------------------------------------------------------ Kalender laden
  var syncing = false;
  function normalizeUrl(u) {
    u = String(u || '').trim();
    if (/^webcals?:\/\//i.test(u)) u = u.replace(/^webcals?:/i, 'https:');
    return u;
  }
  function importText(text, source) {
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('Das ist keine Kalenderdatei (.ics).');
    var now = Date.now();
    var parsed = K.ics.parse(text, now - 21 * 864e5, now + 120 * 864e5);
    S.setCalendar({ events: parsed.events, name: parsed.name || '', source: source, syncedAt: U.nowIso(), error: null });
    return parsed;
  }
  function sync(manual) {
    var url = normalizeUrl(S.state.calendar.url);
    if (!url || syncing) return Promise.resolve(false);
    syncing = true;
    return fetch(url, { cache: 'no-store', credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('Der Server antwortet mit Fehler ' + res.status + '. Stimmt der Link?');
      return res.text();
    }).then(function (text) {
      var p = importText(text, 'url');
      if (manual) K.app.toast(p.events.length + ' Termine aus Outlook geladen');
      return true;
    }).catch(function (err) {
      var msg = err instanceof TypeError ? 'cors' : err.message;
      S.setCalendar({ error: msg });
      if (manual) K.app.toast(msg === 'cors' ? 'Direkter Abruf blockiert. Nimm den Datei-Import.' : msg);
      return false;
    }).then(function (ok) { syncing = false; return ok; });
  }
  function maybeAutoSync() {
    var c = S.state.calendar;
    if (!c.url || c.error === 'cors') return;
    if (!c.syncedAt || c.source !== 'url' || Date.now() - new Date(c.syncedAt).getTime() > 15 * 6e4) sync(false);
  }

  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', function () { if (drag) { drag = null; K.app.render(); } });

  K.cal = {
    capacity: capacity, capacityText: capacityText, nextFreeSlot: nextFreeSlot,
    dayPanel: dayPanel, weekView: weekView, mondayOf: mondayOf,
    showGhost: showGhost, hideGhost: hideGhost, dropTask: dropTask,
    sync: sync, maybeAutoSync: maybeAutoSync, importText: importText, normalizeUrl: normalizeUrl,
    statusLine: statusLine, hm: hm, isDragging: function () { return !!drag; }
  };
})(window.K = window.K || {});
