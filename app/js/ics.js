/* Kompass – liest iCalendar-Dateien (.ics), wie Outlook sie veröffentlicht
 * oder exportiert. Unterstützt Serientermine (RRULE mit DAILY, WEEKLY,
 * MONTHLY, YEARLY, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYSETPOS),
 * Ausnahmen (EXDATE), geänderte Einzeltermine (RECURRENCE-ID), Absagen,
 * ganztägige Termine und Zeitzonen inklusive der Windows-Namen von Outlook. */
(function (root) {
  'use strict';

  // Windows-Zeitzonen (Outlook) → IANA
  var WIN_TZ = {
    'W. Europe Standard Time': 'Europe/Berlin',
    'Central Europe Standard Time': 'Europe/Budapest',
    'Central European Standard Time': 'Europe/Warsaw',
    'Romance Standard Time': 'Europe/Paris',
    'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Atlantic/Reykjavik',
    'E. Europe Standard Time': 'Europe/Chisinau',
    'FLE Standard Time': 'Europe/Helsinki',
    'GTB Standard Time': 'Europe/Bucharest',
    'Turkey Standard Time': 'Europe/Istanbul',
    'Russian Standard Time': 'Europe/Moscow',
    'Israel Standard Time': 'Asia/Jerusalem',
    'Arabian Standard Time': 'Asia/Dubai',
    'India Standard Time': 'Asia/Kolkata',
    'China Standard Time': 'Asia/Shanghai',
    'Singapore Standard Time': 'Asia/Singapore',
    'Tokyo Standard Time': 'Asia/Tokyo',
    'AUS Eastern Standard Time': 'Australia/Sydney',
    'Eastern Standard Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver',
    'Pacific Standard Time': 'America/Los_Angeles',
    'UTC': 'UTC',
    'Coordinated Universal Time': 'UTC'
  };

  var DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function resolveZone(tzid) {
    if (!tzid) return null;
    tzid = tzid.replace(/^"|"$/g, '');
    if (WIN_TZ[tzid]) return WIN_TZ[tzid];
    if (/^[A-Za-z]+\/[A-Za-z_+\-\/]+$/.test(tzid) || tzid === 'UTC') {
      try { new Intl.DateTimeFormat('en-US', { timeZone: tzid }); return tzid; } catch (e) { }
    }
    return null; // unbekannt: als Ortszeit des Rechners behandeln
  }

  /* Wandzeit in einer Zone → UTC-Millisekunden */
  var fmtCache = {};
  function zoneOffsetMs(utcMs, zone) {
    var f = fmtCache[zone] || (fmtCache[zone] = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
    }));
    var p = {};
    f.formatToParts(new Date(utcMs)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - Math.floor(utcMs / 1000) * 1000;
  }
  function wallToUtc(w, zone) {
    if (zone === 'UTC') return Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
    if (!zone) return new Date(w.y, w.m, w.d, w.h, w.mi, w.s).getTime();
    var guess = Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
    var off = zoneOffsetMs(guess, zone);
    var t = guess - off;
    var off2 = zoneOffsetMs(t, zone);
    return off2 === off ? t : guess - off2;
  }

  // ---- Zeilen und Eigenschaften
  function unfold(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }
  function parseLine(line) {
    // NAME;PARAM=a;PARAM2="b:c":VALUE
    var i = 0, inQ = false, colon = -1;
    for (; i < line.length; i++) {
      var c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === ':' && !inQ) { colon = i; break; }
    }
    if (colon < 0) return null;
    var head = line.slice(0, colon), value = line.slice(colon + 1);
    var parts = head.split(';');
    var params = {};
    for (var j = 1; j < parts.length; j++) {
      var eq = parts[j].indexOf('=');
      if (eq > 0) params[parts[j].slice(0, eq).toUpperCase()] = parts[j].slice(eq + 1).replace(/^"|"$/g, '');
    }
    return { name: parts[0].toUpperCase(), params: params, value: value };
  }
  function unescapeText(v) {
    return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  }

  /* Datum/Zeit-Wert → {wall, zone, allDay, utc} */
  function parseDate(prop) {
    if (!prop) return null;
    var v = prop.value.trim();
    var m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    var wall = { y: +m[1], m: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
    var allDay = !m[4] || prop.params.VALUE === 'DATE';
    var zone = m[7] ? 'UTC' : resolveZone(prop.params.TZID);
    return { wall: wall, zone: allDay ? null : zone, allDay: allDay };
  }
  function toMs(dt) { return wallToUtc(dt.wall, dt.zone); }

  function parseDuration(v) {
    var m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
    if (!m) return 0;
    var ms = (+(m[2] || 0) * 7 * 864e5) + (+(m[3] || 0) * 864e5) + (+(m[4] || 0) * 36e5) + (+(m[5] || 0) * 6e4) + (+(m[6] || 0) * 1e3);
    return m[1] === '-' ? -ms : ms;
  }

  function parseRule(v) {
    var r = {};
    v.split(';').forEach(function (kv) { var p = kv.split('='); if (p.length === 2) r[p[0].toUpperCase()] = p[1]; });
    return r;
  }

  // ---- Wandzeit-Kalenderrechnung (ohne Zeitzone)
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function weekday(y, m, d) { return new Date(Date.UTC(y, m, d)).getUTCDay(); }
  function addDaysWall(w, n) {
    var t = new Date(Date.UTC(w.y, w.m, w.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), h: w.h, mi: w.mi, s: w.s };
  }
  function cmpWall(a, b) {
    return (a.y - b.y) || (a.m - b.m) || (a.d - b.d) || (a.h - b.h) || (a.mi - b.mi) || (a.s - b.s);
  }

  /* Tage eines Monats, die zu BYDAY (mit Ordinal) / BYMONTHDAY / BYSETPOS passen */
  function monthDays(y, m, rule, dtWall) {
    var dim = daysInMonth(y, m);
    var days = [];
    if (rule.BYMONTHDAY) {
      rule.BYMONTHDAY.split(',').forEach(function (x) {
        var n = +x; var d = n > 0 ? n : dim + n + 1;
        if (d >= 1 && d <= dim) days.push(d);
      });
    } else if (rule.BYDAY) {
      rule.BYDAY.split(',').forEach(function (tok) {
        var mm = tok.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
        if (!mm) return;
        var wd = DAY[mm[2]];
        var all = [];
        for (var d = 1; d <= dim; d++) if (weekday(y, m, d) === wd) all.push(d);
        if (mm[1]) {
          var n = +mm[1];
          var pick = n > 0 ? all[n - 1] : all[all.length + n];
          if (pick) days.push(pick);
        } else days = days.concat(all);
      });
    } else {
      if (dtWall.d <= dim) days.push(dtWall.d);
    }
    days = days.filter(function (d, i, a) { return a.indexOf(d) === i; }).sort(function (a, b) { return a - b; });
    if (rule.BYSETPOS) {
      var sel = [];
      rule.BYSETPOS.split(',').forEach(function (x) {
        var n = +x; var d = n > 0 ? days[n - 1] : days[days.length + n];
        if (d) sel.push(d);
      });
      days = sel.sort(function (a, b) { return a - b; });
    }
    return days;
  }

  /* Startzeitpunkte (Wandzeit) einer Serie bis `untilMs`, max. `limit` Stück */
  function expandRule(dt, rule, fromMs, untilMs, limit) {
    var freq = rule.FREQ;
    var interval = Math.max(1, +(rule.INTERVAL || 1));
    var count = rule.COUNT ? +rule.COUNT : Infinity;
    var until = null;
    if (rule.UNTIL) {
      var u = parseDate({ value: rule.UNTIL, params: {} });
      if (u) until = u.allDay ? wallToUtc({ y: u.wall.y, m: u.wall.m, d: u.wall.d, h: 23, mi: 59, s: 59 }, dt.zone) : wallToUtc(u.wall, u.zone || dt.zone);
    }
    var start = dt.wall;
    var out = [];
    var produced = 0, guard = 0;
    function emit(w) {
      if (cmpWall(w, start) < 0) return true;
      var ms = wallToUtc(w, dt.zone);
      if (until !== null && ms > until) return false;
      if (ms > untilMs) return false;
      if (produced >= count) return false;
      produced++;
      // Vorkommen weit vor dem Zeitraum zählen (für COUNT), aber nicht sammeln
      if (ms >= fromMs - 864e5) out.push(w);
      return out.length < limit;
    }
    var go = true;
    if (freq === 'DAILY') {
      var byday = rule.BYDAY ? rule.BYDAY.split(',').map(function (x) { return DAY[x.slice(-2)]; }) : null;
      for (var i = 0; go && guard < 20000; i += interval, guard++) {
        var w = addDaysWall(start, i);
        if (byday && byday.indexOf(weekday(w.y, w.m, w.d)) < 0) continue;
        go = emit(w);
      }
    } else if (freq === 'WEEKLY') {
      var days = rule.BYDAY ? rule.BYDAY.split(',').map(function (x) { return DAY[x.slice(-2)]; }) : [weekday(start.y, start.m, start.d)];
      var wkst = DAY[rule.WKST || 'MO'];
      var sw = weekday(start.y, start.m, start.d);
      var weekStart = addDaysWall(start, -((sw - wkst + 7) % 7));
      var order = days.map(function (d) { return (d - wkst + 7) % 7; }).sort(function (a, b) { return a - b; });
      for (var k = 0; go && guard < 5000; k += interval, guard++) {
        for (var j = 0; go && j < order.length; j++) go = emit(addDaysWall(weekStart, k * 7 + order[j]));
      }
    } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
      var y = start.y, mo = start.m;
      var months = rule.BYMONTH ? rule.BYMONTH.split(',').map(function (x) { return +x - 1; }) : [start.m];
      for (; go && guard < 3000; guard++) {
        var targetMonths = freq === 'MONTHLY' ? [mo] : months;
        for (var t = 0; go && t < targetMonths.length; t++) {
          var md = monthDays(y, targetMonths[t], rule, start);
          for (var q = 0; go && q < md.length; q++) go = emit({ y: y, m: targetMonths[t], d: md[q], h: start.h, mi: start.mi, s: start.s });
        }
        if (freq === 'MONTHLY') { mo += interval; while (mo > 11) { mo -= 12; y++; } }
        else y += interval;
      }
    } else {
      emit(start);
    }
    return out;
  }

  function busyState(ev) {
    var b = (ev.props['X-MICROSOFT-CDO-BUSYSTATUS'] || {}).value;
    if (b) {
      b = b.toUpperCase();
      if (b === 'FREE') return 'free';
      if (b === 'TENTATIVE') return 'tentative';
      if (b === 'OOF') return 'oof';
      if (b === 'WORKINGELSEWHERE') return 'free';
      return 'busy';
    }
    var tr = (ev.props.TRANSP || {}).value;
    if (tr && tr.toUpperCase() === 'TRANSPARENT') return 'free';
    var st = (ev.props.STATUS || {}).value;
    if (st && st.toUpperCase() === 'TENTATIVE') return 'tentative';
    return 'busy';
  }

  /* Hauptfunktion: liefert Termine im Zeitraum [fromMs, toMs] */
  function parse(text, winFrom, winTo) {
    var lines = unfold(String(text || ''));
    var events = [], cur = null, depth = 0, calName = '';
    lines.forEach(function (raw) {
      if (!raw) return;
      var p = parseLine(raw);
      if (!p) return;
      if (p.name === 'BEGIN') {
        if (p.value === 'VEVENT') { cur = { props: {}, exdates: [] }; depth = 0; }
        else if (cur) depth++;
        return;
      }
      if (p.name === 'END') {
        if (p.value === 'VEVENT' && cur) { events.push(cur); cur = null; }
        else if (cur) depth--;
        return;
      }
      if (!cur) { if (p.name === 'X-WR-CALNAME') calName = unescapeText(p.value); return; }
      if (depth > 0) return; // z. B. VALARM
      if (p.name === 'EXDATE') {
        p.value.split(',').forEach(function (v) { cur.exdates.push({ value: v, params: p.params }); });
      } else if (!cur.props[p.name]) cur.props[p.name] = p;
    });

    var overrides = {}; // uid -> {recurMs: ev}
    var masters = [];
    events.forEach(function (ev) {
      if (ev.props['RECURRENCE-ID']) {
        var uid = (ev.props.UID || {}).value || '';
        var rid = parseDate(ev.props['RECURRENCE-ID']);
        if (rid) (overrides[uid] = overrides[uid] || {})[toMs(rid)] = ev;
      } else masters.push(ev);
    });

    var out = [];
    function pushOcc(ev, startMs, endMs, allDay, wall, endWall) {
      var status = (ev.props.STATUS || {}).value;
      if (status && status.toUpperCase() === 'CANCELLED') return;
      if (endMs < winFrom || startMs > winTo) return;
      var title = unescapeText((ev.props.SUMMARY || {}).value || '(ohne Titel)');
      var item = {
        id: ((ev.props.UID || {}).value || title) + '@' + startMs,
        title: title,
        location: unescapeText((ev.props.LOCATION || {}).value || ''),
        allDay: allDay,
        busy: busyState(ev),
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString()
      };
      if (allDay) {
        item.startDay = wall.y + '-' + pad(wall.m + 1) + '-' + pad(wall.d);
        item.endDay = endWall.y + '-' + pad(endWall.m + 1) + '-' + pad(endWall.d); // exklusiv
      }
      out.push(item);
    }

    masters.forEach(function (ev) {
      var dt = parseDate(ev.props.DTSTART);
      if (!dt) return;
      var startMs0 = toMs(dt);
      var dtEnd = parseDate(ev.props.DTEND);
      var durMs;
      if (dtEnd) durMs = toMs(dtEnd) - startMs0;
      else if (ev.props.DURATION) durMs = parseDuration(ev.props.DURATION.value);
      else durMs = dt.allDay ? 864e5 : 0;
      var durDays = dt.allDay ? Math.max(1, Math.round(durMs / 864e5)) : 0;
      var uid = (ev.props.UID || {}).value || '';
      var ov = overrides[uid] || {};

      var starts;
      if (ev.props.RRULE) {
        starts = expandRule(dt, parseRule(ev.props.RRULE.value), winFrom - durMs, winTo, 2000);
        var ex = {};
        ev.exdates.forEach(function (e) {
          var d = parseDate(e);
          if (!d) return;
          if (d.allDay && !dt.allDay) ex[d.wall.y * 1e4 + d.wall.m * 100 + d.wall.d] = true;
          else ex[wallToUtc(d.wall, d.allDay || !e.params.TZID && !/Z$/.test(e.value) ? dt.zone : d.zone)] = true;
        });
        starts = starts.filter(function (w) {
          var ms = wallToUtc(w, dt.zone);
          return !ex[ms] && !ex[w.y * 1e4 + w.m * 100 + w.d];
        });
      } else starts = [dt.wall];

      starts.forEach(function (w) {
        var sMs = wallToUtc(w, dt.zone);
        if (ov[sMs]) return; // wird unten als Einzeltermin eingefügt
        if (dt.allDay) pushOcc(ev, sMs, wallToUtc(addDaysWall(w, durDays), null), true, w, addDaysWall(w, durDays));
        else pushOcc(ev, sMs, sMs + durMs, false);
      });
    });

    // Geänderte Einzeltermine
    Object.keys(overrides).forEach(function (uid) {
      Object.keys(overrides[uid]).forEach(function (k) {
        var ev = overrides[uid][k];
        var dt = parseDate(ev.props.DTSTART);
        if (!dt) return;
        var s = toMs(dt);
        var de = parseDate(ev.props.DTEND);
        var e = de ? toMs(de) : (ev.props.DURATION ? s + parseDuration(ev.props.DURATION.value) : s);
        if (dt.allDay) {
          var days = Math.max(1, Math.round((e - s) / 864e5));
          pushOcc(ev, s, wallToUtc(addDaysWall(dt.wall, days), null), true, dt.wall, addDaysWall(dt.wall, days));
        } else pushOcc(ev, s, e, false);
      });
    });

    out.sort(function (a, b) { return a.start.localeCompare(b.start); });
    return { name: calName, events: out, total: events.length };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var api = { parse: parse, wallToUtc: wallToUtc, resolveZone: resolveZone };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.K = root.K || {}).ics = api;
})(typeof window !== 'undefined' ? window : this);
