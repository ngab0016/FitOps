#!/usr/bin/env pwsh
<#
.SYNOPSIS
    FitOps Platform Provisioner
    Creates Azure infrastructure, service principal, security groups, and RBAC assignments.

.PARAMETER Environment
    Target environment: dev | staging | prod

.PARAMETER ResourceGroupName
    Azure Resource Group name

.PARAMETER SubscriptionId
    Azure Subscription ID

.PARAMETER FitOpsApiUrl
    URL of the running FitOps API (used for scale recommendation)

.EXAMPLE
    ./provision.ps1 -Environment dev -ResourceGroupName fitops-rg-dev -SubscriptionId "xxxx"
#>

param(
    [Parameter(Mandatory)]
    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment,

    [Parameter(Mandatory)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory)]
    [string]$SubscriptionId,

    [string]$Location = "westus3",

    [string]$FitOpsApiUrl = "http://localhost:8000"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ───────────────────────────────────────────────────────────────────

function Write-Step([string]$msg) {
    Write-Host "`n▸ $msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "  ⚠ $msg" -ForegroundColor Yellow
}

# ── Step 1: Set subscription ──────────────────────────────────────────────────

Write-Step "Setting Azure subscription"
az account set --subscription $SubscriptionId | Out-Null
Write-Success "Subscription set: $SubscriptionId"

# ── Step 2: Query FitOps API for training load ────────────────────────────────

Write-Step "Querying FitOps API for training load and scale recommendation"
try {
    $scaleResponse = Invoke-RestMethod `
        -Uri "$FitOpsApiUrl/metrics/scale-recommendation" `
        -Method GET

    $recommendedReplicas = $scaleResponse.replicas
    $trainingLoad        = $scaleResponse.training_load
    $scaleReason         = $scaleResponse.reason

    Write-Success "Training Load (ATL): $trainingLoad"
    Write-Success "Recommended Replicas: $recommendedReplicas"
    Write-Success "Reason: $scaleReason"

    if ($trainingLoad -gt 90) {
        Write-Warn "Overreach detected! Provisioning at maximum capacity."
    }
} catch {
    Write-Warn "Could not reach FitOps API. Defaulting to 2 replicas."
    $recommendedReplicas = 2
    $trainingLoad        = 0
}

# ── Step 3: Create Resource Group ─────────────────────────────────────────────

Write-Step "Creating Resource Group: $ResourceGroupName"
az group create `
    --name $ResourceGroupName `
    --location $Location `
    --tags "project=fitops" "environment=$Environment" "managedBy=powershell" | Out-Null
Write-Success "Resource Group ready"

# ── Step 4: Deploy Bicep ──────────────────────────────────────────────────────

Write-Step "Deploying Bicep infrastructure (AKS + ACR + Storage)"
$deploymentOutput = az deployment group create `
    --resource-group $ResourceGroupName `
    --template-file "$PSScriptRoot/../bicep/main.bicep" `
    --parameters environment=$Environment aksNodeCount=$recommendedReplicas `
    --query "properties.outputs" `
    --output json | ConvertFrom-Json

$acrLoginServer     = $deploymentOutput.acrLoginServer.value
$aksName            = $deploymentOutput.aksName.value
$storageAccountName = $deploymentOutput.storageAccountName.value

Write-Success "AKS Cluster:    $aksName"
Write-Success "ACR:            $acrLoginServer"
Write-Success "Storage:        $storageAccountName"

# ── Step 5: Create CI/CD Service Principal ────────────────────────────────────

Write-Step "Creating Service Principal for CI/CD pipeline"
$spName           = "fitops-cicd-sp-$Environment"
$subscriptionScope = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName"

$spOutput = az ad sp create-for-rbac `
    --name $spName `
    --role "Contributor" `
    --scopes $subscriptionScope `
    --output json | ConvertFrom-Json

Write-Success "Service Principal created: $spName"
Write-Success "App ID: $($spOutput.appId)"
Write-Warn "Store these credentials in Azure DevOps as a service connection — never commit to git!"

# ── Step 6: Assign AcrPush role to Service Principal ─────────────────────────

Write-Step "Assigning AcrPush role to CI/CD service principal"
$acrResourceId = az acr show `
    --name ($acrLoginServer.Split('.')[0]) `
    --resource-group $ResourceGroupName `
    --query id --output tsv

az role assignment create `
    --assignee $spOutput.appId `
    --role "AcrPush" `
    --scope $acrResourceId | Out-Null

Write-Success "AcrPush role assigned — pipeline can push images to ACR"

# ── Step 7: Create Security Group for platform operators ──────────────────────

Write-Step "Creating Security Group for platform operators"
$groupName = "fitops-platform-ops-$Environment"

$existingGroup = az ad group list `
    --display-name $groupName `
    --query "[0].id" `
    --output tsv 2>$null

if ($existingGroup) {
    Write-Warn "Security group '$groupName' already exists. Skipping creation."
    $groupId = $existingGroup
} else {
    $groupOutput = az ad group create `
        --display-name $groupName `
        --mail-nickname "fitops-platform-ops-$Environment" `
        --output json | ConvertFrom-Json
    $groupId = $groupOutput.id
    Write-Success "Security Group created: $groupName"
}

# Grant ops group Reader access on the resource group
az role assignment create `
    --assignee $groupId `
    --role "Reader" `
    --scope $subscriptionScope `
    --assignee-principal-type Group | Out-Null
Write-Success "Reader role assigned to platform ops group"

# ── Step 8: Configure kubectl ─────────────────────────────────────────────────

Write-Step "Configuring kubectl to connect to AKS"
az aks get-credentials `
    --resource-group $ResourceGroupName `
    --name $aksName `
    --overwrite-existing | Out-Null
Write-Success "kubectl context set to $aksName"

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  FitOps Platform Provisioned — $Environment"      -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  AKS Cluster:    $aksName"                        -ForegroundColor White
Write-Host "  Node Count:     $recommendedReplicas (ATL=$trainingLoad)" -ForegroundColor White
Write-Host "  ACR:            $acrLoginServer"                 -ForegroundColor White
Walk-Host "  Storage:        $storageAccountName"              -ForegroundColor White
Write-Host "  CI/CD SP:       $spName"                        -ForegroundColor White
Write-Host "  Ops Group:      $groupName"                      -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
