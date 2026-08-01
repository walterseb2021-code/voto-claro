[CmdletBinding()]
param(
  [ValidateSet("Plan","Create","Apply","Verify","Destroy","FullTest")]
  [string]$Action = "Plan",
  [string]$PostgresBin = (Join-Path $env:LOCALAPPDATA "VotoClaro\PostgreSQL\17.10-complete\bin"),
  [int]$Port = 55432,
  [string]$ClusterName = "vc_staging_baseline_test_local",
  [string]$DatabaseName = "vc_staging_baseline_test_db",
  [string]$DataRoot,
  [switch]$KeepOnSuccess,
  [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:CurrentStage = "initialization"
$script:AllowedHost = "127.0.0.1"
$script:MarkerFileName = "VC_ISOLATED_BASELINE_TEST.marker"
$script:ClusterPrefix = "vc_staging_baseline_test_"
$script:DatabasePrefix = "vc_staging_baseline_test_"
$script:LocalAdminUser = "vc_isolated_admin"
$script:RequiredConfirmations = @{
  Create = "CREATE-ISOLATED-LOCAL-POSTGRES"
  Apply = "APPLY-BASELINE-TO-ISOLATED-LOCAL"
  Destroy = "DESTROY-ISOLATED-LOCAL-POSTGRES"
  FullTest = "FULL-ISOLATED-BASELINE-TEST"
}
$script:SafeCodes = @(
  "postgres_tools_missing",
  "postgres_package_incomplete",
  "postgres_bki_missing",
  "pgcrypto_control_missing",
  "pgcrypto_library_missing",
  "postgres_major_invalid",
  "port_invalid",
  "port_reserved",
  "port_in_use",
  "cluster_name_invalid",
  "database_name_invalid",
  "data_root_invalid",
  "data_root_inside_repository",
  "data_root_not_empty",
  "marker_missing",
  "marker_invalid",
  "baseline_missing",
  "baseline_validation_failed",
  "dependency_scan_failed",
  "missing_required_role",
  "missing_required_extension",
  "external_schema_dependency",
  "database_not_empty",
  "local_server_not_ready",
  "apply_failed",
  "verification_failed",
  "destroy_refused",
  "action_not_approved",
  "admin_user_invalid",
  "unexpected_failure"
)

function Set-Stage {
  param([Parameter(Mandatory = $true)][string]$Stage)
  $script:CurrentStage = $Stage
}

function Throw-SafeError {
  param([Parameter(Mandatory = $true)][string]$Code)
  throw "VC_SAFE_REASON::$Code"
}

function Get-SafeReason {
  param([Parameter(Mandatory = $true)][object]$ErrorRecord)
  $exception = $ErrorRecord.Exception
  $depth = 0
  while ($null -ne $exception -and $depth -lt 5) {
    if ($null -ne $exception.Message -and $exception.Message -match "^VC_SAFE_REASON::([a-z0-9_]+)$") {
      return $Matches[1]
    }
    $exception = $exception.InnerException
    $depth += 1
  }
  return "unexpected_failure"
}

function Get-RepoRoot {
  return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
}

function Get-FullPathSafe {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  if ($PathValue.StartsWith("\\", [System.StringComparison]::Ordinal)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  if ($PathValue -match "(^|[\\/])\.\.([\\/]|$)") {
    Throw-SafeError -Code "data_root_invalid"
  }
  foreach ($ch in $PathValue.ToCharArray()) {
    if ([int][char]$ch -lt 32) {
      Throw-SafeError -Code "data_root_invalid"
    }
  }
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Assert-SafeParameterText {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value,
    [Parameter(Mandatory = $true)][string]$Code
  )
  if ($Value.IndexOf('"') -ge 0 -or $Value.IndexOf("'") -ge 0) {
    Throw-SafeError -Code $Code
  }
  foreach ($ch in $Value.ToCharArray()) {
    if ([int][char]$ch -lt 32) {
      Throw-SafeError -Code $Code
    }
  }
}

function Test-IsInsideDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$ChildPath,
    [Parameter(Mandatory = $true)][string]$ParentPath
  )
  $childFull = [System.IO.Path]::GetFullPath($ChildPath)
  $parentFull = [System.IO.Path]::GetFullPath($ParentPath)
  if (-not $parentFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $parentFull += [System.IO.Path]::DirectorySeparatorChar
  }
  return $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-DefaultDataRoot {
  param([Parameter(Mandatory = $true)][string]$Name)
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  return Join-Path $env:LOCALAPPDATA (Join-Path "VotoClaro\isolated-postgres-baseline-test" $Name)
}

function Assert-NoForbiddenRemoteText {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)
  $blocked = @(
    ("supabase" + ".co"),
    ("pooler." + "supabase" + ".com"),
    ("amazonaws" + ".com")
  )
  foreach ($item in $blocked) {
    if ($Value.IndexOf($item, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      Throw-SafeError -Code "data_root_invalid"
    }
  }
}

function Assert-Port {
  param([Parameter(Mandatory = $true)][int]$Value)
  if ($Value -lt 1024 -or $Value -gt 65535) {
    Throw-SafeError -Code "port_invalid"
  }
  if ($Value -eq 5432) {
    Throw-SafeError -Code "port_reserved"
  }
}

function Test-PortAvailable {
  param([Parameter(Mandatory = $true)][int]$Value)
  try {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $Value })
    return $listeners.Count -eq 0
  } catch {
    try {
      $lines = @(netstat -ano -p tcp | Select-String -Pattern (":" + $Value + " "))
      return $lines.Count -eq 0
    } catch {
      return $false
    }
  }
}

