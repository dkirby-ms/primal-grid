using 'main.bicep'

param appName = 'primal-grid'
param acrName = 'primalgridacr'
param environment = 'uat'
param containerImage = '${acrName}.azurecr.io/${appName}:latest'
