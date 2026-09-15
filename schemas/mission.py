from pydantic import BaseModel,Field
from typing import Literal,Optional
EvidenceState=Literal['DOCUMENTED_STATIC','PRIMARY_MEASURED','OSINT','UNKNOWN']
class Claim(BaseModel):
 id:str; text:str; page:Optional[int]=None; location:Optional[str]=None; variable:Optional[str]=None; expected_state:Optional[str]=None; source_type:str='IIA'; evidence_state:EvidenceState='DOCUMENTED_STATIC'; confidence:float=Field(ge=0,le=1,default=.85)
class EvidenceGap(BaseModel):
 id:str; claim_id:str; title:str; why_it_matters:str; missing_evidence:str; measurement_targets:list[str]; priority:Literal['HIGH','MEDIUM','LOW']='MEDIUM'; confidence:float=Field(ge=0,le=1,default=.8)
class MissionReport(BaseModel):
 mission_id:str; document_name:str; pages:int; document_sha256:str; site:str; territory_summary:str; claims:list[Claim]; evidence_gaps:list[EvidenceGap]; recommended_mission:dict; guardrails:list[str]
