#!/usr/bin/env pwsh
<#
.SYNOPSIS
    FitOps Teardown removes all Azure resources and cleans up service principals.
    Always run this after testing to avoid unexpected Azure charges.

.PARAMETER ResourceGroupName
    Resource group to delete.

.PARAMETER SubscriptionId
    Azure subscription ID.

.PARAMETER Environment
    Environment name (dev | staging | prod).
#>

param(
    [Parameter(Mandatory)][string]$ResourceGroupName,
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][ValidateSet("dev","staging","prod")][string]$Environment
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
    Write-Host "`n▸ $msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

# Confirm before deleting anything
Write-Host "`n⚠  This will permanently delete all FitOps $Environment resources." -ForegroundColor Yellow
$confirm = Read-Host "Type 'yes' to confirm"
if ($confirm -ne "yes") {
    Write-Host "Aborted." -ForegroundColor Red
    exit 0
}

az account set --subscription $SubscriptionId

# Remove service principal
Write-Step "Removing CI/CD service principal"
$spName = "fitops-cicd-sp-$Environment"
$spId = az ad sp list `
    --display-name $spName `
    --query "[0].appId" `
    --output tsv 2>$null

if ($spId) {
    az ad sp delete --id $spId
    Write-Success "Service principal removed"
} else {
    Write-Host "  Service principal not found, skipping" -ForegroundColor Gray
}

# Remove security group
Write-Step "Removing platform ops security group"
$groupName = "fitops-platform-ops-$Environment"
$groupId = az ad group list `
    --display-name $groupName `
    --query "[0].id" `
    --output tsv 2>$null

if ($groupId) {
    az ad group delete --group $groupId
    Write-Success "Security group removed"
} else {
    Write-Host "  Security group not found, skipping" -ForegroundColor Gray
}

# Delete resource group — this removes AKS, ACR, Storage in one shot
Write-Step "Deleting resource group: $ResourceGroupName"
az group delete --name $ResourceGroupName --yes --no-wait
Write-Success "Resource group deletion initiated (runs in background)"

Write-Host "`n  All FitOps $Environment resources are being removed." -ForegroundColor Green
Write-Host "  Check Azure portal in a few minutes to confirm cleanup.`n" -ForegroundColor Green