/*
 * Reference result for the Guayatayoc case (2024_IIA Cateo 1264-J-2009.pdf).
 * Shipped as a static object so "Load real case" needs no server.
 */
window.Mission000DemoCase = {
  mission_id: 'MISSION-000',
  engine: 'reference result (no PDF parsed on this device)',
  parsed_where: 'REFERENCE_CASE',
  document_name: '2024_IIA Cateo 1264-J-2009.pdf',
  pages: 144,
  document_sha256: 'UNKNOWN — hashed at runtime only when a PDF is parsed locally',
  characters_extracted: null,
  site: 'Cateo 1264-J-2009 — Guayatayoc, Departamento Cochinoca, Jujuy',
  site_evidence: [],
  territory_summary: 'Mission 000 converts a static IIA into an evidence-oriented measurement plan. This demo does not assess legal compliance or prove environmental impact.',
  claims: [
    {
      id: 'CLM-WATER-001',
      text: 'At the time the document was prepared, site-specific surface-water quality information was not available.',
      page: 47,
      location: 'Guayatayoc / Cateo 1264-J-2009',
      variable: 'Surface-water quality',
      expected_state: 'A future primary-data baseline / monitoring proposal should establish observable water-quality conditions.',
      source_type: 'IIA',
      evidence_state: 'DOCUMENTED_STATIC',
      confidence: 0.98,
      detector: 'mission-000/no-surface-water-data',
      excerpt: 'No contamos con información disponible de calidad de agua superficial.'
    },
    {
      id: 'CLM-WATER-002',
      text: 'The document proposes three surface-water monitoring points (Ag-01 / Ag-02 / Ag-03) and the variables to monitor.',
      page: 96,
      location: 'Ag-01 / Ag-02 / Ag-03',
      variable: 'Surface-water monitoring',
      expected_state: 'Primary monitoring at the proposed points after approval by the competent authority.',
      source_type: 'IIA',
      evidence_state: 'DOCUMENTED_STATIC',
      confidence: 0.94,
      detector: 'mission-000/proposed-water-points',
      excerpt: 'Tabla 19: Ubicación de sitios propuestos de RDA.'
    }
  ],
  evidence_gaps: [
    {
      id: 'GAP-WATER-001',
      claim_id: 'CLM-WATER-001',
      title: 'No current site-specific surface-water quality evidence in the document',
      why_it_matters: 'Without a site-specific temporal observation, later change cannot be compared against a local evidence baseline.',
      missing_evidence: 'Timestamped measurements tied to precise sampling points, method/instrument, units and provenance.',
      measurement_targets: ['pH', 'conductivity', 'temperature', 'dissolved oxygen', 'flow', 'laboratory ions / metals / BOD / COD / bacteriological parameters'],
      priority: 'HIGH',
      confidence: 0.96
    },
    {
      id: 'GAP-WATER-002',
      claim_id: 'CLM-WATER-002',
      title: 'Monitoring design exists, but the live observation chain is not part of the PDF',
      why_it_matters: 'A monitoring plan tells us what should be measured; it does not itself provide the measured time series.',
      missing_evidence: 'Actual readings, timestamps, sampling records, coordinates, method/instrument and repeat observations.',
      measurement_targets: ['3 proposed water points', 'same-variable repeat measurements', 'instrument + timestamp + geolocation provenance'],
      priority: 'HIGH',
      confidence: 0.95
    }
  ],
  source_excerpts: [
    { label: 'Surface-water quality information not available', page: 47, text: 'No contamos con información disponible de calidad de agua superficial.', matched_pattern: null },
    { label: 'Proposed surface-water monitoring points', page: 96, text: 'Tabla 19: Ubicación de sitios propuestos de RDA.', matched_pattern: null }
  ],
  recommended_mission: {
    mission_name: 'Water / Territory Baseline V0',
    objective: 'Convert one static water-quality statement into a temporally traceable territorial observation chain.',
    first_field_action: 'Revisit or sample the three proposed water-monitoring locations identified in the document.',
    minimum_record: ['coordinate', 'timestamp', 'variable', 'value', 'unit', 'method/instrument', 'operator', 'source/provenance'],
    phase: 'FIELD EXPERIMENT',
    next_step: 'Compare observed values over time against the documented baseline/expectation; only then consider a deviation rule.'
  },
  guardrails: window.Mission000 ? window.Mission000.GUARDRAILS : []
};
