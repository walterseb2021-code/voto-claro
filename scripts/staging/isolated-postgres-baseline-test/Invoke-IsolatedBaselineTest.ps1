[CmdletBinding()]
param(
  [ValidateSet("Plan","Create","CleanupPartialCreate","Apply","Verify","Destroy","FullTest")]
  [string]$Action = "Plan",
  [string]$PostgresBin = (Join-Path $env:LOCALAPPDATA "VotoClaro\PostgreSQL\17.10-complete\bin"),
  [int]$Port = 55432,
  [string]$ClusterName = "vc_staging_baseline_test_local",
  [string]$DatabaseName = "vc_staging_baseline_test_db",
  [string]$DataRoot,
  [switch]$ConfirmCreate,
  [string]$CreateApprovalToken,
  [switch]$ConfirmCleanupPartialCreate,
  [string]$CleanupApprovalToken,
  [switch]$KeepOnSuccess,
  [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:CurrentStage = "initialization"
$script:CurrentExceptionType = $null
$script:AllowedHost = "127.0.0.1"
$script:MarkerFileName = "VC_ISOLATED_BASELINE_TEST.marker"
$script:ClusterPrefix = "vc_staging_baseline_test_"
$script:DatabasePrefix = "vc_staging_baseline_test_"
$script:LocalAdminUser = "vc_isolated_admin"
$script:ExpectedCreateApprovalToken = "CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432"
$script:ExpectedCleanupApprovalToken = "CLEANUP_PARTIAL_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432"
$script:PostgresPackageRelativePath = "VotoClaro\PostgreSQL\17.10-complete"
$script:IsolatedRootRelativePath = "VotoClaro\PostgreSQL\isolated-baseline-test"
$script:InstanceName = "pg17-port55432"
$script:CreatePort = 55432
$script:CreateStates = @(
  "absent",
  "initializing",
  "initialized",
  "configuring",
  "configured",
  "starting",
  "running",
  "failed",
  "stopped",
  "destroy_pending"
)
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
  "create_not_authorized",
  "cleanup_not_authorized",
  "cleanup_repo_not_clean",
  "cleanup_branch_not_allowed",
  "cleanup_head_not_synced",
  "cleanup_layout_failed",
  "cleanup_git_invalid",
  "cleanup_paths_invalid",
  "cleanup_attributes_invalid",
  "cleanup_reparse_detected",
  "cleanup_enumeration_denied",
  "cleanup_enumeration_failed",
  "cleanup_instance_not_empty",
  "cleanup_signature_failed",
  "cleanup_activity_detected",
  "cleanup_state_changed",
  "cleanup_delete_instance_failed",
  "cleanup_delete_root_failed",
  "cleanup_postcheck_failed",
  "cleanup_preflight_unknown",
  "cleanup_environment_invalid",
  "cleanup_postgres_package_incomplete",
  "cleanup_path_validation_failed",
  "cleanup_reparse_point_detected",
  "cleanup_unexpected_content",
  "cleanup_access_denied",
  "cleanup_postgres_process_detected",
  "cleanup_postgres_process_ambiguous",
  "cleanup_postgresql_service_running",
  "cleanup_port_in_use",
  "cleanup_postmaster_pid_present",
  "cleanup_state_changed_during_validation",
  "cleanup_instance_delete_failed",
  "cleanup_instance_still_exists",
  "cleanup_parent_not_empty",
  "cleanup_parent_delete_failed",
  "cleanup_partial_success_parent_remains",
  "repo_not_clean",
  "branch_not_allowed",
  "git_repository_invalid",
  "git_base_commit_missing",
  "git_ancestry_invalid",
  "git_command_failed",
  "git_working_directory_invalid",
  "git_command_timeout",
  "git_output_drain_failed",
  "postgres_version_invalid",
  "isolated_root_invalid",
  "instance_root_exists",
  "dataroot_exists",
  "protected_path",
  "reparse_point_detected",
  "port_unavailable",
  "acl_apply_failed",
  "acl_validation_failed",
  "acl_identity_missing",
  "acl_identity_translation_failed",
  "acl_identity_not_sid",
  "acl_identity_sid_empty",
  "acl_identity_query_failed",
  "acl_rules_missing",
  "acl_rules_read_failed",
  "acl_rules_collection_invalid",
  "acl_rules_enumeration_failed",
  "acl_unexpected_identity",
  "acl_unexpected_deny_rule",
  "acl_inherited_rule_present",
  "acl_missing_authorized_allow",
  "acl_rights_insufficient",
  "acl_inheritance_flags_mismatch",
  "acl_propagation_flags_mismatch",
  "acl_not_protected",
  "acl_readback_failed",
  "credential_protection_failed",
  "password_file_create_failed",
  "password_file_cleanup_failed",
  "initdb_failed",
  "initdb_timeout",
  "initdb_partial",
  "pg_version_invalid",
  "postgresql_conf_write_failed",
  "pg_hba_write_failed",
  "port_race_detected",
  "pg_ctl_start_failed",
  "pg_ctl_timeout",
  "pg_ctl_start_failed_no_server",
  "pg_ctl_start_failed_server_stopped",
  "postgres_server_state_unresolved",
  "postgres_server_cleanup_failed",
  "postmaster_pid_missing",
  "postmaster_pid_invalid",
  "postmaster_dataroot_mismatch",
  "postmaster_port_mismatch",
  "postgres_process_unverified",
  "listener_verification_failed",
  "process_output_drain_failed",
  "process_timeout_cleanup_failed",
  "process_object_missing",
  "process_already_exited",
  "process_main_module_unavailable",
  "process_executable_path_empty",
  "process_executable_path_invalid",
  "process_access_denied",
  "process_query_failed",
  "state_write_failed",
  "state_schema_invalid",
  "state_duplicate_key",
  "marker_state_mismatch",
  "create_failed",
  "create_completed",
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

function Get-CleanupSafeFailure {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Stage,
    [AllowNull()][object]$Exception
  )
  $allowedReasons = @(
    "cleanup_layout_failed",
    "cleanup_environment_invalid",
    "cleanup_git_invalid",
    "cleanup_paths_invalid",
    "cleanup_attributes_invalid",
    "cleanup_reparse_detected",
    "cleanup_enumeration_denied",
    "cleanup_enumeration_failed",
    "cleanup_unexpected_content",
    "cleanup_instance_not_empty",
    "cleanup_signature_failed",
    "cleanup_activity_detected",
    "cleanup_state_changed",
    "cleanup_delete_instance_failed",
    "cleanup_delete_root_failed",
    "cleanup_postcheck_failed",
    "cleanup_preflight_unknown"
  )
  $allowedStages = @(
    "cleanup_layout",
    "cleanup_environment",
    "cleanup_git",
    "cleanup_paths",
    "cleanup_attributes",
    "cleanup_exact_state",
    "cleanup_signature_initial",
    "cleanup_activity",
    "cleanup_revalidate_signature",
    "cleanup_revalidate_state",
    "cleanup_revalidate_activity",
    "cleanup_delete_instance",
    "cleanup_delete_root",
    "cleanup_postcheck"
  )
  $safeReason = $null
  $current = $Exception
  $depth = 0
  while ($null -ne $current -and $depth -lt 5) {
    $message = $null
    if ($current -is [System.Exception]) {
      $message = [string]$current.Message
    } elseif ($null -ne $current.PSObject.Properties["Message"]) {
      $message = [string]$current.Message
    }
    if ($null -ne $message -and $message -match "^VC_SAFE_REASON::([a-z0-9_]+)$") {
      if ($allowedReasons -contains $Matches[1]) {
        $safeReason = $Matches[1]
      }
      break
    }
    $current = $(if ($current -is [System.Exception]) { $current.InnerException } elseif ($null -ne $current.PSObject.Properties["InnerException"]) { $current.InnerException } else { $null })
    $depth += 1
  }
  $safeStage = $(if ($allowedStages -contains $Stage) { $Stage } else { "cleanup_preflight_unknown" })
  if ($null -ne $safeReason) {
    return [pscustomobject]@{
      Reason = $safeReason
      ExceptionType = $null
      SafeSubstage = $safeStage
    }
  }
  $rawType = "UnknownException"
  if ($null -ne $Exception) {
    if ($null -ne $Exception.PSObject.Properties["SimulatedTypeName"]) {
      $rawType = [string]$Exception.SimulatedTypeName
      if ($rawType -eq "MethodInvocationException" -and
          $null -ne $Exception.PSObject.Properties["InnerException"] -and
          $null -ne $Exception.InnerException) {
        $rawType = $Exception.InnerException.GetType().Name
      }
    } else {
      $rawType = $Exception.GetType().Name
      if ($rawType -eq "MethodInvocationException" -and $null -ne $Exception.InnerException) {
        $rawType = $Exception.InnerException.GetType().Name
      }
    }
  }
  $exceptionType = switch ($rawType) {
    "UnauthorizedAccessException" { "UnauthorizedAccessException"; break }
    "IOException" { "IOException"; break }
    "DirectoryNotFoundException" { "DirectoryNotFoundException"; break }
    "SecurityException" { "SecurityException"; break }
    "InvalidOperationException" { "InvalidOperationException"; break }
    "ArgumentException" { "ArgumentException"; break }
    "MethodInvocationException" { "MethodInvocationException"; break }
    default { "UnknownException" }
  }
  $reason = switch ($safeStage) {
    "cleanup_layout" { "cleanup_layout_failed"; break }
    "cleanup_environment" { "cleanup_environment_invalid"; break }
    "cleanup_git" { "cleanup_git_invalid"; break }
    "cleanup_paths" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" } else { "cleanup_paths_invalid" }
      break
    }
    "cleanup_attributes" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" } else { "cleanup_attributes_invalid" }
      break
    }
    "cleanup_exact_state" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" }
      elseif ($exceptionType -eq "DirectoryNotFoundException") { "cleanup_paths_invalid" }
      else { "cleanup_enumeration_failed" }
      break
    }
    "cleanup_signature_initial" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" }
      elseif ($exceptionType -eq "DirectoryNotFoundException") { "cleanup_state_changed" }
      else { "cleanup_signature_failed" }
      break
    }
    "cleanup_activity" { "cleanup_activity_detected"; break }
    "cleanup_revalidate_signature" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" }
      elseif ($exceptionType -eq "DirectoryNotFoundException") { "cleanup_state_changed" }
      else { "cleanup_signature_failed" }
      break
    }
    "cleanup_revalidate_state" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" } else { "cleanup_state_changed" }
      break
    }
    "cleanup_revalidate_activity" { "cleanup_activity_detected"; break }
    "cleanup_delete_instance" { "cleanup_delete_instance_failed"; break }
    "cleanup_delete_root" { "cleanup_delete_root_failed"; break }
    "cleanup_postcheck" { "cleanup_postcheck_failed"; break }
    default { "cleanup_preflight_unknown" }
  }
  return [pscustomobject]@{
    Reason = $reason
    ExceptionType = $exceptionType
    SafeSubstage = $safeStage
  }
}

function Get-RepoRoot {
  return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
}

function Get-PostgresRoot {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    Throw-SafeError -Code "postgres_tools_missing"
  }
  return [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA $script:PostgresPackageRelativePath))
}

function Get-IsolatedRoot {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    Throw-SafeError -Code "isolated_root_invalid"
  }
  return [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA $script:IsolatedRootRelativePath))
}

function Get-InstanceLayout {
  $isolatedRoot = Get-IsolatedRoot
  $instanceRoot = Join-Path $isolatedRoot $script:InstanceName
  $data = Join-Path $instanceRoot "data"
  $logs = Join-Path $instanceRoot "logs"
  $state = Join-Path $instanceRoot "state"
  $secrets = Join-Path $instanceRoot "secrets"
  return [pscustomobject]@{
    IsolatedRoot = [System.IO.Path]::GetFullPath($isolatedRoot)
    InstanceRoot = [System.IO.Path]::GetFullPath($instanceRoot)
    DataRoot = [System.IO.Path]::GetFullPath($data)
    LogRoot = [System.IO.Path]::GetFullPath($logs)
    StateRoot = [System.IO.Path]::GetFullPath($state)
    SecretRoot = [System.IO.Path]::GetFullPath($secrets)
    ServerLog = [System.IO.Path]::GetFullPath((Join-Path $logs "postgresql-server.log"))
    MarkerPath = [System.IO.Path]::GetFullPath((Join-Path $state $script:MarkerFileName))
    StatePath = [System.IO.Path]::GetFullPath((Join-Path $state "cluster-state.json"))
    CredentialPath = [System.IO.Path]::GetFullPath((Join-Path $secrets "vc_isolated_admin.dpapi"))
    PasswordFilePath = [System.IO.Path]::GetFullPath((Join-Path $secrets "initdb-password.tmp"))
  }
}

