import json
import os
from pathlib import Path
from typing import Any, List, Optional

import pandas as pd
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


def load_dotenv(path: Path) -> None:
    """Load KEY=VALUE pairs from .env without pulling in an extra dependency."""
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

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


@app.post("/api/stream")
async def stream_analysis():
    return {"meta": {"status": "success"}, "tokens": ["mock", "stream"], "done": True, "analysis": "Full analysis"}
# ---------- 以下为测试接口 ----------

# 模拟数据结构（原名 UserProfile，与上面的模型重名会让前者失效）
class PathwayRequest(BaseModel):
    roleId: str
    skills: List[str]

# 1. 测试连通性接口 (GET)
@app.get("/api/hello")
def hello():
    return {"message": "后端连接成功！", "status": "ok"}


# ================= 全量数据智能检索接口 =================
@app.post("/api/pathway")
def generate_pathway(profile: PathwayRequest):
    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("LLM_API_KEY")
    if not api_key:
        return {"error": "请配置 DEEPSEEK_API_KEY（或 LLM_API_KEY）"}

    user_skill = profile.skills[0] if profile.skills else ""
    user_role = profile.roleId

    context_parts = []

    # 数据文件放在 src/backend/data/ 目录下
    data_files = {
        "全国年度数据": ROOT / "src" / "backend" / "data" / "01_national_annual_series.csv",
        "技能薪资": ROOT / "src" / "backend" / "data" / "02_salary_by_qualification_skill_gender_location.csv",
        "行业分布": ROOT / "src" / "backend" / "data" / "03_industry_distribution.csv",
        "各州薪资": ROOT / "src" / "backend" / "data" / "04_salary_by_state.csv",
        "就业率": ROOT / "src" / "backend" / "data" / "05_mohe_employment_rate.csv",
        "全球年度数据": ROOT / "src" / "backend" / "data" / "06_global_annual_series.csv",
        "全球薪资": ROOT / "src" / "backend" / "data" / "07_global_salary_employment_detail.csv",
        "数据来源": ROOT / "src" / "backend" / "data" / "08_source_urls.csv",
        "综合Excel": ROOT / "src" / "backend" / "data" / "malaysia_graduate_labour_market.xlsx",
    }

    for name, path in data_files.items():
        try:
            if not path.is_file():
                print(f"数据集缺失，跳过 {name}: {path}")
                continue
            if path.suffix == ".xlsx":
                df = pd.read_excel(path)
            else:
                df = pd.read_csv(path)
            
            # 智能匹配用户技能或岗位
            matched_rows = df[df.apply(lambda row: row.astype(str).str.contains(user_skill, case=False).any() or 
                                                  row.astype(str).str.contains(user_role, case=False).any(), axis=1)]
            
            if not matched_rows.empty:
                context_parts.append(f"【{name}匹配】: {matched_rows.head(2).to_dict('records')}")
            elif name in ["全国年度数据", "行业分布"]:
                context_parts.append(f"【{name}宏观背景】: {df.head(1).to_dict('records')}")
                
        except Exception as e:
            print(f"读取 {name} 失败: {e}")
            continue

    real_data_context = "\n".join(context_parts)
    if not real_data_context:
        real_data_context = "暂无直接数据，请基于当前AI发展趋势分析。"

    # 构造 Prompt 发给大模型
    prompt = f"""
    你是一个顶级的AI职业规划师。
    用户目标岗位：{user_role}，现有技能：{profile.skills}。
    
    以下是官方真实数据（包括薪资、行业、就业率等），请务必作为重要参考：
    {real_data_context}
    
    请生成个性化技能重塑路径。如果真实数据里显示该岗位风险高或薪资低，请在路径中加入警告和建议。
    必须严格返回纯 JSON 格式，不要包含 Markdown 标记：
    {{
        "status": "success",
        "roleId": "{user_role}",
        "pathway": ["步骤1（结合真实数据）", "步骤2", "步骤3"],
        "sdg": "最合适的SDG",
        "risk_score": 0-100
    }}
    """

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    base_url = os.getenv("DEEPSEEK_BASE_URL") or os.getenv("LLM_BASE_URL") or "https://api.deepseek.com"
    data = {
        "model": os.getenv("LLM_MODEL") or "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"}
    }

    try:
        response = requests.post(
            f"{base_url.rstrip('/')}/chat/completions", headers=headers, json=data, timeout=60
        )
        response.raise_for_status()
        ai_content = response.json()["choices"][0]["message"]["content"]
        return json.loads(ai_content)
    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("API_PORT", "8000")),
    )