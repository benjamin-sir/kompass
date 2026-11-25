/* Kompass – Datenhaltung.
 * Alles liegt im localStorage dieses Browsers. Jeder Datensatz hat id,
 * createdAt, updatedAt und (beim Löschen) deletedAt, damit später ein Sync
 * zwischen Geräten nachgerüstet werden kann, ohne das Modell umzubauen. */
(function (K) {
  'use strict';

  var KEY = 'kompass.v1';
  var SCHEMA = 1;
  var listeners = [];
  var state = null;
  var saveError = null;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function nowIso() { return new Date().toISOString(); }

  function dayKey(d) {
    d = d ? new Date(d) : new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addWorkdays(d, n) {
    var x = new Date(d);
    while (n > 0) { x.setDate(x.getDate() + 1); if (x.getDay() !== 0 && x.getDay() !== 6) n--; }
    return x;
  }

  // Farben in fester Reihenfolge, geprüft auf Unterscheidbarkeit (auch bei Farbsehschwäche)
  var AREA_COLORS = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647'];
  var OLD_DEFAULTS = ['#4f7cac', '#3f9a8a', '#b5793a', '#8a63b8', '#7a8490'];
  var DEFAULT_AREAS = [
    ['Produktziel & Roadmap', AREA_COLORS[0], 6],
    ['Backlog & Refinement', AREA_COLORS[1], 4],
    ['Stakeholder', AREA_COLORS[2], null],
    ['Team', AREA_COLORS[3], null],
    ['Admin & Orga', AREA_COLORS[4], null]
  ];

  function emptyCalendar() {
    return { url: '', source: '', name: '', events: [], syncedAt: null, error: null };
  }

  function emptyState() {
    var t = nowIso();
    return {
      schema: SCHEMA,
      createdAt: t,
      tasks: [],
      areas: DEFAULT_AREAS.map(function (a, i) {
        return { id: uid(), name: a[0], color: a[1], weeklyTarget: a[2], order: i, createdAt: t, updatedAt: t };
      }),
      timeEntries: [],
      blocks: [],
      weeks: {},
      calendar: emptyCalendar(),
      activeTimer: null,
      settings: { theme: 'system', dailyFocusTarget: 3, jiraBase: '', workStart: '08:00', workEnd: '17:00', showWeekend: false, lastBackupAt: null, backupSnoozedUntil: null }
    };
  }

  function newTask(fields) {
    var t = nowIso();
    var task = {
      id: uid(), title: '', notes: '', url: '', source: '', sourceKey: '',
      list: 'inbox', areaId: null, person: '', followUp: null,
      done: false, doneAt: null, order: 0, example: false,
      listChangedAt: t, createdAt: t, updatedAt: t, deletedAt: null
    };
    for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) task[k] = fields[k];
    return task;
  }

  function seedExamples(s) {
    var area = function (i) { return s.areas[i] ? s.areas[i].id : null; };
    var today = new Date();
    var ex = [
      { title: 'Akzeptanzkriterien für den CSV-Export schärfen', list: 'inbox', url: 'https://deinefirma.atlassian.net/browse/SHOP-142', source: 'jira', sourceKey: 'SHOP-142' },
      { title: 'Frage aus dem Vertrieb zum Release-Termin beantworten', list: 'inbox', url: 'https://teams.microsoft.com/l/message/19:beispiel/1700000000000', source: 'teams' },
      { title: 'Sprint-Ziel für das Review vorbereiten', list: 'today', areaId: area(0) },
      { title: 'Roadmap Q1 auf Confluence aktualisieren', list: 'today', areaId: area(0), url: 'https://deinefirma.atlassian.net/wiki/spaces/PROD/pages/123456/Roadmap+Q1', source: 'confluence' },
      { title: 'Rückmeldung an den Einkauf zu Lizenzkosten', list: 'today', areaId: area(2), source: 'mail' },
      { title: 'Top-5-Stories für das nächste Refinement auswählen', list: 'week', areaId: area(1) },
      { title: 'Stakeholder-Map aktualisieren', list: 'later', areaId: area(2) },
      { title: 'Freigabe für das Nutzungs-Tracking', list: 'waiting', person: 'Datenschutz-Team', followUp: dayKey(addDays(today, -1)), areaId: area(2) },
      { title: 'Grobschätzung API-Anbindung', list: 'waiting', person: 'Dev-Team', followUp: dayKey(addWorkdays(today, 2)), areaId: area(1), url: 'https://deinefirma.atlassian.net/browse/SHOP-155', source: 'jira', sourceKey: 'SHOP-155' },
      { title: 'Priorität des Login-Bugs auf Mobile klären', list: 'agenda', person: 'Tech Lead', areaId: area(1) },
      { title: 'Feedback zur neuen Story-Vorlage einholen', list: 'agenda', person: 'Team-Retro', areaId: area(3) }
    ];
    ex.forEach(function (f, i) {
      f.example = true; f.order = i;
      s.tasks.push(newTask(f));
    });
    var doneTask = newTask({ title: 'Release Notes 4.2 abgestimmt', list: 'today', done: true, doneAt: nowIso(), example: true, areaId: area(0) });
    s.tasks.push(doneTask);
    var start = new Date(); start.setHours(Math.max(0, start.getHours() - 2), 5, 0, 0);
    var end = new Date(start.getTime() + 50 * 60000);
    if (end > new Date()) { start = new Date(Date.now() - 55 * 60000); end = new Date(Date.now() - 5 * 60000); }
    s.timeEntries.push({ id: uid(), taskId: doneTask.id, start: start.toISOString(), end: end.toISOString(), example: true, createdAt: nowIso(), updatedAt: nowIso() });

    // Beispiel-Termine, wie sie aus Outlook kämen, und zwei eingeplante Blöcke
    var at = function (dayOffset, h, m) { var d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d; };
    var evs = [];
    for (var off = -3; off <= 10; off++) {
      var wd = at(off, 0, 0).getDay();
      if (wd === 0 || wd === 6) continue;
      evs.push(['Daily Standup', off, 9, 15, 15, 'busy', '']);
      if (wd === 1) evs.push(['Wochenplanung PO-Team', off, 10, 0, 60, 'busy', '']);
      if (wd === 2) { evs.push(['Refinement Team Shop', off, 13, 0, 90, 'busy', 'Raum 4.12']); evs.push(['1:1 Tech Lead', off, 16, 0, 30, 'busy', '']); }
      if (wd === 3) { evs.push(['Stakeholder-Sync Vertrieb', off, 11, 0, 60, 'busy', 'Teams']); evs.push(['Sprint Review', off, 14, 0, 60, 'busy', '']); evs.push(['Architektur-Runde', off, 15, 30, 60, 'tentative', '']); }
      if (wd === 4) evs.push(['Lunch & Learn', off, 12, 0, 60, 'free', '']);
      if (wd === 5) evs.push(['Retro', off, 13, 0, 60, 'busy', '']);
    }
    s.calendar = emptyCalendar();
    s.calendar.source = 'example';
    s.calendar.name = 'Beispielkalender';
    s.calendar.syncedAt = nowIso();
    s.calendar.events = evs.map(function (e) {
      var st = at(e[1], e[2], e[3]);
      return { id: 'ex-' + e[0] + st.getTime(), title: e[0], location: e[6], allDay: false, busy: e[5], start: st.toISOString(), end: new Date(st.getTime() + e[4] * 6e4).toISOString() };
    });
    var mon = new Date(); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
    s.weeks[dayKey(mon)] = { goals: [
      { id: uid(), text: 'Release 4.3 mit Vertrieb abstimmen', done: true },
      { id: uid(), text: 'Backlog für Q1 auf 20 Stories priorisieren', done: false }
    ], checks: {}, note: '', example: true };
    // Fokuszeit der letzten Tage, damit der Rückblick etwas zeigt
    var exTasks = s.tasks.filter(function (t) { return t.example && t.areaId; });
    for (var back = 1; back <= 4; back++) {
      var dd = at(-back, 0, 0); if (dd.getDay() === 0 || dd.getDay() === 6) continue;
      [[9, 40, 70], [14, 0, 45], [16, 30, 35]].forEach(function (slot, k) {
        var tk = exTasks[(back + k) % exTasks.length];
        var st = at(-back, slot[0], slot[1]);
        s.timeEntries.push({ id: uid(), taskId: tk.id, start: st.toISOString(), end: new Date(st.getTime() + slot[2] * 6e4).toISOString(), example: true, createdAt: nowIso(), updatedAt: nowIso() });
      });
    }
    var planned = s.tasks.filter(function (t) { return t.list === 'today' && !t.done; });
    if (planned[0]) s.blocks.push(newBlock(planned[0].id, at(0, 10, 30), at(0, 11, 30), true));
    if (planned[1]) s.blocks.push(newBlock(planned[1].id, at(0, 15, 0), at(0, 15, 45), true));
  }

  function newBlock(taskId, start, end, example) {
    var t = nowIso();
    return { id: uid(), taskId: taskId, start: new Date(start).toISOString(), end: new Date(end).toISOString(), example: !!example, createdAt: t, updatedAt: t, deletedAt: null };
  }

  function migrate(s) {
    var base = emptyState();
    if (!s || typeof s !== 'object') return base;
    s.schema = SCHEMA;
    s.tasks = Array.isArray(s.tasks) ? s.tasks : [];
    s.areas = Array.isArray(s.areas) ? s.areas : base.areas;
    s.timeEntries = Array.isArray(s.timeEntries) ? s.timeEntries : [];
    s.blocks = Array.isArray(s.blocks) ? s.blocks : [];
    s.weeks = s.weeks && typeof s.weeks === 'object' ? s.weeks : {};
    s.areas.forEach(function (a) {
      var i = OLD_DEFAULTS.indexOf(String(a.color).toLowerCase());
      if (i >= 0) a.color = AREA_COLORS[i];
      if (a.weeklyTarget === undefined) a.weeklyTarget = null;
    });
    s.calendar = Object.assign(emptyCalendar(), s.calendar || {});
    if (!Array.isArray(s.calendar.events)) s.calendar.events = [];
    s.settings = Object.assign({}, base.settings, s.settings || {});
    if (!s.createdAt) s.createdAt = nowIso();
    if (s.activeTimer === undefined) s.activeTimer = null;
    s.tasks = s.tasks.map(function (t) { return newTask(t); });
    // Gelöschte Einträge nach 30 Tagen endgültig entfernen
    var cutoff = Date.now() - 30 * 864e5;
    s.tasks = s.tasks.filter(function (t) { return !t.deletedAt || new Date(t.deletedAt).getTime() > cutoff; });
    return s;
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* defekte oder gesperrte Daten: neu anfangen */ }
    var s = emptyState();
    seedExamples(s);
    return s;
  }

  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      saveError = null;
    } catch (e) {
      saveError = e;
    }
  }

  function emit() { listeners.forEach(function (fn) { fn(state); }); }

  var store = {
    load: function () { state = read(); write(); return state; },
    get state() { return state; },
    get saveError() { return saveError; },
    subscribe: function (fn) { listeners.push(fn); },
    commit: function () { write(); emit(); },
    persist: function () { write(); },
    snapshot: function () { return JSON.stringify(state); },
    restore: function (snap) { state = migrate(JSON.parse(snap)); write(); emit(); },
    replace: function (data) { state = migrate(data); write(); emit(); },
    reset: function () { state = emptyState(); write(); emit(); },
    reloadFromStorage: function () {
      try { var raw = localStorage.getItem(KEY); if (raw) { state = migrate(JSON.parse(raw)); emit(); } } catch (e) { }
    },

    // ---- Aufgaben ----
    tasks: function () { return state.tasks.filter(function (t) { return !t.deletedAt; }); },
    task: function (id) { return state.tasks.find(function (t) { return t.id === id && !t.deletedAt; }) || null; },
    openIn: function (list) {
      return store.tasks().filter(function (t) { return !t.done && t.list === list; })
        .sort(function (a, b) { return a.order - b.order || a.createdAt.localeCompare(b.createdAt); });
    },
    addTask: function (fields, position) {
      var list = fields.list || 'inbox';
      var peers = store.openIn(list);
      var order = 0;
      if (peers.length) {
        order = position === 'top'
          ? peers[0].order - 1
          : peers[peers.length - 1].order + 1;
      }
      var t = newTask(Object.assign({}, fields, { list: list, order: order }));
      state.tasks.push(t);
      store.commit();
      return t;
    },
    updateTask: function (id, fields) {
      var t = store.task(id);
      if (!t) return null;
      if (fields.list && fields.list !== t.list) {
        var peers = store.openIn(fields.list);
        fields.order = peers.length ? peers[peers.length - 1].order + 1 : 0;
        fields.listChangedAt = nowIso();
      }
      Object.assign(t, fields, { updatedAt: nowIso() });
      store.commit();
      return t;
    },
    setDone: function (id, done) {
      var t = store.task(id);
      if (!t) return;
      if (done && state.activeTimer && state.activeTimer.taskId === id) store.stopTimer(true);
      t.done = done;
      t.doneAt = done ? nowIso() : null;
      t.updatedAt = nowIso();
      store.commit();
    },
    deleteTask: function (id) {
      var t = store.task(id);
      if (!t) return;
      if (state.activeTimer && state.activeTimer.taskId === id) store.stopTimer(true);
      t.deletedAt = nowIso(); t.updatedAt = t.deletedAt;
      store.commit();
    },
    reorder: function (list, orderedIds) {
      orderedIds.forEach(function (id, i) {
        var t = store.task(id);
        if (t && t.order !== i) { t.order = i; t.updatedAt = nowIso(); }
      });
      store.commit();
    },
    removeExamples: function () {
      state.tasks = state.tasks.filter(function (t) { return !t.example; });
      state.timeEntries = state.timeEntries.filter(function (e) { return !e.example; });
      state.blocks = state.blocks.filter(function (b) { return !b.example; });
      if (state.calendar.source === 'example') state.calendar = emptyCalendar();
      Object.keys(state.weeks).forEach(function (k) { if (state.weeks[k].example) delete state.weeks[k]; });
      if (state.activeTimer && !store.task(state.activeTimer.taskId)) state.activeTimer = null;
      store.commit();
    },
    hasExamples: function () { return store.tasks().some(function (t) { return t.example; }); },
    people: function () {
      var seen = {};
      store.tasks().forEach(function (t) { if (t.person) seen[t.person] = true; });
      return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'de'); });
    },

    // ---- Bereiche ----
    areas: function () { return state.areas.slice().sort(function (a, b) { return a.order - b.order; }); },
    area: function (id) { return state.areas.find(function (a) { return a.id === id; }) || null; },
    addArea: function (name, color) {
      var t = nowIso();
      state.areas.push({ id: uid(), name: name, color: color || '#7a8490', order: state.areas.length, createdAt: t, updatedAt: t });
      store.commit();
    },
    updateArea: function (id, fields) {
      var a = store.area(id); if (!a) return;
      Object.assign(a, fields, { updatedAt: nowIso() });
      store.commit();
    },
    deleteArea: function (id) {
      state.areas = state.areas.filter(function (a) { return a.id !== id; });
      state.tasks.forEach(function (t) { if (t.areaId === id) { t.areaId = null; t.updatedAt = nowIso(); } });
      store.commit();
    },

    // ---- Zeiterfassung ----
    startTimer: function (taskId) {
      if (state.activeTimer) store.stopTimer(true);
      state.activeTimer = { taskId: taskId, start: nowIso() };
      store.commit();
    },
    stopTimer: function (silent) {
      var a = state.activeTimer;
      if (!a) return;
      var end = nowIso();
      if (new Date(end) - new Date(a.start) >= 5000) {
        state.timeEntries.push({ id: uid(), taskId: a.taskId, start: a.start, end: end, createdAt: end, updatedAt: end });
      }
      state.activeTimer = null;
      if (!silent) store.commit();
    },
    secondsOnDay: function (day) {
      var from = new Date(day + 'T00:00:00').getTime(), to = from + 864e5;
      var sum = 0;
      var add = function (s, e) {
        var a = Math.max(from, s), b = Math.min(to, e);
        if (b > a) sum += (b - a) / 1000;
      };
      state.timeEntries.forEach(function (e) { add(new Date(e.start).getTime(), new Date(e.end).getTime()); });
      if (state.activeTimer) add(new Date(state.activeTimer.start).getTime(), Date.now());
      return sum;
    },
    secondsOnTask: function (taskId) {
      var sum = 0;
      state.timeEntries.forEach(function (e) { if (e.taskId === taskId) sum += (new Date(e.end) - new Date(e.start)) / 1000; });
      if (state.activeTimer && state.activeTimer.taskId === taskId) sum += (Date.now() - new Date(state.activeTimer.start)) / 1000;
      return sum;
    },

    // ---- Zeitblöcke im Kalender ----
    blocks: function () {
      return state.blocks.filter(function (b) { return !b.deletedAt && store.task(b.taskId); });
    },
    blocksBetween: function (fromMs, toMs) {
      return store.blocks().filter(function (b) { return new Date(b.end).getTime() > fromMs && new Date(b.start).getTime() < toMs; })
        .sort(function (a, b) { return a.start.localeCompare(b.start); });
    },
    blocksOfTask: function (taskId) { return store.blocks().filter(function (b) { return b.taskId === taskId; }); },
    block: function (id) { return state.blocks.find(function (b) { return b.id === id && !b.deletedAt; }) || null; },
    addBlock: function (taskId, startMs, endMs) {
      var b = newBlock(taskId, startMs, endMs, false);
      state.blocks.push(b);
      store.commit();
      return b;
    },
    updateBlock: function (id, startMs, endMs) {
      var b = store.block(id); if (!b) return;
      b.start = new Date(startMs).toISOString(); b.end = new Date(endMs).toISOString(); b.updatedAt = nowIso();
      store.commit();
    },
    deleteBlock: function (id) {
      var b = store.block(id); if (!b) return;
      b.deletedAt = nowIso(); b.updatedAt = b.deletedAt;
      store.commit();
    },

    // ---- Outlook-Kalender (nur lesend) ----
    eventsBetween: function (fromMs, toMs) {
      return state.calendar.events.filter(function (e) { return new Date(e.end).getTime() > fromMs && new Date(e.start).getTime() < toMs; });
    },
    setCalendar: function (fields) { Object.assign(state.calendar, fields); store.commit(); },
    clearCalendar: function () { state.calendar = emptyCalendar(); store.commit(); },

    // ---- Wochen: Wochenfokus, Abschluss-Checkliste, Notiz ----
    week: function (monday) {
      return state.weeks[monday] || { goals: [], checks: {}, note: '' };
    },
    updateWeek: function (monday, fn) {
      var w = state.weeks[monday] || (state.weeks[monday] = { goals: [], checks: {}, note: '' });
      fn(w);
      w.updatedAt = nowIso();
      store.commit();
    },
    persistWeekNote: function (monday, note) {
      var w = state.weeks[monday] || (state.weeks[monday] = { goals: [], checks: {}, note: '' });
      w.note = note; w.updatedAt = nowIso();
      write();
    },
    nextAreaColor: function () { return AREA_COLORS[state.areas.length % AREA_COLORS.length]; },

    // ---- Einstellungen ----
    setSetting: function (k, v) { state.settings[k] = v; store.commit(); }
  };

  K.util = { uid: uid, dayKey: dayKey, addDays: addDays, addWorkdays: addWorkdays, nowIso: nowIso };
  K.store = store;
})(window.K = window.K || {});
