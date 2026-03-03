// FitOps: Azure Infrastructure as Code(Bicep)
// Provisions: AKS Cluster, ACR, Storage Account and all RBAC assignments

@description('Environment name')
param environment string = 'dev'

@description('Azure region')
param location string = resourceGroup().location

@description('AKS node count — set by PowerShell based on training load')
param aksNodeCount int = 2

var prefix = 'fitops'
var tags = {
  project: 'fitops'
  environment: environment
  managedBy: 'bicep'
  purpose: 'cloud-enterprise-platform-demo'
}

// ── Azure Container Registry ──────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${prefix}acr${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false  // Use service principal auth & never admin credentials
  }
}

// ── Storage Account ───────────────────────────────────────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: '${prefix}sa${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true          // Hardened: HTTPS only
    minimumTlsVersion: 'TLS1_2'            // Hardened: no old TLS versions
    allowBlobPublicAccess: false            // Hardened: no anonymous access
  }
}

// ── Blob Container for workout data ──────────────────────────────────────────
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource workoutsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'workouts'
  properties: {
    publicAccess: 'None'
  }
}

// ── AKS Cluster ───────────────────────────────────────────────────────────────
resource aks 'Microsoft.ContainerService/managedClusters@2024-02-01' = {
  name: '${prefix}-aks-${environment}'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'   // Azure manages the identity & no credentials to rotate
  }
  properties: {
    dnsPrefix: '${prefix}-${environment}'
    agentPoolProfiles: [
      {
        name: 'system'
        count: aksNodeCount      // This value comes from training load recommendation
        vmSize: 'Standard_B2s'
        mode: 'System'
        enableAutoScaling: true
        minCount: 1
        maxCount: 4              // Matches FitOps max replica recommendation
        osType: 'Linux'
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      loadBalancerSku: 'standard'
    }
  }
}

// ── RBAC: AKS can pull images from ACR ───────────────────────────────────────
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, aks.id, 'acrpull')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'  // AcrPull built-in role
    )
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
  }
}

// ── RBAC: AKS can read/write to Storage ──────────────────────────────────────
resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, aks.id, 'storagecontributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'ba92f5b4-2d11-453d-a403-e96b0029c9fe'  // Storage Blob Data Contributor
    )
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs — used by PowerShell provisioning script ─────────────────────────
output acrLoginServer string = acr.properties.loginServer
output aksName string = aks.name
output storageAccountName string = storageAccount.name
output aksKubeletIdentityObjectId string = aks.properties.identityProfile.kubeletidentity.objectId
