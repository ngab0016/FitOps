# ⬡ FitOps — Where Fitness Meets Cloud Infrastructure

> I love fitness & cloud engineering...Essentially I built a platform that uses athlete training load to make Azure scaling decisions. The harder you train, the more Kubernetes pods you get. Rest days scale everything back down because infrastructure should work as hard as you do.

This is a passion project built for fun, touching every layer of the stack: a Python API, a React dashboard, Docker containers, Kubernetes on AKS, Bicep infrastructure as code, PowerShell provisioning scripts, and an Azure DevOps CI/CD pipeline.

---

## The Idea

In sports science, **Acute Training Load (ATL)** measures how hard an athlete has been training over the last 7 days. High ATL means a peak training week. Low ATL means rest and recovery.

FitOps uses that same metric to make infrastructure decisions:

| Training Load (ATL) | Phase | AKS Replicas |
|---|---|---|
| ATL < 30 | Rest week | 1 pod |
| ATL 30–60 | Base training | 2 pods |
| ATL 60–90 | Peak week | 3 pods |
| ATL > 90 | Overreach ⚠ | 4 pods + alert |

Log your workouts → ATL is computed → infrastructure scales to match. Proactive scaling driven by real data, not reactive CPU spikes.

---

## Live on Azure

Successfully deployed to Azure Kubernetes Service. The screenshots below show a real AKS cluster with 4 pods triggered by an overreach training week.


**Overreach week — ATL: 370.4 → 4 pods, OVERREACH ALERT:**

![alt text](<Screenshot 2026-03-13 at 18.37.35.png>)

**Workout history — color-coded by intensity:**