function Assert-ClusterName {
  param([Parameter(Mandatory = $true)][string]$Value)
  Assert-SafeParameterText -Value $Value -Code "cluster_name_invalid"
  Assert-NoForbiddenRemoteText -Value $Value
  if (-not $Value.StartsWith($script:ClusterPrefix, [System.StringComparison]::Ordinal) -or
      $Value -notmatch "^[a-z0-9_]+$") {
    Throw-SafeError -Code "cluster_name_invalid"
  }
}

function Assert-DatabaseName {
  param([Parameter(Mandatory = $true)][string]$Value)
  Assert-SafeParameterText -Value $Value -Code "database_name_invalid"
  Assert-NoForbiddenRemoteText -Value $Value
  if (-not $Value.StartsWith($script:DatabasePrefix, [System.StringComparison]::Ordinal) -or
      $Value -notmatch "^[a-z0-9_]+$") {
    Throw-SafeError -Code "database_name_invalid"
  }
  if ($Value -in @("postgres","template0","template1")) {
    Throw-SafeError -Code "database_name_invalid"
  }
}

function Assert-LocalAdminUser {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value -ne "vc_isolated_admin") {
    Throw-SafeError -Code "admin_user_invalid"
  }
  if ($Value -in @("postgres","service_role","anon","authenticated")) {
    Throw-SafeError -Code "admin_user_invalid"
  }
}

function Test-HasReparsePointInPath {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$StopParent
  )
  $current = $PathValue
  while (-not [string]::IsNullOrWhiteSpace($current)) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        return $true
      }
    }
    if ([string]::Equals($current.TrimEnd('\'), $StopParent.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
      break
    }
    $parent = Split-Path -Parent $current
    if ([string]::IsNullOrWhiteSpace($parent) -or [string]::Equals($parent, $current, [System.StringComparison]::OrdinalIgnoreCase)) {
      break
    }
    $current = $parent
  }
  return $false
}

function Get-RequiredDataRootParent {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  return [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "VotoClaro\isolated-postgres-baseline-test"))
}

