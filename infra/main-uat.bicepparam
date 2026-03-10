using 'main.bicep'

param appName = 'primal-grid'
param acrName = 'primalgridacr'
param environment = 'uat'
param containerImage = 'mcr.microsoft.com/k8se/quickstart:latest'
param customDomainName = 'gridtest.kirbytoso.xyz'
