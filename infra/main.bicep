@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Base name for the application.')
param appName string = 'primal-grid'

@description('Name of the Azure Container Registry.')
param acrName string = 'primalgridacr'

@description('Full container image reference (e.g. primalgridacr.azurecr.io/primal-grid:latest).')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Deployment environment (prod or uat)')
param environment string = 'prod'

@description('JWT secret for auth token signing. Must be set for all environments.')
@secure()
param jwtSecret string

// ---------- Azure Container Registry ----------

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ---------- Container Apps Environment ----------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource containerEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------- Container App ----------

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: environment == 'uat' ? '${appName}-uat' : appName
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 2567
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: containerImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '2567'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
          ]
        }
      ]
      scale: {
        minReplicas: environment == 'uat' ? 0 : 1
        maxReplicas: environment == 'uat' ? 3 : 1
      }
    }
  }
}

// ---------- Outputs ----------

output acrLoginServer string = acr.properties.loginServer
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
