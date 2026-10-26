param([ValidateSet('success','endpoint','missing-container','missing-retention','divergent-retention','concurrent-compose','environment','public-version','unrelated')][string]$Scenario = 'success')
$ErrorActionPreference='Stop'
$global:mockScenario=$Scenario
# Entire deployment exercised offline: no real credential, network or backup I/O.
$global:mockput = $false
$global:mockcomposeReads = 0
$global:mockold = 'registry.lagggpixel.com/atcmh-frontend:26.10.40'
$global:mocknew = 'registry.lagggpixel.com/atcmh-frontend:26.10.41'
$global:mockcompose = @('services:', '  web:', "    image: $global:mockold", '  retention:', "    image: $global:mockold", '') -join [Environment]::NewLine
$global:mockrelease = @{
  checked=$true;qa=@{passed=$true};published=@{imageId='sha256:new'};imageId='sha256:new';version='26.10.41'
  target=@{stack=30;stackName='atcmh';endpoint=3;image='registry.lagggpixel.com/atcmh-frontend';origin='https://www.atcmh.org';containers=@('atcmh-frontend','atcmh-simulator-retention')}
} | ConvertTo-Json -Depth 15
function Resolve-Path { [pscustomobject]@{Path=(Join-Path $PSScriptRoot 'mock-receipt.json')} }
function Get-Content { $global:mockrelease }
function Test-Path { param($LiteralPath) return $LiteralPath -like '*portainer.credential.clixml' }
function New-Item { }
function Export-Clixml { param([Parameter(ValueFromPipeline)]$InputObject, $LiteralPath) process { $global:mockencrypted=$InputObject } }
function Import-Clixml {
  param($LiteralPath)
  if ($LiteralPath -like '*portainer.credential.clixml') { return [PSCredential]::new('test', (ConvertTo-SecureString 'offline-fixture' -AsPlainText -Force)) }
  return $global:mockencrypted
}
function Set-Content { param([Parameter(ValueFromPipeline)]$Value, $LiteralPath) process { $global:mockresult=$Value } }
function Invoke-WebRequest { return @{StatusCode=200} }
function Invoke-RestMethod {
  param($Uri, $Method, $Headers, $TimeoutSec, $ContentType, $Body)
  if ($Uri -like '*/api/version') { return @{version=$(if ($global:mockScenario -eq 'public-version') {'wrong'} else {'26.10.41'})} }
  $route = ([uri]$Uri).PathAndQuery
  switch -Regex ($route) {
    '^/api/endpoints/3$' { return @{Name=$(if ($global:mockScenario -eq 'endpoint') {'wrong'} else {'local'})} }
    '/docker/info$' { return @{OSType='linux';Architecture='x86_64'} }
    '^/api/stacks/30\?endpointId=3$' {
      if ($Method -cne 'Put') {throw 'Unexpected write method'}
      $payload = $Body | ConvertFrom-Json
      if ($payload.Prune -or -not $payload.PullImage) {throw 'Unsafe deployment flags'}
      if ($global:mockScenario -in @('missing-container','missing-retention','divergent-retention')) {throw 'Invalid retention state reached deployment write'}
      $expected = $global:mockcompose.Replace($global:mockold,$global:mocknew)
      if ($payload.StackFileContent -cne $expected) {throw 'Unexpected Compose mutation'}
      $global:mockput=$true
      return @{}
    }
    '^/api/stacks/30$' {
      return @{Name='atcmh';EndpointId=3;Env=@(@{name='UNCHANGED';value=$(if ($global:mockput -and $global:mockScenario -eq 'environment') {'changed'} else {'preserved'})})}
    }
    '^/api/stacks/30/file$' {
      $global:mockcomposeReads++
      if ($global:mockScenario -eq 'concurrent-compose' -and $global:mockcomposeReads -gt 1) { return @{StackFileContent='edited concurrently'} }
      return @{StackFileContent=$(if ($global:mockput) {$global:mockcompose.Replace($global:mockold,$global:mocknew)} else {$global:mockcompose})}
    }
    '/docker/containers/json\?all=true$' {
      $values = @(@{Id='web';Names=@('/atcmh-frontend');ImageID='sha256:old';Labels=@{'com.docker.compose.project'='atcmh'}},
        @{Id='retention';Names=@('/atcmh-simulator-retention');ImageID='sha256:old';Labels=@{'com.docker.compose.project'='atcmh'}},
        @{Id='other';Names=@('/unrelated');ImageID='sha256:other';Labels=@{'com.docker.compose.project'='other'}})
      if ($global:mockScenario -eq 'missing-container') { Write-Output -NoEnumerate @($values[1],$values[2]); return }
      if ($global:mockScenario -eq 'missing-retention') { Write-Output -NoEnumerate @($values[0],$values[2]); return }
      if ($global:mockput -and $global:mockScenario -eq 'unrelated') { $values[2].Id='recreated' }
      Write-Output -NoEnumerate $values; return
    }
    '/docker/containers/web/json$' {
      return @{Config=@{Image=$(if ($global:mockput) {$global:mocknew} else {$global:mockold})};Image=$(if ($global:mockput) {'sha256:new'} else {'sha256:old'});RestartCount=0;State=@{Running=$true;OOMKilled=$false;Health=@{Status='healthy'}}}
    }
    '/docker/containers/retention/json$' {
      return @{Config=@{Image=$(if ($global:mockput) {$global:mocknew} elseif ($global:mockScenario -eq 'divergent-retention') {'registry.lagggpixel.com/atcmh-frontend:1.8.58'} else {$global:mockold})};Image=$(if ($global:mockput) {'sha256:new'} else {'sha256:old'});RestartCount=0;State=@{Running=$true;OOMKilled=$false}}
    }
    default { throw 'Unexpected API request in offline deployment test' }
  }
}
& (Join-Path $PSScriptRoot 'release-deploy.ps1') -ReceiptPath 'mock-receipt.json'
if (-not $global:mockput -or -not $global:mockresult) { throw 'Deployment did not complete' }