function Assert-DataRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedClusterName,
    [bool]$RequireMarker
  )
  Assert-NoForbiddenRemoteText -Value $Root
  $full = Get-FullPathSafe -PathValue $Root
  $driveRoot = [System.IO.Path]::GetPathRoot($full)
  if ([string]::Equals($full.TrimEnd('\'), $driveRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  $requiredParent = Get-RequiredDataRootParent
  $actualParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $full))
  $actualLeaf = Split-Path -Leaf $full
  if (-not [string]::Equals($actualParent.TrimEnd('\'), $requiredParent.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  if (-not [string]::Equals($actualLeaf, $ExpectedClusterName, [System.StringComparison]::Ordinal)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  $profileRoot = [System.IO.Path]::GetFullPath($env:USERPROFILE)
  if ([string]::Equals($full.TrimEnd('\'), $profileRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  if (Test-IsInsideDirectory -ChildPath $full -ParentPath $RepoRoot) {
    Throw-SafeError -Code "data_root_inside_repository"
  }
  if ($full.StartsWith($env:ProgramFiles, [System.StringComparison]::OrdinalIgnoreCase) -or
      $full.StartsWith($env:WINDIR, [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  if (Test-HasReparsePointInPath -PathValue $full -StopParent $requiredParent) {
    Throw-SafeError -Code "data_root_invalid"
  }
  if (Test-Path -LiteralPath $full) {
    $marker = Join-Path $full $script:MarkerFileName
    if ($RequireMarker -and -not (Test-Path -LiteralPath $marker -PathType Leaf)) {
      Throw-SafeError -Code "marker_missing"
    }
    if ($RequireMarker) {
      Assert-Marker -MarkerPath $marker -ExpectedClusterName $ExpectedClusterName -ExpectedDatabaseName $DatabaseName -ExpectedPort $Port
    }
    if (-not $RequireMarker -and -not (Test-Path -LiteralPath $marker -PathType Leaf)) {
      $items = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue)
      if ($items.Count -gt 0) {
        Throw-SafeError -Code "data_root_not_empty"
      }
    }
  }
  if ($RequireMarker) {
    Throw-SafeError -Code "marker_missing"
  }
  return $full
}

function Assert-Marker {
  param(
    [Parameter(Mandatory = $true)][string]$MarkerPath,
    [Parameter(Mandatory = $true)][string]$ExpectedClusterName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][int]$ExpectedPort
  )
  if (-not (Test-Path -LiteralPath $MarkerPath -PathType Leaf)) {
    Throw-SafeError -Code "marker_missing"
  }
  $allowedKeys = @("artifact","cluster_name","database_name","host","port","created_utc","production_safe","isolated_local_only")
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $MarkerPath) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -le 0) { Throw-SafeError -Code "marker_invalid" }
    $key = $line.Substring(0, $separator)
    $value = $line.Substring($separator + 1)
    if ($allowedKeys -notcontains $key -or $map.ContainsKey($key)) {
      Throw-SafeError -Code "marker_invalid"
    }
    $map[$key] = $value
  }
  foreach ($key in $allowedKeys) {
    if (-not $map.ContainsKey($key)) { Throw-SafeError -Code "marker_invalid" }
  }
  if ($map["artifact"] -ne "vc_isolated_baseline_test" -or
      $map["cluster_name"] -ne $ExpectedClusterName -or
      $map["database_name"] -ne $ExpectedDatabaseName -or
      $map["host"] -ne $script:AllowedHost -or
      $map["port"] -ne ([string]$ExpectedPort) -or
      $map["production_safe"] -ne "false" -or
      $map["isolated_local_only"] -ne "true") {
    Throw-SafeError -Code "marker_invalid"
  }
}

function Get-ToolPath {
  param(
    [Parameter(Mandatory = $true)][string]$BinRoot,
    [Parameter(Mandatory = $true)][string]$ToolName
  )
  return Join-Path $BinRoot ($ToolName + ".exe")
}

function Get-PostgresPackageInfo {
  param([Parameter(Mandatory = $true)][string]$BinRoot)
  Assert-SafeParameterText -Value $BinRoot -Code "postgres_tools_missing"
  $binFull = [System.IO.Path]::GetFullPath($BinRoot)
  $root = [System.IO.Path]::GetFullPath((Join-Path $binFull ".."))
  $share = Join-Path $root "share"
  $lib = Join-Path $root "lib"
  $postgresBki = Join-Path $share "postgres.bki"
  $pgcryptoControl = Join-Path $share "extension\pgcrypto.control"
  $pgcryptoLibrary = Join-Path $lib "pgcrypto.dll"
  $complete = (Test-Path -LiteralPath $postgresBki -PathType Leaf) -and
    (Test-Path -LiteralPath $pgcryptoControl -PathType Leaf) -and
    (Test-Path -LiteralPath $pgcryptoLibrary -PathType Leaf)
  return [pscustomobject]@{
    Root = $root
    Bin = $binFull
    Complete = $complete
    PostgresBkiPresent = (Test-Path -LiteralPath $postgresBki -PathType Leaf)
    PgcryptoControlPresent = (Test-Path -LiteralPath $pgcryptoControl -PathType Leaf)
    PgcryptoLibraryPresent = (Test-Path -LiteralPath $pgcryptoLibrary -PathType Leaf)
    Major = "17"
    Version = "17.10"
  }
}

function Assert-PostgresTools {
  param([Parameter(Mandatory = $true)][string]$BinRoot)
  $package = Get-PostgresPackageInfo -BinRoot $BinRoot
  $binFull = $package.Bin
  $required = @("initdb","pg_ctl","postgres","psql","createdb","dropdb","pg_isready")
  foreach ($tool in $required) {
    $path = Get-ToolPath -BinRoot $binFull -ToolName $tool
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      Throw-SafeError -Code "postgres_tools_missing"
    }
    $command = Get-Command $path -ErrorAction SilentlyContinue
    if ($null -eq $command -or $command.CommandType -ne "Application") {
      Throw-SafeError -Code "postgres_tools_missing"
    }
  }
  if ($binFull -notmatch "\\VotoClaro\\PostgreSQL\\17\.10-complete\\bin$") {
    Throw-SafeError -Code "postgres_major_invalid"
  }
  if (-not $package.PostgresBkiPresent) { Throw-SafeError -Code "postgres_bki_missing" }
  if (-not $package.PgcryptoControlPresent) { Throw-SafeError -Code "pgcrypto_control_missing" }
  if (-not $package.PgcryptoLibraryPresent) { Throw-SafeError -Code "pgcrypto_library_missing" }
  if (-not $package.Complete) { Throw-SafeError -Code "postgres_package_incomplete" }
  return $package
}

function Test-LocalServerDetected {
  $serviceDetected = $false
  try {
    $services = @(Get-Service | Where-Object { $_.Name -match "postgres|postgresql" -or $_.DisplayName -match "postgres|postgresql" })
    $serviceDetected = $services.Count -gt 0
  } catch {
    $serviceDetected = $false
  }
  $processDetected = $false
  try {
    $processes = @(Get-Process | Where-Object { $_.ProcessName -match "postgres|postgresql" })
    $processDetected = $processes.Count -gt 0
  } catch {
    $processDetected = $false
  }
  return ($serviceDetected -or $processDetected)
}

function Invoke-BaselineValidator {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  $validator = Join-Path $RepoRoot "scripts\staging\validate-public-baseline-candidate.ps1"
  if (-not (Test-Path -LiteralPath $validator -PathType Leaf)) {
    Throw-SafeError -Code "baseline_missing"
  }
  $output = @(powershell -ExecutionPolicy Bypass -File $validator)
  if ($LASTEXITCODE -ne 0) {
    Throw-SafeError -Code "baseline_validation_failed"
  }
  $required = @(
    "BASELINE_CANDIDATE_VALID",
    "active_migration=false",
    "safe_to_apply_production=false",
    "safe_to_apply_staging=false",
    "requires_isolated_restore_test=true",
    "migration_lineage_decision_required=true"
  )
  foreach ($line in $required) {
    if ($output -notcontains $line) {
      Throw-SafeError -Code "baseline_validation_failed"
    }
  }
  return $true
}

function Invoke-LocalCompatPreflightValidator {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  $validator = Join-Path $RepoRoot "scripts\staging\isolated-postgres-baseline-test\Validate-LocalCompatPreflightCandidate.ps1"
  $manifest = Join-Path $RepoRoot "scripts\staging\isolated-postgres-baseline-test\local-compat-preflight.candidate.manifest.txt"
  $result = [ordered]@{
    Valid = $false
    ReadyForExecution = "false"
    HumanReviewRequired = "true"
    CompatibilityStrategyComplete = "false"
    DependencyNames = "none"
    AuthStubCreated = "false"
    StorageStubCreated = "false"
    ExtensionStrategy = "none"
    UnresolvedDependencyCount = "0"
  }
  if (-not (Test-Path -LiteralPath $validator -PathType Leaf) -or -not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    return [pscustomobject]$result
  }
  $output = @(powershell -ExecutionPolicy Bypass -File $validator)
  if ($LASTEXITCODE -ne 0 -or $output -notcontains "LOCAL_COMPAT_PREFLIGHT_CANDIDATE_VALID") {
    return [pscustomobject]$result
  }
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $manifest) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -gt 0) {
      $map[$line.Substring(0, $separator)] = $line.Substring($separator + 1)
    }
  }
  $result.Valid = $true
  $result.ReadyForExecution = $map["ready_for_execution"]
  $result.HumanReviewRequired = $map["requires_human_review"]
  $result.CompatibilityStrategyComplete = $(if ($map["unresolved_dependency_count"] -eq "0") { "true" } else { "false" })
  $result.DependencyNames = $map["dependency_names"]
  $result.AuthStubCreated = $map["auth_stub_created"]
  $result.StorageStubCreated = $map["storage_stub_created"]
  $result.ExtensionStrategy = $map["extension_strategy"]
  $result.UnresolvedDependencyCount = $map["unresolved_dependency_count"]
  return [pscustomobject]$result
}

