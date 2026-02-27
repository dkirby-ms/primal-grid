using 'main.bicep'

param location = 'eastus'
param appName = 'primal-grid'
param acrName = 'primalgridacr'
param containerImage = '${acrName}.azurecr.io/${appName}:latest'