![alt text](<Screenshot 2026-03-13 at 18.37.48.png>)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Kubernetes Service                      │
│                                                                 │
│   ┌─────────────────────┐      ┌───────────────────────────┐   │
│   │   FastAPI Backend   │◄────►│     React Dashboard       │   │
│   │   /metrics/*        │      │   (live platform view)    │   │
│   │   /workouts/*       │      └───────────────────────────┘   │
│   └──────────┬──────────┘                                      │
│              │               ┌───────────────────────────┐     │
│   ┌──────────▼──────────┐    │  HPA (min replicas = ATL) │     │
│   │  Azure Blob Storage │    │      max = 4 pods         │     │
│   │  (workout archive)  │    └───────────────────────────┘     │
│   └─────────────────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
            ▲                             ▲
            │                             │
┌───────────────────────┐   ┌─────────────────────────────────┐
│  Azure DevOps CI/CD   │   │     Bicep + PowerShell IaC      │
│  Test → Build → Push  │   │  AKS, ACR, Storage, RBAC,       │
│  → Scale → Deploy     │   │  Service Principals, Sec Groups  │
└───────────────────────┘   └─────────────────────────────────┘
```

---

## Stack

| Layer | Technology |
|---|---|
| Backend API | Python, FastAPI, Pydantic |
| Frontend | React, Recharts, Vite |
| Containers | Docker, nginx |
| Orchestration | Kubernetes (AKS), HPA |
| Infrastructure | Azure Bicep |
| Provisioning | PowerShell, Azure CLI |
| CI/CD | Azure DevOps Pipelines |
| Registry | Azure Container Registry (ACR) |
| Storage | Azure Blob Storage |
| Security | Service Principals, RBAC, Security Groups |

---

## Project Structure

```
fitops/
├── docker-compose.yml              # Run everything locally with one command
├── .azuredevops/
│   └── azure-pipelines.yml         # Full CI/CD pipeline (Test → Build → Deploy)
├── k8s/
│   └── manifests.yaml              # AKS Deployments, Services, ConfigMap, HPA
├── infra/
│   ├── bicep/
│   │   └── main.bicep              # AKS + ACR + Storage + RBAC as code
│   └── scripts/
│       ├── provision.ps1           # Full provisioner (SP, groups, roles, AKS)
│       └── teardown.ps1            # Clean teardown to avoid runaway costs
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── src/
│   │   └── main.py                 # FastAPI app + ATL algorithm
│   └── tests/
│       └── test_api.py             # 19 passing tests (unit + integration)
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        └── App.jsx                 # React dashboard with live charts
```

---

## Getting Started

### Run locally (no Azure required)

**Prerequisites:** Docker Desktop

```bash
git clone https://github.com/ngab0016/FitOps.git
cd fitops
docker-compose up --build
```

- Dashboard → http://localhost:3000
- API docs → http://localhost:8000/docs

### Run backend only

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

### Run tests

```bash
cd backend
pytest tests/ -v
```

19 tests pass in under a second:

```
tests/test_api.py::test_training_load_empty PASSED
tests/test_api.py::test_training_load_rest_days PASSED
tests/test_api.py::test_training_load_calculation PASSED
tests/test_api.py::test_training_load_uses_only_last_7 PASSED
tests/test_api.py::test_scale_rest_week PASSED
tests/test_api.py::test_scale_base_week PASSED
tests/test_api.py::test_scale_peak_week PASSED
tests/test_api.py::test_scale_overreach PASSED
tests/test_api.py::test_scale_boundaries PASSED
tests/test_api.py::test_health_endpoint PASSED
tests/test_api.py::test_list_workouts_returns_seeded_data PASSED
tests/test_api.py::test_add_workout PASSED
tests/test_api.py::test_get_workout_by_id PASSED
tests/test_api.py::test_get_workout_not_found PASSED
tests/test_api.py::test_training_load_endpoint PASSED
tests/test_api.py::test_scale_recommendation_endpoint PASSED
tests/test_api.py::test_weekly_summary_returns_4_weeks PASSED
tests/test_api.py::test_weekly_summary_has_required_fields PASSED
tests/test_api.py::test_platform_status_endpoint PASSED
19 passed in 0.25s
```

---

## The Dashboard

**Dashboard:** live KPI cards showing your current ATL score, recommended replica count, scale decision (UP / HOLD / DOWN), and four charts tracking training load, replicas, weekly volume, and intensity trends over the last 4 weeks.

**Workouts:** your last 14 sessions with workout type, date, duration, and a live intensity bar color-coded by effort level.

**Log:** log a new workout session. As soon as you submit, the ATL recalculates and the dashboard updates in real time.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/workouts` | List all workouts |
| POST | `/workouts` | Log a new workout |
| GET | `/workouts/{id}` | Get a single workout |
| GET | `/metrics/training-load` | Current ATL score |
| GET | `/metrics/scale-recommendation` | Replica count recommendation |
| GET | `/metrics/weekly-summary` | 4-week aggregated training data |
| GET | `/metrics/platform-status` | Live platform health snapshot |

Full interactive docs available at `/docs` when the API is running.

---

## Azure Deployment

**Prerequisites:** Azure CLI, PowerShell 7+, kubectl, Docker Desktop, active Azure subscription

```bash
# Login
az login

# Create resource group
az group create \
  --name fitops-rg-dev \
  --location westus3 \
  --tags project=fitops environment=dev

# Deploy Bicep infrastructure (AKS + ACR + Storage)
az deployment group create \
  --resource-group fitops-rg-dev \
  --template-file infra/bicep/main.bicep \
  --parameters environment=dev aksNodeCount=2

# Build and push AMD64 images to ACR
az acr login --name <your-acr-name>
docker buildx build --platform linux/amd64 \
  -t <acr-login-server>/fitops-api:latest --push ./backend
docker buildx build --platform linux/amd64 \
  -t <acr-login-server>/fitops-dashboard:latest --push ./frontend

# Grant AKS access to ACR
az aks update \
  --resource-group fitops-rg-dev \
  --name fitops-aks-dev \
  --attach-acr <your-acr-name>

# Deploy to AKS
kubectl apply -f k8s/manifests.yaml
kubectl get pods --watch
```

> **Note for Apple Silicon Macs:** Always use `--platform linux/amd64` when building images & AKS nodes run AMD64 and will fail to pull ARM64 images.

**Teardown (always clean up to avoid charges):**
```bash
pwsh infra/scripts/teardown.ps1 \
  -Environment dev \
  -ResourceGroupName fitops-rg-dev \
  -SubscriptionId "your-subscription-id"
```

---

## Azure DevOps Pipeline

Three stages run sequentially & a broken stage stops everything downstream:

```
Push to main
     │
     ▼
┌─────────┐    fail → pipeline stops
│  Test   │─────────────────────────► ✘
│ pytest  │
│npm build│
└────┬────┘
     │ pass
     ▼
┌─────────┐
│  Build  │  Docker build + push to ACR
│ & Push  │  Tagged with Build ID + latest
└────┬────┘
     │ pass
     ▼
┌──────────────────────────┐
│  ⬡ FitOps Scale Decision │  Query API → get ATL → patch HPA min replicas
│        Deploy            │  kubectl apply → rollout status verify
└──────────────────────────┘
```

Secrets are stored in an Azure DevOps variable group & never in the yaml file or git history.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| Bicep over Terraform | Azure-only project & no state file to manage, native ARM integration |
| System-assigned AKS identity | Azure manages credential rotation automatically |
| `allowBlobPublicAccess: false` | Security hardening & no anonymous blob access |
| `adminUserEnabled: false` on ACR | Service principal auth only & no shared passwords |
| ATL as scale signal | Proactive scaling based on known future load, not reactive CPU spikes |
| Azure DevOps over GitHub Actions | Matches enterprise government toolchain |
| `--platform linux/amd64` on builds | AKS nodes run AMD64 & Apple Silicon Macs must cross-compile |
| Teardown script | Cost discipline & a core platform engineering practice |

---

## Author

Built with ☕ and post-workout energy by Kelvin Ngabo

[GitHub](https://github.com/ngab0016)