function Get-DependencyScan {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  $baseline = Join-Path $RepoRoot "scripts\staging\baseline-candidate\public-schema-baseline.candidate.sql"
  if (-not (Test-Path -LiteralPath $baseline -PathType Leaf)) {
    Throw-SafeError -Code "baseline_missing"
  }
  try {
    $text = [System.IO.File]::ReadAllText($baseline)
    $roles = @{}
    foreach ($match in [regex]::Matches($text, "(?im)^\s*(GRANT|REVOKE)\b[^\r\n]*\b(TO|FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)")) {
      $roleName = $match.Groups[3].Value
      if ($roleName -eq "PUBLIC") {
        continue
      }
      if (-not $roles.ContainsKey($roleName)) {
        $roles[$roleName] = 0
      }
      $roles[$roleName] += 1
    }
    $dependencyRecords = New-Object System.Collections.Generic.List[object]
    foreach ($role in @($roles.Keys | Sort-Object)) {
      [void]$dependencyRecords.Add([pscustomobject]@{
        Name = $role
        Category = "role"
        References = $roles[$role]
        RequiredToApply = "true"
        CanSimulateInPurePostgres = $(if ($role -eq "postgres") { "indeterminado" } else { "true" })
        Strategy = $(if ($role -eq "postgres") { "REQUIRES_MANUAL_REVIEW" } else { "PRECREATE_ROLE_LOCAL" })
      })
    }
    $knownExternalObjects = @(
      @{ Name = "auth.users"; Category = "auth_object"; Strategy = "CREATE_MINIMAL_STUB_LOCAL"; Simulate = "true" },
      @{ Name = "storage.objects"; Category = "storage_object"; Strategy = "CREATE_MINIMAL_STUB_LOCAL"; Simulate = "true" },
      @{ Name = "extensions.gen_random_uuid"; Category = "external_function"; Strategy = "INSTALL_EXTENSION_LOCAL"; Simulate = "true" }
    )
    foreach ($item in $knownExternalObjects) {
      $count = [regex]::Matches($text, [regex]::Escape($item.Name)).Count
      if ($count -gt 0) {
        [void]$dependencyRecords.Add([pscustomobject]@{
          Name = $item.Name
          Category = $item.Category
          References = $count
          RequiredToApply = "true"
          CanSimulateInPurePostgres = $item.Simulate
          Strategy = $item.Strategy
        })
      }
    }
    foreach ($schema in @("auth","storage","extensions","realtime","cron")) {
      $count = [regex]::Matches($text, "\b" + [regex]::Escape($schema) + "\.").Count
      if ($count -gt 0) {
        [void]$dependencyRecords.Add([pscustomobject]@{
          Name = $schema
          Category = "external_schema"
          References = $count
          RequiredToApply = "true"
          CanSimulateInPurePostgres = $(if ($schema -in @("auth","storage","extensions")) { "true" } else { "false" })
          Strategy = $(if ($schema -in @("auth","storage","extensions")) { "PRECREATE_EMPTY_SCHEMA_LOCAL" } else { "NOT_SUPPORTED_IN_PURE_POSTGRES" })
        })
      }
    }
    $categories = New-Object System.Collections.Generic.List[string]
    foreach ($category in @($dependencyRecords | ForEach-Object { $_.Category } | Sort-Object -Unique)) {
      [void]$categories.Add($category)
    }
    $names = @($dependencyRecords | Sort-Object Category,Name | ForEach-Object { $_.Name })
    $dependencyCount = $dependencyRecords.Count
    $dependencyNames = if ($names.Count -eq 0) { "none" } else { $names -join "," }
    $dependencyCategories = if ($categories.Count -eq 0) { "none" } else { @($categories.ToArray()) -join "," }
    return [pscustomobject]@{
      RequiredDependenciesCount = $dependencyCount
      DependencyNames = $dependencyNames
      MissingDependencyCategories = $dependencyCategories
    }
  } catch {
    Throw-SafeError -Code "dependency_scan_failed"
  }
}