function Convert-ToPublicPath {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  $local = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)
  $full = [System.IO.Path]::GetFullPath($PathValue)
  if ($full.StartsWith($local, [System.StringComparison]::OrdinalIgnoreCase)) {
    return ("LOCALAPPDATA" + $full.Substring($local.Length))
  }
  return "<outside-localappdata>"
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
  [void]$Name
  return (Get-InstanceLayout).DataRoot
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
  if ($Value -ne 55432) {
    if ($Value -eq 5432) {
      Throw-SafeError -Code "port_reserved"
    }
    Throw-SafeError -Code "port_invalid"
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
  return (Get-InstanceLayout).InstanceRoot
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
  $layout = Get-InstanceLayout
  $localAppData = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)
  $votoClaroRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "VotoClaro"))
  $postgresParent = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "VotoClaro\PostgreSQL"))
  $postgresRoot = Get-PostgresRoot
  $postgresBinFull = [System.IO.Path]::GetFullPath((Join-Path $postgresRoot "bin"))
  $driveRoot = [System.IO.Path]::GetPathRoot($full)
  if ([string]::Equals($full.TrimEnd('\'), $driveRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  foreach ($protected in @($localAppData, $votoClaroRoot, $postgresParent, $postgresRoot, $postgresBinFull, $layout.IsolatedRoot, $layout.InstanceRoot)) {
    if ([string]::Equals($full.TrimEnd('\'), $protected.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-SafeError -Code "protected_path"
    }
  }
  if (-not [string]::Equals($full.TrimEnd('\'), $layout.DataRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  $requiredParent = $layout.IsolatedRoot
  $actualParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $full))
  $actualLeaf = Split-Path -Leaf $full
  if (-not [string]::Equals($actualParent.TrimEnd('\'), $layout.InstanceRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  if (-not [string]::Equals($actualLeaf, "data", [System.StringComparison]::Ordinal)) {
    Throw-SafeError -Code "data_root_invalid"
  }
  [void]$ExpectedClusterName
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
      return $full
    }
    if (-not $RequireMarker -and -not (Test-Path -LiteralPath $marker -PathType Leaf)) {
      $items = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue)
      if ($items.Count -gt 0) {
        Throw-SafeError -Code "data_root_not_empty"
      }
    }
  }
  if ($RequireMarker) { Throw-SafeError -Code "marker_missing" }
  return $full
}

function Read-MarkerMap {
  param([Parameter(Mandatory = $true)][string]$MarkerPath)
  if (-not (Test-Path -LiteralPath $MarkerPath -PathType Leaf)) {
    Throw-SafeError -Code "marker_missing"
  }
  $allowedKeys = @("magic","cluster_id","instance_name","host","port")
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
  return $map
}

function Assert-Marker {
  param(
    [Parameter(Mandatory = $true)][string]$MarkerPath,
    [Parameter(Mandatory = $true)][string]$ExpectedClusterName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][int]$ExpectedPort
  )
  $map = Read-MarkerMap -MarkerPath $MarkerPath
  [void]$ExpectedClusterName
  [void]$ExpectedDatabaseName
  if ($map["magic"] -ne "VOTO_CLARO_ISOLATED_BASELINE_TEST_V1" -or
      $map["instance_name"] -ne $script:InstanceName -or
      $map["host"] -ne $script:AllowedHost -or
      $map["port"] -ne ([string]$ExpectedPort) -or
      $map["cluster_id"] -notmatch "^[0-9a-fA-F-]{36}$") {
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

function Get-GitExecutable {
  try {
    $command = Get-Command git.exe -CommandType Application -ErrorAction Stop
    $path = [System.IO.Path]::GetFullPath($command.Source)
    if (-not [System.IO.Path]::IsPathRooted($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
      Throw-SafeError -Code "git_command_failed"
    }
    return $path
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "git_command_failed"
  }
}

function Invoke-GitCommand {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )
  $git = Get-GitExecutable
  try {
    $full = [System.IO.Path]::GetFullPath($WorkingDirectory)
    $repoRoot = Get-RepoRoot
    if (-not (Test-Path -LiteralPath $full -PathType Container) -or
        -not [string]::Equals($full.TrimEnd('\'), $repoRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase) -or
        (Test-HasReparsePointInPath -PathValue $full -StopParent $full)) {
      Throw-SafeError -Code "git_working_directory_invalid"
    }
    $result = Invoke-SafeProcess -FilePath $git -Arguments $Arguments -WorkingDirectory $full -TimeoutSeconds 15 -ToolName "git"
    if ($result.SafeErrorCode -eq "process_output_drain_failed") {
      return [pscustomobject]@{ ExitCode = 998; Output = @(); SafeErrorCode = "git_output_drain_failed" }
    }
    if ($result.TimedOut) {
      return [pscustomobject]@{ ExitCode = 997; Output = @(); SafeErrorCode = "git_command_timeout" }
    }
    $output = @()
    if (-not [string]::IsNullOrWhiteSpace($result.StdOut)) {
      $output = @($result.StdOut -split "\r?\n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
    return [pscustomobject]@{ ExitCode = $result.ExitCode; Output = $output; SafeErrorCode = $result.SafeErrorCode }
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    return [pscustomobject]@{ ExitCode = 999; Output = @() }
  }
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
    [Parameter(Mandatory = $true)][string]$ClusterId,
    [Parameter(Mandatory = $true)][int]$LocalPort
  )
  return @(
    "magic=VOTO_CLARO_ISOLATED_BASELINE_TEST_V1"
    "cluster_id=$ClusterId"
    "instance_name=$script:InstanceName"
    "host=$script:AllowedHost"
    "port=$LocalPort"
  )
}

function Get-FutureInitDbArgumentTemplate {
  param(
    [Parameter(Mandatory = $true)][string]$ExactDataRoot,
    [Parameter(Mandatory = $true)][string]$PasswordFile
  )
  Assert-LocalAdminUser -Value $script:LocalAdminUser
  return @(
    "--pgdata=$ExactDataRoot",
    "--username=$script:LocalAdminUser",
    "--encoding=UTF8",
    "--locale=C",
    "--auth-host=scram-sha-256",
    "--auth-local=scram-sha-256",
    "--pwfile=$PasswordFile"
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
    "# BEGIN VOTO_CLARO_ISOLATED_BASELINE_TEST",
    "listen_addresses = '127.0.0.1'",
    "port = $ExactPort",
    "ssl = off",
    "password_encryption = 'scram-sha-256'",
    "timezone = 'UTC'",
    "log_timezone = 'UTC'",
    "logging_collector = off",
    "max_connections = 10",
    "# END VOTO_CLARO_ISOLATED_BASELINE_TEST"
  )
}

function Get-FuturePgHbaTemplate {
  return @(
    "# VOTO CLARO ISOLATED BASELINE TEST",
    "# IPv4 loopback only. SCRAM authentication required.",
    "host    all    all    127.0.0.1/32    scram-sha-256",
    "",
    "# Explicitly reject all other IPv4 and IPv6 hosts.",
    "host    all    all    0.0.0.0/0       reject",
    "host    all    all    ::/0            reject"
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

function Test-CreateAuthorization {
  param(
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$ProvidedCreateApprovalToken,
    [Parameter(Mandatory = $true)][string]$ExpectedCreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$ProvidedCleanupApprovalToken
  )
  $authorized = $true
  if (-not $ConfirmCreate) { $authorized = $false }
  if ([string]::IsNullOrWhiteSpace($ProvidedCreateApprovalToken)) { $authorized = $false }
  if (-not [string]::Equals($ProvidedCreateApprovalToken, $ExpectedCreateApprovalToken, [System.StringComparison]::Ordinal)) { $authorized = $false }
  if ($ConfirmCleanupPartialCreate) { $authorized = $false }
  if (-not [string]::IsNullOrWhiteSpace($ProvidedCleanupApprovalToken)) { $authorized = $false }
  return [pscustomobject]@{
    Authorized = $authorized
    SafeErrorCode = $(if ($authorized) { $null } else { "create_not_authorized" })
  }
}

function Assert-CreateAuthorization {
  param(
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$ProvidedCreateApprovalToken,
    [Parameter(Mandatory = $true)][string]$ExpectedCreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$ProvidedCleanupApprovalToken
  )
  $result = Test-CreateAuthorization `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $ProvidedCreateApprovalToken `
    -ExpectedCreateApprovalToken $ExpectedCreateApprovalToken `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $ProvidedCleanupApprovalToken
  if (-not $result.Authorized) {
    Throw-SafeError -Code $result.SafeErrorCode
  }
}

function Assert-GitReadyForCreate {
  $repoRoot = Get-RepoRoot
  $topLevel = Invoke-GitCommand -Arguments @("rev-parse","--show-toplevel") -WorkingDirectory $repoRoot
  if ($topLevel.ExitCode -eq 997) { Throw-SafeError -Code "git_command_timeout" }
  if ($topLevel.ExitCode -eq 998) { Throw-SafeError -Code "git_output_drain_failed" }
  if ($topLevel.ExitCode -ne 0 -or $topLevel.Output.Count -ne 1) {
    Throw-SafeError -Code "git_repository_invalid"
  }
  $actualRoot = [System.IO.Path]::GetFullPath([string]$topLevel.Output[0])
  if (-not [string]::Equals($actualRoot.TrimEnd('\'), $repoRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "git_repository_invalid"
  }
  $base = Invoke-GitCommand -Arguments @("rev-parse","--verify","fe899a1^{commit}") -WorkingDirectory $repoRoot
  if ($base.ExitCode -eq 997) { Throw-SafeError -Code "git_command_timeout" }
  if ($base.ExitCode -eq 998) { Throw-SafeError -Code "git_output_drain_failed" }
  if ($base.ExitCode -ne 0) {
    Throw-SafeError -Code "git_base_commit_missing"
  }
  $ancestry = Invoke-GitCommand -Arguments @("merge-base","--is-ancestor","fe899a1","HEAD") -WorkingDirectory $repoRoot
  if ($ancestry.ExitCode -eq 997) { Throw-SafeError -Code "git_command_timeout" }
  if ($ancestry.ExitCode -eq 998) { Throw-SafeError -Code "git_output_drain_failed" }
  if ($ancestry.ExitCode -eq 1) {
    Throw-SafeError -Code "git_ancestry_invalid"
  }
  if ($ancestry.ExitCode -ne 0) {
    Throw-SafeError -Code "git_command_failed"
  }
  $branch = Invoke-GitCommand -Arguments @("branch","--show-current") -WorkingDirectory $repoRoot
  if ($branch.ExitCode -eq 997) { Throw-SafeError -Code "git_command_timeout" }
  if ($branch.ExitCode -eq 998) { Throw-SafeError -Code "git_output_drain_failed" }
  if ($branch.ExitCode -ne 0 -or $branch.Output.Count -ne 1 -or $branch.Output[0] -ne "master") {
    Throw-SafeError -Code "branch_not_allowed"
  }
  $status = Invoke-GitCommand -Arguments @("status","--porcelain=v1","--untracked-files=all") -WorkingDirectory $repoRoot
  if ($status.ExitCode -eq 997) { Throw-SafeError -Code "git_command_timeout" }
  if ($status.ExitCode -eq 998) { Throw-SafeError -Code "git_output_drain_failed" }
  if ($status.ExitCode -ne 0) {
    Throw-SafeError -Code "git_command_failed"
  }
  if ($status.Output.Count -ne 0) {
    Throw-SafeError -Code "repo_not_clean"
  }
}

function Assert-CreateConstants {
  if ($script:AllowedHost -ne "127.0.0.1" -or $script:CreatePort -ne 55432 -or $Port -ne 55432) {
    Throw-SafeError -Code "port_invalid"
  }
  Assert-LocalAdminUser -Value $script:LocalAdminUser
}

function Assert-PostgresPackageForCreate {
  param([Parameter(Mandatory = $true)][string]$BinRoot)
  $package = Assert-PostgresTools -BinRoot $BinRoot
  $localRoot = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)
  if (-not (Test-IsInsideDirectory -ChildPath $package.Root -ParentPath $localRoot)) {
    Throw-SafeError -Code "postgres_version_invalid"
  }
  if (-not [string]::Equals($package.Root.TrimEnd('\'), (Get-PostgresRoot).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "postgres_version_invalid"
  }
  foreach ($tool in @("initdb","postgres","pg_ctl","psql","createdb","dropdb","pg_isready")) {
    $path = Get-ToolPath -BinRoot $package.Bin -ToolName $tool
    if (-not [System.IO.Path]::IsPathRooted($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
      Throw-SafeError -Code "postgres_tools_missing"
    }
  }
  $extensionSql = @(Get-ChildItem -LiteralPath (Join-Path $package.Root "share\extension") -Filter "pgcrypto--*.sql" -File -ErrorAction SilentlyContinue)
  if ($extensionSql.Count -lt 1) {
    Throw-SafeError -Code "pgcrypto_control_missing"
  }
  foreach ($versionTool in @("postgres","initdb","psql")) {
    $result = Invoke-SafeProcess -FilePath (Get-ToolPath -BinRoot $package.Bin -ToolName $versionTool) -Arguments @("--version") -WorkingDirectory $package.Root -TimeoutSeconds 10 -ToolName "version"
    if (-not $result.Success -or $result.StdOut -notmatch "PostgreSQL\)\s+17\.10|PostgreSQL\s+17\.10") {
      Throw-SafeError -Code "postgres_version_invalid"
    }
  }
  return $package
}

function Assert-CreatePath {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$AllowedRoot,
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )
  if ([string]::IsNullOrWhiteSpace($PathValue) -or -not [System.IO.Path]::IsPathRooted($PathValue)) {
    Throw-SafeError -Code "isolated_root_invalid"
  }
  if ($PathValue.StartsWith("\\", [System.StringComparison]::Ordinal) -or $PathValue -match "(^|[\\/])\.\.([\\/]|$)") {
    Throw-SafeError -Code "isolated_root_invalid"
  }
  $full = [System.IO.Path]::GetFullPath($PathValue)
  $root = [System.IO.Path]::GetPathRoot($full)
  if ([string]::Equals($full.TrimEnd('\'), $root.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "protected_path"
  }
  foreach ($protected in @(
      [System.IO.Path]::GetFullPath($env:LOCALAPPDATA),
      [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "VotoClaro")),
      [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "VotoClaro\PostgreSQL")),
      (Get-PostgresRoot),
      [System.IO.Path]::GetFullPath((Join-Path (Get-PostgresRoot) "bin")),
      [System.IO.Path]::GetFullPath($env:ProgramFiles),
      [System.IO.Path]::GetFullPath($env:WINDIR),
      [System.IO.Path]::GetFullPath($RepoRoot)
    )) {
    if ([string]::Equals($full.TrimEnd('\'), $protected.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-SafeError -Code "protected_path"
    }
  }
  if (-not (Test-IsInsideDirectory -ChildPath $full -ParentPath $AllowedRoot) -and
      -not [string]::Equals($full.TrimEnd('\'), $AllowedRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "isolated_root_invalid"
  }
  if (Test-IsInsideDirectory -ChildPath $full -ParentPath $RepoRoot) {
    Throw-SafeError -Code "protected_path"
  }
  if (Test-HasReparsePointInPath -PathValue $full -StopParent $AllowedRoot) {
    Throw-SafeError -Code "reparse_point_detected"
  }
}

function Assert-CreateLayout {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )
  $expectedRoot = Get-IsolatedRoot
  if (-not [string]::Equals($Layout.IsolatedRoot.TrimEnd('\'), $expectedRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "isolated_root_invalid"
  }
  foreach ($path in @($Layout.IsolatedRoot, $Layout.InstanceRoot, $Layout.DataRoot, $Layout.LogRoot, $Layout.StateRoot, $Layout.SecretRoot, $Layout.ServerLog, $Layout.MarkerPath, $Layout.StatePath, $Layout.CredentialPath, $Layout.PasswordFilePath)) {
    Assert-CreatePath -PathValue $path -AllowedRoot $Layout.IsolatedRoot -RepoRoot $RepoRoot
  }
  if ((Split-Path -Leaf $Layout.InstanceRoot) -ne $script:InstanceName -or
      (Split-Path -Leaf $Layout.DataRoot) -ne "data" -or
      (Split-Path -Leaf $Layout.LogRoot) -ne "logs" -or
      (Split-Path -Leaf $Layout.StateRoot) -ne "state" -or
      (Split-Path -Leaf $Layout.SecretRoot) -ne "secrets") {
    Throw-SafeError -Code "isolated_root_invalid"
  }
}

function Assert-CreateInstanceAbsent {
  param([Parameter(Mandatory = $true)][object]$Layout)
  if (Test-Path -LiteralPath $Layout.InstanceRoot) { Throw-SafeError -Code "instance_root_exists" }
  if (Test-Path -LiteralPath $Layout.DataRoot) { Throw-SafeError -Code "dataroot_exists" }
  if (Test-Path -LiteralPath $Layout.MarkerPath) { Throw-SafeError -Code "instance_root_exists" }
  if (Test-Path -LiteralPath $Layout.StatePath) { Throw-SafeError -Code "instance_root_exists" }
  if (Test-Path -LiteralPath $Layout.CredentialPath) { Throw-SafeError -Code "instance_root_exists" }
  if (Test-Path -LiteralPath $Layout.ServerLog) { Throw-SafeError -Code "instance_root_exists" }
}

function Test-CleanupAuthorization {
  param(
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$ProvidedCleanupApprovalToken,
    [Parameter(Mandatory = $true)][string]$ExpectedCleanupApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$ProvidedCreateApprovalToken
  )
  $authorized = $true
  if (-not $ConfirmCleanupPartialCreate) { $authorized = $false }
  if ([string]::IsNullOrWhiteSpace($ProvidedCleanupApprovalToken)) { $authorized = $false }
  if (-not [string]::Equals($ProvidedCleanupApprovalToken, $ExpectedCleanupApprovalToken, [System.StringComparison]::Ordinal)) { $authorized = $false }
  if ($ConfirmCreate) { $authorized = $false }
  if (-not [string]::IsNullOrWhiteSpace($ProvidedCreateApprovalToken)) { $authorized = $false }
  return [pscustomobject]@{
    Authorized = $authorized
    SafeErrorCode = $(if ($authorized) { $null } else { "cleanup_not_authorized" })
  }
}

function Assert-CleanupAuthorization {
  param(
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$ProvidedCleanupApprovalToken,
    [Parameter(Mandatory = $true)][string]$ExpectedCleanupApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$ProvidedCreateApprovalToken
  )
  $result = Test-CleanupAuthorization `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $ProvidedCleanupApprovalToken `
    -ExpectedCleanupApprovalToken $ExpectedCleanupApprovalToken `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $ProvidedCreateApprovalToken
  if (-not $result.Authorized) {
    Throw-SafeError -Code $result.SafeErrorCode
  }
}

function Assert-CleanupGitReady {
  $repoRoot = Get-RepoRoot
  $branch = Invoke-GitCommand -Arguments @("branch","--show-current") -WorkingDirectory $repoRoot
  if ($branch.ExitCode -ne 0 -or $branch.Output.Count -ne 1 -or $branch.Output[0] -ne "master") {
    Throw-SafeError -Code "cleanup_branch_not_allowed"
  }
  $status = Invoke-GitCommand -Arguments @("status","--porcelain=v1","--untracked-files=all") -WorkingDirectory $repoRoot
  if ($status.ExitCode -ne 0) {
    Throw-SafeError -Code "cleanup_repo_not_clean"
  }
  if ($status.Output.Count -ne 0) {
    Throw-SafeError -Code "cleanup_repo_not_clean"
  }
  $origin = Invoke-GitCommand -Arguments @("rev-parse","origin/master") -WorkingDirectory $repoRoot
  $head = Invoke-GitCommand -Arguments @("rev-parse","HEAD") -WorkingDirectory $repoRoot
  if ($origin.ExitCode -ne 0 -or $head.ExitCode -ne 0 -or $origin.Output.Count -ne 1 -or $head.Output.Count -ne 1 -or
      -not [string]::Equals($origin.Output[0], $head.Output[0], [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "cleanup_head_not_synced"
  }
  $ancestry = Invoke-GitCommand -Arguments @("merge-base","--is-ancestor","239f291","HEAD") -WorkingDirectory $repoRoot
  if ($ancestry.ExitCode -ne 0) {
    Throw-SafeError -Code "cleanup_head_not_synced"
  }
}

function Assert-CleanupEnvironment {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -or
      $PSVersionTable.PSEdition -ne "Desktop" -or
      -not [Environment]::Is64BitOperatingSystem -or
      -not [Environment]::Is64BitProcess) {
    Throw-SafeError -Code "cleanup_environment_invalid"
  }
  $package = Get-PostgresPackageInfo -BinRoot $PostgresBin
  if (-not $package.Complete -or
      -not [string]::Equals($package.Root.TrimEnd('\'), (Get-PostgresRoot).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "cleanup_postgres_package_incomplete"
  }
  return $package
}

function Assert-CleanupPathFixed {
  param([Parameter(Mandatory = $true)][object]$Layout)
  try {
    $local = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)
    $postgresParent = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "VotoClaro\PostgreSQL"))
    $expectedIsolated = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA $script:IsolatedRootRelativePath))
    $expectedInstance = [System.IO.Path]::GetFullPath((Join-Path $expectedIsolated $script:InstanceName))
    $packageRoot = Get-PostgresRoot
    foreach ($path in @($Layout.IsolatedRoot, $Layout.InstanceRoot)) {
      if ([string]::IsNullOrWhiteSpace($path) -or -not [System.IO.Path]::IsPathRooted($path) -or $path.IndexOfAny([char[]]@('*','?')) -ge 0) {
        Throw-SafeError -Code "cleanup_path_validation_failed"
      }
    }
    if (-not [string]::Equals($Layout.IsolatedRoot.TrimEnd('\'), $expectedIsolated.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals($Layout.InstanceRoot.TrimEnd('\'), $expectedInstance.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-IsInsideDirectory -ChildPath $Layout.IsolatedRoot -ParentPath $postgresParent) -or
        -not [string]::Equals((Split-Path -Parent $Layout.InstanceRoot).TrimEnd('\'), $Layout.IsolatedRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-SafeError -Code "cleanup_path_validation_failed"
    }
    foreach ($protected in @($local, (Join-Path $env:LOCALAPPDATA "VotoClaro"), $postgresParent, $packageRoot)) {
      $protectedFull = [System.IO.Path]::GetFullPath($protected)
      if ([string]::Equals($Layout.IsolatedRoot.TrimEnd('\'), $protectedFull.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase) -or
          [string]::Equals($Layout.InstanceRoot.TrimEnd('\'), $protectedFull.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
        Throw-SafeError -Code "cleanup_path_validation_failed"
      }
    }
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "cleanup_path_validation_failed"
  }
}

function Get-CleanupDirectoryEntries {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  try {
    return @([System.IO.Directory]::EnumerateFileSystemEntries($PathValue))
  } catch [System.UnauthorizedAccessException] {
    Throw-SafeError -Code "cleanup_enumeration_denied"
  } catch {
    Throw-SafeError -Code "cleanup_enumeration_failed"
  }
}

function Assert-CleanupDirectorySafe {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  try {
    if (-not (Test-Path -LiteralPath $PathValue -PathType Container)) {
      Throw-SafeError -Code "cleanup_unexpected_content"
    }
    $item = Get-Item -LiteralPath $PathValue -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      Throw-SafeError -Code "cleanup_reparse_detected"
    }
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "cleanup_attributes_invalid"
  }
}

function Assert-CleanupEntrySafe {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  try {
    $item = Get-Item -LiteralPath $PathValue -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      Throw-SafeError -Code "cleanup_reparse_detected"
    }
    if (($item.Attributes -band [System.IO.FileAttributes]::Hidden) -ne 0 -or
        ($item.Attributes -band [System.IO.FileAttributes]::System) -ne 0) {
      Throw-SafeError -Code "cleanup_unexpected_content"
    }
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "cleanup_attributes_invalid"
  }
}

function Assert-CleanupExactPartialState {
  param([Parameter(Mandatory = $true)][object]$Layout)
  Assert-CleanupDirectorySafe -PathValue $Layout.IsolatedRoot
  Assert-CleanupDirectorySafe -PathValue $Layout.InstanceRoot
  foreach ($path in @(
      $Layout.DataRoot,
      $Layout.LogRoot,
      $Layout.StateRoot,
      $Layout.SecretRoot,
      $Layout.MarkerPath,
      $Layout.StatePath,
      $Layout.CredentialPath,
      $Layout.PasswordFilePath,
      $Layout.ServerLog,
      (Join-Path $Layout.DataRoot "postmaster.pid"),
      (Join-Path $Layout.DataRoot "PG_VERSION"),
      (Join-Path $Layout.DataRoot "postgresql.conf"),
      (Join-Path $Layout.DataRoot "pg_hba.conf")
    )) {
    if (Test-Path -LiteralPath $path) {
      if ($path.EndsWith("postmaster.pid", [System.StringComparison]::OrdinalIgnoreCase)) {
        Throw-SafeError -Code "cleanup_postmaster_pid_present"
      }
      Throw-SafeError -Code "cleanup_unexpected_content"
    }
  }
  $instanceEntries = Get-CleanupDirectoryEntries -PathValue $Layout.InstanceRoot
  foreach ($entry in $instanceEntries) {
    Assert-CleanupEntrySafe -PathValue $entry
    Throw-SafeError -Code "cleanup_instance_not_empty"
  }
  $isolatedEntries = Get-CleanupDirectoryEntries -PathValue $Layout.IsolatedRoot
  if ($isolatedEntries.Count -ne 1) {
    Throw-SafeError -Code "cleanup_unexpected_content"
  }
  Assert-CleanupEntrySafe -PathValue $isolatedEntries[0]
  $onlyEntry = [System.IO.Path]::GetFullPath($isolatedEntries[0])
  if (-not [string]::Equals($onlyEntry.TrimEnd('\'), $Layout.InstanceRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "cleanup_unexpected_content"
  }
}

function Get-CleanupPartialStateSignature {
  param([Parameter(Mandatory = $true)][object]$Layout)
  $isolatedEntries = @(Get-CleanupDirectoryEntries -PathValue $Layout.IsolatedRoot | Sort-Object)
  $instanceEntries = @(Get-CleanupDirectoryEntries -PathValue $Layout.InstanceRoot | Sort-Object)
  $knownPresence = @(
    (Test-Path -LiteralPath $Layout.DataRoot),
    (Test-Path -LiteralPath $Layout.LogRoot),
    (Test-Path -LiteralPath $Layout.StateRoot),
    (Test-Path -LiteralPath $Layout.SecretRoot),
    (Test-Path -LiteralPath $Layout.MarkerPath),
    (Test-Path -LiteralPath $Layout.StatePath),
    (Test-Path -LiteralPath $Layout.CredentialPath),
    (Test-Path -LiteralPath $Layout.PasswordFilePath),
    (Test-Path -LiteralPath $Layout.ServerLog),
    (Test-Path -LiteralPath (Join-Path $Layout.DataRoot "postmaster.pid")),
    (Test-Path -LiteralPath (Join-Path $Layout.DataRoot "PG_VERSION")),
    (Test-Path -LiteralPath (Join-Path $Layout.DataRoot "postgresql.conf")),
    (Test-Path -LiteralPath (Join-Path $Layout.DataRoot "pg_hba.conf"))
  )
  return (($isolatedEntries -join "|") + "::" + ($instanceEntries -join "|") + "::" + ($knownPresence -join "|"))
}

function Assert-CleanupNoPostgresActivity {
  param(
    [Parameter(Mandatory = $true)][object]$Package,
    [Parameter(Mandatory = $true)][object]$Layout
  )
  $evidence = Get-LocalPostgresProcessEvidence -Package $Package
  if ($evidence.AmbiguousCount -gt 0) {
    Throw-SafeError -Code "cleanup_postgres_process_ambiguous"
  }
  if ($evidence.AuthorizedCount -gt 0 -or $evidence.OtherCount -gt 0) {
    Throw-SafeError -Code "cleanup_postgres_process_detected"
  }
  try {
    $runningServices = @(Get-Service -ErrorAction Stop | Where-Object { ($_.Name -match "postgres|postgresql" -or $_.DisplayName -match "postgres|postgresql") -and $_.Status -eq "Running" })
    if ($runningServices.Count -gt 0) {
      Throw-SafeError -Code "cleanup_postgresql_service_running"
    }
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "cleanup_postgresql_service_running"
  }
  if (-not (Test-PortAvailable -Value $script:CreatePort)) {
    Throw-SafeError -Code "cleanup_port_in_use"
  }
  if (Test-Path -LiteralPath (Join-Path $Layout.DataRoot "postmaster.pid") -PathType Leaf) {
    Throw-SafeError -Code "cleanup_postmaster_pid_present"
  }
}

function Invoke-CleanupPartialCreate {
  param(
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$CleanupApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$CreateApprovalToken
  )
  Set-Stage -Stage "cleanup_authorization"
  Assert-CleanupAuthorization `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $CleanupApprovalToken `
    -ExpectedCleanupApprovalToken $script:ExpectedCleanupApprovalToken `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $CreateApprovalToken
  try {
    Set-Stage -Stage "cleanup_layout"
    $layout = Get-InstanceLayout

    Set-Stage -Stage "cleanup_environment"
    $package = Assert-CleanupEnvironment

    Set-Stage -Stage "cleanup_git"
    $repoRoot = Get-RepoRoot
    [void]$repoRoot
    Assert-CleanupGitReady

    Set-Stage -Stage "cleanup_paths"
    Assert-CleanupPathFixed -Layout $layout

    Set-Stage -Stage "cleanup_attributes"
    Assert-CleanupDirectorySafe -PathValue $layout.IsolatedRoot
    Assert-CleanupDirectorySafe -PathValue $layout.InstanceRoot

    Set-Stage -Stage "cleanup_exact_state"
    Assert-CleanupExactPartialState -Layout $layout

    Set-Stage -Stage "cleanup_signature_initial"
    $initialStateSignature = Get-CleanupPartialStateSignature -Layout $layout

    Set-Stage -Stage "cleanup_activity"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_revalidate_signature"
    Assert-CleanupPathFixed -Layout $layout
    $revalidatedStateSignature = Get-CleanupPartialStateSignature -Layout $layout
    if (-not [string]::Equals($initialStateSignature, $revalidatedStateSignature, [System.StringComparison]::Ordinal)) {
      Throw-SafeError -Code "cleanup_state_changed"
    }
    Set-Stage -Stage "cleanup_revalidate_state"
    Assert-CleanupExactPartialState -Layout $layout

    Set-Stage -Stage "cleanup_revalidate_activity"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_delete_instance"
    try {
      [System.IO.Directory]::Delete($layout.InstanceRoot, $false)
    } catch {
      Throw-SafeError -Code "cleanup_delete_instance_failed"
    }

    Set-Stage -Stage "cleanup_postcheck"
    if (Test-Path -LiteralPath $layout.InstanceRoot) {
      Throw-SafeError -Code "cleanup_postcheck_failed"
    }

    Set-Stage -Stage "cleanup_delete_root"
    Assert-CleanupDirectorySafe -PathValue $layout.IsolatedRoot
    $parentEntries = Get-CleanupDirectoryEntries -PathValue $layout.IsolatedRoot
    if ($parentEntries.Count -ne 0) {
      Throw-SafeError -Code "cleanup_parent_not_empty"
    }
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout
    try {
      [System.IO.Directory]::Delete($layout.IsolatedRoot, $false)
    } catch {
      Throw-SafeError -Code "cleanup_delete_root_failed"
    }
    Set-Stage -Stage "cleanup_postcheck"
    if (Test-Path -LiteralPath $layout.IsolatedRoot) {
      Throw-SafeError -Code "cleanup_postcheck_failed"
    }

    Write-Output "PARTIAL_CREATE_CLEANUP_OK"
    Write-Output "isolated_root_removed=true"
    Write-Output "instance_root_removed=true"
    Write-Output "postgres_process_detected=false"
    Write-Output "port_55432_listening=false"
    Write-Output "sql_executed=false"
    Write-Output "production_connection_used=false"
    Write-Output "package_directory_modified=false"
    Write-Output "ready_for_create_recheck=true"
  } catch {
    $failure = Get-CleanupSafeFailure -Stage $script:CurrentStage -Exception $_.Exception
    Set-Stage -Stage $failure.SafeSubstage
    $script:CurrentExceptionType = $failure.ExceptionType
    Throw-SafeError -Code $failure.Reason
  }
}

function Test-CreatePortAvailable {
  $listener = $null
  try {
    $address = [System.Net.IPAddress]::Parse("127.0.0.1")
    $listener = [System.Net.Sockets.TcpListener]::new($address, 55432)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $listener) {
      $listener.Stop()
    }
  }
}

function Convert-IdentityReferenceToSidValue {
  param([Parameter(Mandatory = $true)][AllowNull()][System.Security.Principal.IdentityReference]$IdentityReference)
  if ($null -eq $IdentityReference) {
    return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_missing" }
  }
  try {
    $sid = $null
    if ($IdentityReference -is [System.Security.Principal.SecurityIdentifier]) {
      $sid = $IdentityReference
    } else {
      $sid = $IdentityReference.Translate([System.Security.Principal.SecurityIdentifier])
    }
    if ($null -eq $sid -or -not ($sid -is [System.Security.Principal.SecurityIdentifier])) {
      return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_not_sid" }
    }
    if ([string]::IsNullOrWhiteSpace($sid.Value)) {
      return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_sid_empty" }
    }
    return [pscustomobject]@{ Success = $true; SidValue = $sid.Value; SafeErrorCode = "none" }
  } catch [System.Security.Principal.IdentityNotMappedException] {
    return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_translation_failed" }
  } catch [System.ArgumentException] {
    return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_translation_failed" }
  } catch [System.InvalidOperationException] {
    return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_query_failed" }
  } catch [System.SystemException] {
    return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_query_failed" }
  } catch {
    return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_query_failed" }
  }
}

function Get-RestrictedAclRulesForValidation {
  param([Parameter(Mandatory = $true)][AllowNull()][System.Security.AccessControl.FileSystemSecurity]$Acl)
  if ($null -eq $Acl) {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_missing" }
  }
  try {
    $accessRules = $Acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
    if ($null -eq $accessRules) {
      return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_collection_invalid" }
    }
  } catch [System.ArgumentNullException] {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_read_failed" }
  } catch [System.ArgumentException] {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_read_failed" }
  } catch [System.InvalidOperationException] {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_read_failed" }
  } catch [System.UnauthorizedAccessException] {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_read_failed" }
  } catch [System.SystemException] {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_read_failed" }
  } catch {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_read_failed" }
  }

  try {
    $materializedRules = @()
    foreach ($rule in $accessRules) {
      $materializedRules += $rule
    }
    return [pscustomobject]@{ Success = $true; Rules = $materializedRules; SafeErrorCode = "none" }
  } catch [System.InvalidOperationException] {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_enumeration_failed" }
  } catch [System.SystemException] {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_enumeration_failed" }
  } catch {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_enumeration_failed" }
  }
}

function Assert-RestrictedAclSemantics {
  param(
    [Parameter(Mandatory = $true)][object]$Acl,
    [Parameter(Mandatory = $true)][System.Security.Principal.SecurityIdentifier]$ExpectedSid,
    [Parameter(Mandatory = $true)][ValidateSet("Directory","File")][string]$TargetType
  )
  if ($null -eq $Acl -or $Acl.AreAccessRulesProtected -ne $true) {
    Throw-SafeError -Code "acl_not_protected"
  }
  $expectedSidValue = $ExpectedSid.Value
  if ([string]::IsNullOrWhiteSpace($expectedSidValue)) {
    Throw-SafeError -Code "acl_identity_sid_empty"
  }
  $expectedInheritance = if ($TargetType -eq "Directory") {
    [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"
  } else {
    [System.Security.AccessControl.InheritanceFlags]"None"
  }
  $expectedPropagation = [System.Security.AccessControl.PropagationFlags]"None"
  $requiredRights = [int64][System.Security.AccessControl.FileSystemRights]::FullControl
  $combinedAllowRights = [int64]0
  $authorizedAllowFound = $false

  $rulesResult = Get-RestrictedAclRulesForValidation -Acl $Acl
  if (-not $rulesResult.Success) {
    Throw-SafeError -Code $rulesResult.SafeErrorCode
  }

  foreach ($access in @($rulesResult.Rules)) {
    if ($null -eq $access) {
      Throw-SafeError -Code "acl_rules_collection_invalid"
    }
    if ($access.IsInherited) {
      Throw-SafeError -Code "acl_inherited_rule_present"
    }
    if ($access.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Deny) {
      Throw-SafeError -Code "acl_unexpected_deny_rule"
    }
    if ($access.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
      Throw-SafeError -Code "acl_rules_collection_invalid"
    }
    $identity = Convert-IdentityReferenceToSidValue -IdentityReference $access.IdentityReference
    if (-not $identity.Success) {
      Throw-SafeError -Code $identity.SafeErrorCode
    }
    if (-not [string]::Equals($identity.SidValue, $expectedSidValue, [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-SafeError -Code "acl_unexpected_identity"
    }
    if ([int]$access.InheritanceFlags -ne [int]$expectedInheritance) {
      Throw-SafeError -Code "acl_inheritance_flags_mismatch"
    }
    if ([int]$access.PropagationFlags -ne [int]$expectedPropagation) {
      Throw-SafeError -Code "acl_propagation_flags_mismatch"
    }
    if ($access.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow) {
      $authorizedAllowFound = $true
      $combinedAllowRights = $combinedAllowRights -bor [int64]$access.FileSystemRights
    }
  }

  if (-not $authorizedAllowFound) {
    Throw-SafeError -Code "acl_missing_authorized_allow"
  }
  if (($combinedAllowRights -band $requiredRights) -ne $requiredRights) {
    Throw-SafeError -Code "acl_rights_insufficient"
  }
}

function Set-RestrictedAcl {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][ValidateSet("Directory","File")][string]$TargetType
  )
  try {
    if ($TargetType -eq "Directory") {
      if (-not (Test-Path -LiteralPath $PathValue -PathType Container)) { Throw-SafeError -Code "acl_validation_failed" }
    } else {
      if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) { Throw-SafeError -Code "acl_validation_failed" }
    }
    $item = Get-Item -LiteralPath $PathValue -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      Throw-SafeError -Code "reparse_point_detected"
    }
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = Get-Acl -LiteralPath $PathValue
    $acl.SetAccessRuleProtection($true, $false)
    $existingRules = Get-RestrictedAclRulesForValidation -Acl $acl
    if (-not $existingRules.Success) {
      Throw-SafeError -Code $existingRules.SafeErrorCode
    }
    foreach ($rule in @($existingRules.Rules)) {
      [void]$acl.RemoveAccessRule($rule)
    }
    $inherit = if ($TargetType -eq "Directory") {
      [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"
    } else {
      [System.Security.AccessControl.InheritanceFlags]"None"
    }
    $propagation = [System.Security.AccessControl.PropagationFlags]"None"
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, "FullControl", $inherit, $propagation, "Allow")
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $PathValue -AclObject $acl
    try {
      $verify = Get-Acl -LiteralPath $PathValue
    } catch {
      Throw-SafeError -Code "acl_readback_failed"
    }
    Assert-RestrictedAclSemantics -Acl $verify -ExpectedSid $sid -TargetType $TargetType
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "acl_apply_failed"
  }
}

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$Text
  )
  [System.IO.File]::WriteAllText($PathValue, ($Text.TrimEnd("`r","`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
}

function Read-StrictJsonString {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][ref]$Index
  )
  if ($Index.Value -ge $Text.Length -or $Text[$Index.Value] -ne '"') {
    Throw-SafeError -Code "state_schema_invalid"
  }
  $Index.Value += 1
  $builder = [System.Text.StringBuilder]::new()
  while ($Index.Value -lt $Text.Length) {
    $ch = $Text[$Index.Value]
    $Index.Value += 1
    if ($ch -eq '"') {
      return $builder.ToString()
    }
    if ([int][char]$ch -lt 32) {
      Throw-SafeError -Code "state_schema_invalid"
    }
    if ($ch -eq '\') {
      if ($Index.Value -ge $Text.Length) { Throw-SafeError -Code "state_schema_invalid" }
      $escaped = $Text[$Index.Value]
      $Index.Value += 1
      if ('"\/bfnrt'.IndexOf($escaped) -ge 0) {
        [void]$builder.Append($escaped)
        continue
      }
      if ($escaped -eq 'u') {
        if (($Index.Value + 4) -gt $Text.Length) { Throw-SafeError -Code "state_schema_invalid" }
        $hex = $Text.Substring($Index.Value, 4)
        if ($hex -notmatch '^[0-9a-fA-F]{4}$') { Throw-SafeError -Code "state_schema_invalid" }
        [void]$builder.Append([char]([Convert]::ToInt32($hex, 16)))
        $Index.Value += 4
        continue
      }
      Throw-SafeError -Code "state_schema_invalid"
    }
    [void]$builder.Append($ch)
  }
  Throw-SafeError -Code "state_schema_invalid"
}

function Skip-StrictJsonWhitespace {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][ref]$Index
  )
  while ($Index.Value -lt $Text.Length -and [char]::IsWhiteSpace($Text[$Index.Value])) {
    $Index.Value += 1
  }
}

function Assert-StrictFlatStateJson {
  param([Parameter(Mandatory = $true)][string]$JsonText)
  $index = 0
  $indexRef = [ref]$index
  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  Skip-StrictJsonWhitespace -Text $JsonText -Index $indexRef
  if ($indexRef.Value -ge $JsonText.Length -or $JsonText[$indexRef.Value] -ne '{') {
    Throw-SafeError -Code "state_schema_invalid"
  }
  $indexRef.Value += 1
  Skip-StrictJsonWhitespace -Text $JsonText -Index $indexRef
  if ($indexRef.Value -lt $JsonText.Length -and $JsonText[$indexRef.Value] -eq '}') {
    $indexRef.Value += 1
  } else {
    while ($true) {
      Skip-StrictJsonWhitespace -Text $JsonText -Index $indexRef
      $key = Read-StrictJsonString -Text $JsonText -Index $indexRef
      if (-not $seen.Add($key)) {
        Throw-SafeError -Code "state_duplicate_key"
      }
      Skip-StrictJsonWhitespace -Text $JsonText -Index $indexRef
      if ($indexRef.Value -ge $JsonText.Length -or $JsonText[$indexRef.Value] -ne ':') {
        Throw-SafeError -Code "state_schema_invalid"
      }
      $indexRef.Value += 1
      Skip-StrictJsonWhitespace -Text $JsonText -Index $indexRef
      if ($indexRef.Value -ge $JsonText.Length) { Throw-SafeError -Code "state_schema_invalid" }
      $valueStart = $JsonText[$indexRef.Value]
      if ($valueStart -eq '{' -or $valueStart -eq '[') {
        Throw-SafeError -Code "state_schema_invalid"
      }
      if ($valueStart -eq '"') {
        [void](Read-StrictJsonString -Text $JsonText -Index $indexRef)
      } else {
        $primitiveStart = $indexRef.Value
        while ($indexRef.Value -lt $JsonText.Length -and $JsonText[$indexRef.Value] -ne ',' -and $JsonText[$indexRef.Value] -ne '}') {
          if ($JsonText[$indexRef.Value] -eq '/' -or $JsonText[$indexRef.Value] -eq '#') {
            Throw-SafeError -Code "state_schema_invalid"
          }
          $indexRef.Value += 1
        }
        $primitive = $JsonText.Substring($primitiveStart, $indexRef.Value - $primitiveStart).Trim()
        if ([string]::IsNullOrWhiteSpace($primitive) -or $primitive -notmatch '^(true|false|null|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?)$') {
          Throw-SafeError -Code "state_schema_invalid"
        }
      }
      Skip-StrictJsonWhitespace -Text $JsonText -Index $indexRef
      if ($indexRef.Value -ge $JsonText.Length) { Throw-SafeError -Code "state_schema_invalid" }
      if ($JsonText[$indexRef.Value] -eq ',') {
        $indexRef.Value += 1
        continue
      }
      if ($JsonText[$indexRef.Value] -eq '}') {
        $indexRef.Value += 1
        break
      }
      Throw-SafeError -Code "state_schema_invalid"
    }
  }
  Skip-StrictJsonWhitespace -Text $JsonText -Index $indexRef
  if ($indexRef.Value -ne $JsonText.Length) {
    Throw-SafeError -Code "state_schema_invalid"
  }
  return @($seen)
}

function Get-StableCreatedUtc {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$ClusterId
  )
  $now = [DateTimeOffset]::UtcNow.ToString("o")
  if (-not (Test-Path -LiteralPath $Layout.StatePath -PathType Leaf)) {
    return $now
  }
  try {
    $existingText = [System.IO.File]::ReadAllText($Layout.StatePath)
    [void](Assert-StrictFlatStateJson -JsonText $existingText)
    $existing = $existingText | ConvertFrom-Json
    if ($existing.artifact_type -ne "voto_claro_isolated_baseline_cluster_state" -or
        [int]$existing.schema_version -ne 1 -or
        $existing.cluster_id -ne $ClusterId -or
        $existing.instance_name -ne $script:InstanceName -or
        $existing.host -ne "127.0.0.1" -or
        [int]$existing.port -ne 55432 -or
        [string]::IsNullOrWhiteSpace([string]$existing.created_utc)) {
      Throw-SafeError -Code "state_write_failed"
    }
    return [string]$existing.created_utc
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "state_write_failed"
  }
}

function Write-ClusterState {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$ClusterId,
    [Parameter(Mandatory = $true)][string]$State,
    [Parameter(Mandatory = $true)][string]$Stage,
    [string]$ErrorCode,
    [bool]$InitdbCompleted = $false,
    [bool]$ConfigurationCompleted = $false,
    [bool]$ServerStarted = $false,
    [bool]$CredentialProtected = $false,
    [ValidateSet("not_started","running","stopped","unresolved")][string]$ServerState = "not_started",
    [bool]$ServerCleanupAttempted = $false,
    [bool]$ServerCleanupCompleted = $false
  )
  if ($script:CreateStates -notcontains $State) {
    Throw-SafeError -Code "state_write_failed"
  }
  try {
    $now = [DateTimeOffset]::UtcNow.ToString("o")
    $createdUtc = Get-StableCreatedUtc -Layout $Layout -ClusterId $ClusterId
    if ([DateTimeOffset]::Parse($now) -lt [DateTimeOffset]::Parse($createdUtc)) {
      Throw-SafeError -Code "state_write_failed"
    }
    $payload = [ordered]@{
      artifact_type = "voto_claro_isolated_baseline_cluster_state"
      schema_version = 1
      cluster_id = $ClusterId
      state = $State
      stage = $Stage
      created_utc = $createdUtc
      updated_utc = $now
      postgres_major = "17"
      postgres_version = "17.10"
      host = "127.0.0.1"
      port = 55432
      admin_role = $script:LocalAdminUser
      instance_name = $script:InstanceName
      data_directory_name = "data"
      server_log_name = "postgresql-server.log"
      last_error_code = $(if ([string]::IsNullOrWhiteSpace($ErrorCode)) { $null } else { $ErrorCode })
      initdb_completed = $InitdbCompleted
      configuration_completed = $ConfigurationCompleted
      server_started = $ServerStarted
      credential_protected = $CredentialProtected
      plaintext_password_file_present = (Test-Path -LiteralPath $Layout.PasswordFilePath -PathType Leaf)
      server_state = $ServerState
      server_cleanup_attempted = $ServerCleanupAttempted
      server_cleanup_completed = $ServerCleanupCompleted
    }
    $json = $payload | ConvertTo-Json -Depth 4
    $tmp = Join-Path $Layout.StateRoot ("cluster-state." + [Guid]::NewGuid().ToString("N") + ".tmp")
    Write-Utf8NoBomFile -PathValue $tmp -Text $json
    if (Test-Path -LiteralPath $Layout.StatePath) {
      [System.IO.File]::Replace($tmp, $Layout.StatePath, $null)
    } else {
      [System.IO.File]::Move($tmp, $Layout.StatePath)
    }
    Set-RestrictedAcl -PathValue $Layout.StatePath -TargetType File
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "state_write_failed"
  }
}

function Write-AtomicState {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$ClusterId,
    [Parameter(Mandatory = $true)][string]$State,
    [Parameter(Mandatory = $true)][string]$Stage,
    [string]$ErrorCode,
    [bool]$InitdbCompleted = $false,
    [bool]$ConfigurationCompleted = $false,
    [bool]$ServerStarted = $false,
    [bool]$CredentialProtected = $false,
    [ValidateSet("not_started","running","stopped","unresolved")][string]$ServerState = "not_started",
    [bool]$ServerCleanupAttempted = $false,
    [bool]$ServerCleanupCompleted = $false
  )
  Write-ClusterState -Layout $Layout -ClusterId $ClusterId -State $State -Stage $Stage -ErrorCode $ErrorCode -InitdbCompleted:$InitdbCompleted -ConfigurationCompleted:$ConfigurationCompleted -ServerStarted:$ServerStarted -CredentialProtected:$CredentialProtected -ServerState $ServerState -ServerCleanupAttempted:$ServerCleanupAttempted -ServerCleanupCompleted:$ServerCleanupCompleted
}

function Assert-MarkerStateConcordance {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$ClusterId
  )
  try {
    $stateRoot = [System.IO.Path]::GetFullPath($Layout.StateRoot)
    foreach ($path in @($Layout.MarkerPath, $Layout.StatePath)) {
      $full = [System.IO.Path]::GetFullPath($path)
      $parent = [System.IO.Path]::GetFullPath((Split-Path -Parent $full))
      if (-not [string]::Equals($parent.TrimEnd('\'), $stateRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
        Throw-SafeError -Code "marker_state_mismatch"
      }
      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Throw-SafeError -Code "marker_state_mismatch"
      }
      $item = Get-Item -LiteralPath $full -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Throw-SafeError -Code "marker_state_mismatch"
      }
    }
    $marker = Read-MarkerMap -MarkerPath $Layout.MarkerPath
    $stateText = [System.IO.File]::ReadAllText($Layout.StatePath)
    $combined = ([System.IO.File]::ReadAllText($Layout.MarkerPath) + "`n" + $stateText)
    foreach ($forbidden in @($script:ExpectedCreateApprovalToken, "initdb-password.tmp", "vc_isolated_admin.dpapi", "plainTextPassword", "state_password", "marker_password", "stdout", "stderr")) {
      if ($combined.IndexOf($forbidden, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        Throw-SafeError -Code "marker_state_mismatch"
      }
    }
    foreach ($personalRoot in @($env:USERPROFILE, $env:LOCALAPPDATA)) {
      if (-not [string]::IsNullOrWhiteSpace($personalRoot) -and
          $combined.IndexOf($personalRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        Throw-SafeError -Code "marker_state_mismatch"
      }
    }
    $rawStateKeys = @(Assert-StrictFlatStateJson -JsonText $stateText)
    $state = $stateText | ConvertFrom-Json
    $allowedStateKeys = @(
      "artifact_type",
      "schema_version",
      "cluster_id",
      "state",
      "stage",
      "created_utc",
      "updated_utc",
      "postgres_major",
      "postgres_version",
      "host",
      "port",
      "admin_role",
      "instance_name",
      "data_directory_name",
      "server_log_name",
      "last_error_code",
      "initdb_completed",
      "configuration_completed",
      "server_started",
      "credential_protected",
      "plaintext_password_file_present",
      "server_state",
      "server_cleanup_attempted",
      "server_cleanup_completed"
    )
    $stateProperties = @($state.PSObject.Properties | ForEach-Object { $_.Name })
    if (@($rawStateKeys | Sort-Object).Count -ne $stateProperties.Count) {
      Throw-SafeError -Code "state_schema_invalid"
    }
    foreach ($key in $allowedStateKeys) {
      if ($stateProperties -notcontains $key) { Throw-SafeError -Code "state_schema_invalid" }
    }
    foreach ($key in $stateProperties) {
      if ($allowedStateKeys -notcontains $key) { Throw-SafeError -Code "state_schema_invalid" }
      $value = $state.$key
      if ($value -is [System.Array] -or $value -is [System.Management.Automation.PSCustomObject]) {
        Throw-SafeError -Code "state_schema_invalid"
      }
    }
    if (@($stateProperties | Sort-Object -Unique).Count -ne $stateProperties.Count) {
      Throw-SafeError -Code "state_schema_invalid"
    }
    if ($marker["magic"] -ne "VOTO_CLARO_ISOLATED_BASELINE_TEST_V1" -or
        $marker["cluster_id"] -ne $ClusterId -or
        $marker["instance_name"] -ne $script:InstanceName -or
        $marker["host"] -ne "127.0.0.1" -or
        $marker["port"] -ne "55432" -or
        $state.artifact_type -ne "voto_claro_isolated_baseline_cluster_state" -or
        [int]$state.schema_version -ne 1 -or
        $state.cluster_id -ne $ClusterId -or
        $state.instance_name -ne $script:InstanceName -or
        $state.host -ne "127.0.0.1" -or
        [int]$state.port -ne 55432 -or
        $state.admin_role -ne "vc_isolated_admin" -or
        $state.postgres_major -ne "17" -or
        $state.postgres_version -ne "17.10" -or
        $script:CreateStates -notcontains $state.state -or
        @("not_started","running","stopped","unresolved") -notcontains $state.server_state -or
        [string]::IsNullOrWhiteSpace([string]$state.created_utc) -or
        [string]::IsNullOrWhiteSpace([string]$state.updated_utc)) {
      Throw-SafeError -Code "marker_state_mismatch"
    }
    foreach ($stringKey in @("artifact_type","cluster_id","state","stage","created_utc","updated_utc","postgres_major","postgres_version","host","admin_role","instance_name","data_directory_name","server_log_name","server_state")) {
      if ($state.$stringKey -isnot [string] -or [string]::IsNullOrWhiteSpace($state.$stringKey)) {
        Throw-SafeError -Code "state_schema_invalid"
      }
    }
    if ($state.schema_version -isnot [int] -and $state.schema_version -isnot [long]) {
      Throw-SafeError -Code "state_schema_invalid"
    }
    if ($state.port -isnot [int] -and $state.port -isnot [long]) {
      Throw-SafeError -Code "state_schema_invalid"
    }
    if ($null -ne $state.last_error_code -and $state.last_error_code -isnot [string]) {
      Throw-SafeError -Code "state_schema_invalid"
    }
    foreach ($boolKey in @("initdb_completed","configuration_completed","server_started","credential_protected","plaintext_password_file_present","server_cleanup_attempted","server_cleanup_completed")) {
      if ($state.$boolKey -isnot [bool]) { Throw-SafeError -Code "state_schema_invalid" }
    }
    if ([DateTimeOffset]::Parse([string]$state.updated_utc) -lt [DateTimeOffset]::Parse([string]$state.created_utc)) {
      Throw-SafeError -Code "marker_state_mismatch"
    }
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "marker_state_mismatch"
  }
}

function New-AdminPasswordText {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
  } finally {
    $rng.Dispose()
    [Array]::Clear($bytes, 0, $bytes.Length)
  }
}

function Protect-AdminCredential {
  param(
    [Parameter(Mandatory = $true)][string]$PlainTextPassword,
    [Parameter(Mandatory = $true)][object]$Layout
  )
  try {
    $secure = ConvertTo-SecureString -String $PlainTextPassword -AsPlainText -Force
    $protected = ConvertFrom-SecureString -SecureString $secure
    Write-Utf8NoBomFile -PathValue $Layout.CredentialPath -Text $protected
    Set-RestrictedAcl -PathValue $Layout.CredentialPath -TargetType File
    return $true
  } catch {
    Throw-SafeError -Code "credential_protection_failed"
  }
}

function New-PasswordFile {
  param(
    [Parameter(Mandatory = $true)][string]$PlainTextPassword,
    [Parameter(Mandatory = $true)][object]$Layout
  )
  try {
    Write-Utf8NoBomFile -PathValue $Layout.PasswordFilePath -Text $PlainTextPassword
    Set-RestrictedAcl -PathValue $Layout.PasswordFilePath -TargetType File
  } catch {
    Throw-SafeError -Code "password_file_create_failed"
  }
}

function Remove-PasswordFileStrict {
  param([Parameter(Mandatory = $true)][object]$Layout)
  if (Test-Path -LiteralPath $Layout.PasswordFilePath -PathType Leaf) {
    [System.IO.File]::Delete($Layout.PasswordFilePath)
  }
  if (Test-Path -LiteralPath $Layout.PasswordFilePath -PathType Leaf) {
    Throw-SafeError -Code "password_file_cleanup_failed"
  }
}

function ConvertTo-WindowsProcessArgument {
  param([Parameter(Mandatory = $true)][AllowNull()][object]$Value)
  if ($null -eq $Value) { Throw-SafeError -Code "unexpected_failure" }
  $Value = [string]$Value
  if ($Value.Length -eq 0) { return '""' }
  if ($Value -notmatch '[\s"]') { return $Value }
  function New-BackslashRun {
    param([Parameter(Mandatory = $true)][int]$Count)
    if ($Count -le 0) { return "" }
    return (([string][char]92) * $Count)
  }
  $builder = [System.Text.StringBuilder]::new()
  [void]$builder.Append('"')
  $slashCount = 0
  foreach ($ch in $Value.ToCharArray()) {
    if ($ch -eq '\') {
      $slashCount += 1
      continue
    }
    if ($ch -eq '"') {
      [void]$builder.Append((New-BackslashRun -Count (($slashCount * 2) + 1)))
      [void]$builder.Append('"')
      $slashCount = 0
      continue
    }
    if ($slashCount -gt 0) {
      [void]$builder.Append((New-BackslashRun -Count $slashCount))
      $slashCount = 0
    }
    [void]$builder.Append($ch)
  }
  if ($slashCount -gt 0) {
    [void]$builder.Append((New-BackslashRun -Count ($slashCount * 2)))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Get-SafeOutputTail {
  param([AllowNull()][string]$Text)
  if ($null -eq $Text) { return "" }
  $safe = $Text
  foreach ($path in @($env:USERPROFILE, $env:LOCALAPPDATA)) {
    if (-not [string]::IsNullOrWhiteSpace($path)) {
      $safe = $safe.Replace($path, "<local_path>")
    }
  }
  $safe = $safe -replace '(?i)[A-Z]:\\[^\r\n]*initdb-password\.tmp', '<pwfile>'
  $safe = $safe -replace '(?i)[A-Z]:\\[^\r\n]*vc_isolated_admin\.dpapi', '<credential>'
  if ($safe.Length -gt 4096) {
    return $safe.Substring($safe.Length - 4096)
  }
  return $safe
}

function Invoke-SafeProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
    [Parameter(Mandatory = $true)][string]$ToolName
  )
  if (-not [System.IO.Path]::IsPathRooted($FilePath) -or -not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    Throw-SafeError -Code "postgres_tools_missing"
  }
  if (-not (Test-Path -LiteralPath $WorkingDirectory -PathType Container)) {
    Throw-SafeError -Code "postgres_tools_missing"
  }
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FilePath
  $psi.Arguments = (($Arguments | ForEach-Object { ConvertTo-WindowsProcessArgument -Value $_ }) -join " ")
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  $stdoutTask = $null
  $stderrTask = $null
  try {
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $completed) {
      try {
        $process.Kill()
      } catch {
        return [pscustomobject]@{ Tool = $ToolName; ExitCode = $null; TimedOut = $true; ProcessKilled = $false; OutputDrainCompleted = $false; Success = $false; SafeErrorCode = "process_timeout_cleanup_failed"; StdOut = ""; StdErr = ""; StdOutTailSanitized = ""; StdErrTailSanitized = "" }
      }
      if (-not $process.WaitForExit(5000)) {
        return [pscustomobject]@{ Tool = $ToolName; ExitCode = $null; TimedOut = $true; ProcessKilled = $true; OutputDrainCompleted = $false; Success = $false; SafeErrorCode = "process_timeout_cleanup_failed"; StdOut = ""; StdErr = ""; StdOutTailSanitized = ""; StdErrTailSanitized = "" }
      }
      $stdoutDoneAfterTimeout = $stdoutTask.Wait(5000)
      $stderrDoneAfterTimeout = $stderrTask.Wait(5000)
      if (-not $stdoutDoneAfterTimeout -or -not $stderrDoneAfterTimeout) {
        return [pscustomobject]@{ Tool = $ToolName; ExitCode = $null; TimedOut = $true; ProcessKilled = $true; OutputDrainCompleted = $false; Success = $false; SafeErrorCode = "process_output_drain_failed"; StdOut = ""; StdErr = ""; StdOutTailSanitized = ""; StdErrTailSanitized = "" }
      }
      $stdoutTailAfterTimeout = Get-SafeOutputTail -Text $stdoutTask.Result
      $stderrTailAfterTimeout = Get-SafeOutputTail -Text $stderrTask.Result
      return [pscustomobject]@{ Tool = $ToolName; ExitCode = $null; TimedOut = $true; ProcessKilled = $true; OutputDrainCompleted = $true; Success = $false; SafeErrorCode = ($ToolName + "_timeout"); StdOut = $stdoutTailAfterTimeout; StdErr = $stderrTailAfterTimeout; StdOutTailSanitized = $stdoutTailAfterTimeout; StdErrTailSanitized = $stderrTailAfterTimeout }
    }
    $process.WaitForExit()
    if (-not $stdoutTask.Wait(5000) -or -not $stderrTask.Wait(5000)) {
      return [pscustomobject]@{ Tool = $ToolName; ExitCode = $process.ExitCode; TimedOut = $false; ProcessKilled = $false; OutputDrainCompleted = $false; Success = $false; SafeErrorCode = "process_output_drain_failed"; StdOut = ""; StdErr = ""; StdOutTailSanitized = ""; StdErrTailSanitized = "" }
    }
    $stdoutTail = Get-SafeOutputTail -Text $stdoutTask.Result
    $stderrTail = Get-SafeOutputTail -Text $stderrTask.Result
    return [pscustomobject]@{ Tool = $ToolName; ExitCode = $process.ExitCode; TimedOut = $false; ProcessKilled = $false; OutputDrainCompleted = $true; Success = ($process.ExitCode -eq 0); SafeErrorCode = $(if ($process.ExitCode -eq 0) { "none" } else { $ToolName + "_failed" }); StdOut = $stdoutTail; StdErr = $stderrTail; StdOutTailSanitized = $stdoutTail; StdErrTailSanitized = $stderrTail }
  } finally {
    if ($null -ne $stdoutTask) { $stdoutTask.Dispose() }
    if ($null -ne $stderrTask) { $stderrTask.Dispose() }
    $process.Dispose()
  }
}

function Assert-InitializedDataRoot {
  param([Parameter(Mandatory = $true)][object]$Layout)
  $pgVersionPath = Join-Path $Layout.DataRoot "PG_VERSION"
  foreach ($required in @($pgVersionPath, (Join-Path $Layout.DataRoot "postgresql.conf"), (Join-Path $Layout.DataRoot "pg_hba.conf"))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      Throw-SafeError -Code "initdb_partial"
    }
  }
  $version = (Get-Content -LiteralPath $pgVersionPath -TotalCount 1)
  if ($version -ne "17") {
    Throw-SafeError -Code "pg_version_invalid"
  }
}

function Add-ManagedPostgresqlConf {
  param([Parameter(Mandatory = $true)][object]$Layout)
  try {
    $path = Join-Path $Layout.DataRoot "postgresql.conf"
    $existing = [System.IO.File]::ReadAllText($path)
    if ($existing -match "# BEGIN VOTO_CLARO_ISOLATED_BASELINE_TEST") {
      Throw-SafeError -Code "postgresql_conf_write_failed"
    }
    $block = (Get-FuturePostgresqlConfTemplate -ExactPort 55432) -join "`n"
    [System.IO.File]::AppendAllText($path, "`n" + $block + "`n", [System.Text.UTF8Encoding]::new($false))
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "postgresql_conf_write_failed"
  }
}

function Set-ManagedPgHba {
  param([Parameter(Mandatory = $true)][object]$Layout)
  try {
    $path = Join-Path $Layout.DataRoot "pg_hba.conf"
    $content = (Get-FuturePgHbaTemplate) -join "`n"
    $ipv6Loopback = ":" + ":1"
    if ($content -match "\btrust\b|\bmd5\b|\bpassword\b|\bident\b|\bpeer\b|\bsspi\b|include" -or
        $content.Contains($ipv6Loopback)) {
      Throw-SafeError -Code "pg_hba_write_failed"
    }
    Write-Utf8NoBomFile -PathValue $path -Text $content
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "pg_hba_write_failed"
  }
}

function Get-PostmasterPidInfo {
  param([Parameter(Mandatory = $true)][object]$Layout)
  $path = Join-Path $Layout.DataRoot "postmaster.pid"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Throw-SafeError -Code "postmaster_pid_missing"
  }
  $fullPidPath = [System.IO.Path]::GetFullPath($path)
  $dataRootFull = [System.IO.Path]::GetFullPath($Layout.DataRoot)
  $pidParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $fullPidPath))
  if (-not [string]::Equals($pidParent.TrimEnd('\'), $dataRootFull.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "postmaster_pid_invalid"
  }
  $pidItem = Get-Item -LiteralPath $fullPidPath -Force
  if (($pidItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    Throw-SafeError -Code "postmaster_pid_invalid"
  }
  $lines = @(Get-Content -LiteralPath $path -ErrorAction Stop)
  if ($lines.Count -lt 4 -or
      [string]::IsNullOrWhiteSpace($lines[0]) -or
      [string]::IsNullOrWhiteSpace($lines[1]) -or
      [string]::IsNullOrWhiteSpace($lines[2]) -or
      [string]::IsNullOrWhiteSpace($lines[3]) -or
      $lines[0] -notmatch "^[1-9][0-9]*$" -or
      $lines[2] -notmatch "^[0-9]+$" -or
      $lines[3] -notmatch "^[0-9]+$") {
    Throw-SafeError -Code "postmaster_pid_invalid"
  }
  if (-not [System.IO.Path]::IsPathRooted($lines[1])) {
    Throw-SafeError -Code "postmaster_dataroot_mismatch"
  }
  $pidDataRoot = [System.IO.Path]::GetFullPath($lines[1])
  if (-not [string]::Equals($pidDataRoot.TrimEnd('\'), $dataRootFull.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "postmaster_dataroot_mismatch"
  }
  if ([int]$lines[3] -ne 55432) {
    Throw-SafeError -Code "postmaster_port_mismatch"
  }
  return [pscustomobject]@{ Pid = [int]$lines[0]; DataRoot = $pidDataRoot; Port = [int]$lines[3]; StartedAt = [int64]$lines[2] }
}

function Assert-PostgresProcessForInstance {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][object]$Package
  )
  $pidInfo = Get-PostmasterPidInfo -Layout $Layout
  [void](Get-VerifiedPostgresProcessInfo -PidInfo $pidInfo -Package $Package)
}

function Convert-ToComparableExecutablePath {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  if ([string]::IsNullOrWhiteSpace($PathValue) -or -not [System.IO.Path]::IsPathRooted($PathValue)) {
    return $null
  }
  try {
    $full = [System.IO.Path]::GetFullPath($PathValue)
    if ([string]::IsNullOrWhiteSpace($full) -or -not [System.IO.Path]::IsPathRooted($full)) {
      return $null
    }
    return $full.TrimEnd([char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar))
  } catch {
    return $null
  }
}

function Get-ProcessExecutablePathCompatible {
  param([Parameter(Mandatory = $true)][AllowNull()][System.Diagnostics.Process]$Process)
  if ($null -eq $Process) {
    return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_object_missing" }
  }
  try {
    try {
      $Process.Refresh()
    } catch [System.InvalidOperationException] {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_already_exited" }
    } catch {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_query_failed" }
    }
    try {
      if ($Process.HasExited) {
        return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_already_exited" }
      }
    } catch [System.InvalidOperationException] {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_already_exited" }
    } catch {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_query_failed" }
    }
    try {
      $moduleFileName = $Process.MainModule.FileName
    } catch [System.ComponentModel.Win32Exception] {
      if ($_.Exception.NativeErrorCode -eq 5) {
        return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_access_denied" }
      }
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_main_module_unavailable" }
    } catch [System.InvalidOperationException] {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_already_exited" }
    } catch {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_query_failed" }
    }
    if ([string]::IsNullOrWhiteSpace($moduleFileName)) {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_executable_path_empty" }
    }
    if (-not [System.IO.Path]::IsPathRooted($moduleFileName)) {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_executable_path_invalid" }
    }
    try {
      $fullPath = [System.IO.Path]::GetFullPath($moduleFileName)
    } catch [System.ArgumentException] {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_executable_path_invalid" }
    } catch [System.NotSupportedException] {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_executable_path_invalid" }
    } catch {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_query_failed" }
    }
    if ([string]::IsNullOrWhiteSpace($fullPath) -or -not [System.IO.Path]::IsPathRooted($fullPath)) {
      return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_executable_path_invalid" }
    }
    return [pscustomobject]@{ Success = $true; ExecutablePath = $fullPath; SafeErrorCode = "none" }
  } catch {
    return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_query_failed" }
  }
}

function Get-VerifiedPostgresProcessInfo {
  param(
    [Parameter(Mandatory = $true)][object]$PidInfo,
    [Parameter(Mandatory = $true)][object]$Package
  )
  $process = $null
  try {
    if ($null -eq $PidInfo.Pid -or [int]$PidInfo.Pid -le 0) {
      Throw-SafeError -Code "postgres_process_unverified"
    }
    $process = [System.Diagnostics.Process]::GetProcessById([int]$PidInfo.Pid)
    $expected = Get-ToolPath -BinRoot $Package.Bin -ToolName "postgres"
    $expectedPath = Convert-ToComparableExecutablePath -PathValue $expected
    $pathResult = Get-ProcessExecutablePathCompatible -Process $process
    if (-not $pathResult.Success) {
      Throw-SafeError -Code "postgres_process_unverified"
    }
    $actualPath = Convert-ToComparableExecutablePath -PathValue $pathResult.ExecutablePath
    try {
      $startTimeUtc = $process.StartTime.ToUniversalTime()
    } catch {
      Throw-SafeError -Code "postgres_process_unverified"
    }
    if ($process.ProcessName -ne "postgres" -or
        [string]::IsNullOrWhiteSpace($actualPath) -or
        [string]::IsNullOrWhiteSpace($expectedPath) -or
        -not [string]::Equals($actualPath, $expectedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-SafeError -Code "postgres_process_unverified"
    }
    return [pscustomobject]@{ Pid = [int]$pidInfo.Pid; ProcessName = $process.ProcessName; ExecutablePath = $pathResult.ExecutablePath; StartTimeUtc = $startTimeUtc; DataRoot = $pidInfo.DataRoot; Port = $pidInfo.Port }
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "postgres_process_unverified"
  } finally {
    if ($null -ne $process) { $process.Dispose() }
  }
}

function Get-LocalPostgresProcessEvidence {
  param([Parameter(Mandatory = $true)][object]$Package)
  $expected = Convert-ToComparableExecutablePath -PathValue (Get-ToolPath -BinRoot $Package.Bin -ToolName "postgres")
  $records = New-Object System.Collections.Generic.List[object]
  $authorized = 0
  $other = 0
  $ambiguous = 0
  try {
    $processes = [System.Diagnostics.Process]::GetProcessesByName("postgres")
  } catch {
    return [pscustomobject]@{ AuthorizedCount = 0; OtherCount = 0; AmbiguousCount = 1; Records = @() }
  }
  foreach ($process in @($processes)) {
    try {
      $pathResult = Get-ProcessExecutablePathCompatible -Process $process
      if (-not $pathResult.Success) {
        $ambiguous += 1
        [void]$records.Add([pscustomobject]@{ Classification = "AMBIGUOUS_POSTGRES_PROCESS"; Pid = $process.Id; ProcessName = "postgres"; ExecutablePath = $null; StartTimeUtc = $null; SafeErrorCode = $pathResult.SafeErrorCode })
        continue
      }
      try {
        $startTimeUtc = $process.StartTime.ToUniversalTime()
      } catch {
        $ambiguous += 1
        [void]$records.Add([pscustomobject]@{ Classification = "AMBIGUOUS_POSTGRES_PROCESS"; Pid = $process.Id; ProcessName = "postgres"; ExecutablePath = $null; StartTimeUtc = $null; SafeErrorCode = "process_query_failed" })
        continue
      }
      $path = Convert-ToComparableExecutablePath -PathValue $pathResult.ExecutablePath
      if ($process.ProcessName -ne "postgres") {
        $classification = "AMBIGUOUS_POSTGRES_PROCESS"
        $ambiguous += 1
      } elseif ([string]::IsNullOrWhiteSpace($path) -or [string]::IsNullOrWhiteSpace($expected)) {
        $classification = "AMBIGUOUS_POSTGRES_PROCESS"
        $ambiguous += 1
      } elseif ([string]::Equals($path, $expected, [System.StringComparison]::OrdinalIgnoreCase)) {
        $classification = "AUTHORIZED_PACKAGE_PROCESS"
        $authorized += 1
      } else {
        $classification = "OTHER_POSTGRES_PROCESS"
        $other += 1
      }
      [void]$records.Add([pscustomobject]@{ Classification = $classification; Pid = $process.Id; ProcessName = $process.ProcessName; ExecutablePath = $pathResult.ExecutablePath; StartTimeUtc = $startTimeUtc; SafeErrorCode = "none" })
    } catch {
      $ambiguous += 1
      [void]$records.Add([pscustomobject]@{ Classification = "AMBIGUOUS_POSTGRES_PROCESS"; Pid = $process.Id; ProcessName = "postgres"; ExecutablePath = $null; StartTimeUtc = $null; SafeErrorCode = "process_query_failed" })
    } finally {
      $process.Dispose()
    }
  }
  return [pscustomobject]@{ AuthorizedCount = $authorized; OtherCount = $other; AmbiguousCount = $ambiguous; Records = @($records.ToArray()) }
}

function Get-OriginalPostgresProcessState {
  param([Parameter(Mandatory = $true)][object]$OriginalIdentity)
  $process = $null
  try {
    $process = [System.Diagnostics.Process]::GetProcessById([int]$OriginalIdentity.Pid)
  } catch [System.ArgumentException] {
    return "ORIGINAL_PROCESS_EXITED"
  } catch {
    return "PROCESS_STATE_UNRESOLVED"
  }
  try {
    $pathResult = Get-ProcessExecutablePathCompatible -Process $process
    if (-not $pathResult.Success) {
      if ($pathResult.SafeErrorCode -eq "process_already_exited") {
        try {
          [void][System.Diagnostics.Process]::GetProcessById([int]$OriginalIdentity.Pid)
          return "PROCESS_STATE_UNRESOLVED"
        } catch [System.ArgumentException] {
          return "ORIGINAL_PROCESS_EXITED"
        } catch {
          return "PROCESS_STATE_UNRESOLVED"
        }
      }
      return "PROCESS_STATE_UNRESOLVED"
    }
    try {
      $startTimeUtc = $process.StartTime.ToUniversalTime()
    } catch {
      return "PROCESS_STATE_UNRESOLVED"
    }
    $path = Convert-ToComparableExecutablePath -PathValue $pathResult.ExecutablePath
    $originalPath = Convert-ToComparableExecutablePath -PathValue $OriginalIdentity.ExecutablePath
    if ($process.ProcessName -eq $OriginalIdentity.ProcessName -and
        -not [string]::IsNullOrWhiteSpace($path) -and
        -not [string]::IsNullOrWhiteSpace($originalPath) -and
        [string]::Equals($path, $originalPath, [System.StringComparison]::OrdinalIgnoreCase) -and
        $startTimeUtc -eq $OriginalIdentity.StartTimeUtc) {
      return "ORIGINAL_PROCESS_RUNNING"
    }
    return "PID_REUSED"
  } catch {
    return "PROCESS_STATE_UNRESOLVED"
  } finally {
    if ($null -ne $process) { $process.Dispose() }
  }
}

function Test-LoopbackListenerOpen {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect("127.0.0.1", 55432, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(1000)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $client) { $client.Dispose() }
  }
}

function Get-VerifiedServerState {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][object]$Package
  )
  $pidPath = Join-Path $Layout.DataRoot "postmaster.pid"
  $pidExists = Test-Path -LiteralPath $pidPath -PathType Leaf
  $listenerOpen = Test-LoopbackListenerOpen
  if (-not $pidExists) {
    if ($listenerOpen) {
      return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $false; CleanupCompleted = $false; Pid = $null }
    }
    $processEvidence = Get-LocalPostgresProcessEvidence -Package $Package
    if ($processEvidence.AuthorizedCount -gt 0 -or $processEvidence.AmbiguousCount -gt 0) {
      return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $false; CleanupCompleted = $false; Pid = $null }
    }
    return [pscustomobject]@{ State = "NO_SERVER_EVIDENCE"; CleanupAttempted = $false; CleanupCompleted = $false; Pid = $null }
  }
  try {
    $pidInfo = Get-PostmasterPidInfo -Layout $Layout
    $identity = Get-VerifiedPostgresProcessInfo -PidInfo $pidInfo -Package $Package
    return [pscustomobject]@{ State = "VERIFIED_SERVER_RUNNING"; CleanupAttempted = $false; CleanupCompleted = $false; Pid = $pidInfo.Pid; Identity = $identity }
  } catch {
    return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $false; CleanupCompleted = $false; Pid = $null }
  }
}

function Wait-ForVerifiedServerStopState {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][object]$Package,
    [Parameter(Mandatory = $true)][object]$OriginalIdentity
  )
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $lastProcessState = "PROCESS_STATE_UNRESOLVED"
  $lastListenerOpen = $false
  $lastPidExists = $false
  while ($watch.Elapsed.TotalSeconds -lt 15) {
    $pidPath = Join-Path $Layout.DataRoot "postmaster.pid"
    $lastPidExists = Test-Path -LiteralPath $pidPath -PathType Leaf
    $lastListenerOpen = Test-LoopbackListenerOpen
    $lastProcessState = Get-OriginalPostgresProcessState -OriginalIdentity $OriginalIdentity
    if ($lastPidExists) {
      try {
        $pidInfo = Get-PostmasterPidInfo -Layout $Layout
        $currentIdentity = Get-VerifiedPostgresProcessInfo -PidInfo $pidInfo -Package $Package
        if ($currentIdentity.Pid -eq $OriginalIdentity.Pid -and
            [string]::Equals($currentIdentity.ExecutablePath, $OriginalIdentity.ExecutablePath, [System.StringComparison]::OrdinalIgnoreCase) -and
            $currentIdentity.StartTimeUtc -eq $OriginalIdentity.StartTimeUtc) {
          Start-Sleep -Milliseconds 300
          continue
        }
        return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
      } catch {
        return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
      }
    }
    if ($lastProcessState -eq "PROCESS_STATE_UNRESOLVED") {
      return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
    }
    if ($lastProcessState -eq "ORIGINAL_PROCESS_EXITED" -or $lastProcessState -eq "PID_REUSED") {
      if (-not $lastListenerOpen) {
        $processEvidence = Get-LocalPostgresProcessEvidence -Package $Package
        if ($processEvidence.AuthorizedCount -eq 0 -and $processEvidence.AmbiguousCount -eq 0) {
          return [pscustomobject]@{ State = "VERIFIED_SERVER_STOPPED"; CleanupAttempted = $true; CleanupCompleted = $true; Pid = $OriginalIdentity.Pid }
        }
        return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
      }
      if ($lastProcessState -eq "PID_REUSED") {
        return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
      }
    }
    Start-Sleep -Milliseconds 300
  }
  if ($lastProcessState -eq "ORIGINAL_PROCESS_RUNNING") {
    return [pscustomobject]@{ State = "VERIFIED_SERVER_STOP_FAILED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
  }
  if ($lastListenerOpen) {
    return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
  }
  if ($lastPidExists) {
    return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
  }
  return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $OriginalIdentity.Pid }
}

function Invoke-VerifiedPgCtlStop {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][object]$Package
  )
  $before = Get-VerifiedServerState -Layout $Layout -Package $Package
  if ($before.State -ne "VERIFIED_SERVER_RUNNING" -or $null -eq $before.Pid) {
    return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $false; CleanupCompleted = $false; Pid = $null }
  }
  try {
    $originalIdentity = $before.Identity
    [void](Get-PostmasterPidInfo -Layout $Layout)
    $pgCtl = Get-ToolPath -BinRoot $Package.Bin -ToolName "pg_ctl"
    $stopArgs = @("stop", "-D", $Layout.DataRoot, "-m", "fast", "-w", "-t", "30")
    $stopResult = Invoke-SafeProcess -FilePath $pgCtl -Arguments $stopArgs -WorkingDirectory $Layout.InstanceRoot -TimeoutSeconds 45 -ToolName "pg_ctl_stop"
    [void]$stopResult
    return (Wait-ForVerifiedServerStopState -Layout $Layout -Package $Package -OriginalIdentity $originalIdentity)
  } catch {
    return [pscustomobject]@{ State = "VERIFIED_SERVER_STOP_FAILED"; CleanupAttempted = $true; CleanupCompleted = $false; Pid = $before.Pid }
  }
}

function Resolve-VerifiedPgCtlStartFailure {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][object]$Package
  )
  $state = Get-VerifiedServerState -Layout $Layout -Package $Package
  if ($state.State -eq "NO_SERVER_EVIDENCE") { return $state }
  if ($state.State -eq "VERIFIED_SERVER_RUNNING") {
    return (Invoke-VerifiedPgCtlStop -Layout $Layout -Package $Package)
  }
  return [pscustomobject]@{ State = "SERVER_STATE_UNRESOLVED"; CleanupAttempted = $false; CleanupCompleted = $false; Pid = $null }
}

function Assert-LoopbackListener {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect("127.0.0.1", 55432, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(3000)) {
      Throw-SafeError -Code "listener_verification_failed"
    }
    $client.EndConnect($async)
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "listener_verification_failed"
  } finally {
    if ($null -ne $client) { $client.Dispose() }
  }
}

