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
    { id: 'woche', label: 'Diese Woche', key: '3', list: 'week', hint: 'Steht an, aber nicht heute.' },
    { id: 'spaeter', label: 'Später', key: '4', list: 'later', hint: 'Irgendwann, ohne Termin. Einmal pro Woche durchsehen.' },
    { id: 'warten', label: 'Warten auf', key: '5', list: 'waiting', hint: 'Liegt bei jemand anderem. Mit Datum, wann du nachfasst.' },
    { id: 'agenda', label: 'Agenda', key: '6', list: 'agenda', hint: 'Themen, die du im nächsten Gespräch mit dieser Person ansprichst.' },
    { id: 'erledigt', label: 'Erledigt', key: '7' }
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
    showDoneToday: false
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

  function taskRow(t, opts) {
    opts = opts || {};
    var running = S.state.activeTimer && S.state.activeTimer.taskId === t.id;
    var sel = ui.selectedId === t.id;
    var meta = [areaChip(t), sourceChip(t), opts.hidePerson ? '' : (t.person && !opts.hidePerson ? '<span class="chip person">' + esc(t.person) + '</span>' : ''), followChip(t), ageChip(t), timeChip(t), t.example ? '<span class="chip example">Beispiel</span>' : ''].join('');
    var actions = '';
    if (!t.done) {
      if (t.list === 'inbox' || opts.triage) {
        actions += TRIAGE.filter(function (x) { return x.list !== t.list; }).map(function (x) {
          return '<button type="button" class="tbtn" data-act="move" data-id="' + esc(t.id) + '" data-list="' + x.list + '" title="' + x.label + ' (' + x.key + ')">' + x.label + '</button>';
        }).join('');
      }
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

    var html = header(longDate(new Date()), '', right);
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
        '<label class="field"><span>Fokusziel pro Tag (Stunden)</span><input id="set-target" type="number" min="0.5" max="12" step="0.5" value="' + esc(s.dailyFocusTarget) + '" data-setting="dailyFocusTarget" /></label>' +
      '</section>' +

      '<section class="card"><h2>Bereiche</h2><p class="muted">Sie ordnen deine Aufgaben thematisch. In der Eingabe mit <code>#Name</code> zuweisen, z. B. <code>#stake</code>.</p>' +
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

  function mainHTML() {
    var v = viewById(ui.view);
    var body;
    if (ui.view === 'heute') body = viewToday();
    else if (ui.view === 'fokus') body = viewFocus();
    else if (ui.view === 'optionen') body = viewSettings();
    else if (ui.view === 'warten') body = viewWaiting(v);
    else if (ui.view === 'agenda') body = viewAgenda(v);
    else if (ui.view === 'erledigt') body = viewDone(v);
    else body = viewList(v);
    return '<div class="main-inner' + (ui.view === 'fokus' ? ' is-focus' : '') + '">' + banners() + body + '</div>';
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
        '<label class="field"><span>Notizen</span><textarea id="ed-notes" rows="5">' + esc(e.notes) + '</textarea></label>' +
        '<p class="muted small">Erfasst ' + esc(new Date(e.createdAt).toLocaleString('de-DE')) + (S.secondsOnTask(e.id) ? ' · ' + fmtDur(S.secondsOnTask(e.id)) + ' Fokuszeit' : '') + '</p>' +
        '<div class="modal-btns"><button type="button" class="btn ghost danger" data-act="del" data-id="' + esc(e.id) + '">Löschen</button><span class="spacer"></span><button type="button" class="btn ghost" data-act="modal-close">Abbrechen</button><button type="submit" class="btn primary">Speichern</button></div>' +
      '</form>';
    } else if (m.type === 'confirm') {
      inner = '<form class="modal-form" data-act-form="confirm"><h2>' + esc(m.title) + '</h2><p>' + esc(m.text) + '</p>' +
        (m.typeWord ? '<label class="field"><span>Zum Bestätigen „' + esc(m.typeWord) + '“ eingeben</span><input id="confirm-word" type="text" autocomplete="off" /></label>' : '') +
        '<div class="modal-btns"><button type="button" class="btn ghost" data-act="modal-close">Abbrechen</button><button type="submit" class="btn ' + (m.danger ? 'danger-solid' : 'primary') + '">' + esc(m.ok) + '</button></div></form>';
    } else if (m.type === 'help') {
      var rows = [
        [MOD + ' K', 'Suchen und springen'], ['N', 'Neue Aufgabe'], [MOD + ' V', 'Link oder Text in die Inbox einfügen'],
        ['1 – 7', 'Listen wechseln'], ['J / K oder ↓ / ↑', 'Aufgabe auswählen'], ['E oder ↵', 'Bearbeiten'],
        ['X oder ' + MOD + ' ↵', 'Erledigt'], ['H W S A G I', 'Nach Heute, Woche, Später, Warten, Agenda, Inbox'],
        ['F', 'Fokus auf die Aufgabe'], ['T', 'Timer starten oder stoppen'], ['Entf', 'Löschen (mit Rückgängig)'], ['Esc', 'Schließen, Fokus verlassen']
      ];
      inner = '<div class="modal-form"><h2>Tastenkürzel</h2><table class="keys">' + rows.map(function (r) { return '<tr><td><kbd>' + esc(r[0]) + '</kbd></td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
        '<p class="muted small">Aufgaben lassen sich per Drag & Drop sortieren oder auf einen Listennamen links ziehen.</p>' +
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
  function toggleTimer(id) {
    var a = S.state.activeTimer;
    if (a && a.taskId === id) S.stopTimer();
    else S.startTimer(id);
  }
  function visibleIds() { return $$('#main .task').map(function (el) { return el.getAttribute('data-id'); }); }
  function selectNeighbor(id) {
    var ids = visibleIds();
    var i = ids.indexOf(id);
    ui.selectedId = ids[i + 1] || ids[i - 1] || null;
  }
  function select(id, scroll) {
    ui.selectedId = id;
    $$('#main .task').forEach(function (el) { el.classList.toggle('is-selected', el.getAttribute('data-id') === id); });
    if (scroll) { var row = $('#main .task.is-selected'); if (row) row.scrollIntoView({ block: 'nearest' }); }
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
  function captureText(text, list, extra) {
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
    return S.addTask(fields, (list || 'inbox') === 'inbox' ? 'top' : 'bottom');
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
          toast('Kalender-Import kommt mit der Kalenderansicht in Phase 2.');
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
        notes: $('#ed-notes').value
      };
      var cur = S.task(id);
      if (url !== cur.url) {
        if (url) { var d = L.detect(url); upd.source = d.source; upd.sourceKey = d.key; }
        else { upd.source = cur.source === 'mail' ? 'mail' : ''; upd.sourceKey = ''; }
      }
      ui.modal = null;
      S.updateTask(id, upd);
      toast('Gespeichert');
    } else if (kind === 'confirm') {
      var cm = ui.modal;
      if (cm.typeWord && $('#confirm-word').value.trim().toLowerCase() !== cm.typeWord) { $('#confirm-word').focus(); return; }
      ui.modal = null;
      cm.run();
      render();
    } else if (kind === 'area-add') {
      var inp = $('#area-new');
      var name = inp.value.trim();
      if (!name) return;
      var palette = ['#4f7cac', '#3f9a8a', '#b5793a', '#8a63b8', '#7a8490', '#b2546a', '#5c8f3a'];
      S.addArea(name, palette[S.state.areas.length % palette.length]);
      setTimeout(function () { var i = $('#area-new'); if (i) i.focus(); }, 0);
    }
  }

  function onChange(e) {
    var el = e.target;
    if (el.id === 'import-file' && el.files && el.files[0]) { importBackup(el.files[0]); el.value = ''; return; }
    if (el.hasAttribute('data-area')) {
      var v = el.value.trim();
      if (el.getAttribute('data-field') === 'name' && !v) return;
      S.updateArea(el.getAttribute('data-area'), (function () { var o = {}; o[el.getAttribute('data-field')] = v; return o; })());
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
    var row = e.target.closest && e.target.closest('.task[draggable="true"]');
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
  function onDragEnd() { dragId = null; clearDropMarks(); $$('.is-dragging').forEach(function (el) { el.classList.remove('is-dragging'); }); }

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
    S.load();
    applyTheme();
    try { window.name = 'kompass'; } catch (e) { }

    var hash = (location.hash || '').replace('#', '');
    if (viewById(hash) || hash === 'fokus' || hash === 'optionen') ui.view = hash;
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
    setInterval(function () { if (U.dayKey() !== lastDay) { lastDay = U.dayKey(); render(); } }, 60000);

    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'localhost') {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.K = window.K || {});