function Assert-Confirmation {
  param(
    [Parameter(Mandatory = $true)][string]$Expected,
    [Parameter(Mandatory = $true)][string]$Provided
  )
  if ($Provided -ne $Expected) {
    Throw-SafeError -Code "destroy_refused"
  }
}

function New-MarkerText {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$DbName,
    [Parameter(Mandatory = $true)][int]$LocalPort
  )
  return @(
    "artifact=vc_isolated_baseline_test"
    "cluster_name=$Name"
    "database_name=$DbName"
    "host=$script:AllowedHost"
    "port=$LocalPort"
    "created_utc=<future-iso-8601>"
    "production_safe=false"
    "isolated_local_only=true"
  )
}

function Get-FutureInitDbArgumentTemplate {
  param(
    [Parameter(Mandatory = $true)][string]$ExactDataRoot,
    [Parameter(Mandatory = $true)][string]$PasswordFile
  )
  Assert-LocalAdminUser -Value $script:LocalAdminUser
  return @(
    "--pgdata", $ExactDataRoot,
    "--username", $script:LocalAdminUser,
    "--auth-host=scram-sha-256",
    "--auth-local=scram-sha-256",
    "--pwfile", $PasswordFile
  )
}

function Get-FuturePsqlArgumentTemplate {
  param(
    [Parameter(Mandatory = $true)][string]$ExactDatabaseName,
    [Parameter(Mandatory = $true)][int]$ExactPort,
    [Parameter(Mandatory = $true)][string]$FilePath
  )
  Assert-DatabaseName -Value $ExactDatabaseName
  Assert-Port -Value $ExactPort
  return @(
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "--host", $script:AllowedHost,
    "--port", ([string]$ExactPort),
    "--username", $script:LocalAdminUser,
    "--dbname", $ExactDatabaseName,
    "--file", $FilePath
  )
}