function Invoke-Create {
  param(
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$CreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$CleanupApprovalToken
  )
  Set-Stage -Stage "create_authorization"
  Assert-CreateAuthorization `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $CreateApprovalToken `
    -ExpectedCreateApprovalToken $script:ExpectedCreateApprovalToken `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $CleanupApprovalToken
  $plainTextPassword = $null
  $layout = Get-InstanceLayout
  $clusterId = [Guid]::NewGuid().ToString()
  $initdbCompleted = $false
  $credentialProtected = $false
  $serverState = "not_started"
  $serverCleanupAttempted = $false
  $serverCleanupCompleted = $false
  try {
    Set-Stage -Stage "create_preflight"
    Assert-GitReadyForCreate
    Assert-CreateConstants
    $repoRoot = Get-RepoRoot
    $package = Assert-PostgresPackageForCreate -BinRoot $PostgresBin
    [void](Invoke-BaselineValidator -RepoRoot $repoRoot)
    $localCompat = Invoke-LocalCompatPreflightValidator -RepoRoot $repoRoot
    if (-not $localCompat.Valid -or $localCompat.ReadyForExecution -ne "false") {
      Throw-SafeError -Code "baseline_validation_failed"
    }
    Assert-CreateLayout -Layout $layout -RepoRoot $repoRoot
    Assert-CreateInstanceAbsent -Layout $layout
    if (-not (Test-CreatePortAvailable)) {
      Throw-SafeError -Code "port_unavailable"
    }

    Set-Stage -Stage "create_directories"
    foreach ($dir in @($layout.InstanceRoot, $layout.DataRoot, $layout.LogRoot, $layout.StateRoot, $layout.SecretRoot)) {
      New-Item -ItemType Directory -Path $dir -ErrorAction Stop | Out-Null
      Set-RestrictedAcl -PathValue $dir -TargetType Directory
    }
    Assert-CreateLayout -Layout $layout -RepoRoot $repoRoot
    $markerText = New-MarkerText -ClusterId $clusterId -LocalPort 55432
    Write-Utf8NoBomFile -PathValue $layout.MarkerPath -Text ($markerText -join "`n")
    Set-RestrictedAcl -PathValue $layout.MarkerPath -TargetType File
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "initializing" -Stage "initdb"
    Assert-MarkerStateConcordance -Layout $layout -ClusterId $clusterId

    Set-Stage -Stage "credential"
    $plainTextPassword = New-AdminPasswordText
    $credentialProtected = Protect-AdminCredential -PlainTextPassword $plainTextPassword -Layout $layout
    New-PasswordFile -PlainTextPassword $plainTextPassword -Layout $layout

    Set-Stage -Stage "initdb"
    $initdb = Get-ToolPath -BinRoot $package.Bin -ToolName "initdb"
    $initResult = Invoke-SafeProcess -FilePath $initdb -Arguments (Get-FutureInitDbArgumentTemplate -ExactDataRoot $layout.DataRoot -PasswordFile $layout.PasswordFilePath) -WorkingDirectory $layout.InstanceRoot -TimeoutSeconds 120 -ToolName "initdb"
    Remove-PasswordFileStrict -Layout $layout
    if ($initResult.TimedOut) { Throw-SafeError -Code "initdb_timeout" }
    if (-not $initResult.Success) { Throw-SafeError -Code "initdb_failed" }
    $initdbCompleted = $true
    Assert-InitializedDataRoot -Layout $layout
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "initialized" -Stage "initialized" -InitdbCompleted:$true -CredentialProtected:$credentialProtected
    Assert-MarkerStateConcordance -Layout $layout -ClusterId $clusterId

    Set-Stage -Stage "postgresql_conf"
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "configuring" -Stage "postgresql_conf" -InitdbCompleted:$true -CredentialProtected:$credentialProtected
    Add-ManagedPostgresqlConf -Layout $layout
    Set-Stage -Stage "pg_hba"
    Set-ManagedPgHba -Layout $layout
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "configured" -Stage "configured" -InitdbCompleted:$true -ConfigurationCompleted:$true -CredentialProtected:$credentialProtected
    Assert-MarkerStateConcordance -Layout $layout -ClusterId $clusterId

    Set-Stage -Stage "pg_ctl_start"
    if (-not (Test-CreatePortAvailable)) {
      Throw-SafeError -Code "port_race_detected"
    }
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "starting" -Stage "pg_ctl_start" -InitdbCompleted:$true -ConfigurationCompleted:$true -CredentialProtected:$credentialProtected -ServerState $serverState -ServerCleanupAttempted:$serverCleanupAttempted -ServerCleanupCompleted:$serverCleanupCompleted
    Assert-MarkerStateConcordance -Layout $layout -ClusterId $clusterId
    $pgCtl = Get-ToolPath -BinRoot $package.Bin -ToolName "pg_ctl"
    $startArgs = @("start", "-D", $layout.DataRoot, "-l", $layout.ServerLog, "-w", "-t", "60")
    $startResult = Invoke-SafeProcess -FilePath $pgCtl -Arguments $startArgs -WorkingDirectory $layout.InstanceRoot -TimeoutSeconds 75 -ToolName "pg_ctl"
    if ($startResult.TimedOut -or -not $startResult.Success) {
      $recovery = Resolve-VerifiedPgCtlStartFailure -Layout $layout -Package $package
      $serverCleanupAttempted = $recovery.CleanupAttempted
      $serverCleanupCompleted = $recovery.CleanupCompleted
      if ($recovery.State -eq "NO_SERVER_EVIDENCE") {
        $serverState = "not_started"
        Throw-SafeError -Code "pg_ctl_start_failed_no_server"
      }
      if ($recovery.State -eq "VERIFIED_SERVER_STOPPED") {
        $serverState = "stopped"
        Throw-SafeError -Code "pg_ctl_start_failed_server_stopped"
      }
      if ($recovery.State -eq "VERIFIED_SERVER_STOP_FAILED") {
        $serverState = "unresolved"
        Throw-SafeError -Code "postgres_server_cleanup_failed"
      }
      $serverState = "unresolved"
      Throw-SafeError -Code "postgres_server_state_unresolved"
    }
    try {
      Assert-PostgresProcessForInstance -Layout $layout -Package $package
      Assert-LoopbackListener
    } catch {
      $recovery = Resolve-VerifiedPgCtlStartFailure -Layout $layout -Package $package
      $serverCleanupAttempted = $recovery.CleanupAttempted
      $serverCleanupCompleted = $recovery.CleanupCompleted
      if ($recovery.State -eq "NO_SERVER_EVIDENCE") {
        $serverState = "not_started"
        Throw-SafeError -Code "pg_ctl_start_failed_no_server"
      }
      if ($recovery.State -eq "VERIFIED_SERVER_STOPPED") {
        $serverState = "stopped"
        Throw-SafeError -Code "pg_ctl_start_failed_server_stopped"
      }
      if ($recovery.State -eq "VERIFIED_SERVER_STOP_FAILED") {
        $serverState = "unresolved"
        Throw-SafeError -Code "postgres_server_cleanup_failed"
      }
      $serverState = "unresolved"
      Throw-SafeError -Code "postgres_server_state_unresolved"
    }
    $serverState = "running"
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "running" -Stage "running" -InitdbCompleted:$true -ConfigurationCompleted:$true -ServerStarted:$true -CredentialProtected:$credentialProtected -ServerState $serverState -ServerCleanupAttempted:$serverCleanupAttempted -ServerCleanupCompleted:$serverCleanupCompleted
    Assert-MarkerStateConcordance -Layout $layout -ClusterId $clusterId

    Write-Output "CREATE_LOCAL_ISOLATED_CLUSTER_OK"
    Write-Output "state=running"
    Write-Output "host=127.0.0.1"
    Write-Output "port=55432"
    Write-Output "postgres_major=17"
    Write-Output "postgres_version=17.10"
    Write-Output "admin_role=$script:LocalAdminUser"
    Write-Output "credential_protected=true"
    Write-Output "plaintext_password_file_present=false"
    Write-Output "preflight_executed=false"
    Write-Output "baseline_executed=false"
    Write-Output "sql_executed=false"
    Write-Output "apply_ready=false"
    Write-Output "production_connection_used=false"
  } catch {
    $reason = Get-SafeReason -ErrorRecord $_
    try { Remove-PasswordFileStrict -Layout $layout } catch { $reason = "password_file_cleanup_failed" }
    if ($initdbCompleted -ne $true -and (Test-Path -LiteralPath $layout.CredentialPath -PathType Leaf)) {
      try { [System.IO.File]::Delete($layout.CredentialPath) } catch { }
    }
    if (Test-Path -LiteralPath $layout.StateRoot -PathType Container) {
      try { Write-ClusterState -Layout $layout -ClusterId $clusterId -State "failed" -Stage $script:CurrentStage -ErrorCode $reason -InitdbCompleted:$initdbCompleted -CredentialProtected:$credentialProtected -ServerState $serverState -ServerCleanupAttempted:$serverCleanupAttempted -ServerCleanupCompleted:$serverCleanupCompleted } catch { }
    }
    Throw-SafeError -Code $reason
  } finally {
    if ($null -ne $plainTextPassword) {
      $plainTextPassword = $null
    }
  }
}

