"""
FitOps Backend — Test Suite
Tests for training load computation, scale recommendations, and API endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from src.main import app, _training_load, _scale_recommendation

client = TestClient(app)

# ── Unit Tests: core algorithm ────────────────────────────────────────────────

def test_training_load_empty():
    """No workouts should return zero load."""
    assert _training_load([]) == 0.0

def test_training_load_rest_days():
    """All rest days should return zero load."""
    rest_days = [
        {"date": "2025-01-01", "duration_min": 0, "intensity": 0, "type": "rest"}
    ] * 7
    assert _training_load(rest_days) == 0.0

def test_training_load_calculation():
    """60 min at intensity 8 every day = ATL of 480."""
    workouts = [
        {"date": f"2025-01-0{i+1}", "duration_min": 60, "intensity": 8, "type": "run"}
        for i in range(7)
    ]
    atl = _training_load(workouts)
    assert atl == 480.0

def test_training_load_uses_only_last_7():
    """ATL should only look at the 7 most recent workouts."""
    old_workouts = [
        {"date": "2024-01-01", "duration_min": 90, "intensity": 10, "type": "run"}
    ] * 10
    recent_workouts = [
        {"date": "2025-06-01", "duration_min": 0, "intensity": 0, "type": "rest"}
    ] * 7
    atl = _training_load(old_workouts + recent_workouts)
    assert atl == 0.0  # recent rest days should dominate

# ── Unit Tests: scale recommendation ─────────────────────────────────────────

def test_scale_rest_week():
    rec = _scale_recommendation(20.0)
    assert rec.replicas == 1
    assert "Rest" in rec.reason

def test_scale_base_week():
    rec = _scale_recommendation(45.0)
    assert rec.replicas == 2
    assert "Base" in rec.reason

def test_scale_peak_week():
    rec = _scale_recommendation(75.0)
    assert rec.replicas == 3
    assert "Peak" in rec.reason

def test_scale_overreach():
    rec = _scale_recommendation(95.0)
    assert rec.replicas == 4
    assert "Overreach" in rec.reason

def test_scale_boundaries():
    """Test exact boundary values."""
    assert _scale_recommendation(29.9).replicas == 1
    assert _scale_recommendation(30.0).replicas == 2
    assert _scale_recommendation(59.9).replicas == 2
    assert _scale_recommendation(60.0).replicas == 3
    assert _scale_recommendation(89.9).replicas == 3
    assert _scale_recommendation(90.0).replicas == 4

# ── Integration Tests: API endpoints ─────────────────────────────────────────

def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

def test_list_workouts_returns_seeded_data():
    resp = client.get("/workouts")
    assert resp.status_code == 200
    data = resp.json()
    assert "workouts" in data
    assert data["total"] > 0

def test_add_workout():
    payload = {
        "date": "2025-06-01",
        "type": "run",
        "duration_min": 45,
        "intensity": 7,
        "notes": "Morning 10k"
    }
    resp = client.post("/workouts", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["workout"]["type"] == "run"
    assert data["workout"]["intensity"] == 7
    assert data["workout"]["duration_min"] == 45

def test_get_workout_by_id():
    resp = client.get("/workouts/1")
    assert resp.status_code == 200
    assert resp.json()["id"] == 1

def test_get_workout_not_found():
    resp = client.get("/workouts/99999")
    assert resp.status_code == 404

def test_training_load_endpoint():
    resp = client.get("/metrics/training-load")
    assert resp.status_code == 200
    data = resp.json()
    assert "atl" in data
    assert "workouts_analyzed" in data
    assert isinstance(data["atl"], float)

def test_scale_recommendation_endpoint():
    resp = client.get("/metrics/scale-recommendation")
    assert resp.status_code == 200
    data = resp.json()
    assert "replicas" in data
    assert "reason" in data
    assert "training_load" in data
    assert 1 <= data["replicas"] <= 4

def test_weekly_summary_returns_4_weeks():
    resp = client.get("/metrics/weekly-summary")
    assert resp.status_code == 200
    weeks = resp.json()["weeks"]
    assert len(weeks) == 4

def test_weekly_summary_has_required_fields():
    resp = client.get("/metrics/weekly-summary")
    week = resp.json()["weeks"][0]
    assert "training_load" in week
    assert "recommended_replicas" in week
    assert "total_minutes" in week

def test_platform_status_endpoint():
    resp = client.get("/metrics/platform-status")
    assert resp.status_code == 200
    data = resp.json()
    assert "current_replicas" in data
    assert "training_load" in data
    assert data["status"] in ["healthy", "warning"]
    assert 1 <= data["current_replicas"] <= 4