function Get-FuturePostgresqlConfTemplate {
  param([Parameter(Mandatory = $true)][int]$ExactPort)
  Assert-Port -Value $ExactPort
  return @(
    "listen_addresses='127.0.0.1'",
    "port=$ExactPort",
    "ssl=off",
    "max_connections=20",
    "logging_collector=off",
    "password_encryption='scram-sha-256'"
  )
}

function Get-FuturePgHbaTemplate {
  return @(
    "local all all scram-sha-256",
    "host all all 127.0.0.1/32 scram-sha-256",
    "host all all 0.0.0.0/0 reject",
    "host all all ::/0 reject"
  )
}

function Test-ReadyForDestroy {
  param(
    [Parameter(Mandatory = $true)][string]$ResolvedDataRoot,
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )
  try {
    [void](Assert-DataRoot -Root $ResolvedDataRoot -RepoRoot $RepoRoot -ExpectedClusterName $ClusterName -RequireMarker:$true)
    return $true
  } catch {
    return $false
  }
}

function Invoke-Plan {
  Set-Stage -Stage "plan"
  $repoRoot = Get-RepoRoot
  $postgresPackage = Assert-PostgresTools -BinRoot $PostgresBin
  Assert-LocalAdminUser -Value $script:LocalAdminUser
  Assert-Port -Value $Port
  Assert-ClusterName -Value $ClusterName
  Assert-DatabaseName -Value $DatabaseName
  $resolvedDataRoot = if ([string]::IsNullOrWhiteSpace($DataRoot)) { Get-DefaultDataRoot -Name $ClusterName } else { $DataRoot }
  [void](Assert-DataRoot -Root $resolvedDataRoot -RepoRoot $repoRoot -ExpectedClusterName $ClusterName -RequireMarker:$false)
  $baselineValid = Invoke-BaselineValidator -RepoRoot $repoRoot
  $portAvailable = Test-PortAvailable -Value $Port
  $localServerDetected = Test-LocalServerDetected
  $dependencies = Get-DependencyScan -RepoRoot $repoRoot
  $localCompat = Invoke-LocalCompatPreflightValidator -RepoRoot $repoRoot
  $readyForCreate = $baselineValid -and $portAvailable -and (-not $localServerDetected)
  $readyForApply = $false
  $readyForVerify = $false
  $readyForDestroy = Test-ReadyForDestroy -ResolvedDataRoot $resolvedDataRoot -RepoRoot $repoRoot

  Write-Output "ISOLATED_BASELINE_TEST_PLAN_OK"
  Write-Output "postgres_major=$($postgresPackage.Major)"
  Write-Output "postgres_version=$($postgresPackage.Version)"
  Write-Output "complete_postgres_package=$(([string]$postgresPackage.Complete).ToLowerInvariant())"
  Write-Output "postgres_bki_present=$(([string]$postgresPackage.PostgresBkiPresent).ToLowerInvariant())"
  Write-Output "pgcrypto_control_present=$(([string]$postgresPackage.PgcryptoControlPresent).ToLowerInvariant())"
  Write-Output "pgcrypto_library_present=$(([string]$postgresPackage.PgcryptoLibraryPresent).ToLowerInvariant())"
  Write-Output "host=$script:AllowedHost"
  Write-Output "port=$Port"
  Write-Output "cluster_name_valid=true"
  Write-Output "database_name_valid=true"
  Write-Output "data_root_outside_repository=true"
  Write-Output "baseline_candidate_valid=true"
  Write-Output "port_available=$(([string]$portAvailable).ToLowerInvariant())"
  Write-Output "local_server_detected=$(([string]$localServerDetected).ToLowerInvariant())"
  Write-Output "required_dependencies_count=$($dependencies.RequiredDependenciesCount)"
  Write-Output "dependency_names=$($dependencies.DependencyNames)"
  Write-Output "missing_dependency_categories=$($dependencies.MissingDependencyCategories)"
  Write-Output "local_compat_preflight_valid=$(([string]$localCompat.Valid).ToLowerInvariant())"
  Write-Output "local_compat_preflight_dependency_names=$($localCompat.DependencyNames)"
  Write-Output "local_compat_preflight_auth_stub_created=$($localCompat.AuthStubCreated)"
  Write-Output "local_compat_preflight_storage_stub_created=$($localCompat.StorageStubCreated)"
  Write-Output "local_compat_preflight_extension_strategy=$($localCompat.ExtensionStrategy)"
  Write-Output "local_compat_preflight_unresolved_dependency_count=$($localCompat.UnresolvedDependencyCount)"
  Write-Output "local_compat_preflight_ready_for_execution=$($localCompat.ReadyForExecution)"
  Write-Output "local_compat_preflight_human_review_required=$($localCompat.HumanReviewRequired)"
  Write-Output "compatibility_strategy_complete=$($localCompat.CompatibilityStrategyComplete)"
  Write-Output "ready_for_create=$(([string]$readyForCreate).ToLowerInvariant())"
  Write-Output "ready_for_apply=$(([string]$readyForApply).ToLowerInvariant())"
  Write-Output "ready_for_verify=$(([string]$readyForVerify).ToLowerInvariant())"
  Write-Output "ready_for_destroy=$(([string]$readyForDestroy).ToLowerInvariant())"
  Write-Output "grant_revoke_source_counts_only=true"
  Write-Output "restored_acl_semantic_verification_required=true"
  Write-Output "human_approval_required_for_create=true"
  Write-Output "human_approval_required_for_apply=true"
  Write-Output "human_approval_required_for_destroy=true"
  Write-Output "destroy_requires_separate_action=true"
  Write-Output "production_connection_used=false"
  Write-Output "sql_executed=false"
}

