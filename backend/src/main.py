"""
FitOps Backend — FastAPI service
Manages workout data, computes training load scores, and exposes
metrics that drive AKS Horizontal Pod Autoscaler decisions.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
import random

app = FastAPI(title="FitOps API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────────────────

class Workout(BaseModel):
    date: str
    type: str          # "run", "lift", "cycle", or "rest"
    duration_min: int
    intensity: int     # 1–10 RPE scale
    notes: str = ""

class ScaleRecommendation(BaseModel):
    replicas: int
    reason: str
    training_load: float

# ── In-memory store ───────────────────────────────────────────────────────────

_workouts: list[dict] = []

def _seed_demo_data():
    types = ["run", "lift", "cycle", "rest", "run", "lift", "run"]
    base = datetime.now()
    for i in range(30):
        day = base - timedelta(days=29 - i)
        wtype = types[i % len(types)]
        _workouts.append({
            "id": i + 1,
            "date": day.strftime("%Y-%m-%d"),
            "type": wtype,
            "duration_min": 0 if wtype == "rest" else random.randint(30, 90),
            "intensity": 0 if wtype == "rest" else random.randint(4, 9),
            "notes": "",
        })

_seed_demo_data()

# ── Core Algorithm ────────────────────────────────────────────────────────────

def _training_load(workouts: list[dict]) -> float:
    if not workouts:
        return 0.0
    recent = sorted(workouts, key=lambda w: w["date"], reverse=True)[:7]
    total = sum(w["duration_min"] * w["intensity"] for w in recent)
    return round(total / 7, 2)

def _scale_recommendation(atl: float) -> ScaleRecommendation:
    if atl < 30:
        return ScaleRecommendation(replicas=1, reason="Rest week — scaling down to minimum", training_load=atl)
    elif atl < 60:
        return ScaleRecommendation(replicas=2, reason="Base training week — standard capacity", training_load=atl)
    elif atl < 90:
        return ScaleRecommendation(replicas=3, reason="Peak training week — scaling up", training_load=atl)
    else:
        return ScaleRecommendation(replicas=4, reason="⚠ Overreach detected — maximum capacity", training_load=atl)

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "fitops-api"}

@app.get("/workouts")
def list_workouts():
    return {"workouts": _workouts, "total": len(_workouts)}

@app.post("/workouts")
def add_workout(workout: Workout):
    new_id = max((w["id"] for w in _workouts), default=0) + 1
    record = {"id": new_id, **workout.model_dump()}
    _workouts.append(record)
    return {"message": "Workout logged", "workout": record}

@app.get("/workouts/{workout_id}")
def get_workout(workout_id: int):
    workout = next((w for w in _workouts if w["id"] == workout_id), None)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout

@app.get("/metrics/training-load")
def training_load():
    atl = _training_load(_workouts)
    return {"atl": atl, "workouts_analyzed": min(len(_workouts), 7)}

@app.get("/metrics/scale-recommendation")
def scale_recommendation():
    atl = _training_load(_workouts)
    return _scale_recommendation(atl)

@app.get("/metrics/weekly-summary")
def weekly_summary():
    today = datetime.now()
    weeks = []
    for week_offset in range(4):
        week_start = today - timedelta(days=(week_offset + 1) * 7)
        week_end   = today - timedelta(days=week_offset * 7)
        week_workouts = [
            w for w in _workouts
            if week_start.strftime("%Y-%m-%d") <= w["date"] < week_end.strftime("%Y-%m-%d")
        ]
        atl = _training_load(week_workouts)
        active = [w for w in week_workouts if w["type"] != "rest"]
        weeks.append({
            "week": f"Week -{week_offset + 1}",
            "workouts": len(active),
            "total_minutes": sum(w["duration_min"] for w in week_workouts),
            "avg_intensity": round(sum(w["intensity"] for w in active) / max(len(active), 1), 1),
            "training_load": atl,
            "recommended_replicas": _scale_recommendation(atl).replicas,
        })
    return {"weeks": list(reversed(weeks))}

@app.get("/metrics/platform-status")
def platform_status():
    atl = _training_load(_workouts)
    rec = _scale_recommendation(atl)
    return {
        "current_replicas": rec.replicas,
        "training_load": atl,
        "status": "warning" if atl > 90 else "healthy",
        "scale_reason": rec.reason,
        "total_workouts": len(_workouts),
        "last_updated": datetime.now().isoformat(),
    }