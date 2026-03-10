using 'main.bicep'

param location = 'centralus'
param appName = 'primal-grid'
param acrName = 'primalgridacr'
param containerImage = 'mcr.microsoft.com/k8se/quickstart:latest'
param jwtSecret = readEnvironmentVariable('JWT_SECRET', '')
param customDomainName = 'gridwar.kirbytoso.xyz'