function Invoke-BlockedFutureAction {
  param([Parameter(Mandatory = $true)][string]$RequestedAction)
  Set-Stage -Stage $RequestedAction.ToLowerInvariant()
  [void]$script:RequiredConfirmations[$RequestedAction]
  Throw-SafeError -Code "action_not_approved"
}

try {
  if ($SelfTest) {
    Write-Output "SELF_TEST_DELEGATED_TO_VALIDATE_TOOL"
    exit 0
  }

  switch ($Action) {
    "Plan" { Invoke-Plan }
    "Create" { Invoke-BlockedFutureAction -RequestedAction "Create" }
    "Apply" { Invoke-BlockedFutureAction -RequestedAction "Apply" }
    "Verify" { Invoke-BlockedFutureAction -RequestedAction "Verify" }
    "Destroy" {
      $repoRoot = Get-RepoRoot
      $resolvedDataRoot = if ([string]::IsNullOrWhiteSpace($DataRoot)) { Get-DefaultDataRoot -Name $ClusterName } else { $DataRoot }
      [void](Assert-DataRoot -Root $resolvedDataRoot -RepoRoot $repoRoot -ExpectedClusterName $ClusterName -RequireMarker:$true)
      [void](Assert-DataRoot -Root $resolvedDataRoot -RepoRoot $repoRoot -ExpectedClusterName $ClusterName -RequireMarker:$true)
      Invoke-BlockedFutureAction -RequestedAction "Destroy"
    }
    "FullTest" { Invoke-BlockedFutureAction -RequestedAction "FullTest" }
  }
  exit 0
} catch {
  $reason = Get-SafeReason -ErrorRecord $_
  Write-Output "ISOLATED_BASELINE_TEST_INVALID"
  Write-Output "stage=$script:CurrentStage"
  Write-Output "reason=$reason"
  Write-Output "production_connection_used=false"
  Write-Output "sql_executed=false"
  exit 1
}
