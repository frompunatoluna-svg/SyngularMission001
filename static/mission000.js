/*
 * SYNGULAR — Mission 000 / browser-side analysis engine.
 *
 * Pure functions over text that was already extracted from a PDF in this
 * browser. Nothing here performs network I/O: the document never leaves the
 * device. Exposed as window.Mission000.
 */
(function (global) {
  'use strict';

  var MISSION_ID = 'MISSION-000';
  var ENGINE_VERSION = '0.3.0-browser';

  var GUARDRAILS = [
    'Document statements are labeled as DOCUMENTED_STATIC, not as live measurements.',
    'The system does not infer compliance, causality or legal status from the PDF.',
    'Any missing information remains UNKNOWN until independently observed or sourced.',
    'Recommendations are measurement hypotheses, not legal or environmental certification.',
    'Parsing happens entirely in this browser. The document is not uploaded, stored or logged anywhere.'
  ];

  var TERRITORY_SUMMARY =
    'Mission 000 converts a static IIA into an evidence-oriented measurement plan. ' +
    'This demo does not assess legal compliance or prove environmental impact.';

  var NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  function numberWord(n) {
    return NUMBER_WORDS[n] || String(n);
  }

  /* ------------------------------------------------------------------ *
   * Text folding: lowercase, strip diacritics, collapse whitespace,
   * while keeping an index map back into the original page text so that
   * excerpts can be quoted verbatim.
   * ------------------------------------------------------------------ */
  function fold(raw) {
    var out = [];
    var map = [];
    var pendingSpace = false;
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (/\s/.test(ch)) {
        if (out.length) pendingSpace = true;
        continue;
      }
      if (pendingSpace) {
        out.push(' ');
        map.push(i);
        pendingSpace = false;
      }
      var folded = ch.toLowerCase();
      if (folded.normalize) folded = folded.normalize('NFD').replace(/[̀-ͯ]/g, '');
      for (var k = 0; k < folded.length; k++) {
        out.push(folded.charAt(k));
        map.push(i);
      }
    }
    return { text: out.join(''), map: map };
  }

  function makePage(pageNumber, rawText) {
    var folded = fold(rawText || '');
    return { page: pageNumber, raw: rawText || '', folded: folded.text, map: folded.map };
  }

  function combinePages(a, b) {
    var joinIndex = a.raw.length;
    var map = a.map.slice();
    map.push(joinIndex);
    for (var i = 0; i < b.map.length; i++) map.push(b.map[i] + joinIndex + 1);
    return {
      page: a.page,
      raw: a.raw + '\n' + b.raw,
      folded: a.folded + ' ' + b.folded,
      map: map
    };
  }

  function collapse(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function excerptAround(page, foldedStart, foldedEnd, pad) {
    var rawStart = page.map[foldedStart];
    var rawEnd = page.map[Math.min(foldedEnd, page.map.length - 1)];
    if (rawStart === undefined || rawEnd === undefined) return '';
    var from = Math.max(0, rawStart - pad);
    var to = Math.min(page.raw.length, rawEnd + 1 + pad);
    var text = collapse(page.raw.slice(from, to));
    if (from > 0) text = '… ' + text;
    if (to < page.raw.length) text = text + ' …';
    return text;
  }

  function groupRaw(page, match, groupIndex) {
    var group = match[groupIndex];
    if (!group) return null;
    var offset = match[0].indexOf(group);
    if (offset < 0) return null;
    var start = match.index + offset;
    var end = start + group.length - 1;
    var rawStart = page.map[start];
    var rawEnd = page.map[Math.min(end, page.map.length - 1)];
    if (rawStart === undefined || rawEnd === undefined) return null;
    return collapse(page.raw.slice(rawStart, rawEnd + 1));
  }

  /*
   * Search page by page, then across adjacent page boundaries so a phrase
   * split by a page break is still found.
   */
  function searchPages(pages, regex) {
    var i, match;
    for (i = 0; i < pages.length; i++) {
      match = regex.exec(pages[i].folded);
      if (match) return { page: pages[i], match: match, pageNumber: pages[i].page };
    }
    for (i = 0; i < pages.length - 1; i++) {
      if (!pages[i].folded || !pages[i + 1].folded) continue;
      var combined = combinePages(pages[i], pages[i + 1]);
      match = regex.exec(combined.folded);
      if (match) return { page: combined, match: match, pageNumber: pages[i].page };
    }
    return null;
  }

  function findAny(pages, regexes) {
    for (var i = 0; i < regexes.length; i++) {
      var hit = searchPages(pages, regexes[i]);
      if (hit) {
        hit.pattern = regexes[i].source;
        return hit;
      }
    }
    return null;
  }

  function findAll(pages, regexes) {
    var hits = [];
    for (var i = 0; i < regexes.length; i++) {
      var hit = searchPages(pages, regexes[i]);
      if (!hit) return null;
      hits.push(hit);
    }
    return hits[0];
  }

  /* ------------------------------------------------------------------ *
   * Pattern library
   * ------------------------------------------------------------------ */

  // 1. The document states surface-water quality information was not available.
  var NO_SURFACE_WATER_DATA = [
    /no contamos con informacion disponible de calidad de agua superficial/,
    /no (?:se )?(?:contamos|cuenta|contaba|contabamos|dispone|disponemos|disponia|disponiamos)(?: con| de)*(?: la)? informacion(?: disponible)?(?: sobre| de| del| respecto (?:a|de))*(?: la)? calidad (?:de|del) agua(?:s)? superficial(?:es)?/,
    /(?:no existe|no existen|no hay|no se dispone de|carece de|carecemos de|sin) informacion(?: disponible)?(?: sobre| de| del)*(?: la)? calidad (?:de|del) agua(?:s)? superficial(?:es)?/,
    /(?:informacion|datos|antecedentes) (?:de|sobre|del) calidad (?:de|del) agua(?:s)? superficial(?:es)?[^.]{0,80}no (?:se encuentra|se encuentran|esta|estan|estaba|estaban|fue|fueron|era|eran|resulta) disponible/,
    /(?:no |lack of )?(?:site[- ]specific )?surface[- ]water quality (?:data|information|records)[^.]{0,80}(?:not available|unavailable|not exist|is lacking|were not available|was not available)/,
    /no (?:site[- ]specific )?surface[- ]water quality (?:data|information|records)/
  ];

  // 2. The document proposes surface-water monitoring points / variables (RDA).
  var PROPOSED_WATER_POINTS = [
    /tabla \d+ ?:? ?ubicacion de sitios propuestos de rda/,
    /ubicacion de (?:los )?sitios propuestos de rda/,
    /sitios propuestos de rda/,
    /(?:sitios|puntos|estaciones) propuestos? de (?:monitoreo|muestreo|control)(?: de)?(?: agua| aguas)?(?: superficial(?:es)?)?/,
    /(?:tres|3) (?:sitios|puntos|estaciones) de (?:monitoreo|muestreo|control)(?: de)?(?: agua| aguas)(?: superficial(?:es)?)?/,
    /(?:three|3) (?:proposed )?surface[- ]water (?:monitoring|sampling) (?:points|sites|stations)/
  ];

  var WATER_POINT_CODES = /\bag\s?-\s?0*(\d{1,2})\b/g;

  // 3. Generic fallback: the document says some information was not available.
  var GENERIC_MISSING_INFO = [
    /no (?:se )?(?:contamos|cuenta|contaba|dispone|disponemos|disponia) (?:con|de) (?:informacion|datos|antecedentes|registros)/,
    /no (?:hay|existe|existen) (?:informacion|datos|antecedentes|registros)(?: disponibles?)?/,
    /(?:informacion|datos) no disponibles?/,
    /sin (?:informacion|datos|registros)(?: disponibles?)?(?: al momento| a la fecha)/,
    /(?:data|information|records) (?:is|are|was|were) not available/,
    /no (?:data|information|records) (?:is|are|was|were)? ?available/
  ];

  // 4. Generic fallback: the document proposes a monitoring design.
  var GENERIC_MONITORING_PLAN = [
    /plan de (?:monitoreo|vigilancia|seguimiento) ambiental/,
    /programa de (?:monitoreo|vigilancia|seguimiento)/,
    /(?:puntos|sitios|estaciones) de (?:monitoreo|muestreo)/,
    /red de (?:monitoreo|muestreo)/,
    /(?:environmental )?monitoring (?:plan|program|programme)/,
    /(?:sampling|monitoring) (?:points|sites|stations)/
  ];

  var SITE_PATTERNS = {
    cateo: [/\bcateo\s+n?o?\.?\s*(\d{2,6}\s?-\s?[a-z]\s?-\s?\d{4})\b/, /\b(\d{3,6}\s?-\s?[a-z]\s?-\s?\d{4})\b/],
    water_body: [/\b(?:laguna|salar|salinas|rio|cuenca)\s+(?:de\s+|del\s+)?([a-z]{4,})\b/],
    department: [/\bdepartamento\s+(?:de\s+|del\s+)?([a-z]{4,})\b/, /\bdpto\.?\s+(?:de\s+)?([a-z]{4,})\b/],
    province: [/\bprovincia\s+(?:de\s+|del\s+)?([a-z]{4,})\b/]
  };

  function titleCase(value) {
    return value.replace(/\b[a-záéíóúñ]/g, function (c) { return c.toUpperCase(); });
  }

  function resolveSite(pages) {
    var parts = [];
    var evidence = [];

    var cateo = findAny(pages, SITE_PATTERNS.cateo);
    if (cateo) {
      var code = groupRaw(cateo.page, cateo.match, 1);
      if (code) {
        parts.push('Cateo ' + code.replace(/\s+/g, '').toUpperCase());
        evidence.push({ field: 'cateo', page: cateo.pageNumber });
      }
    }

    var water = findAny(pages, SITE_PATTERNS.water_body);
    if (water) {
      var body = groupRaw(water.page, water.match, 0);
      if (body) {
        parts.push(titleCase(collapse(body)));
        evidence.push({ field: 'water_body', page: water.pageNumber });
      }
    }

    var department = findAny(pages, SITE_PATTERNS.department);
    if (department) {
      var dep = groupRaw(department.page, department.match, 1);
      if (dep) {
        parts.push('Departamento ' + titleCase(dep));
        evidence.push({ field: 'department', page: department.pageNumber });
      }
    }

    var province = findAny(pages, SITE_PATTERNS.province);
    if (province) {
      var prov = groupRaw(province.page, province.match, 1);
      if (prov) {
        parts.push(titleCase(prov));
        evidence.push({ field: 'province', page: province.pageNumber });
      }
    }

    if (!parts.length) {
      return { site: 'UNKNOWN — site not resolved from the document text', site_evidence: [] };
    }
    var head = parts.shift();
    return {
      site: parts.length ? head + ' — ' + parts.join(', ') : head,
      site_evidence: evidence
    };
  }

  function countWaterPointCodes(pages) {
    var seen = {};
    var order = [];
    for (var i = 0; i < pages.length; i++) {
      WATER_POINT_CODES.lastIndex = 0;
      var match;
      while ((match = WATER_POINT_CODES.exec(pages[i].folded)) !== null) {
        var label = 'Ag-' + (match[1].length === 1 ? '0' + match[1] : match[1]);
        if (!seen[label]) {
          seen[label] = true;
          order.push(label);
        }
      }
    }
    order.sort();
    return order;
  }

  /* ------------------------------------------------------------------ *
   * Report construction
   * ------------------------------------------------------------------ */
  function buildReport(input) {
    var pageTexts = input.pageTexts || [];
    var pages = pageTexts.map(function (text, index) { return makePage(index + 1, text); });

    var claims = [];
    var gaps = [];
    var excerpts = [];

    function addExcerpt(label, hit, pageNumber) {
      if (!hit) return null;
      var text = excerptAround(hit.page, hit.match.index, hit.match.index + hit.match[0].length - 1, 160);
      if (!text) return null;
      var entry = {
        label: label,
        page: pageNumber === undefined ? hit.pageNumber : pageNumber,
        text: text,
        matched_pattern: hit.pattern || null
      };
      excerpts.push(entry);
      return entry;
    }

    var siteInfo = resolveSite(pages);
    var codes = countWaterPointCodes(pages);

    /* --- Pattern 1 --------------------------------------------------- */
    var noWaterData = findAny(pages, NO_SURFACE_WATER_DATA);
    var genericMissing = null;
    if (!noWaterData) genericMissing = findAny(pages, GENERIC_MISSING_INFO);

    if (noWaterData) {
      var waterExcerpt = addExcerpt('Surface-water quality information not available', noWaterData);
      claims.push({
        id: 'CLM-WATER-001',
        text: 'At the time the document was prepared, site-specific surface-water quality information was not available.',
        page: noWaterData.pageNumber,
        location: siteInfo.site,
        variable: 'Surface-water quality',
        expected_state: 'A future primary-data baseline / monitoring proposal should establish observable water-quality conditions.',
        source_type: 'IIA',
        evidence_state: 'DOCUMENTED_STATIC',
        confidence: 0.98,
        detector: 'mission-000/no-surface-water-data',
        excerpt: waterExcerpt ? waterExcerpt.text : null
      });
      gaps.push({
        id: 'GAP-WATER-001',
        claim_id: 'CLM-WATER-001',
        title: 'No current site-specific surface-water quality evidence in the document',
        why_it_matters: 'Without a site-specific temporal observation, later change cannot be compared against a local evidence baseline.',
        missing_evidence: 'Timestamped measurements tied to precise sampling points, method/instrument, units and provenance.',
        measurement_targets: ['pH', 'conductivity', 'temperature', 'dissolved oxygen', 'flow', 'laboratory ions / metals / BOD / COD / bacteriological parameters'],
        priority: 'HIGH',
        confidence: 0.96
      });
    } else if (genericMissing) {
      var missingExcerpt = addExcerpt('Document states information was not available', genericMissing);
      claims.push({
        id: 'CLM-GEN-001',
        text: 'The document states that some information was not available at the time of preparation. The specific variable is UNKNOWN until read in context.',
        page: genericMissing.pageNumber,
        location: siteInfo.site,
        variable: 'UNKNOWN',
        expected_state: 'The missing variable must be named before a baseline can be designed.',
        source_type: 'DOCUMENT',
        evidence_state: 'DOCUMENTED_STATIC',
        confidence: 0.55,
        detector: 'generic/missing-information',
        excerpt: missingExcerpt ? missingExcerpt.text : null
      });
      gaps.push({
        id: 'GAP-GEN-001',
        claim_id: 'CLM-GEN-001',
        title: 'The document declares an information gap without supplying the observation',
        why_it_matters: 'A declared absence of data is the cheapest entry point for a first field measurement.',
        missing_evidence: 'A timestamped, georeferenced primary observation of the variable the document declares unavailable.',
        measurement_targets: ['variable named in the quoted passage', 'coordinate', 'timestamp', 'method/instrument'],
        priority: 'MEDIUM',
        confidence: 0.55
      });
    }

    /* --- Pattern 2 --------------------------------------------------- */
    var proposedPoints = findAny(pages, PROPOSED_WATER_POINTS);
    if (!proposedPoints && codes.length >= 3) {
      proposedPoints = findAll(pages, [
        new RegExp('\\bag\\s?-\\s?0*' + parseInt(codes[0].slice(3), 10) + '\\b'),
        new RegExp('\\bag\\s?-\\s?0*' + parseInt(codes[1].slice(3), 10) + '\\b'),
        new RegExp('\\bag\\s?-\\s?0*' + parseInt(codes[2].slice(3), 10) + '\\b')
      ]);
    }
    var genericMonitoring = null;
    if (!proposedPoints) genericMonitoring = findAny(pages, GENERIC_MONITORING_PLAN);

    if (proposedPoints) {
      var pointsExcerpt = addExcerpt('Proposed surface-water monitoring points', proposedPoints);
      var countText = codes.length
        ? 'The document proposes ' + numberWord(codes.length) + ' surface-water monitoring ' +
          (codes.length === 1 ? 'point' : 'points') + ' (' + codes.join(' / ') + ') and the variables to monitor.'
        : 'The document proposes surface-water monitoring points and the variables to monitor; the number of points is UNKNOWN from the matched passage.';
      claims.push({
        id: 'CLM-WATER-002',
        text: countText,
        page: proposedPoints.pageNumber,
        location: codes.length ? codes.join(' / ') : 'Monitoring points not enumerated in the matched passage',
        variable: 'Surface-water monitoring',
        expected_state: 'Primary monitoring at the proposed points after approval by the competent authority.',
        source_type: 'IIA',
        evidence_state: 'DOCUMENTED_STATIC',
        confidence: 0.94,
        detector: 'mission-000/proposed-water-points',
        excerpt: pointsExcerpt ? pointsExcerpt.text : null
      });
      gaps.push({
        id: 'GAP-WATER-002',
        claim_id: 'CLM-WATER-002',
        title: 'Monitoring design exists, but the live observation chain is not part of the PDF',
        why_it_matters: 'A monitoring plan tells us what should be measured; it does not itself provide the measured time series.',
        missing_evidence: 'Actual readings, timestamps, sampling records, coordinates, method/instrument and repeat observations.',
        measurement_targets: [
          (codes.length ? codes.length : 3) + ' proposed water points',
          'same-variable repeat measurements',
          'instrument + timestamp + geolocation provenance'
        ],
        priority: 'HIGH',
        confidence: 0.95
      });
    } else if (genericMonitoring) {
      var planExcerpt = addExcerpt('Monitoring design referenced in the document', genericMonitoring);
      claims.push({
        id: 'CLM-GEN-002',
        text: 'The document references a monitoring design. The document itself contains no measured time series for it.',
        page: genericMonitoring.pageNumber,
        location: 'UNKNOWN — monitoring locations not resolved from the matched passage',
        variable: 'Monitoring design',
        expected_state: 'Measurements produced by the referenced monitoring design, with provenance.',
        source_type: 'DOCUMENT',
        evidence_state: 'DOCUMENTED_STATIC',
        confidence: 0.5,
        detector: 'generic/monitoring-plan',
        excerpt: planExcerpt ? planExcerpt.text : null
      });
      gaps.push({
        id: 'GAP-GEN-002',
        claim_id: 'CLM-GEN-002',
        title: 'A monitoring design is described but no observations are attached',
        why_it_matters: 'Without readings, the plan cannot be compared against anything over time.',
        missing_evidence: 'Readings, timestamps, coordinates, method/instrument and repeat observations.',
        measurement_targets: ['monitoring locations', 'repeat measurements', 'instrument + timestamp + geolocation provenance'],
        priority: 'MEDIUM',
        confidence: 0.5
      });
    }

    /* --- Mission ----------------------------------------------------- */
    var waterMission = claims.some(function (claim) {
      return claim.id === 'CLM-WATER-001' || claim.id === 'CLM-WATER-002';
    });

    var minimumRecord = ['coordinate', 'timestamp', 'variable', 'value', 'unit', 'method/instrument', 'operator', 'source/provenance'];
    var mission;
    if (waterMission) {
      mission = {
        mission_name: 'Water / Territory Baseline V0',
        objective: 'Convert one static water-quality statement into a temporally traceable territorial observation chain.',
        first_field_action: 'Revisit or sample the proposed surface-water monitoring locations identified in the document.',
        minimum_record: minimumRecord,
        phase: 'FIELD EXPERIMENT',
        next_step: 'Compare observed values over time against the documented baseline/expectation; only then consider a deviation rule.'
      };
    } else if (claims.length) {
      mission = {
        mission_name: 'Territory Baseline V0 — scoping',
        objective: 'Name the variable behind the declared information gap, then convert it into one repeatable observation.',
        first_field_action: 'Read the quoted passage in context and decide which single variable is cheapest to observe first.',
        minimum_record: minimumRecord,
        phase: 'SCOPING',
        next_step: 'Once the variable is named, design the smallest repeatable field measurement for it.'
      };
    } else {
      mission = {
        mission_name: 'UNKNOWN — no Mission 000 pattern matched',
        objective: 'UNKNOWN. This prototype only recognises a small library of evidence patterns; absence of a match is not evidence of absence in the document.',
        first_field_action: 'Review the document manually, or extend the pattern library for this document type.',
        minimum_record: minimumRecord,
        phase: 'UNKNOWN',
        next_step: 'Extend the detector set, or try the Guayatayoc reference case to see an end-to-end result.'
      };
    }

    return {
      mission_id: MISSION_ID,
      engine: 'browser/pdf.js ' + (input.pdfjsVersion || 'unknown') + ' · mission000 ' + ENGINE_VERSION,
      parsed_where: 'BROWSER_LOCAL',
      document_name: input.documentName || 'document.pdf',
      pages: pages.length,
      document_sha256: input.sha256 || 'UNAVAILABLE',
      characters_extracted: pageTexts.join('').replace(/\s+/g, '').length,
      site: siteInfo.site,
      site_evidence: siteInfo.site_evidence,
      territory_summary: TERRITORY_SUMMARY,
      claims: claims,
      evidence_gaps: gaps,
      source_excerpts: excerpts,
      recommended_mission: mission,
      guardrails: GUARDRAILS
    };
  }

  global.Mission000 = {
    buildReport: buildReport,
    GUARDRAILS: GUARDRAILS,
    ENGINE_VERSION: ENGINE_VERSION,
    _internals: { fold: fold, makePage: makePage, resolveSite: resolveSite, countWaterPointCodes: countWaterPointCodes }
  };
})(typeof window !== 'undefined' ? window : globalThis);
