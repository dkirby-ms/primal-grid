using 'main.bicep'

param location = 'centralus'
param appName = 'primal-grid'
param acrName = 'primalgridacr'
param containerImage = '${acrName}.azurecr.io/${appName}:latest'
param jwtSecret = readEnvironmentVariable('JWT_SECRET', '')
