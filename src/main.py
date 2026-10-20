from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any

app = FastAPI(title="SDC Hackathon Backend")

@app.get("/")
def read_root():
    return {"message": "Backend is running!", "status": "ok"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

class UserProfile(BaseModel):
    skills: Optional[List[str]] = []
    experience: Optional[Any] = None
    constraints: Optional[List[str]] = []

@app.post("/api/profile", status_code=201)
def create_profile(profile: UserProfile):
    return {
        "id": "user_001",
        "skills": profile.skills or ["Python", "SQL"],
        "constraints": profile.constraints or ["Malaysia", "Remote"],
    }

@app.get("/api/profile/{profile_id}")
def get_profile(profile_id: str):
    if profile_id == "missing":
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"id": profile_id, "skills": ["Python", "Data Analysis"], "constraints": ["Malaysia"]}

@app.patch("/api/profile/{profile_id}")
def update_profile(profile_id: str, profile: UserProfile):
    return {"id": profile_id, "skills": profile.skills, "status": "updated"}

@app.post("/api/match")
def match_roles(payload: dict = None):
    scenario = "fast_ai" if payload and payload.get("scenario") == "fast_ai" else "moderate"
    return {
        "scenarioId": scenario,
        "summary": {"topRoleId": "role_001"},
        "matches": [
            {
                "roleId": "role_001", "roleName": "AI Data Analyst", "fitScore": 85,
                "gapRows": [{"skill": "Machine Learning", "importance": "High"}],
                "explanation": "Based on your Python skills."
            }
        ]
    }



@app.get("/api/sdgs")
def get_sdgs():
    return {
        "goals": [{"id": i, "name": f"SDG {i}", "narrative": f"Narrative for SDG {i}"} for i in range(1, 18)],
        "summary": {"topGoal": "SDG 8"}
    }

@app.post("/api/stream")
async def stream_analysis():
    return {"meta": {"status": "success"}, "tokens": ["mock", "stream"], "done": True, "analysis": "Full analysis"}
# ---------- 以下为测试接口 ----------
from pydantic import BaseModel

# 模拟数据结构
class UserProfile(BaseModel):
    roleId: str
    skills: list[str]

# 1. 测试连通性接口 (GET)
@app.get("/api/hello")
def hello():
    return {"message": "后端连接成功！", "status": "ok"}

# 2. 模拟生成路径接口 (POST)
@app.post("/api/pathway")
def generate_pathway(profile: UserProfile):
    # 这里直接返回假数据，等有时间了再换成真实的 AI 调用
    return {
        "status": "success",
        "roleId": profile.roleId,
        "pathway": ["学 Python", "学 FastAPI", "做项目"],
        "sdg": "SDG 8"
    }