import os
import requests
import pandas as pd
import json
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv

load_dotenv()

# 定义请求的数据结构
class UserProfile(BaseModel):
    roleId: str
    skills: List[str]

app = FastAPI(title="SDC Hackathon Backend")
# app = FastAPI(title="SDC Hackathon Backend")

# ================= 跨域配置（必须加在路由前面） =================
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ==============================================================

# ================= 接入真实大模型 =================
ROOT = Path(__file__).resolve().parent.parent # 获取根目录

@app.post("/api/v1/pathway")
def generate_pathway(profile: UserProfile):
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return {"error": "请配置 DEEPSEEK_API_KEY"}

    user_skill = profile.skills[0] if profile.skills else ""
    user_role = profile.roleId

    context_parts = []
    
    # 数据路径（跟你左侧的文件夹对应）
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
                continue
            if path.suffix == ".xlsx":
                df = pd.read_excel(path)
            else:
                df = pd.read_csv(path)
            
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

    prompt = f"""
    你是一个顶级的AI职业规划师。
    用户目标岗位：{user_role}，现有技能：{user_skill}。
    
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
    data = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"}
    }

    try:
        response = requests.post("https://api.deepseek.com/chat/completions", headers=headers, json=data)
        response.raise_for_status()
        ai_content = response.json()["choices"][0]["message"]["content"]
        return json.loads(ai_content)
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ================= 静态文件挂载 (如果有前端) =================
FRONTEND_DIR = ROOT / "src" / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)