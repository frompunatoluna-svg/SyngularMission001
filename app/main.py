from __future__ import annotations
import hashlib,json,re
from pathlib import Path
from fastapi import FastAPI,File,UploadFile,HTTPException
from fastapi.responses import FileResponse,JSONResponse
from fastapi.staticfiles import StaticFiles
from pypdf import PdfReader
from schemas.mission import Claim,EvidenceGap,MissionReport
ROOT=Path(__file__).resolve().parents[1]; INBOX=ROOT/'storage/inbox'; OUT=ROOT/'storage/outputs'; DEMO=ROOT/'demo/sample_mission.json'
INBOX.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
app=FastAPI(title='SYNGULAR Mission 000',version='0.2.0'); app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')
def sha256_file(path):
 h=hashlib.sha256();
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()
def extract_pages(path): return [(p.extract_text() or '') for p in PdfReader(str(path)).pages]
def first_match_page(pages,needle):
 for i,txt in enumerate(pages,1):
  if needle.lower() in txt.lower(): return i
 return None
def build_report_from_pdf(path):
 pages=extract_pages(path); full='\n'.join(pages); normalized=re.sub(r'\s+',' ',full.lower())
 no_surface_water=bool(re.search(r'n\s*o\s+contamos\s+con información disponible de calidad de agua superficial',normalized)); rda='tabla 19: ubicación de sitios propuestos de rda' in normalized
 water_page=first_match_page(pages,'no contamos con información disponible de calidad de agua superficial'); rda_page=first_match_page(pages,'Tabla 19: Ubicación de sitios propuestos de RDA')
 claims=[]; gaps=[]
 if no_surface_water:
  claims.append(Claim(id='CLM-WATER-001',text='At the time the document was prepared, site-specific surface-water quality information was not available.',page=water_page,location='Guayatayoc / Cateo 1264-J-2009',variable='Surface-water quality',expected_state='A future primary-data baseline / monitoring proposal should establish observable water-quality conditions.',confidence=.98))
  gaps.append(EvidenceGap(id='GAP-WATER-001',claim_id='CLM-WATER-001',title='No current site-specific surface-water quality evidence in the document',why_it_matters='Without a site-specific temporal observation, later change cannot be compared against a local evidence baseline.',missing_evidence='Timestamped measurements tied to precise sampling points, method/instrument, units and provenance.',measurement_targets=['pH','conductivity','temperature','dissolved oxygen','flow','laboratory ions / metals / BOD / COD / bacteriological parameters'],priority='HIGH',confidence=.96))
 if rda:
  claims.append(Claim(id='CLM-WATER-002',text='The RDA proposes three surface-water points and lists the variables to monitor; the document frames the RDA as baseline data for future mining activities and potentially monitoring.',page=rda_page,location='Ag-01 / Ag-02 / Ag-03',variable='Surface-water monitoring',expected_state='Primary monitoring at the proposed points after approval by the provincial mining authority.',confidence=.94))
  gaps.append(EvidenceGap(id='GAP-WATER-002',claim_id='CLM-WATER-002',title='Monitoring design exists, but the live observation chain is not part of the PDF',why_it_matters='A monitoring plan tells us what should be measured; it does not itself provide the measured time series.',missing_evidence='Actual readings, timestamps, sampling records, coordinates, method/instrument and repeat observations.',measurement_targets=['3 proposed water points','same-variable repeat measurements','instrument + timestamp + geolocation provenance'],priority='HIGH',confidence=.95))
 return MissionReport(mission_id='MISSION-000',document_name=path.name,pages=len(pages),document_sha256=sha256_file(path),site='Cateo 1264-J-2009 — Guayatayoc, Departamento Cochinoca, Jujuy',territory_summary='Mission 000 converts a static IIA into an evidence-oriented measurement plan. This demo does not assess legal compliance or prove environmental impact.',claims=claims,evidence_gaps=gaps,recommended_mission={'mission_name':'Water Baseline V0','objective':'Convert one static water-quality statement into a temporally traceable territorial observation chain.','first_field_action':'Revisit or sample the three proposed water-monitoring locations identified in the RDA.','minimum_record':['coordinate','timestamp','variable','value','unit','method/instrument','operator','source/provenance'],'phase':'FIELD EXPERIMENT','next_step':'Compare observed values over time against the documented baseline/expectation; only then consider a deviation rule.'},guardrails=['Document statements are labeled as DOCUMENTED_STATIC, not as live measurements.','The system does not infer compliance, causality or legal status from the PDF.','Any missing information remains UNKNOWN until independently observed or sourced.','Recommendations are measurement hypotheses, not legal or environmental certification.'])
def save_report(report): (OUT/'mission-000.json').write_text(report.model_dump_json(indent=2),encoding='utf-8')
@app.get('/')
def root(): return FileResponse(ROOT/'static/index.html')
@app.get('/api/health')
def health(): return {'ok':True,'mission':'MISSION-000','version':'0.2.0'}
@app.get('/api/demo')
def demo(): return JSONResponse(json.loads(DEMO.read_text(encoding='utf-8')))
@app.post('/api/mission/000/ingest',response_model=MissionReport)
async def ingest(file:UploadFile=File(...)):
 if not file.filename.lower().endswith('.pdf'): raise HTTPException(400,'Mission 000 expects a PDF')
 safe=re.sub(r'[^A-Za-z0-9._-]+','_',file.filename); target=INBOX/safe; target.write_bytes(await file.read())
 try: report=build_report_from_pdf(target)
 except Exception as exc: raise HTTPException(422,f'Could not parse PDF: {exc}') from exc
 save_report(report); return report
