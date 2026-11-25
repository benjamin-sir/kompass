/* Kompass – Oberfläche */
(function (K) {
  'use strict';

  var S = K.store, L = K.links, U = K.util;

  // ------------------------------------------------------------------ Hilfen
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    var mm = (m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }
  function fmtDur(sec) {
    var min = Math.round(sec / 60);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), r = min % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }
  function fmtHours(sec) { return (sec / 3600).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }); }
  function longDate(d) { return new Date(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function shortDate(day) { return new Date(day + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }); }
  function daysBetween(dayA, dayB) { return Math.round((new Date(dayB + 'T12:00:00') - new Date(dayA + 'T12:00:00')) / 864e5); }
  function isTyping(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  var MOD = isMac ? '⌘' : 'Strg';

  // ------------------------------------------------------------------ Ansichten
  var VIEWS = [
    { id: 'inbox', label: 'Inbox', key: '1', list: 'inbox', hint: 'Alles, was reinkommt. Einmal am Tag sortieren.' },
    { id: 'heute', label: 'Heute', key: '2', list: 'today' },
    { id: 'plan', label: 'Plan', key: '3' },
    { id: 'kalender', label: 'Kalender', key: '4' },
    { id: 'woche', label: 'Diese Woche', key: '5', list: 'week', hint: 'Steht an, aber nicht heute. Aufgaben mit Datum rücken am Tag selbst auf „Heute“.' },
    { id: 'spaeter', label: 'Später', key: '6', list: 'later', hint: 'Irgendwann oder ab nächster Woche. Einmal pro Woche durchsehen.' },
    { id: 'warten', label: 'Warten auf', key: '7', list: 'waiting', hint: 'Liegt bei jemand anderem. Mit Datum, wann du nachfasst.' },
    { id: 'agenda', label: 'Agenda', key: '8', list: 'agenda', hint: 'Themen, die du im nächsten Gespräch mit dieser Person ansprichst.' },
    { id: 'erledigt', label: 'Erledigt', key: '9' },
    { id: 'rueckblick', label: 'Rückblick', key: '0' }
  ];
  var LIST_LABEL = { inbox: 'Inbox', today: 'Heute', week: 'Diese Woche', later: 'Später', waiting: 'Warten auf', agenda: 'Agenda' };
  var TRIAGE = [
    { list: 'today', key: 'H', label: 'Heute' },
    { list: 'week', key: 'W', label: 'Woche' },
    { list: 'later', key: 'S', label: 'Später' },
    { list: 'waiting', key: 'A', label: 'Warten' },
    { list: 'agenda', key: 'G', label: 'Agenda' }
  ];
  function viewById(id) { return VIEWS.find(function (v) { return v.id === id; }); }

  var ui = {
    view: 'heute',
    prevView: 'heute',
    selectedId: null,
    focusTaskId: null,
    modal: null,          // {type, ...}
    palette: null,        // {q, idx}
    showDoneToday: false,
    weekStart: null,      // Montag der angezeigten Kalenderwoche
    reviewWeek: null,     // Montag der Woche im Rückblick
    planFilter: null,     // Bereich, nach dem die Plan-Ansicht filtert
    planFilterOpen: false,
    planShowDone: false
  };

  // ------------------------------------------------------------------ Theme
  function applyTheme() {
    var t = S.state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  // ------------------------------------------------------------------ Toasts
  function toast(text, undoSnap) {
    var root = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span>' + esc(text) + '</span>' + (undoSnap ? '<button type="button" class="toast-undo">Rückgängig</button>' : '');
    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstChild);
    var timer = setTimeout(function () { el.remove(); }, undoSnap ? 7000 : 3500);
    if (undoSnap) {
      el.querySelector('.toast-undo').addEventListener('click', function () {
        clearTimeout(timer); el.remove(); S.restore(undoSnap); toast('Rückgängig gemacht');
      });
    }
  }

  // ------------------------------------------------------------------ Bausteine
  function sourceChip(t) {
    if (!t.source && !t.url) return '';
    var src = L.SOURCES[t.source] || L.SOURCES.web;
    var label = t.sourceKey && t.sourceKey !== t.title ? src.label + ' ' + t.sourceKey : src.label;
    var cls = 'chip src src-' + esc(t.source || 'web');
    if (t.url) return '<a class="' + cls + '" href="' + esc(t.url) + '" target="_blank" rel="noopener" title="Quelle öffnen">' + esc(label) + ' ↗</a>';
    return '<span class="' + cls + '">' + esc(label) + '</span>';
  }
  function areaChip(t) {
    var a = t.areaId && S.area(t.areaId);
    if (!a) return '';
    return '<span class="chip area"><i class="dot" style="background:' + esc(a.color) + '"></i>' + esc(a.name) + '</span>';
  }
  function followChip(t) {
    if (t.list !== 'waiting' || !t.followUp) return '';
    var diff = daysBetween(U.dayKey(), t.followUp);
    var cls = 'chip follow', txt;
    if (diff < 0) { cls += ' is-late'; txt = 'Nachfassen seit ' + (-diff) + (diff === -1 ? ' Tag' : ' Tagen'); }
    else if (diff === 0) { cls += ' is-due'; txt = 'Heute nachfassen'; }
    else txt = 'Nachfassen ' + shortDate(t.followUp);
    return '<span class="' + cls + '">' + esc(txt) + '</span>';
  }
  function ageChip(t) {
    if (t.list !== 'today' || t.done) return '';
    var d = daysBetween(U.dayKey(t.listChangedAt), U.dayKey());
    if (d < 1) return '';
    return '<span class="chip age" title="Seit ' + d + (d === 1 ? ' Tag' : ' Tagen') + ' auf Heute">seit ' + esc(shortDate(U.dayKey(t.listChangedAt))) + '</span>';
  }
  function timeChip(t) {
    var sec = S.secondsOnTask(t.id);
    var running = S.state.activeTimer && S.state.activeTimer.taskId === t.id;
    if (!sec && !running) return '';
    return '<span class="chip time' + (running ? ' is-running' : '') + '"' + (running ? ' data-timer="task" data-task="' + esc(t.id) + '"' : '') + '>' + (running ? fmtClock(sec) : fmtDur(sec)) + '</span>';
  }

  function blockChip(t) {
    if (t.done) return '';
    var today = U.dayKey();
    var bs = S.blocksOfTask(t.id).filter(function (b) { return b.end >= new Date().toISOString() || U.dayKey(b.start) === today; })
      .sort(function (a, b) { return a.start.localeCompare(b.start); });
    if (!bs.length) return '';
    var b = bs[0];
    var day = U.dayKey(b.start);
    var label = (day === today ? '' : shortDate(day) + ' ') + K.cal.hm(new Date(b.start).getTime());
    return '<button type="button" class="chip block" data-act="block-open" data-block="' + esc(b.id) + '" title="Eingeplant">◷ ' + esc(label) + (bs.length > 1 ? ' +' + (bs.length - 1) : '') + '</button>';
  }

  function planChip(t) {
    var out = '';
    if (!t.done && t.planDate && t.planDate > U.dayKey()) out += '<span class="chip plan" title="Geplant für">' + esc(shortDate(t.planDate)) + '</span>';
    if (t.repeat) out += '<span class="chip rep" title="' + esc(U.REPEATS[t.repeat] || '') + '">↻ ' + esc(U.REPEATS[t.repeat] || '') + '</span>';
    return out;
  }

  function taskRow(t, opts) {
    opts = opts || {};
    var running = S.state.activeTimer && S.state.activeTimer.taskId === t.id;
    var sel = ui.selectedId === t.id;
    var meta = [blockChip(t), planChip(t), areaChip(t), sourceChip(t), opts.hidePerson ? '' : (t.person && !opts.hidePerson ? '<span class="chip person">' + esc(t.person) + '</span>' : ''), followChip(t), ageChip(t), timeChip(t), t.example ? '<span class="chip example">Beispiel</span>' : ''].join('');
    var actions = '';
    if (!t.done) {
      if (t.list === 'inbox' || opts.triage) {
        actions += TRIAGE.filter(function (x) { return x.list !== t.list; }).map(function (x) {
          return '<button type="button" class="tbtn" data-act="move" data-id="' + esc(t.id) + '" data-list="' + x.list + '" title="' + x.label + ' (' + x.key + ')">' + x.label + '</button>';
        }).join('');
      }
      actions += '<button type="button" class="ibtn" data-act="plan" data-id="' + esc(t.id) + '" title="In die nächste freie Lücke (P)" aria-label="Einplanen">◷</button>';
      actions += '<button type="button" class="ibtn' + (running ? ' is-on' : '') + '" data-act="timer" data-id="' + esc(t.id) + '" title="' + (running ? 'Timer stoppen' : 'Timer starten') + ' (T)" aria-label="' + (running ? 'Timer stoppen' : 'Timer starten') + '">' + (running ? '❚❚' : '▶') + '</button>';
      actions += '<button type="button" class="ibtn" data-act="focus" data-id="' + esc(t.id) + '" title="Fokus (F)" aria-label="Fokus">◎</button>';
    } else {
      actions += '<button type="button" class="tbtn" data-act="undone" data-id="' + esc(t.id) + '">Wieder öffnen</button>';
    }
    actions += '<button type="button" class="ibtn" data-act="edit" data-id="' + esc(t.id) + '" title="Bearbeiten (E)" aria-label="Bearbeiten">⋯</button>';

    return '<li class="task' + (sel ? ' is-selected' : '') + (t.done ? ' is-done' : '') + (running ? ' is-running' : '') + '" data-id="' + esc(t.id) + '"' + (opts.draggable && !t.done ? ' draggable="true"' : '') + '>' +
      '<button type="button" class="check' + (t.done ? ' is-checked' : '') + '" data-act="' + (t.done ? 'undone' : 'done') + '" data-id="' + esc(t.id) + '" aria-label="' + (t.done ? 'Als offen markieren' : 'Erledigt') + '"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg></button>' +
      '<div class="task-main" data-act="select" data-id="' + esc(t.id) + '">' +
        '<div class="task-title">' + esc(t.title || '(ohne Titel)') + '</div>' +
        (meta ? '<div class="task-meta">' + meta + '</div>' : '') +
      '</div>' +
      '<div class="task-actions">' + actions + '</div>' +
    '</li>';
  }

  function taskList(tasks, opts) {
    opts = opts || {};
    if (!tasks.length) return opts.empty ? '<p class="empty">' + opts.empty + '</p>' : '';
    return '<ul class="tasks" data-list="' + esc(opts.list || '') + '">' + tasks.map(function (t) { return taskRow(t, opts); }).join('') + '</ul>';
  }

  function quickAdd(list, placeholder) {
    return '<form class="quick-add" data-list="' + list + '" autocomplete="off">' +
      '<label class="sr-only" for="quick-add">Neue Aufgabe</label>' +
      '<input id="quick-add" name="q" type="text" placeholder="' + esc(placeholder) + '" />' +
      '<span class="kbd-hint"><kbd>N</kbd></span>' +
    '</form>';
  }

  // ------------------------------------------------------------------ Banner
  function banners() {
    var out = '';
    if (S.saveError) {
      out += '<div class="banner is-danger"><span>Speichern im Browser ist fehlgeschlagen. Exportiere ein Backup, bevor du das Fenster schließt.</span><button type="button" class="btn" data-act="export">Backup exportieren</button></div>';
    }
    if (K.review.reviewDue() && ui.view !== 'rueckblick') {
      out += '<div class="banner"><span>Freitagnachmittag: Zeit für den Wochenrückblick und den Fokus für nächste Woche.</span><button type="button" class="btn" data-act="nav" data-view="rueckblick">Zum Rückblick</button></div>';
    }
    if (S.hasExamples()) {
      out += '<div class="banner"><span>Du siehst Beispieldaten, damit du die Abläufe ausprobieren kannst.</span><button type="button" class="btn" data-act="remove-examples">Beispiele entfernen</button></div>';
    } else if (needsBackupNag()) {
      var last = S.state.settings.lastBackupAt;
      out += '<div class="banner is-warn"><span>' + (last ? 'Letztes Backup am ' + esc(new Date(last).toLocaleDateString('de-DE')) + '.' : 'Noch kein Backup.') + ' Deine Daten liegen nur in diesem Browser.</span><span class="banner-actions"><button type="button" class="btn" data-act="export">Jetzt sichern</button><button type="button" class="btn ghost" data-act="snooze-backup">Später</button></span></div>';
    }
    return out;
  }
  function needsBackupNag() {
    var s = S.state.settings;
    if (!S.tasks().length) return false;
    if (s.backupSnoozedUntil && new Date(s.backupSnoozedUntil) > new Date()) return false;
    var ref = s.lastBackupAt || S.state.createdAt;
    return Date.now() - new Date(ref).getTime() > 7 * 864e5;
  }

  // ------------------------------------------------------------------ Seitenleiste
  function counts() {
    var c = { inbox: 0, today: 0, week: 0, later: 0, waiting: 0, agenda: 0, due: 0 };
    var today = U.dayKey();
    S.tasks().forEach(function (t) {
      if (t.done) return;
      c[t.list] = (c[t.list] || 0) + 1;
      if (t.list === 'waiting' && t.followUp && t.followUp <= today) c.due++;
    });
    return c;
  }
  function sidebarHTML() {
    var c = counts();
    var nav = VIEWS.map(function (v) {
      var n = v.list ? c[v.list] : 0;
      var badge = '';
      if (v.id === 'inbox' && n) badge = '<span class="badge is-strong">' + n + '</span>';
      else if (v.id === 'warten' && c.due) badge = '<span class="badge is-warn" title="Nachfassen fällig">' + c.due + '</span>';
      else if (n) badge = '<span class="badge">' + n + '</span>';
      return '<a href="#' + v.id + '" class="nav-item' + (ui.view === v.id ? ' is-active' : '') + '" data-act="nav" data-view="' + v.id + '"' + (v.list ? ' data-drop-list="' + v.list + '"' : '') + '>' +
        '<span class="nav-label">' + esc(v.label) + '</span>' + badge + '<kbd class="nav-key">' + v.key + '</kbd></a>';
    }).join('');

    var timer = '';
    var a = S.state.activeTimer;
    if (a) {
      var t = S.task(a.taskId);
      timer = '<div class="side-timer">' +
        '<button type="button" class="side-timer-main" data-act="focus" data-id="' + esc(a.taskId) + '"><span class="side-timer-label">Läuft</span><span class="side-timer-title">' + esc(t ? t.title : '') + '</span></button>' +
        '<span class="side-timer-clock" data-timer="active">' + fmtClock((Date.now() - new Date(a.start)) / 1000) + '</span>' +
        '<button type="button" class="ibtn is-on" data-act="timer-stop" title="Timer stoppen" aria-label="Timer stoppen">❚❚</button>' +
      '</div>';
    }

    return '<div class="brand"><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><path d="M16 6l3.2 10L16 26l-3.2-10z"/></svg><span>Kompass</span></div>' +
      '<button type="button" class="search" data-act="palette"><span>Suchen …</span><kbd>' + MOD + ' K</kbd></button>' +
      '<nav class="nav" aria-label="Listen">' + nav +
        '<a href="#fokus" class="nav-item' + (ui.view === 'fokus' ? ' is-active' : '') + '" data-act="nav" data-view="fokus"><span class="nav-label">Fokus</span><kbd class="nav-key">F</kbd></a>' +
      '</nav>' +
      timer +
      '<div class="side-foot">' +
        '<a href="#optionen" class="nav-item small' + (ui.view === 'optionen' ? ' is-active' : '') + '" data-act="nav" data-view="optionen"><span class="nav-label">Einstellungen</span></a>' +
        '<button type="button" class="nav-item small" data-act="help"><span class="nav-label">Tastenkürzel</span><kbd class="nav-key">?</kbd></button>' +
      '</div>';
  }

  // ------------------------------------------------------------------ Ansichten rendern
  function header(title, sub, right) {
    return '<header class="view-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (right || '') + '</header>';
  }

  function viewList(v) {
    var tasks = S.openIn(v.list);
    var place = { inbox: 'Erfassen: Text oder Link einfügen, Enter', week: 'Für diese Woche …', later: 'Für später …' }[v.list];
    var body = place ? quickAdd(v.list, place) : '';
    if (v.list === 'inbox' && tasks.length) {
      body += '<p class="triage-hint">Sortieren: Aufgabe anklicken, dann <kbd>H</kbd> Heute · <kbd>W</kbd> Woche · <kbd>S</kbd> Später · <kbd>A</kbd> Warten · <kbd>G</kbd> Agenda · <kbd>Entf</kbd> Löschen</p>';
    }
    body += taskList(tasks, { list: v.list, draggable: true, empty: v.list === 'inbox' ? 'Inbox ist leer. Neues landet hier per Eingabe, Einfügen (' + MOD + '+V), Bookmarklet oder indem du eine Mail aus Outlook hierher ziehst.' : 'Nichts hier.' });
    return header(v.label, v.hint ? esc(v.hint) : '') + body;
  }

  function viewToday() {
    var today = U.dayKey();
    var focusSec = S.secondsOnDay(today);
    var target = Math.max(0.5, Number(S.state.settings.dailyFocusTarget) || 3) * 3600;
    var pct = Math.min(100, Math.round(focusSec / target * 100));
    var right = '<div class="focus-meter" title="Fokuszeit heute">' +
      '<div class="focus-meter-num"><span data-timer="today">' + fmtHours(focusSec) + '</span> h <small>von ' + fmtHours(target) + ' h Fokus</small></div>' +
      '<div class="meter"><i data-timer="today-bar" style="width:' + pct + '%"></i></div></div>';

    var due = S.tasks().filter(function (t) { return !t.done && t.list === 'waiting' && t.followUp && t.followUp <= today; })
      .sort(function (a, b) { return a.followUp.localeCompare(b.followUp); });
    var open = S.openIn('today');
    var doneToday = S.tasks().filter(function (t) { return t.done && t.doneAt && U.dayKey(t.doneAt) === today; })
      .sort(function (a, b) { return b.doneAt.localeCompare(a.doneAt); });

    var cap = K.cal.capacity(today);
    var html = header(longDate(new Date()), '<span class="cap-inline' + (cap.over ? ' is-over' : '') + '">' + esc(K.cal.capacityText(cap)) + '</span>', right);
    html += K.review.todayStrip();
    html += '<div class="today-grid"><div class="today-main">';
    if (due.length) {
      html += '<section class="section"><h2 class="section-title is-warn">Nachfassen fällig <span>' + due.length + '</span></h2>' +
        '<ul class="tasks">' + due.map(function (t) {
          return taskRow(t).replace('<div class="task-actions">', '<div class="task-actions"><button type="button" class="tbtn" data-act="follow-later" data-id="' + esc(t.id) + '" title="In 2 Arbeitstagen wieder">+2 Tage</button><button type="button" class="tbtn" data-act="move" data-list="today" data-id="' + esc(t.id) + '">Auf Heute</button>');
        }).join('') + '</ul></section>';
    }
    html += '<section class="section">' + quickAdd('today', 'Für heute … (#Bereich, Jira-Key oder Link möglich)') +
      taskList(open, { list: 'today', draggable: true, empty: 'Noch nichts für heute geplant. Hol dir etwas aus der Inbox oder aus „Diese Woche“.' }) + '</section>';
    if (doneToday.length) {
      html += '<section class="section"><button type="button" class="section-toggle" data-act="toggle-done-today" aria-expanded="' + ui.showDoneToday + '">Heute erledigt <span>' + doneToday.length + '</span></button>' +
        (ui.showDoneToday ? taskList(doneToday) : '') + '</section>';
    }
    html += '</div>' + K.cal.dayPanel(today) + '</div>';
    return html;
  }

  function groupBy(tasks, keyFn) {
    var groups = {}, order = [];
    tasks.forEach(function (t) { var k = keyFn(t); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(t); });
    return order.map(function (k) { return { key: k, tasks: groups[k] }; });
  }

  function viewWaiting(v) {
    var tasks = S.openIn('waiting').sort(function (a, b) { return (a.followUp || '9999').localeCompare(b.followUp || '9999'); });
    var groups = groupBy(tasks, function (t) { return t.person || 'Ohne Person'; })
      .sort(function (a, b) { return (a.tasks[0].followUp || '9999').localeCompare(b.tasks[0].followUp || '9999'); });
    var html = header(v.label, esc(v.hint));
    if (!groups.length) return html + '<p class="empty">Du wartest gerade auf niemanden. Verschiebe eine Aufgabe mit <kbd>A</kbd> hierher.</p>';
    groups.forEach(function (g) {
      html += '<section class="section"><h2 class="section-title">' + esc(g.key) + ' <span>' + g.tasks.length + '</span></h2>' + taskList(g.tasks, { hidePerson: true }) + '</section>';
    });
    return html;
  }

  function viewAgenda(v) {
    var tasks = S.openIn('agenda');
    var groups = groupBy(tasks, function (t) { return t.person || 'Ohne Person'; })
      .sort(function (a, b) { return a.key.localeCompare(b.key, 'de'); });
    var html = header(v.label, esc(v.hint));
    if (!groups.length) return html + '<p class="empty">Keine offenen Gesprächsthemen. Verschiebe eine Aufgabe mit <kbd>G</kbd> hierher.</p>';
    groups.forEach(function (g) {
      html += '<section class="section"><div class="section-row"><h2 class="section-title">' + esc(g.key) + ' <span>' + g.tasks.length + '</span></h2>' +
        '<button type="button" class="btn ghost small" data-act="agenda-done" data-person="' + esc(g.key) + '">Alle besprochen</button></div>' +
        taskList(g.tasks, { hidePerson: true }) + '</section>';
    });
    return html;
  }

  function viewDone(v) {
    var tasks = S.tasks().filter(function (t) { return t.done; }).sort(function (a, b) { return (b.doneAt || '').localeCompare(a.doneAt || ''); });
    var html = header(v.label, 'Was du geschafft hast, nach Tagen.');
    if (!tasks.length) return html + '<p class="empty">Noch nichts erledigt.</p>';
    var today = U.dayKey();
    groupBy(tasks.slice(0, 300), function (t) { return U.dayKey(t.doneAt); }).forEach(function (g) {
      var label = g.key === today ? 'Heute' : (daysBetween(g.key, today) === 1 ? 'Gestern' : new Date(g.key + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }));
      var sec = S.secondsOnDay(g.key);
      html += '<section class="section"><h2 class="section-title">' + esc(label) + ' <span>' + g.tasks.length + '</span>' + (sec ? '<em>' + fmtDur(sec) + ' Fokus</em>' : '') + '</h2>' + taskList(g.tasks) + '</section>';
    });
    return html;
  }

  function viewFocus() {
    var t = ui.focusTaskId && S.task(ui.focusTaskId);
    if (!t || t.done) {
      var cands = S.openIn('today');
      var html = header('Fokus', 'Was ist jetzt das Wichtigste? Wähle eine Aufgabe.');
      if (!cands.length) return html + '<p class="empty">Auf „Heute“ steht nichts. Plane zuerst deinen Tag.</p>';
      return html + '<ul class="pick">' + cands.map(function (c) {
        return '<li><button type="button" class="pick-item" data-act="focus" data-id="' + esc(c.id) + '"><span>' + esc(c.title) + '</span>' + areaChip(c) + '</button></li>';
      }).join('') + '</ul>';
    }
    var running = S.state.activeTimer && S.state.activeTimer.taskId === t.id;
    var session = running ? (Date.now() - new Date(S.state.activeTimer.start)) / 1000 : 0;
    var total = S.secondsOnTask(t.id);
    return '<div class="focus">' +
      '<button type="button" class="btn ghost small focus-back" data-act="focus-exit">← Zurück <kbd>Esc</kbd></button>' +
      '<p class="eyebrow">Fokus</p>' +
      '<h1 class="focus-title">' + esc(t.title) + '</h1>' +
      '<div class="task-meta focus-meta">' + areaChip(t) + sourceChip(t) + (t.person ? '<span class="chip person">' + esc(t.person) + '</span>' : '') + '</div>' +
      '<div class="focus-clock' + (running ? ' is-running' : '') + '" data-timer="session">' + fmtClock(session) + '</div>' +
      '<p class="focus-total">Insgesamt <span data-timer="task-total" data-task="' + esc(t.id) + '">' + fmtDur(total) + '</span> an dieser Aufgabe</p>' +
      '<div class="focus-actions">' +
        '<button type="button" class="btn primary big" data-act="timer" data-id="' + esc(t.id) + '">' + (running ? 'Pause' : 'Timer starten') + ' <kbd>T</kbd></button>' +
        '<button type="button" class="btn big" data-act="done" data-id="' + esc(t.id) + '">Erledigt <kbd>' + MOD + ' ↵</kbd></button>' +
        (t.url ? '<a class="btn big" href="' + esc(t.url) + '" target="_blank" rel="noopener">Quelle öffnen ↗</a>' : '') +
      '</div>' +
      '<label class="focus-notes-label" for="focus-notes">Notizen</label>' +
      '<textarea id="focus-notes" class="focus-notes" data-id="' + esc(t.id) + '" placeholder="Gedanken, nächste Schritte, offene Fragen …">' + esc(t.notes) + '</textarea>' +
    '</div>';
  }

  function viewSettings() {
    var s = S.state.settings;
    var appUrl = location.protocol.indexOf('http') === 0 ? location.origin + location.pathname : '';
    var bookmarklet = appUrl ? "javascript:(function(){var s=String(window.getSelection()||'').slice(0,800);window.open('" + appUrl + "?capture=1&t='+encodeURIComponent(document.title)+'&u='+encodeURIComponent(location.href)+'&s='+encodeURIComponent(s),'kompass');})();" : '';
    var areas = S.areas().map(function (a) {
      return '<li class="area-row">' +
        '<input type="color" id="area-color-' + esc(a.id) + '" value="' + esc(a.color) + '" data-area="' + esc(a.id) + '" data-field="color" aria-label="Farbe" />' +
        '<input type="text" id="area-name-' + esc(a.id) + '" value="' + esc(a.name) + '" data-area="' + esc(a.id) + '" data-field="name" aria-label="Name" />' +
        '<label class="area-target"><input type="number" id="area-target-' + esc(a.id) + '" min="0" max="60" step="0.5" value="' + esc(a.weeklyTarget == null ? '' : a.weeklyTarget) + '" data-area="' + esc(a.id) + '" data-field="weeklyTarget" placeholder="–" aria-label="Wochenziel in Stunden" /><span>h/Woche</span></label>' +
        '<button type="button" class="btn ghost small" data-act="area-del" data-id="' + esc(a.id) + '">Entfernen</button></li>';
    }).join('');
    var used = 0;
    try { used = (localStorage.getItem('kompass.v1') || '').length; } catch (e) { }

    return header('Einstellungen', '') +
      '<section class="card"><h2>Darstellung</h2>' +
        '<div class="seg" role="radiogroup" aria-label="Farbschema">' +
          ['system', 'light', 'dark'].map(function (k) {
            var label = { system: 'Wie Windows', light: 'Hell', dark: 'Dunkel' }[k];
            return '<button type="button" role="radio" aria-checked="' + (s.theme === k) + '" class="seg-btn' + (s.theme === k ? ' is-on' : '') + '" data-act="theme" data-theme-val="' + k + '">' + label + '</button>';
          }).join('') +
        '</div>' +
        '<div class="field-row">' +
          '<label class="field"><span>Arbeitsbeginn</span><input id="set-ws" type="time" step="900" value="' + esc(s.workStart) + '" data-setting="workStart" /></label>' +
          '<label class="field"><span>Arbeitsende</span><input id="set-we" type="time" step="900" value="' + esc(s.workEnd) + '" data-setting="workEnd" /></label>' +
        '</div>' +
        '<label class="field"><span>Fokusziel pro Tag (Stunden)</span><input id="set-target" type="number" min="0.5" max="12" step="0.5" value="' + esc(s.dailyFocusTarget) + '" data-setting="dailyFocusTarget" /></label>' +
      '</section>' +

      calendarCard() +
      '<section class="card"><h2>Bereiche</h2><p class="muted">Sie ordnen deine Aufgaben thematisch. In der Eingabe mit <code>#Name</code> zuweisen, z. B. <code>#stake</code>. Das Wochenziel ist optional: So viele Stunden Fokus willst du pro Woche in diesen Bereich stecken. Der Rückblick zeigt, wie nah du drankommst.</p>' +
        '<ul class="areas">' + areas + '</ul>' +
        '<form class="area-add" data-act-form="area-add"><input id="area-new" type="text" placeholder="Neuer Bereich" aria-label="Neuer Bereich" /><button type="submit" class="btn">Hinzufügen</button></form>' +
      '</section>' +

      '<section class="card"><h2>Erfassen aus Jira, Confluence, Teams und Outlook</h2>' +
        '<label class="field"><span>Jira-Adresse</span><input id="set-jira" type="url" placeholder="https://deinefirma.atlassian.net" value="' + esc(s.jiraBase) + '" data-setting="jiraBase" /></label>' +
        '<p class="muted">Dann reicht in der Eingabe <code>SHOP-142 Kriterien klären</code>, und der Link zum Ticket wird ergänzt.</p>' +
        (bookmarklet
          ? '<div class="howto"><h3>Bookmarklet für Jira und Confluence</h3><p>Zieh diesen Knopf in deine Favoritenleiste (<kbd>' + MOD + '+Umschalt+B</kbd> blendet sie ein). Klick ihn auf einer Jira- oder Confluence-Seite, und Titel und Link landen in der Inbox. Markierter Text wird als Notiz übernommen.</p>' +
            '<p><a class="bookmarklet" href="' + esc(bookmarklet) + '" data-act="bookmarklet">→ In Kompass</a></p></div>'
          : '<div class="howto"><h3>Bookmarklet</h3><p>Steht zur Verfügung, sobald Kompass über seine Web-Adresse geöffnet ist.</p></div>') +
        '<div class="howto"><h3>Teams</h3><p>Bei der Nachricht <em>⋯ → Link kopieren</em>, dann in Kompass <kbd>' + MOD + '+V</kbd> drücken (ohne Textfeld aktiv). Der Eintrag landet in der Inbox.</p></div>' +
        '<div class="howto"><h3>Outlook</h3><p>Mail aus der Outlook-Liste in das Kompass-Fenster ziehen. Der Betreff wird zum Titel. Alternativ den Betreff kopieren und einfügen.</p></div>' +
      '</section>' +

      '<section class="card"><h2>Daten und Backup</h2>' +
        '<p class="muted">Alles liegt nur in diesem Browser (' + (used / 1024).toFixed(0) + ' KB). Wenn die IT das Browser-Profil zurücksetzt, ist es weg. Sichere deshalb regelmäßig.' + (s.lastBackupAt ? ' Letztes Backup: ' + esc(new Date(s.lastBackupAt).toLocaleString('de-DE')) + '.' : ' Noch kein Backup.') + '</p>' +
        '<div class="row-btns"><button type="button" class="btn primary" data-act="export">Backup exportieren</button>' +
        '<label class="btn" for="import-file">Backup importieren</label><input id="import-file" type="file" accept=".json,application/json" class="sr-only" /></div>' +
        '<div class="row-btns"><button type="button" class="btn ghost danger" data-act="reset">Alle Daten löschen …</button></div>' +
      '</section>';
  }

  function calendarCard() {
    var c = S.state.calendar;
    var isHtml = /\.html?(\?|$)/i.test(c.url || '');
    return '<section class="card" id="kalender-verbinden"><h2>Outlook-Kalender</h2>' +
      '<p class="muted">Deine Termine erscheinen grau im Hintergrund von „Heute“ und „Kalender“. Kompass liest nur, ändert nichts in Outlook.</p>' +
      '<p>' + K.cal.statusLine(true) + '</p>' +
      '<label class="field"><span>Veröffentlichter ICS-Link</span><input id="cal-url" type="url" placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" value="' + esc(c.url) + '" /></label>' +
      (isHtml ? '<p class="banner is-warn">Das ist der HTML-Link. Kompass braucht den ICS-Link, der auf <code>.ics</code> endet.</p>' : '') +
      '<div class="row-btns"><button type="button" class="btn primary" data-act="cal-sync"' + (c.url ? '' : ' disabled') + '>Jetzt laden</button>' +
      (c.url ? '<a class="btn" href="' + esc(K.cal.normalizeUrl(c.url)) + '" target="_blank" rel="noopener">Link öffnen (lädt .ics-Datei)</a>' : '') +
      '<label class="btn" for="ics-file">.ics-Datei importieren</label><input id="ics-file" type="file" accept=".ics,text/calendar" class="sr-only" />' +
      (c.source ? '<button type="button" class="btn ghost danger" data-act="cal-clear">Termine entfernen</button>' : '') + '</div>' +
      (c.error === 'cors'
        ? '<div class="banner is-warn"><span>Outlook erlaubt nicht, dass eine Webseite den Kalender direkt abruft. So geht es trotzdem: <strong>Link öffnen</strong> klicken, Edge lädt <code>calendar.ics</code> herunter, die Datei in Kompass ziehen. Das dauert morgens etwa zehn Sekunden.</span></div>'
        : '') +
      '<p class="muted small">Der ICS-Link wirkt wie ein Passwort: Wer ihn hat, sieht deinen Kalender. Er bleibt in diesem Browser und steht auch im Backup.</p>' +
    '</section>';
  }

  function mainHTML() {
    var v = viewById(ui.view);
    var body;
    if (ui.view === 'heute') body = viewToday();
    else if (ui.view === 'fokus') body = viewFocus();
    else if (ui.view === 'plan') body = K.plan.view(ui);
    else if (ui.view === 'rueckblick') body = K.review.view(ui.reviewWeek || K.cal.mondayOf(U.dayKey()));
    else if (ui.view === 'kalender') body = K.cal.weekView(ui.weekStart || K.cal.mondayOf(U.dayKey()), S.openIn('today').concat(S.openIn('week')));
    else if (ui.view === 'optionen') body = viewSettings();
    else if (ui.view === 'warten') body = viewWaiting(v);
    else if (ui.view === 'agenda') body = viewAgenda(v);
    else if (ui.view === 'erledigt') body = viewDone(v);
    else body = viewList(v);
    var cls = ui.view === 'plan' ? ' is-plan' : ui.view === 'fokus' ? ' is-focus' : (ui.view === 'heute' || ui.view === 'kalender' || ui.view === 'rueckblick') ? ' is-wide' : '';
    return '<div class="main-inner' + cls + '">' + banners() + body + '</div>';
  }

  // ------------------------------------------------------------------ Overlays
  function modalHTML() {
    var m = ui.modal;
    if (!m) return '';
    var inner = '';
    if (m.type === 'person') {
      var t = S.task(m.taskId);
      var isWait = m.list === 'waiting';
      var people = S.people().map(function (p) { return '<option value="' + esc(p) + '"></option>'; }).join('');
      inner = '<form class="modal-form" data-act-form="person">' +
        '<h2>' + (isWait ? 'Warten auf wen?' : 'Für welches Gespräch?') + '</h2>' +
        '<p class="muted">' + esc(t ? t.title : '') + '</p>' +
        '<label class="field"><span>' + (isWait ? 'Person oder Team' : 'Person, Team oder Termin') + '</span><input id="person-input" list="people-list" type="text" required value="' + esc(t && t.person || '') + '" /></label>' +
        '<datalist id="people-list">' + people + '</datalist>' +
        (isWait ? '<label class="field"><span>Nachfassen am</span><input id="follow-input" type="date" value="' + esc((t && t.followUp) || U.dayKey(U.addWorkdays(new Date(), 2))) + '" /></label>' : '') +
        '<div class="modal-btns"><button type="button" class="btn ghost" data-act="modal-close">Abbrechen</button><button type="submit" class="btn primary">Übernehmen</button></div>' +
      '</form>';
    } else if (m.type === 'editor') {
      var e = S.task(m.taskId);
      if (!e) return '';
      var lists = Object.keys(LIST_LABEL).map(function (k) { return '<option value="' + k + '"' + (e.list === k ? ' selected' : '') + '>' + LIST_LABEL[k] + '</option>'; }).join('');
      var areas = '<option value="">Kein Bereich</option>' + S.areas().map(function (a) { return '<option value="' + esc(a.id) + '"' + (e.areaId === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('');
      var ppl = S.people().map(function (p) { return '<option value="' + esc(p) + '"></option>'; }).join('');
      inner = '<form class="modal-form" data-act-form="editor">' +
        '<h2>Aufgabe bearbeiten</h2>' +
        '<label class="field"><span>Titel</span><input id="ed-title" type="text" required value="' + esc(e.title) + '" /></label>' +
        '<label class="field"><span>Link zur Quelle</span><input id="ed-url" type="url" placeholder="https://…" value="' + esc(e.url) + '" /></label>' +
        '<div class="field-row">' +
          '<label class="field"><span>Liste</span><select id="ed-list">' + lists + '</select></label>' +
          '<label class="field"><span>Bereich</span><select id="ed-area">' + areas + '</select></label>' +
        '</div>' +
        '<div class="field-row">' +
          '<label class="field"><span>Person (Warten auf / Agenda)</span><input id="ed-person" list="people-list2" type="text" value="' + esc(e.person) + '" /></label>' +
          '<label class="field"><span>Nachfassen am</span><input id="ed-follow" type="date" value="' + esc(e.followUp || '') + '" /></label>' +
        '</div>' +
        '<datalist id="people-list2">' + ppl + '</datalist>' +
        '<div class="field-row">' +
          '<label class="field"><span>Geplant für</span><input id="ed-plan" type="date" value="' + esc(e.planDate || '') + '" /></label>' +
          '<label class="field"><span>Wiederholen</span><select id="ed-repeat"><option value="">Nicht wiederholen</option>' +
            Object.keys(U.REPEATS).map(function (k) { return '<option value="' + k + '"' + (e.repeat === k ? ' selected' : '') + '>' + U.REPEATS[k] + '</option>'; }).join('') + '</select></label>' +
        '</div>' +
        '<label class="field"><span>Notizen</span><textarea id="ed-notes" rows="5">' + esc(e.notes) + '</textarea></label>' +
        '<p class="muted small">Erfasst ' + esc(new Date(e.createdAt).toLocaleString('de-DE')) + (S.secondsOnTask(e.id) ? ' · ' + fmtDur(S.secondsOnTask(e.id)) + ' Fokuszeit' : '') + '</p>' +
        '<div class="modal-btns"><button type="button" class="btn ghost danger" data-act="del" data-id="' + esc(e.id) + '">Löschen</button><span class="spacer"></span><button type="button" class="btn ghost" data-act="modal-close">Abbrechen</button><button type="submit" class="btn primary">Speichern</button></div>' +
      '</form>';
    } else if (m.type === 'recurring') {
      inner = K.plan.recurringModal();
    } else if (m.type === 'block') {
      var b = S.block(m.blockId);
      var bt = b && S.task(b.taskId);
      if (!bt) return '';
      var bs = new Date(b.start).getTime(), be = new Date(b.end).getTime();
      var durNow = Math.round((be - bs) / 6e4);
      inner = '<div class="modal-form">' +
        '<p class="eyebrow">Eingeplant · ' + esc(shortDate(U.dayKey(b.start))) + ', ' + K.cal.hm(bs) + '–' + K.cal.hm(be) + '</p>' +
        '<h2>' + esc(bt.title) + '</h2>' +
        '<div class="task-meta">' + areaChip(bt) + sourceChip(bt) + '</div>' +
        '<div class="field"><span>Dauer</span><div class="seg">' + [30, 45, 60, 90, 120].map(function (d) {
          return '<button type="button" class="seg-btn' + (d === durNow ? ' is-on' : '') + '" data-act="block-dur" data-min="' + d + '">' + (d < 60 ? d + ' min' : (d / 60).toLocaleString('de-DE') + ' h') + '</button>';
        }).join('') + '</div></div>' +
        '<div class="modal-btns">' +
          '<button type="button" class="btn ghost danger" data-act="block-del">Aus dem Kalender nehmen</button><span class="spacer"></span>' +
          '<button type="button" class="btn" data-act="edit" data-id="' + esc(bt.id) + '">Bearbeiten</button>' +
          (bt.done ? '' : '<button type="button" class="btn" data-act="done" data-id="' + esc(bt.id) + '">Erledigt</button>') +
          (bt.done ? '' : '<button type="button" class="btn primary" data-act="block-focus">Fokus starten</button>') +
        '</div></div>';
    } else if (m.type === 'confirm') {
      inner = '<form class="modal-form" data-act-form="confirm"><h2>' + esc(m.title) + '</h2><p>' + esc(m.text) + '</p>' +
        (m.typeWord ? '<label class="field"><span>Zum Bestätigen „' + esc(m.typeWord) + '“ eingeben</span><input id="confirm-word" type="text" autocomplete="off" /></label>' : '') +
        '<div class="modal-btns"><button type="button" class="btn ghost" data-act="modal-close">Abbrechen</button><button type="submit" class="btn ' + (m.danger ? 'danger-solid' : 'primary') + '">' + esc(m.ok) + '</button></div></form>';
    } else if (m.type === 'help') {
      var rows = [
        [MOD + ' K', 'Suchen und springen'], ['N', 'Neue Aufgabe'], [MOD + ' V', 'Link oder Text in die Inbox einfügen'],
        ['1 – 9, 0', 'Ansichten wechseln (3 Plan, 4 Kalender, 0 Rückblick)'], ['J / K oder ↓ / ↑', 'Aufgabe auswählen'], ['E oder ↵', 'Bearbeiten'],
        ['X oder ' + MOD + ' ↵', 'Erledigt'], ['H W S A G I', 'Nach Heute, Woche, Später, Warten, Agenda, Inbox'],
        ['P', 'In die nächste freie Lücke heute einplanen'], ['F', 'Fokus auf die Aufgabe'], ['T', 'Timer starten oder stoppen'], ['Entf', 'Löschen (mit Rückgängig)'], ['Esc', 'Schließen, Fokus verlassen']
      ];
      inner = '<div class="modal-form"><h2>Tastenkürzel</h2><table class="keys">' + rows.map(function (r) { return '<tr><td><kbd>' + esc(r[0]) + '</kbd></td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
        '<p class="muted small">Aufgaben lassen sich per Drag & Drop sortieren, auf einen Listennamen links oder in den Kalender ziehen. Blöcke im Kalender verschiebst du mit der Maus, die Länge änderst du am unteren Rand.</p>' +
        '<div class="modal-btns"><button type="button" class="btn primary" data-act="modal-close">Schließen</button></div></div>';
    }
    return '<div class="backdrop" data-act="modal-close-bg"><div class="modal" role="dialog" aria-modal="true">' + inner + '</div></div>';
  }

  // ---- Befehlspalette
  function paletteItems(q) {
    q = (q || '').trim().toLowerCase();
    var items = [];
    var cmds = VIEWS.map(function (v) { return { kind: 'Liste', label: 'Gehe zu ' + v.label, run: function () { go(v.id); } }; })
      .concat([
        { kind: 'Befehl', label: 'Neue Aufgabe in die Inbox', run: function () { go('inbox'); setTimeout(focusQuickAdd, 0); } },
        { kind: 'Befehl', label: 'Fokus starten', run: function () { go('fokus'); } },
        { kind: 'Befehl', label: 'Backup exportieren', run: exportBackup },
        { kind: 'Befehl', label: 'Hell/Dunkel umschalten', run: function () { var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches); S.setSetting('theme', dark ? 'light' : 'dark'); applyTheme(); } },
        { kind: 'Befehl', label: 'Einstellungen', run: function () { go('optionen'); } },
        { kind: 'Befehl', label: 'Tastenkürzel anzeigen', run: function () { openModal({ type: 'help' }); } }
      ]);
    cmds.forEach(function (c) { if (!q || c.label.toLowerCase().indexOf(q) >= 0) items.push(c); });
    if (q) {
      S.tasks().filter(function (t) {
        return [t.title, t.notes, t.sourceKey, t.person].join(' ').toLowerCase().indexOf(q) >= 0;
      }).sort(function (a, b) { return (a.done - b.done) || b.updatedAt.localeCompare(a.updatedAt); }).slice(0, 30).forEach(function (t) {
        items.push({ kind: t.done ? 'Erledigt' : LIST_LABEL[t.list], label: t.title, task: t, run: function () { revealTask(t); } });
      });
    }
    return items.slice(0, 40);
  }
  function paletteHTML() {
    if (!ui.palette) return '';
    return '<div class="backdrop is-top" data-act="palette-close-bg"><div class="palette" role="dialog" aria-modal="true" aria-label="Suchen oder springen">' +
      '<input id="palette-input" type="text" placeholder="Aufgabe suchen, Liste oder Befehl …" autocomplete="off" value="' + esc(ui.palette.q) + '" />' +
      '<ul class="palette-list" id="palette-list">' + paletteListHTML() + '</ul></div></div>';
  }
  function paletteListHTML() {
    var items = paletteItems(ui.palette.q);
    ui.palette.items = items;
    if (ui.palette.idx >= items.length) ui.palette.idx = Math.max(0, items.length - 1);
    if (!items.length) return '<li class="palette-empty">Nichts gefunden.</li>';
    return items.map(function (it, i) {
      return '<li class="palette-item' + (i === ui.palette.idx ? ' is-active' : '') + '" data-act="palette-run" data-idx="' + i + '"><span class="palette-label">' + esc(it.label) + '</span><span class="palette-kind">' + esc(it.kind) + '</span></li>';
    }).join('');
  }

  // ------------------------------------------------------------------ Render
  var renderQueued = false;
  function render() {
    renderQueued = false;
    var active = document.activeElement;
    var activeId = active && active.id;
    var selStart = null, selEnd = null;
    try { if (activeId && active.selectionStart != null) { selStart = active.selectionStart; selEnd = active.selectionEnd; } } catch (e) { }
    var mainScroll = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
    var ds = $('#day-scroll');
    var dayScroll = ds ? ds.scrollTop : null;
    var ps = $('#plan-scroll');
    var planScroll = ps ? ps.scrollLeft : null;

    $('#sidebar').innerHTML = sidebarHTML();
    $('#main').innerHTML = mainHTML();
    $('#overlay').innerHTML = modalHTML() + paletteHTML();

    if (activeId) {
      var el = document.getElementById(activeId);
      if (el && el !== document.activeElement) {
        el.focus({ preventScroll: true });
        try { if (selStart != null) el.setSelectionRange(selStart, selEnd); } catch (e) { }
      }
    }
    if (document.scrollingElement) document.scrollingElement.scrollTop = mainScroll;
    var ds2 = $('#day-scroll');
    if (ds2) {
      if (dayScroll != null) ds2.scrollTop = dayScroll;
      else { var now = $('.tl-now', ds2); ds2.scrollTop = now ? Math.max(0, now.offsetTop - 90) : 0; }
    }
    var ps2 = $('#plan-scroll');
    if (ps2) {
      if (planScroll != null) { ps2.scrollLeft = planScroll; K.plan.updateMonth(); }
      else K.plan.scrollToToday(false);
    }
    updateTitle();
  }
  function schedule() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); } }

  function updateTitle() {
    var a = S.state.activeTimer;
    if (a) {
      var t = S.task(a.taskId);
      document.title = fmtClock((Date.now() - new Date(a.start)) / 1000) + ' · ' + (t ? t.title : 'Kompass');
    } else {
      var v = viewById(ui.view);
      document.title = 'Kompass' + (v ? ' · ' + v.label : ui.view === 'fokus' ? ' · Fokus' : '');
    }
  }

  function tick() {
    var a = S.state.activeTimer;
    if (!a) return;
    var start = new Date(a.start).getTime();
    var sess = (Date.now() - start) / 1000;
    $$('[data-timer="active"],[data-timer="session"]').forEach(function (el) { el.textContent = fmtClock(sess); });
    $$('[data-timer="task"]').forEach(function (el) { el.textContent = fmtClock(S.secondsOnTask(el.getAttribute('data-task'))); });
    $$('[data-timer="task-total"]').forEach(function (el) { el.textContent = fmtDur(S.secondsOnTask(el.getAttribute('data-task'))); });
    var todaySec = S.secondsOnDay(U.dayKey());
    var target = Math.max(0.5, Number(S.state.settings.dailyFocusTarget) || 3) * 3600;
    $$('[data-timer="today"]').forEach(function (el) { el.textContent = fmtHours(todaySec); });
    $$('[data-timer="today-bar"]').forEach(function (el) { el.style.width = Math.min(100, Math.round(todaySec / target * 100)) + '%'; });
    updateTitle();
  }

  // ------------------------------------------------------------------ Navigation
  function go(view) {
    if (view !== ui.view) {
      if (ui.view !== 'fokus' && ui.view !== 'optionen') ui.prevView = ui.view;
      ui.view = view;
      ui.selectedId = null;
    }
    if (location.hash !== '#' + view) {
      try { history.replaceState(null, '', location.pathname + location.search + '#' + view); } catch (e) { }
    }
    closePalette(true);
    ui.modal = null;
    render();
    window.scrollTo(0, 0);
  }
  function revealTask(t) {
    var v = t.done ? 'erledigt' : VIEWS.find(function (x) { return x.list === t.list; }).id;
    go(v);
    ui.selectedId = t.id;
    render();
    var row = $('.task[data-id="' + cssEsc(t.id) + '"]');
    if (row) row.scrollIntoView({ block: 'center' });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }
  function focusQuickAdd() {
    var el = $('#quick-add');
    if (el) { el.focus(); return true; }
    return false;
  }
  function startFocus(id) {
    ui.focusTaskId = id;
    go('fokus');
  }

  // ------------------------------------------------------------------ Aktionen
  function moveTask(id, list) {
    var t = S.task(id);
    if (!t) return;
    if (list === 'waiting' || list === 'agenda') { openModal({ type: 'person', taskId: id, list: list }); return; }
    var snap = S.snapshot();
    S.updateTask(id, { list: list, done: false, doneAt: null });
    if (ui.selectedId === id) selectNeighbor(id);
    toast('Nach „' + LIST_LABEL[list] + '“ verschoben', snap);
  }
  function completeTask(id) {
    var t = S.task(id);
    if (!t) return;
    var snap = S.snapshot();
    if (ui.selectedId === id) selectNeighbor(id);
    S.setDone(id, true);
    if (ui.view === 'fokus' && ui.focusTaskId === id) { ui.focusTaskId = null; go(ui.prevView || 'heute'); }
    toast('Erledigt: ' + t.title, snap);
  }
  function deleteTask(id) {
    var t = S.task(id);
    if (!t) return;
    var snap = S.snapshot();
    if (ui.selectedId === id) selectNeighbor(id);
    ui.modal = null;
    S.deleteTask(id);
    toast('Gelöscht: ' + t.title, snap);
  }
  function planTask(id) {
    var t = S.task(id);
    if (!t || t.done) return;
    var today = U.dayKey();
    var slot = K.cal.nextFreeSlot(today, 60);
    if (!slot) { toast('Heute ist keine Lücke mehr frei. Zieh die Aufgabe in den Kalender.'); return; }
    var snap = S.snapshot();
    S.addBlock(id, slot[0], slot[1]);
    if (t.list !== 'today') S.updateTask(id, { list: 'today' });
    toast('Eingeplant: heute ' + K.cal.hm(slot[0]) + '–' + K.cal.hm(slot[1]), snap);
  }
  function toggleTimer(id) {
    var a = S.state.activeTimer;
    if (a && a.taskId === id) S.stopTimer();
    else S.startTimer(id);
  }
  function visibleIds() { return $$('#main .task, #main .pcard').map(function (el) { return el.getAttribute('data-id'); }); }
  function selectNeighbor(id) {
    var ids = visibleIds();
    var i = ids.indexOf(id);
    ui.selectedId = ids[i + 1] || ids[i - 1] || null;
  }
  function select(id, scroll) {
    ui.selectedId = id;
    $$('#main .task, #main .pcard').forEach(function (el) { el.classList.toggle('is-selected', el.getAttribute('data-id') === id); });
    if (scroll) { var row = $('#main .is-selected'); if (row) row.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function openModal(m) {
    ui.modal = m;
    render();
    var first = $('#overlay .modal input:not([type=hidden]), #overlay .modal select, #overlay .modal textarea, #overlay .modal button.primary');
    if (first) { first.focus(); if (first.select && first.type === 'text') first.select(); }
  }
  function closeModal() { ui.modal = null; render(); }
  function openPalette() {
    ui.palette = { q: '', idx: 0, items: [] };
    render();
    var i = $('#palette-input'); if (i) i.focus();
  }
  function closePalette(silent) { if (ui.palette) { ui.palette = null; if (!silent) render(); } }

  // Freitext oder Link anlegen
  function captureText(text, list, extra, position) {
    text = String(text || '').trim();
    if (!text) return null;
    var areaId = null;
    var m = text.match(/(?:^|\s)#([^\s#]+)/);
    if (m) {
      var needle = m[1].toLowerCase();
      var area = S.areas().find(function (a) { return a.name.toLowerCase().replace(/\s+/g, '').indexOf(needle) === 0; });
      if (area) { areaId = area.id; text = text.replace(m[0], ' ').trim(); }
    }
    var p = L.parse(text, S.state.settings.jiraBase);
    var fields = Object.assign({ title: p.title, url: p.url, source: p.source, sourceKey: p.sourceKey, list: list || 'inbox', areaId: areaId }, extra || {});
    return S.addTask(fields, position || ((list || 'inbox') === 'inbox' ? 'top' : 'bottom'));
  }
  function planAdd(day, position) {
    var input = document.getElementById('plan-add-' + day);
    if (!input || !input.value.trim()) { if (input) input.focus(); return; }
    var t = captureText(input.value, U.listForDate(day), { planDate: day }, position);
    if (t) { input.value = ''; toast('Geplant für ' + shortDate(day) + ': ' + t.title); }
  }

  function exportBackup() {
    var data = JSON.stringify(S.state, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kompass-backup-' + U.dayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    S.setSetting('lastBackupAt', U.nowIso());
    toast('Backup gespeichert. Leg die Datei z. B. in dein OneDrive.');
  }
  function importBackup(file) {
    var r = new FileReader();
    r.onload = function () {
      var data;
      try { data = JSON.parse(r.result); } catch (e) { toast('Die Datei ist kein gültiges Kompass-Backup.'); return; }
      if (!data || !Array.isArray(data.tasks)) { toast('Die Datei ist kein gültiges Kompass-Backup.'); return; }
      var n = data.tasks.filter(function (t) { return !t.deletedAt; }).length;
      openModal({
        type: 'confirm', title: 'Backup importieren?', ok: 'Ersetzen',
        text: 'Die aktuellen Daten (' + S.tasks().length + ' Aufgaben) werden durch das Backup (' + n + ' Aufgaben) ersetzt.',
        run: function () { var snap = S.snapshot(); S.replace(data); applyTheme(); toast('Backup importiert', snap); }
      });
    };
    r.readAsText(file);
  }

  function importIcsFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var p = K.cal.importText(String(r.result), 'file');
        toast(p.events.length + ' Termine aus ' + (file.name || 'der Datei') + ' übernommen');
      } catch (err) { toast(err.message); }
    };
    r.readAsText(file);
  }

  // Dateien und Text, die ins Fenster gezogen werden
  function handleDrop(dt) {
    var files = dt.files ? Array.prototype.slice.call(dt.files) : [];
    var added = 0;
    if (files.length) {
      files.forEach(function (f) {
        var name = f.name || '';
        if (/\.eml$/i.test(name)) {
          var r = new FileReader();
          r.onload = function () {
            var info = L.parseEml(String(r.result));
            S.addTask({ title: info.subject || name.replace(/\.eml$/i, ''), source: 'mail', notes: info.from ? 'Von: ' + info.from : '' }, 'top');
            toast('Mail in die Inbox übernommen');
          };
          r.readAsText(f);
          added++;
        } else if (/\.msg$/i.test(name)) {
          S.addTask({ title: name.replace(/\.msg$/i, '').trim(), source: 'mail' }, 'top');
          added++;
        } else if (/\.ics$/i.test(name)) {
          importIcsFile(f);
        } else {
          S.addTask({ title: name, notes: 'Datei: ' + name }, 'top');
          added++;
        }
      });
      if (added) { toast(added === 1 ? 'In die Inbox übernommen' : added + ' Einträge in die Inbox übernommen'); if (ui.view !== 'inbox') go('inbox'); }
      return;
    }
    var text = dt.getData('text/uri-list') || dt.getData('text/plain');
    if (text) {
      text.split(/\r?\n/).filter(function (l) { return l.trim() && l[0] !== '#'; }).slice(0, 20).forEach(function (l) { captureText(l, 'inbox'); added++; });
      if (added) { toast('In die Inbox übernommen'); if (ui.view !== 'inbox') go('inbox'); }
    }
  }

  // ------------------------------------------------------------------ Ereignisse
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (ui.planFilterOpen && !(el && /^plan-filter/.test(el.getAttribute('data-act')))) { ui.planFilterOpen = false; render(); }
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');

    switch (act) {
      case 'nav': e.preventDefault(); go(el.getAttribute('data-view')); break;
      case 'select':
        if (e.target.closest('a')) return;
        select(id); break;
      case 'done': completeTask(id); break;
      case 'undone': S.setDone(id, false); toast('Wieder geöffnet'); break;
      case 'move': moveTask(id, el.getAttribute('data-list')); break;
      case 'timer': toggleTimer(id); break;
      case 'timer-stop': S.stopTimer(); break;
      case 'focus': startFocus(id); break;
      case 'focus-exit': go(ui.prevView || 'heute'); break;
      case 'edit': ui.selectedId = id; openModal({ type: 'editor', taskId: id }); break;
      case 'del': deleteTask(id); break;
      case 'follow-later': {
        var snap = S.snapshot();
        S.updateTask(id, { followUp: U.dayKey(U.addWorkdays(new Date(), 2)) });
        toast('Nachfassen in 2 Arbeitstagen', snap); break;
      }
      case 'agenda-done': {
        var person = el.getAttribute('data-person');
        var snap2 = S.snapshot();
        S.openIn('agenda').filter(function (t) { return (t.person || 'Ohne Person') === person; }).forEach(function (t) { S.setDone(t.id, true); });
        toast('Agenda mit ' + person + ' abgehakt', snap2); break;
      }
      case 'toggle-done-today': ui.showDoneToday = !ui.showDoneToday; render(); break;
      case 'remove-examples': { var snap3 = S.snapshot(); S.removeExamples(); toast('Beispiele entfernt', snap3); break; }
      case 'export': exportBackup(); break;
      case 'snooze-backup': S.setSetting('backupSnoozedUntil', new Date(Date.now() + 2 * 864e5).toISOString()); break;
      case 'theme': S.setSetting('theme', el.getAttribute('data-theme-val')); applyTheme(); break;
      case 'area-del': {
        var snap4 = S.snapshot(); var a = S.area(id);
        S.deleteArea(id); toast('Bereich „' + (a ? a.name : '') + '“ entfernt', snap4); break;
      }
      case 'reset':
        openModal({ type: 'confirm', title: 'Alle Daten löschen?', text: 'Alle Aufgaben, Bereiche und Zeiten in diesem Browser werden gelöscht. Exportiere vorher ein Backup, wenn du sie behalten willst.', ok: 'Endgültig löschen', danger: true, typeWord: 'löschen', run: function () { S.reset(); applyTheme(); toast('Alle Daten gelöscht'); } });
        break;
      case 'bookmarklet': e.preventDefault(); toast('Zieh den Knopf in die Favoritenleiste, statt ihn anzuklicken.'); break;
      case 'palette': openPalette(); break;
      case 'palette-run': runPalette(Number(el.getAttribute('data-idx'))); break;
      case 'palette-close-bg': if (e.target === el) closePalette(); break;
      case 'help': openModal({ type: 'help' }); break;
      case 'plan': planTask(id); break;
      case 'plan-today': K.plan.scrollToToday(true); break;
      case 'plan-recurring': openModal({ type: 'recurring' }); break;
      case 'plan-toggle-done': ui.planShowDone = !ui.planShowDone; render(); break;
      case 'plan-filter-toggle': ui.planFilterOpen = !ui.planFilterOpen; render(); break;
      case 'plan-filter': ui.planFilter = el.getAttribute('data-area') || null; ui.planFilterOpen = false; render(); break;
      case 'plan-add-top': planAdd(el.getAttribute('data-day'), 'top'); break;
      case 'repeat-stop': { var snapR = S.snapshot(); S.updateTask(id, { repeat: null }); toast('Wird nicht mehr wiederholt', snapR); break; }
      case 'reveal': { var rt = S.task(id); if (rt) revealTask(rt); break; }
      case 'review-prev': case 'review-next': {
        var rb = new Date((ui.reviewWeek || K.cal.mondayOf(U.dayKey())) + 'T12:00:00');
        ui.reviewWeek = U.dayKey(U.addDays(rb, act === 'review-prev' ? -7 : 7));
        render(); break;
      }
      case 'review-today': ui.reviewWeek = null; render(); break;
      case 'goal-toggle': {
        var gid = el.getAttribute('data-goal');
        S.updateWeek(el.getAttribute('data-week'), function (w) { w.goals.forEach(function (g) { if (g.id === gid) g.done = !g.done; }); });
        break;
      }
      case 'goal-del': {
        var gd = el.getAttribute('data-goal'); var snapG = S.snapshot();
        S.updateWeek(el.getAttribute('data-week'), function (w) { w.goals = w.goals.filter(function (g) { return g.id !== gd; }); });
        toast('Wochenfokus entfernt', snapG); break;
      }
      case 'block-open': e.preventDefault(); openModal({ type: 'block', blockId: el.getAttribute('data-block') }); break;
      case 'block-dur': {
        var bb = S.block(ui.modal && ui.modal.blockId);
        if (bb) { var st = new Date(bb.start).getTime(); S.updateBlock(bb.id, st, st + Number(el.getAttribute('data-min')) * 6e4); }
        break;
      }
      case 'block-del': {
        var bd = S.block(ui.modal && ui.modal.blockId);
        if (bd) { var snapB = S.snapshot(); ui.modal = null; S.deleteBlock(bd.id); toast('Aus dem Kalender genommen', snapB); }
        break;
      }
      case 'block-focus': {
        var bf = S.block(ui.modal && ui.modal.blockId);
        if (bf) { ui.modal = null; if (!S.state.activeTimer || S.state.activeTimer.taskId !== bf.taskId) S.startTimer(bf.taskId); startFocus(bf.taskId); }
        break;
      }
      case 'week-prev': case 'week-next': {
        var base = new Date((ui.weekStart || K.cal.mondayOf(U.dayKey())) + 'T12:00:00');
        ui.weekStart = U.dayKey(U.addDays(base, act === 'week-prev' ? -7 : 7));
        render(); break;
      }
      case 'week-today': ui.weekStart = null; render(); break;
      case 'toggle-weekend': S.setSetting('showWeekend', !S.state.settings.showWeekend); break;
      case 'cal-sync': K.cal.sync(true); break;
      case 'cal-clear': {
        var snapC = S.snapshot(); var keepUrl = S.state.calendar.url;
        S.clearCalendar(); S.setCalendar({ url: keepUrl });
        toast('Termine entfernt', snapC); break;
      }
      case 'modal-close': closeModal(); break;
      case 'modal-close-bg': if (e.target === el) closeModal(); break;
    }
  }

  function onSubmit(e) {
    var form = e.target;
    e.preventDefault();
    if (form.classList.contains('quick-add')) {
      var input = form.querySelector('input');
      var t = captureText(input.value, form.getAttribute('data-list'));
      if (t) { input.value = ''; toast('Angelegt: ' + t.title); }
      return;
    }
    var kind = form.getAttribute('data-act-form');
    if (kind === 'plan-add') { planAdd(form.getAttribute('data-day'), 'bottom'); return; }
    if (kind === 'person') {
      var m = ui.modal;
      var person = $('#person-input').value.trim();
      if (!person) return;
      var fields = { list: m.list, person: person, done: false, doneAt: null };
      var fi = $('#follow-input');
      if (fi) fields.followUp = fi.value || null;
      var snap = S.snapshot();
      if (ui.selectedId === m.taskId) selectNeighbor(m.taskId);
      ui.modal = null;
      S.updateTask(m.taskId, fields);
      toast((m.list === 'waiting' ? 'Warten auf ' : 'Agenda: ') + person, snap);
    } else if (kind === 'editor') {
      var id = ui.modal.taskId;
      var url = $('#ed-url').value.trim();
      var upd = {
        title: $('#ed-title').value.trim() || '(ohne Titel)',
        url: url,
        list: $('#ed-list').value,
        areaId: $('#ed-area').value || null,
        person: $('#ed-person').value.trim(),
        followUp: $('#ed-follow').value || null,
        notes: $('#ed-notes').value,
        planDate: $('#ed-plan').value || null,
        repeat: $('#ed-repeat').value || null
      };
      var cur = S.task(id);
      if (upd.repeat && !upd.planDate) upd.planDate = upd.list === 'today' ? U.dayKey() : U.nextOccurrence(U.dayKey(), upd.repeat);
      if (url !== cur.url) {
        if (url) { var d = L.detect(url); upd.source = d.source; upd.sourceKey = d.key; }
        else { upd.source = cur.source === 'mail' ? 'mail' : ''; upd.sourceKey = ''; }
      }
      ui.modal = null;
      S.updateTask(id, upd);
      S.syncPlanDates();
      toast('Gespeichert');
    } else if (kind === 'confirm') {
      var cm = ui.modal;
      if (cm.typeWord && $('#confirm-word').value.trim().toLowerCase() !== cm.typeWord) { $('#confirm-word').focus(); return; }
      ui.modal = null;
      cm.run();
      render();
    } else if (kind === 'goal-add') {
      var wk = form.getAttribute('data-week');
      var gin = form.querySelector('input');
      var text = gin.value.trim();
      if (!text) return;
      S.updateWeek(wk, function (w) { if (w.goals.length < 3) w.goals.push({ id: U.uid(), text: text, done: false }); });
      setTimeout(function () { var i = document.getElementById(gin.id); if (i) i.focus(); }, 0);
    } else if (kind === 'area-add') {
      var inp = $('#area-new');
      var name = inp.value.trim();
      if (!name) return;
      S.addArea(name, S.nextAreaColor());
      setTimeout(function () { var i = $('#area-new'); if (i) i.focus(); }, 0);
    }
  }

  function onChange(e) {
    var el = e.target;
    if (el.id === 'import-file' && el.files && el.files[0]) { importBackup(el.files[0]); el.value = ''; return; }
    if (el.id === 'ics-file' && el.files && el.files[0]) { importIcsFile(el.files[0]); el.value = ''; return; }
    if (el.id === 'cal-url') {
      var url = el.value.trim();
      S.setCalendar({ url: url, error: null });
      if (url && !/\.html?(\?|$)/i.test(url)) K.cal.sync(true);
      return;
    }
    if (el.hasAttribute('data-repeat-for')) {
      S.updateTask(el.getAttribute('data-repeat-for'), { repeat: el.value });
      toast('Rhythmus geändert');
      return;
    }
    if (el.hasAttribute('data-week-check')) {
      var cid = el.getAttribute('data-week-check'), on = el.checked;
      S.updateWeek(el.getAttribute('data-week'), function (w) { w.checks[cid] = on; });
      return;
    }
    if (el.hasAttribute('data-area')) {
      var field = el.getAttribute('data-field');
      var v = el.value.trim();
      if (field === 'name' && !v) return;
      if (field === 'weeklyTarget') v = v === '' ? null : Math.max(0, Number(v.replace(',', '.')) || 0) || null;
      S.updateArea(el.getAttribute('data-area'), (function () { var o = {}; o[field] = v; return o; })());
      return;
    }
    if (el.hasAttribute('data-setting')) {
      var key = el.getAttribute('data-setting');
      var val = el.type === 'number' ? Number(el.value) : el.value.trim();
      S.setSetting(key, val);
      toast('Gespeichert');
    }
  }

  var notesTimer = null;
  function onInput(e) {
    var el = e.target;
    if (el.id === 'palette-input') {
      ui.palette.q = el.value; ui.palette.idx = 0;
      $('#palette-list').innerHTML = paletteListHTML();
      return;
    }
    if (el.id === 'week-note') {
      clearTimeout(notesTimer);
      var wkn = el.getAttribute('data-week'), txt = el.value;
      notesTimer = setTimeout(function () { S.persistWeekNote(wkn, txt); }, 400);
      return;
    }
    if (el.id === 'focus-notes') {
      clearTimeout(notesTimer);
      var id = el.getAttribute('data-id'), val = el.value;
      notesTimer = setTimeout(function () {
        var t = S.task(id);
        if (t) { t.notes = val; t.updatedAt = U.nowIso(); S.persist(); }
      }, 400);
    }
  }

  function runPalette(i) {
    var it = ui.palette && ui.palette.items[i];
    if (!it) return;
    ui.palette = null;
    it.run();
    render();
  }

  function onKey(e) {
    var mod = e.metaKey || e.ctrlKey;
    var k = e.key;

    if (mod && (k === 'k' || k === 'K')) { e.preventDefault(); ui.palette ? closePalette() : openPalette(); return; }

    if (ui.palette) {
      if (k === 'Escape') { e.preventDefault(); closePalette(); }
      else if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        var n = ui.palette.items.length;
        if (!n) return;
        ui.palette.idx = (ui.palette.idx + (k === 'ArrowDown' ? 1 : n - 1)) % n;
        $('#palette-list').innerHTML = paletteListHTML();
        var act = $('#palette-list .is-active'); if (act) act.scrollIntoView({ block: 'nearest' });
      } else if (k === 'Enter') { e.preventDefault(); runPalette(ui.palette.idx); }
      return;
    }

    if (ui.modal) {
      if (k === 'Escape') { e.preventDefault(); closeModal(); }
      else if (mod && k === 'Enter') { var f = $('#overlay form'); if (f) { e.preventDefault(); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true })); } }
      return;
    }

    var typing = isTyping(e.target);
    if (mod && k === 'Enter') {
      var tid = ui.view === 'fokus' ? ui.focusTaskId : ui.selectedId;
      if (tid) { e.preventDefault(); completeTask(tid); }
      return;
    }
    if (typing) {
      if (k === 'Escape') { e.target.blur(); }
      return;
    }
    if (mod || e.altKey) return;

    var lower = k.length === 1 ? k.toLowerCase() : k;
    var v = VIEWS.find(function (x) { return x.key === k; });
    if (v) { e.preventDefault(); go(v.id); return; }

    switch (lower) {
      case 'n':
        e.preventDefault();
        if (!focusQuickAdd()) { go(ui.view === 'heute' ? 'heute' : 'inbox'); setTimeout(focusQuickAdd, 0); }
        return;
      case '?': e.preventDefault(); openModal({ type: 'help' }); return;
      case 'escape':
      case 'Escape':
        if (ui.view === 'fokus') go(ui.prevView || 'heute');
        else if (ui.selectedId) select(null);
        return;
      case 'j': case 'ArrowDown': case 'k': case 'ArrowUp': {
        var ids = visibleIds();
        if (!ids.length) return;
        e.preventDefault();
        var i = ids.indexOf(ui.selectedId);
        var down = lower === 'j' || k === 'ArrowDown';
        i = i < 0 ? (down ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, i + (down ? 1 : -1)));
        select(ids[i], true);
        return;
      }
      case 'f':
        e.preventDefault();
        if (ui.selectedId) startFocus(ui.selectedId); else go('fokus');
        return;
      case 'p':
        if (ui.selectedId) { e.preventDefault(); planTask(ui.selectedId); }
        return;
      case 't':
        if (ui.view === 'fokus' && ui.focusTaskId) { toggleTimer(ui.focusTaskId); return; }
        if (ui.selectedId) toggleTimer(ui.selectedId);
        return;
    }

    var sel = ui.selectedId && S.task(ui.selectedId);
    if (!sel) return;
    if (lower === 'e' || k === 'Enter') { e.preventDefault(); openModal({ type: 'editor', taskId: sel.id }); return; }
    if (lower === 'x') { e.preventDefault(); sel.done ? S.setDone(sel.id, false) : completeTask(sel.id); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteTask(sel.id); return; }
    var map = { h: 'today', w: 'week', s: 'later', a: 'waiting', g: 'agenda', i: 'inbox' };
    if (map[lower]) {
      e.preventDefault();
      if (sel.list === map[lower] && !sel.done) return;
      moveTask(sel.id, map[lower]);
    }
  }

  function onPaste(e) {
    if (isTyping(e.target) || ui.modal || ui.palette) return;
    var text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text || !text.trim()) return;
    e.preventDefault();
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var snap = S.snapshot();
    var created;
    // Mehrzeiliger Text ohne Links: eine Aufgabe, Rest als Notiz
    if (lines.length > 1 && !/https?:\/\//.test(text)) {
      created = [S.addTask({ title: lines[0].slice(0, 200), notes: lines.slice(1).join('\n') }, 'top')];
    } else {
      created = lines.slice(0, 20).map(function (l) { return captureText(l, 'inbox'); }).filter(Boolean);
    }
    toast(created.length > 1 ? created.length + ' Einträge in der Inbox' : 'In der Inbox: ' + created[0].title, snap);
    if (ui.view !== 'inbox' && ui.view !== 'heute') go('inbox');
  }

  // ---- Drag & Drop: Sortieren und auf Listen ziehen
  var dragId = null;
  function onDragStart(e) {
    var row = e.target.closest && e.target.closest('.task[draggable="true"], .plan-chip[draggable="true"], .pcard[draggable="true"]');
    if (!row) return;
    dragId = row.getAttribute('data-id');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/x-kompass-task', dragId); } catch (err) { }
    row.classList.add('is-dragging');
  }
  function clearDropMarks() {
    $$('.drop-before,.drop-after,.drop-target').forEach(function (el) { el.classList.remove('drop-before', 'drop-after', 'drop-target'); });
  }
  function onDragOver(e) {
    if (dragId) {
      var tl = e.target.closest('.tl');
      if (tl) { e.preventDefault(); clearDropMarks(); K.cal.showGhost(tl, e.clientY, 60); return; }
      K.cal.hideGhost();
      var pcol = e.target.closest('.pcol');
      if (pcol) {
        clearDropMarks();
        if (pcol.classList.contains('is-past')) return;
        e.preventDefault();
        var pc = e.target.closest('.pcard');
        if (pc && pc.getAttribute('data-id') !== dragId && !pc.classList.contains('is-done')) {
          var pr = pc.getBoundingClientRect();
          pc.classList.add(e.clientY < pr.top + pr.height / 2 ? 'drop-before' : 'drop-after');
        } else pcol.classList.add('drop-target');
        return;
      }
      var nav = e.target.closest('[data-drop-list]');
      var row = e.target.closest('.task');
      clearDropMarks();
      if (nav) { e.preventDefault(); nav.classList.add('drop-target'); return; }
      if (row && row.getAttribute('data-id') !== dragId && row.parentElement.getAttribute('data-list')) {
        e.preventDefault();
        var r = row.getBoundingClientRect();
        row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      }
      return;
    }
    // Von außen: Dateien, Links, Text
    var types = Array.prototype.slice.call(e.dataTransfer.types || []);
    if (types.indexOf('Files') >= 0 || types.indexOf('text/uri-list') >= 0 || types.indexOf('text/plain') >= 0) {
      if (isTyping(e.target)) return;
      e.preventDefault();
      document.body.classList.add('is-dropping');
    }
  }
  function onDragLeave(e) {
    if (!e.relatedTarget) document.body.classList.remove('is-dropping');
  }
  function onDrop(e) {
    document.body.classList.remove('is-dropping');
    if (dragId) {
      e.preventDefault();
      var id = dragId;
      var tlDrop = e.target.closest('.tl');
      if (tlDrop) {
        dragId = null;
        var snapD = S.snapshot();
        var b = K.cal.dropTask(id, tlDrop, e.clientY);
        toast('Eingeplant: ' + K.cal.hm(new Date(b.start).getTime()) + '–' + K.cal.hm(new Date(b.end).getTime()), snapD);
        return;
      }
      var pcolDrop = e.target.closest('.pcol');
      if (pcolDrop) {
        var pcard = e.target.closest('.pcard');
        var pBefore = pcard && pcard.classList.contains('drop-before');
        var pAfter = pcard && pcard.classList.contains('drop-after');
        clearDropMarks();
        dragId = null;
        if (pcolDrop.classList.contains('is-past')) return;
        var day = pcolDrop.getAttribute('data-day');
        var ids2 = $$('.pcard:not(.is-done)', pcolDrop).map(function (el) { return el.getAttribute('data-id'); }).filter(function (x) { return x !== id; });
        var pos = ids2.length;
        if (pcard && (pBefore || pAfter)) { var at2 = ids2.indexOf(pcard.getAttribute('data-id')); if (at2 >= 0) pos = pBefore ? at2 : at2 + 1; }
        ids2.splice(pos, 0, id);
        var snapP = S.snapshot();
        var moved = S.task(id);
        var sameDay = moved && (moved.planDate === day || (day === U.dayKey() && moved.list === 'today'));
        S.planOn(id, day, ids2);
        if (!sameDay) toast('Verschoben auf ' + (day === U.dayKey() ? 'heute' : shortDate(day)), snapP);
        return;
      }
      var nav = e.target.closest('[data-drop-list]');
      var row = e.target.closest('.task');
      var before = row && row.classList.contains('drop-before');
      clearDropMarks();
      dragId = null;
      if (nav) { moveTask(id, nav.getAttribute('data-drop-list')); return; }
      if (row && row.getAttribute('data-id') !== id) {
        var ul = row.parentElement;
        var list = ul.getAttribute('data-list');
        var t = S.task(id);
        if (!list || !t) return;
        if (t.list !== list) { S.updateTask(id, { list: list }); }
        var ids = $$('.task', ul).map(function (el) { return el.getAttribute('data-id'); }).filter(function (x) { return x !== id; });
        var at = ids.indexOf(row.getAttribute('data-id'));
        ids.splice(before ? at : at + 1, 0, id);
        S.reorder(list, ids);
      }
      return;
    }
    if (isTyping(e.target)) return;
    e.preventDefault();
    handleDrop(e.dataTransfer);
  }
  function onDragEnd() { dragId = null; clearDropMarks(); K.cal.hideGhost(); $$('.is-dragging').forEach(function (el) { el.classList.remove('is-dragging'); }); }

  // ---- Erfassen über das Bookmarklet (?capture=1&t=…&u=…&s=…)
  function handleCapture() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (!q.get('capture')) return;
    var url = q.get('u') || '', title = q.get('t') || '', sel = q.get('s') || '';
    var d = url ? L.detect(url) : { source: '', key: '', suggestion: '' };
    var clean = L.cleanTitle(title, d.source, d.key) || d.suggestion || url;
    var dup = url && S.tasks().find(function (t) { return !t.done && t.url === url; });
    try { history.replaceState(null, '', location.pathname + '#inbox'); } catch (e) { }
    ui.view = 'inbox';
    if (dup) { setTimeout(function () { toast('Ist schon da: ' + dup.title); }, 50); ui.selectedId = dup.id; return; }
    var t = S.addTask({ title: clean, url: url, source: d.source, sourceKey: d.key, notes: sel }, 'top');
    ui.selectedId = t.id;
    setTimeout(function () { toast('Aus ' + ((L.SOURCES[d.source] || L.SOURCES.web).label) + ' übernommen: ' + clean); }, 50);
  }

  // ------------------------------------------------------------------ Start
  function boot() {
    K.app = { toast: toast, openModal: openModal, render: render };
    S.load();
    S.syncPlanDates();
    applyTheme();
    try { window.name = 'kompass'; } catch (e) { }

    var hash = (location.hash || '').replace('#', '');
    if (viewById(hash) || hash === 'fokus' || hash === 'optionen') ui.view = hash;
    else if (hash === 'kalender-verbinden') ui.view = 'optionen';
    if (ui.view === 'fokus' && S.state.activeTimer) ui.focusTaskId = S.state.activeTimer.taskId;
    handleCapture();

    S.subscribe(schedule);
    render();

    document.addEventListener('click', onClick);
    document.addEventListener('dblclick', function (e) {
      var m = e.target.closest('.task-main');
      if (m && !e.target.closest('a')) openModal({ type: 'editor', taskId: m.getAttribute('data-id') });
    });
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', onDragEnd);
    window.addEventListener('hashchange', function () {
      var h = (location.hash || '').replace('#', '');
      if ((viewById(h) || h === 'fokus' || h === 'optionen') && h !== ui.view) go(h);
    });
    window.addEventListener('storage', function (e) { if (e.key === 'kompass.v1') { S.reloadFromStorage(); applyTheme(); } });
    try {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    } catch (e) { }

    setInterval(tick, 1000);
    // Beim Tageswechsel neu zeichnen
    var lastDay = U.dayKey();
    setInterval(function () {
      if (U.dayKey() !== lastDay) { lastDay = U.dayKey(); S.syncPlanDates(); render(); return; }
      // Jetzt-Linie und freie Zeit nachziehen, aber nicht mitten in einer Eingabe oder beim Ziehen
      if ((ui.view === 'heute' || ui.view === 'kalender') && !ui.modal && !ui.palette && !K.cal.isDragging() && !dragId && !isTyping(document.activeElement)) render();
    }, 60000);
    K.cal.maybeAutoSync();
    setInterval(K.cal.maybeAutoSync, 5 * 60000);

    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'localhost') {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.K = window.K || {});
