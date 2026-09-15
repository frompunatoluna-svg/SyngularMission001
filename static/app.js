/*
 * SYNGULAR — Mission 000 / browser demo controller.
 *
 * Everything runs locally: PDF.js is served from this site, the selected file
 * is read with FileReader/arrayBuffer, hashed with crypto.subtle and analysed
 * in memory. No request carries document content anywhere.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var selectedFile = null;
  var busy = false;

  function setStatus(text, tone) {
    var el = $('status');
    el.textContent = text;
    el.className = 'status' + (tone ? ' ' + tone : '');
  }

  function setBusy(state) {
    busy = state;
    $('analyze').disabled = state || !selectedFile;
    $('demo').disabled = state;
    $('choose').setAttribute('aria-disabled', state ? 'true' : 'false');
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */
  function render(report) {
    $('pages').textContent = report.pages === null || report.pages === undefined ? '—' : report.pages;
    $('claimsN').textContent = (report.claims || []).length;
    $('gapsN').textContent = (report.evidence_gaps || []).length;

    $('site').textContent = report.site || 'UNKNOWN';
    $('summary').textContent = report.territory_summary || '';
    $('provenance').textContent =
      'Document: ' + (report.document_name || 'UNKNOWN') +
      ' · pages: ' + (report.pages === null || report.pages === undefined ? 'UNKNOWN' : report.pages) +
      ' · SHA-256: ' + (report.document_sha256 || 'UNKNOWN') +
      ' · parsed: ' + (report.parsed_where || 'UNKNOWN') +
      ' · engine: ' + (report.engine || 'UNKNOWN');

    var claims = report.claims || [];
    $('claims').innerHTML = claims.length ? claims.map(function (c) {
      return '<div class="claim">' +
        '<span class="pill">' + escapeHtml(c.evidence_state) + '</span> ' +
        '<span class="small">p.' + escapeHtml(c.page === null || c.page === undefined ? '—' : c.page) +
        ' · confidence ' + Math.round((c.confidence || 0) * 100) + '%' +
        (c.detector ? ' · ' + escapeHtml(c.detector) : '') + '</span>' +
        '<div style="margin-top:9px">' + escapeHtml(c.text) + '</div>' +
        '<div class="small" style="margin-top:8px">' + escapeHtml(c.variable || 'variable UNKNOWN') +
        ' · ' + escapeHtml(c.location || 'location UNKNOWN') + '</div>' +
        '<div class="small" style="margin-top:8px">Expected: ' + escapeHtml(c.expected_state || 'UNKNOWN') + '</div>' +
        '</div>';
    }).join('') : '<p class="small">No Mission 000 pattern matched. This prototype recognises a small library of evidence patterns; absence of a match is not evidence of absence in the document.</p>';

    var gaps = report.evidence_gaps || [];
    $('gaps').innerHTML = gaps.length ? gaps.map(function (g) {
      return '<div class="claim"><b>' + escapeHtml(g.title) + '</b>' +
        '<div class="small" style="margin-top:7px">' + escapeHtml(g.why_it_matters) + '</div>' +
        '<div class="small" style="margin-top:7px"><b>Missing:</b> ' + escapeHtml(g.missing_evidence) + '</div>' +
        '<div style="margin-top:6px">' + (g.measurement_targets || []).map(function (t) {
          return '<span class="tag">' + escapeHtml(t) + '</span>';
        }).join('') + '</div></div>';
    }).join('') : '<p class="small">No evidence gaps derived.</p>';

    var excerpts = report.source_excerpts || [];
    $('excerpts').innerHTML = excerpts.length ? excerpts.map(function (e) {
      return '<div class="claim"><div class="small">p.' +
        escapeHtml(e.page === null || e.page === undefined ? '—' : e.page) + ' · ' + escapeHtml(e.label) + '</div>' +
        '<blockquote class="quote">' + escapeHtml(e.text) + '</blockquote></div>';
    }).join('') : '<p class="small">No source excerpts extracted.</p>';

    var m = report.recommended_mission || {};
    $('mname').textContent = m.mission_name || 'UNKNOWN';
    $('mobjective').textContent = m.objective || 'UNKNOWN';
    $('mfirst').textContent = 'First field action: ' + (m.first_field_action || 'UNKNOWN');
    $('mrecord').textContent = 'MINIMUM RECORD\n' + (m.minimum_record || []).map(function (x, i) {
      return String(i + 1).padStart(2, '0') + '  ' + x;
    }).join('\n');
    $('mnext').textContent = 'Next step: ' + (m.next_step || 'UNKNOWN');

    $('guardrails').innerHTML = (report.guardrails || []).map(function (g) {
      return '<li>' + escapeHtml(g) + '</li>';
    }).join('');

    $('results').hidden = false;
  }

  /* ---------------------------------------------------------------- *
   * PDF parsing (local)
   * ---------------------------------------------------------------- */
  function pdfLib() {
    return window.pdfjsLib;
  }

  function yieldToBrowser() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  async function sha256Hex(buffer) {
    if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest) {
      return 'UNAVAILABLE — crypto.subtle requires a secure context (https)';
    }
    try {
      var digest = await window.crypto.subtle.digest('SHA-256', buffer);
      return Array.prototype.map.call(new Uint8Array(digest), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    } catch (err) {
      return 'UNAVAILABLE';
    }
  }

  async function analyze() {
    if (busy) return;
    if (!selectedFile) {
      setStatus('Choose a PDF first.', 'warn');
      return;
    }
    if (!pdfLib()) {
      setStatus('PDF.js could not be loaded, so local parsing is unavailable. Reload the page and try again.', 'warn');
      return;
    }

    setBusy(true);
    setStatus('Reading PDF… opening document', 'busy');

    try {
      var buffer = await selectedFile.arrayBuffer();
      var hash = await sha256Hex(buffer);

      var pdf = await pdfLib().getDocument({ data: new Uint8Array(buffer) }).promise;
      var total = pdf.numPages;
      var pageTexts = [];

      for (var n = 1; n <= total; n++) {
        setStatus('Reading PDF… page ' + n + '/' + total, 'busy');
        if (n % 5 === 1) await yieldToBrowser();
        var page = await pdf.getPage(n);
        var content = await page.getTextContent();
        pageTexts.push(content.items.map(function (item) {
          return item.str + (item.hasEOL ? '\n' : '');
        }).join(''));
        if (page.cleanup) page.cleanup();
      }

      if (pageTexts.join('').replace(/\s+/g, '').length < 40) {
        setStatus('This prototype requires a text-readable PDF. Scanned-image PDFs are not yet supported.', 'warn');
        setBusy(false);
        return;
      }

      setStatus('Analyzing ' + total + ' pages…', 'busy');
      await yieldToBrowser();

      var report = window.Mission000.buildReport({
        pageTexts: pageTexts,
        documentName: selectedFile.name,
        sha256: hash,
        pdfjsVersion: pdfLib().version || 'unknown'
      });

      render(report);
      $('caseBanner').hidden = true;
      setStatus('Analyzed: ' + selectedFile.name, 'ok');
    } catch (err) {
      setStatus('Could not parse this PDF locally: ' + (err && err.message ? err.message : String(err)), 'warn');
    } finally {
      setBusy(false);
    }
  }

  function loadRealCase() {
    if (busy) return;
    render(window.Mission000DemoCase);
    $('caseBanner').hidden = false;
    setStatus('Loaded reference case: 2024_IIA Cateo 1264-J-2009.pdf (no PDF parsed on this device)', 'ok');
  }

  /* ---------------------------------------------------------------- *
   * Wiring
   * ---------------------------------------------------------------- */
  function init() {
    var input = $('file');

    $('choose').addEventListener('click', function () {
      if (!busy) input.click();
    });

    input.addEventListener('change', function () {
      selectedFile = input.files && input.files[0] ? input.files[0] : null;
      if (selectedFile) {
        $('filename').textContent = selectedFile.name + ' · ' + humanSize(selectedFile.size);
        setStatus('Selected: ' + selectedFile.name + ' — nothing has been uploaded. Click “Analyze document”.', '');
      } else {
        $('filename').textContent = 'No file selected';
        setStatus('Ready. Choose a text-readable PDF, then click “Analyze document”.', '');
      }
      setBusy(false);
    });

    $('analyze').addEventListener('click', analyze);
    $('demo').addEventListener('click', loadRealCase);

    if (window.Mission000) {
      $('guardrails').innerHTML = window.Mission000.GUARDRAILS.map(function (g) {
        return '<li>' + escapeHtml(g) + '</li>';
      }).join('');
    }

    setBusy(false);
    if (!pdfLib()) {
      setStatus('PDF.js failed to load. Local PDF parsing is unavailable; “Load real case” still works.', 'warn');
    } else {
      setStatus('Ready. Choose a text-readable PDF, then click “Analyze document”.', '');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
