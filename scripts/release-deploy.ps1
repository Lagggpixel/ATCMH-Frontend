param([string]$ReceiptPath, [switch]$LoadFunctionsOnly)
$ErrorActionPreference = 'Stop'

function Get-ReleaseCompose {
    param([string]$Compose, [string]$OldImage, [string]$NewImage, [int]$ExpectedCount)
    $pattern = '(?m)^(\s*image:\s*[''" ]?)' + [regex]::Escape($OldImage) + '([''"]?\s*(?:#.*)?\r?)$'
    $matches = [regex]::Matches($Compose, $pattern)
    if ($matches.Count -ne $ExpectedCount) { throw 'Unexpected web/retention image references; inspect the live stack' }
    $next = [regex]::Replace($Compose, $pattern, {param($match) $match.Groups[1].Value + $NewImage + $match.Groups[2].Value})
    if ($next -ceq $Compose) { throw 'Release is already deployed; inspect receipts instead of redeploying' }
    return $next
}

function Get-ReleaseEnvironmentJson($Environment) {
    return ConvertTo-Json -InputObject @($Environment | Sort-Object name) -Depth 30 -Compress
}

if ($LoadFunctionsOnly) { return }
try {
    if (-not $IsWindows) { throw 'Portainer DPAPI deployment requires Windows' }
    $receiptFile = (Resolve-Path -LiteralPath $ReceiptPath).Path
    $release = Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json
    $target = $release.target
    if (-not $release.checked -or -not $release.qa -or -not $release.published -or $release.published.imageId -cne $release.imageId) { throw 'Incomplete release checks/publication' }
    # Restrict reusable deployment to the two verified web stacks.
    $expected = if ($target.stack -eq 30) { @{name='atcmh';image='registry.lagggpixel.com/atcmh-frontend';containers=@('atcmh-frontend','atcmh-simulator-retention');origin='https://www.atcmh.org'} }
      elseif ($target.stack -eq 66) { @{name='sweatbox';image='registry.lagggpixel.com/sweatbox';containers=@('sweatbox','sweatbox-retention');origin='https://sweatbox.lagggpixel.com'} }
      else { throw 'Unrecognised deployment stack' }
    if ($target.endpoint -ne 3 -or $target.stackName -cne $expected.name -or $target.image -cne $expected.image -or $target.origin -cne $expected.origin -or ($target.containers -join ',') -cne ($expected.containers -join ',')) { throw 'Deployment mapping changed' }
    $credentialPath = Join-Path $env:USERPROFILE 'Documents/Codex/2026-10-01/can/work/private/portainer.credential.clixml'
    if (-not (Test-Path -LiteralPath $credentialPath)) { throw 'Saved Portainer credential unavailable' }
    $credential = Import-Clixml -LiteralPath $credentialPath
    function Invoke-ReleasePortainer([string]$Path, [string]$Method = 'Get', $Body = $null) {
        $parameters = @{Uri="https://portainer.lagggpixel.com/api$Path";Method=$Method;Headers=@{'X-API-Key'=$credential.GetNetworkCredential().Password};TimeoutSec=180}
        if ($null -ne $Body) { $parameters.ContentType='application/json'; $parameters.Body=ConvertTo-Json -InputObject $Body -Depth 90 -Compress }
        try { $response = Invoke-RestMethod @parameters; foreach ($item in $response) { $item } } catch { throw "Portainer $Method $Path failed; response withheld" }
    }
    $endpoint = Invoke-ReleasePortainer '/endpoints/3'
    $info = Invoke-ReleasePortainer '/endpoints/3/docker/info'
    if ($endpoint.Name -cne 'local' -or $info.OSType -cne 'linux' -or $info.Architecture -notin @('x86_64','amd64')) { throw 'Deployment endpoint identity/platform changed' }
    $stack = Invoke-ReleasePortainer "/stacks/$($target.stack)"
    if ($stack.Name -cne $target.stackName -or $stack.EndpointId -ne 3) { throw 'Stack identity changed' }
    $compose = (Invoke-ReleasePortainer "/stacks/$($target.stack)/file").StackFileContent
    $containers = @(Invoke-ReleasePortainer '/endpoints/3/docker/containers/json?all=true')
    $before = @{}
    foreach ($container in $containers) {
        $name = $container.Names[0].TrimStart('/')
        # Only inspect stack services; never persist unrelated environment values.
        if ($container.Labels.'com.docker.compose.project' -ceq $target.stackName) {
            $before[$name] = Invoke-ReleasePortainer "/endpoints/3/docker/containers/$($container.Id)/json"
        }
    }
    foreach ($name in $target.containers) { if (-not $before.ContainsKey($name)) { throw "Expected stack container missing: $name" } }
    $oldImage = $before[$target.containers[0]].Config.Image
    if (-not $oldImage.StartsWith("$($target.image):")) { throw 'Unexpected preceding image repository' }
    $oldVersion = $oldImage.Substring($target.image.Length + 1)
    if ($oldVersion -notmatch '^\d+\.\d+\.\d+$' -or [version]$release.version -le [version]$oldVersion) { throw 'New version must be later than the running version; inspect concurrent releases' }
    foreach ($name in $target.containers) { if ($before[$name].Config.Image -cne $oldImage) { throw 'Web/retention versions diverged; inspect before deployment' } }
    $newImage = "$($target.image):$($release.version)"
    $next = Get-ReleaseCompose $compose $oldImage $newImage $target.containers.Count
    $backupDirectory = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Codex/releases/$($target.stackName)/$($release.version)"
    $null = New-Item -ItemType Directory -Path $backupDirectory -Force
    $backup = Join-Path $backupDirectory 'before.clixml'
    if (Test-Path -LiteralPath $backup) { throw 'Deployment backup exists; inspect previous attempt before retrying' }
    $snapshot = ConvertTo-Json -InputObject @{stack=$stack;compose=$compose;containers=$before} -Depth 100 -Compress
    $snapshot | ConvertTo-SecureString -AsPlainText -Force | Export-Clixml -LiteralPath $backup
    $restored = [System.Net.NetworkCredential]::new('', (Import-Clixml -LiteralPath $backup)).Password
    if ($restored -cne $snapshot) { throw 'Encrypted recovery round-trip failed' }
    $restored = $snapshot = $null
    # Refuse a concurrent stack edit immediately before the only deployment write.
    $current = Invoke-ReleasePortainer "/stacks/$($target.stack)"
    if ((Invoke-ReleasePortainer "/stacks/$($target.stack)/file").StackFileContent -cne $compose -or (Get-ReleaseEnvironmentJson $current.Env) -cne (Get-ReleaseEnvironmentJson $stack.Env)) { throw 'Stack changed during preparation' }
    $null = Invoke-ReleasePortainer "/stacks/$($target.stack)?endpointId=3" 'Put' @{StackFileContent=$next;Env=@($stack.Env);Prune=$false;PullImage=$true}
    $after = Invoke-ReleasePortainer "/stacks/$($target.stack)"
    if ((Invoke-ReleasePortainer "/stacks/$($target.stack)/file").StackFileContent -cne $next -or (Get-ReleaseEnvironmentJson $after.Env) -cne (Get-ReleaseEnvironmentJson $stack.Env)) { throw 'Stack configuration/environment preservation failed' }
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    do {
        $ready = $true
        $live = @(Invoke-ReleasePortainer '/endpoints/3/docker/containers/json?all=true')
        foreach ($name in $before.Keys) {
            $entry = @($live | Where-Object { $_.Names -contains "/$name" })
            if ($entry.Count -ne 1) { $ready=$false; continue }
            $details = Invoke-ReleasePortainer "/endpoints/3/docker/containers/$($entry[0].Id)/json"
            $expectedId = if ($target.containers -contains $name) { $release.imageId } else { $before[$name].Image }
            if ($details.Image -cne $expectedId) { $ready=$false }
            $allowedRestarts = if ($target.containers -contains $name) { 0 } else { $before[$name].RestartCount }
            if (-not $details.State.Running -or $details.State.OOMKilled -or $details.RestartCount -gt $allowedRestarts) { $ready=$false }
            if ($before[$name].State.Health -and $details.State.Health.Status -cne 'healthy') { $ready=$false }
        }
        if (-not $ready) { Start-Sleep -Seconds 2 }
    } while (-not $ready -and [DateTime]::UtcNow -lt $deadline)
    if (-not $ready) { throw 'Container image/state/health verification failed; encrypted recovery retained' }
    foreach ($container in $containers) {
        if ($container.Labels.'com.docker.compose.project' -ceq $target.stackName) { continue }
        $entry = @($live | Where-Object Id -ceq $container.Id)
        if ($entry.Count -ne 1 -or $entry[0].ImageID -cne $container.ImageID) { throw 'An unrelated container changed; inspect concurrent operations' }
    }
    try {
        $version = Invoke-RestMethod -Uri "$($target.origin)/api/version" -TimeoutSec 30
        $health = Invoke-WebRequest -Uri "$($target.origin)/api/health" -TimeoutSec 30
    } catch { throw 'Public version/health verification failed; response withheld' }
    if ($version.version -cne $release.version -or $health.StatusCode -ne 200) { throw 'Public version/health mismatch' }
    @{stack=$target.stack;endpoint=3;version=$release.version;imageId=$release.imageId;configurationPreserved=$true;freshPull=$true;healthy=$true;completedAt=[DateTime]::UtcNow.ToString('o')} |
      ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path $receiptFile) 'deployment.json')
    Write-Output 'Remote image, stack configuration, environment, container health and public version verified.'
} catch {
    # Never let PowerShell print request objects, credential-bearing responses or stack data.
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