function Invoke-Plan {
  Set-Stage -Stage "plan"
  $repoRoot = Get-RepoRoot
  $postgresPackage = Assert-PostgresTools -BinRoot $PostgresBin
  $layout = Get-InstanceLayout
  Assert-LocalAdminUser -Value $script:LocalAdminUser
  Assert-Port -Value $Port
  Assert-ClusterName -Value $ClusterName
  Assert-DatabaseName -Value $DatabaseName
  $resolvedDataRoot = if ([string]::IsNullOrWhiteSpace($DataRoot)) { $layout.DataRoot } else { $DataRoot }
  [void](Assert-DataRoot -Root $resolvedDataRoot -RepoRoot $repoRoot -ExpectedClusterName $ClusterName -RequireMarker:$false)
  $baselineValid = Invoke-BaselineValidator -RepoRoot $repoRoot
  $portAvailable = Test-PortAvailable -Value $Port
  $dependencies = Get-DependencyScan -RepoRoot $repoRoot
  $localCompat = Invoke-LocalCompatPreflightValidator -RepoRoot $repoRoot
  $partialInstanceCleanupRequired = Test-Path -LiteralPath $layout.InstanceRoot -PathType Container
  $readyForCreate = $baselineValid -and $portAvailable -and $localCompat.Valid -and (-not $partialInstanceCleanupRequired)
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
  Write-Output "isolated_root=$(Convert-ToPublicPath -PathValue $layout.IsolatedRoot)"
  Write-Output "instance_name=$script:InstanceName"
  Write-Output "host=$script:AllowedHost"
  Write-Output "port=55432"
  Write-Output "admin_role=$script:LocalAdminUser"
  Write-Output "credential_strategy=WINDOWS_DPAPI_CURRENT_USER"
  Write-Output "authentication=scram-sha-256"
  Write-Output "create_implementation_present=true"
  Write-Output "git_ancestry_strategy=MERGE_BASE_IS_ANCESTOR"
  Write-Output "process_output_strategy=ASYNC_DUAL_STREAM_DRAIN"
  Write-Output "windows_argument_empty_value_safe=true"
  Write-Output "pg_hba_ipv6_reject=::/0"
  Write-Output "file_acl_inheritance=NONE"
  Write-Output "acl_rules_api=GETACCESSRULES"
  Write-Output "acl_include_explicit=true"
  Write-Output "acl_include_inherited=true"
  Write-Output "acl_identity_target=SECURITYIDENTIFIER"
  Write-Output "acl_access_property_used=false"
  Write-Output "acl_rules_fallback_allowed=false"
  Write-Output "acl_identity_normalization=SECURITYIDENTIFIER_TRANSLATE"
  Write-Output "acl_identity_name_comparison=false"
  Write-Output "acl_validation_semantic_set=true"
  Write-Output "acl_rule_order_dependency=false"
  Write-Output "acl_fullcontrol_bitmask_validation=true"
  Write-Output "partial_instance_cleanup_required=$(([string]$partialInstanceCleanupRequired).ToLowerInvariant())"
  Write-Output "create_retry_blocked_until_cleanup=$(([string]$partialInstanceCleanupRequired).ToLowerInvariant())"
  Write-Output "marker_state_concordance_required=true"
  Write-Output "created_utc_stable=true"
  Write-Output "git_working_directory_enforced=true"
  Write-Output "process_output_drain_verified=true"
  Write-Output "process_output_drain_failure_code=process_output_drain_failed"
  Write-Output "no_pidfile_process_inventory=DOTNET_LOCAL_PROCESS_ENUMERATION"
  Write-Output "no_server_evidence_requires_zero_authorized_or_ambiguous_processes=true"
  Write-Output "process_executable_path_strategy=MAINMODULE_FILENAME_PS51"
  Write-Output "process_path_property_used=false"
  Write-Output "process_access_failure_strategy=AMBIGUOUS_FAIL_CLOSED"
  Write-Output "process_identity_strategy=PID_MAINMODULE_STARTTIME"
  Write-Output "real_process_enumeration_in_plan=false"
  Write-Output "pg_ctl_start_failure_recovery=VERIFIED_PID_DATAROOT_EXECUTABLE_LISTENER"
  Write-Output "pg_ctl_stop_strategy=FAST_WAIT_30_VERIFIED"
  Write-Output "pg_ctl_stop_recheck_always=true"
  Write-Output "pg_ctl_stop_recheck_timeout_seconds=15"
  Write-Output "pid_reuse_detection=true"
  Write-Output "postmaster_dataroot_validation=true"
  Write-Output "raw_json_duplicate_scan_before_parse=true"
  Write-Output "server_state_schema_strict=true"
  Write-Output "state_schema_flat_strict=true"
  Write-Output "server_state_unresolved_fail_closed=true"
  Write-Output "cluster_name_valid=true"
  Write-Output "database_name_valid=true"
  Write-Output "data_root_outside_repository=true"
  Write-Output "baseline_candidate_valid=true"
  Write-Output "port_available=$(([string]$portAvailable).ToLowerInvariant())"
  Write-Output "local_server_detected=not_checked_by_plan"
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
  Write-Output "create_authorized=false"
  Write-Output "create_execution_blocked=true"
  Write-Output "create_execution_requires_exact_approval=true"
  Write-Output "authorization_parameter_scope=EXPLICIT"
  Write-Output "authorization_token_name_collision=false"
  Write-Output "create_expected_token_variable=EXPECTED_CREATE_APPROVAL_TOKEN"
  Write-Output "cleanup_expected_token_variable=EXPECTED_CLEANUP_APPROVAL_TOKEN"
  Write-Output "create_input_token_preserved=true"
  Write-Output "cleanup_input_token_preserved=true"
  Write-Output "cleanup_positive_authorization_selftest=true"
  Write-Output "create_positive_authorization_selftest=true"
  Write-Output "cleanup_safe_instrumentation=true"
  Write-Output "cleanup_substage_model=CLOSED"
  Write-Output "cleanup_reason_model=CLOSED"
  Write-Output "cleanup_exception_type_model=ALLOWLIST"
  Write-Output "cleanup_generic_failure_removed=true"
  Write-Output "cleanup_delete_stage_guard=true"
  Write-Output "cleanup_safe_reason_filter=true"
  Write-Output "cleanup_real_execution_tested=false"
  Write-Output "cleanup_action_present=true"
  Write-Output "cleanup_authorized=false"
  Write-Output "cleanup_execution_blocked=true"
  Write-Output "cleanup_requires_empty_instance=true"
  Write-Output "cleanup_recursive_delete_allowed=false"
  Write-Output "cleanup_acl_modification_allowed=false"
  Write-Output "cleanup_reparse_points_allowed=false"
  Write-Output "cleanup_package_directory_in_scope=false"
  Write-Output "apply_implementation_present=false"
  Write-Output "verify_implementation_present=false"
  Write-Output "destroy_implementation_present=false"
  Write-Output "fulltest_implementation_present=false"
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
    "Create" {
      Invoke-Create `
        -ConfirmCreate:$ConfirmCreate `
        -CreateApprovalToken $CreateApprovalToken `
        -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
        -CleanupApprovalToken $CleanupApprovalToken
    }
    "CleanupPartialCreate" {
      Invoke-CleanupPartialCreate `
        -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
        -CleanupApprovalToken $CleanupApprovalToken `
        -ConfirmCreate:$ConfirmCreate `
        -CreateApprovalToken $CreateApprovalToken
    }
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
  if (-not [string]::IsNullOrWhiteSpace($script:CurrentExceptionType)) {
    Write-Output "exception_type=$script:CurrentExceptionType"
  }
  Write-Output "production_connection_used=false"
  Write-Output "sql_executed=false"
  exit 1
}
