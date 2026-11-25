/* Kompass – erkennt, woher ein Link oder eine Datei kommt,
 * und schlägt einen brauchbaren Titel vor. */
(function (K) {
  'use strict';

  var SOURCES = {
    jira: { label: 'Jira' },
    confluence: { label: 'Confluence' },
    teams: { label: 'Teams' },
    mail: { label: 'Mail' },
    sharepoint: { label: 'SharePoint' },
    web: { label: 'Link' }
  };

  var URL_RE = /https?:\/\/[^\s<>"']+/i;

  function safeDecode(s) {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s.replace(/\+/g, ' '); }
  }

  function detect(url) {
    var u;
    try { u = new URL(url); } catch (e) { return { source: 'web', key: '', suggestion: url }; }
    var host = u.hostname.toLowerCase();
    var path = u.pathname;

    if (/(^|\.)atlassian\.net$/.test(host) || /jira/.test(host) || /confluence/.test(host)) {
      if (/\/wiki\//.test(path) || /confluence/.test(host)) {
        var m = path.match(/\/pages\/\d+\/([^/]+)/);
        return { source: 'confluence', key: '', suggestion: m ? safeDecode(m[1]) : 'Confluence-Seite' };
      }
      var key = '';
      var mk = path.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
      if (mk) key = mk[1].toUpperCase();
      var sel = u.searchParams.get('selectedIssue');
      if (!key && sel) key = sel.toUpperCase();
      return { source: 'jira', key: key, suggestion: key || 'Jira-Ticket' };
    }
    if (/teams\.(microsoft|cloud\.microsoft|live)\.com$/.test(host) || host === 'teams.cloud.microsoft') {
      return { source: 'teams', key: '', suggestion: 'Teams-Nachricht' };
    }
    if (/^outlook\.(office|office365|live)\.com$/.test(host) || host === 'outlook.cloud.microsoft') {
      return { source: 'mail', key: '', suggestion: 'Mail' };
    }
    if (/\.sharepoint\.com$/.test(host)) {
      var file = safeDecode(path.split('/').filter(Boolean).pop() || '');
      return { source: 'sharepoint', key: '', suggestion: file || 'Dokument' };
    }
    return { source: 'web', key: '', suggestion: host.replace(/^www\./, '') };
  }

  /* Seitentitel aus Jira/Confluence/Teams/Outlook säubern */
  function cleanTitle(title, source, key) {
    var t = String(title || '').trim();
    var isConfluence = /\s[-|–]\s*Confluence\s*$/i.test(t) || source === 'confluence';
    t = t.replace(/\s*[-|–]\s*(Jira|Confluence|Microsoft Teams|Teams|Outlook|Mail|SharePoint)\s*$/i, '');
    // Confluence hängt den Bereichsnamen an: "Seite - Bereich - Confluence"
    if (isConfluence) t = t.replace(/\s+[-–]\s+[^-–]{1,60}$/, '');
    if (key) t = t.replace(new RegExp('^\\[?' + key + '\\]?\\s*[:\\-–]?\\s*'), '');
    return t.trim();
  }

  /* Freitext mit oder ohne Link in Aufgabenfelder zerlegen */
  function parse(text, jiraBase) {
    text = String(text || '').trim();
    var m = text.match(URL_RE);
    if (!m) {
      // "SHOP-142 Text" wird zum Jira-Link, wenn die Jira-Adresse hinterlegt ist
      var jk = text.match(/^([A-Z][A-Z0-9_]{1,14}-\d{1,7})\b[\s:–-]*(.*)$/);
      if (jk && jiraBase) {
        return { title: jk[2] || jk[1], url: jiraBase.replace(/\/+$/, '') + '/browse/' + jk[1], source: 'jira', sourceKey: jk[1] };
      }
      return { title: text, url: '', source: '', sourceKey: '' };
    }
    var url = m[0].replace(/[).,;]+$/, '');
    var rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
    var d = detect(url);
    return { title: rest || d.suggestion, url: url, source: d.source, sourceKey: d.key };
  }

  /* Betreff und Absender aus einer .eml-Datei lesen */
  function decodeWords(s) {
    return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, function (_, charset, enc, data) {
      try {
        var bytes;
        if (enc.toUpperCase() === 'B') {
          var bin = atob(data);
          bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } else {
          var q = data.replace(/_/g, ' ');
          var arr = [];
          for (var j = 0; j < q.length; j++) {
            if (q[j] === '=' && /[0-9A-F]{2}/i.test(q.substr(j + 1, 2))) { arr.push(parseInt(q.substr(j + 1, 2), 16)); j += 2; }
            else arr.push(q.charCodeAt(j));
          }
          bytes = new Uint8Array(arr);
        }
        return new TextDecoder(charset).decode(bytes);
      } catch (e) { return data; }
    }).replace(/\?=\s+=\?/g, '');
  }
  function parseEml(text) {
    var head = text.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
    var get = function (name) {
      var m = head.match(new RegExp('^' + name + ':\\s*(.*)$', 'im'));
      return m ? decodeWords(m[1]).trim() : '';
    };
    var from = get('From').replace(/<[^>]*>/, '').replace(/"/g, '').trim();
    return { subject: get('Subject'), from: from };
  }

  K.links = { SOURCES: SOURCES, detect: detect, parse: parse, cleanTitle: cleanTitle, parseEml: parseEml };
})(window.K = window.K || {});
