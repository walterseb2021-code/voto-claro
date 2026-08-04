[CmdletBinding()]
param(
  [ValidateSet("Plan","Create","CleanupPartialCreate","CleanupFailedCreate","Apply","Verify","Destroy","FullTest")]
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
  [switch]$ConfirmCleanupFailedCreate,
  [string]$CleanupFailedCreateApprovalToken,
  [switch]$KeepOnSuccess,
  [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:CurrentStage = "initialization"
$script:CurrentExceptionType = $null
$script:CurrentSecondaryReason = $null
$script:AllowedHost = "127.0.0.1"
$script:MarkerFileName = "VC_ISOLATED_BASELINE_TEST.marker"
$script:ClusterPrefix = "vc_staging_baseline_test_"
$script:DatabasePrefix = "vc_staging_baseline_test_"
$script:LocalAdminUser = "vc_isolated_admin"
$script:ExpectedCreateApprovalToken = "CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432"
$script:ExpectedCleanupApprovalToken = "CLEANUP_PARTIAL_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432"
$script:ExpectedCleanupFailedCreateApprovalToken = "CLEANUP_FAILED_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432"
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
  "cleanup_failed_not_authorized",
  "cleanup_failed_layout_failed",
  "cleanup_failed_environment_invalid",
  "cleanup_failed_git_invalid",
  "cleanup_failed_paths_invalid",
  "cleanup_failed_attributes_invalid",
  "cleanup_failed_exact_state_invalid",
  "cleanup_failed_marker_state_invalid",
  "cleanup_failed_acl_invalid",
  "cleanup_failed_internal_acl_invalid",
  "cleanup_failed_isolated_root_acl_invalid",
  "cleanup_failed_acl_owner_invalid",
  "cleanup_failed_acl_fullcontrol_missing",
  "cleanup_failed_acl_deny_rule",
  "cleanup_failed_acl_unexpected_explicit_rule",
  "cleanup_failed_acl_identity_invalid",
  "cleanup_failed_acl_read_failed",
  "cleanup_failed_acl_enumeration_failed",
  "cleanup_failed_activity_detected",
  "cleanup_failed_state_changed",
  "cleanup_failed_delete_state_json_failed",
  "cleanup_failed_delete_marker_failed",
  "cleanup_failed_delete_state_root_failed",
  "cleanup_failed_delete_data_root_failed",
  "cleanup_failed_delete_log_root_failed",
  "cleanup_failed_delete_secret_root_failed",
  "cleanup_failed_delete_instance_root_failed",
  "cleanup_failed_delete_isolated_root_failed",
  "cleanup_failed_postcheck_failed",
  "cleanup_failed_package_modified",
  "cleanup_failed_preflight_unknown",
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
  "state_validate_input_failed",
  "state_get_created_utc_failed",
  "state_build_payload_failed",
  "state_serialize_json_failed",
  "state_write_temp_failed",
  "state_move_initial_failed",
  "state_replace_existing_failed",
  "state_apply_acl_failed",
  "state_acl_readback_failed",
  "state_schema_readback_failed",
  "state_marker_concordance_failed",
  "state_temp_file_residual",
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
    "cleanup_parent_not_empty",
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
    "cleanup_revalidate_activity_after_instance_delete",
    "cleanup_validate_parent_empty",
    "cleanup_delete_instance",
    "cleanup_delete_root",
    "cleanup_postcheck"
  )
  $allowedExceptionTypes = @(
    "UnauthorizedAccessException",
    "IOException",
    "DirectoryNotFoundException",
    "SecurityException",
    "InvalidOperationException",
    "ArgumentException",
    "MethodInvocationException",
    "PropertyNotFoundException",
    "RuntimeException",
    "ParentContainsErrorRecordException",
    "CmdletInvocationException",
    "ItemNotFoundException",
    "UnknownException"
  )
  $wrapperExceptionTypes = @(
    "RuntimeException",
    "ParentContainsErrorRecordException",
    "CmdletInvocationException",
    "MethodInvocationException"
  )
  $safeReason = $null
  $current = $Exception
  $depth = 0
  $seenReasons = @{}
  while ($null -ne $current -and $depth -lt 8) {
    $objectId = [System.Runtime.CompilerServices.RuntimeHelpers]::GetHashCode($current)
    if ($seenReasons.ContainsKey($objectId)) { break }
    $seenReasons[$objectId] = $true
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
  $selectedType = $null
  $selectedWrapper = $null
  $current = $Exception
  $depth = 0
  $seenTypes = @{}
  while ($null -ne $current -and $depth -lt 8) {
    $objectId = [System.Runtime.CompilerServices.RuntimeHelpers]::GetHashCode($current)
    if ($seenTypes.ContainsKey($objectId)) { break }
    $seenTypes[$objectId] = $true
    $rawType = "UnknownException"
    if ($null -ne $current.PSObject.Properties["SimulatedTypeName"]) {
      $rawType = [string]$current.SimulatedTypeName
    } else {
      $rawType = $current.GetType().Name
    }
    $safeType = $(if ($allowedExceptionTypes -contains $rawType) { $rawType } else { "UnknownException" })
    if ($wrapperExceptionTypes -contains $safeType) {
      if ($null -eq $selectedWrapper) { $selectedWrapper = $safeType }
    } elseif ($safeType -ne "UnknownException") {
      $selectedType = $safeType
    }
    $current = $(if ($current -is [System.Exception]) { $current.InnerException } elseif ($null -ne $current.PSObject.Properties["InnerException"]) { $current.InnerException } else { $null })
    $depth += 1
  }
  $exceptionType = $(if ($null -ne $selectedType) { $selectedType } elseif ($null -ne $selectedWrapper) { $selectedWrapper } else { "UnknownException" })
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
      elseif ($exceptionType -eq "DirectoryNotFoundException" -or $exceptionType -eq "ItemNotFoundException") { "cleanup_paths_invalid" }
      else { "cleanup_enumeration_failed" }
      break
    }
    "cleanup_signature_initial" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" }
      elseif ($exceptionType -eq "DirectoryNotFoundException" -or $exceptionType -eq "ItemNotFoundException") { "cleanup_state_changed" }
      else { "cleanup_signature_failed" }
      break
    }
    "cleanup_activity" { "cleanup_activity_detected"; break }
    "cleanup_revalidate_signature" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" }
      elseif ($exceptionType -eq "DirectoryNotFoundException" -or $exceptionType -eq "ItemNotFoundException") { "cleanup_state_changed" }
      else { "cleanup_signature_failed" }
      break
    }
    "cleanup_revalidate_state" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" } else { "cleanup_state_changed" }
      break
    }
    "cleanup_revalidate_activity" { "cleanup_activity_detected"; break }
    "cleanup_revalidate_activity_after_instance_delete" { "cleanup_activity_detected"; break }
    "cleanup_validate_parent_empty" {
      if ($exceptionType -eq "UnauthorizedAccessException") { "cleanup_enumeration_denied" }
      else { "cleanup_enumeration_failed" }
      break
    }
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

function New-CleanupDirectoryEntriesResult {
  param([AllowEmptyCollection()][string[]]$Entries)
  return [pscustomobject]@{
    Entries = [string[]]$Entries
  }
}

function Assert-CleanupDirectoryEntriesResult {
  param([AllowNull()][object]$Result)
  if ($null -eq $Result -or
      $null -eq $Result.PSObject.Properties["Entries"] -or
      $null -eq $Result.Entries -or
      -not ($Result.Entries -is [string[]])) {
    Throw-SafeError -Code "cleanup_enumeration_failed"
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
    [AllowNull()][string]$ProvidedCleanupApprovalToken,
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$ProvidedCleanupFailedCreateApprovalToken
  )
  $authorized = $true
  if (-not $ConfirmCreate) { $authorized = $false }
  if ([string]::IsNullOrWhiteSpace($ProvidedCreateApprovalToken)) { $authorized = $false }
  if (-not [string]::Equals($ProvidedCreateApprovalToken, $ExpectedCreateApprovalToken, [System.StringComparison]::Ordinal)) { $authorized = $false }
  if ($ConfirmCleanupPartialCreate) { $authorized = $false }
  if (-not [string]::IsNullOrWhiteSpace($ProvidedCleanupApprovalToken)) { $authorized = $false }
  if ($ConfirmCleanupFailedCreate) { $authorized = $false }
  if (-not [string]::IsNullOrWhiteSpace($ProvidedCleanupFailedCreateApprovalToken)) { $authorized = $false }
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
    [AllowNull()][string]$ProvidedCleanupApprovalToken,
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$ProvidedCleanupFailedCreateApprovalToken
  )
  $result = Test-CreateAuthorization `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $ProvidedCreateApprovalToken `
    -ExpectedCreateApprovalToken $ExpectedCreateApprovalToken `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $ProvidedCleanupApprovalToken `
    -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
    -ProvidedCleanupFailedCreateApprovalToken $ProvidedCleanupFailedCreateApprovalToken
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
    [AllowNull()][string]$ProvidedCreateApprovalToken,
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$ProvidedCleanupFailedCreateApprovalToken
  )
  $authorized = $true
  if (-not $ConfirmCleanupPartialCreate) { $authorized = $false }
  if ([string]::IsNullOrWhiteSpace($ProvidedCleanupApprovalToken)) { $authorized = $false }
  if (-not [string]::Equals($ProvidedCleanupApprovalToken, $ExpectedCleanupApprovalToken, [System.StringComparison]::Ordinal)) { $authorized = $false }
  if ($ConfirmCreate) { $authorized = $false }
  if (-not [string]::IsNullOrWhiteSpace($ProvidedCreateApprovalToken)) { $authorized = $false }
  if ($ConfirmCleanupFailedCreate) { $authorized = $false }
  if (-not [string]::IsNullOrWhiteSpace($ProvidedCleanupFailedCreateApprovalToken)) { $authorized = $false }
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
    [AllowNull()][string]$ProvidedCreateApprovalToken,
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$ProvidedCleanupFailedCreateApprovalToken
  )
  $result = Test-CleanupAuthorization `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $ProvidedCleanupApprovalToken `
    -ExpectedCleanupApprovalToken $ExpectedCleanupApprovalToken `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $ProvidedCreateApprovalToken `
    -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
    -ProvidedCleanupFailedCreateApprovalToken $ProvidedCleanupFailedCreateApprovalToken
  if (-not $result.Authorized) {
    Throw-SafeError -Code $result.SafeErrorCode
  }
}
function Test-CleanupFailedCreateAuthorization {
  param(
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$ProvidedCleanupFailedCreateApprovalToken,
    [Parameter(Mandatory = $true)][string]$ExpectedCleanupFailedCreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$ProvidedCreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$ProvidedCleanupApprovalToken
  )
  $authorized = $true
  if (-not $ConfirmCleanupFailedCreate) { $authorized = $false }
  if ([string]::IsNullOrWhiteSpace($ProvidedCleanupFailedCreateApprovalToken)) { $authorized = $false }
  if (-not [string]::Equals($ProvidedCleanupFailedCreateApprovalToken, $ExpectedCleanupFailedCreateApprovalToken, [System.StringComparison]::Ordinal)) { $authorized = $false }
  if ($ConfirmCreate) { $authorized = $false }
  if (-not [string]::IsNullOrWhiteSpace($ProvidedCreateApprovalToken)) { $authorized = $false }
  if ($ConfirmCleanupPartialCreate) { $authorized = $false }
  if (-not [string]::IsNullOrWhiteSpace($ProvidedCleanupApprovalToken)) { $authorized = $false }
  return [pscustomobject]@{
    Authorized = $authorized
    SafeErrorCode = $(if ($authorized) { $null } else { "cleanup_failed_not_authorized" })
  }
}
function Assert-CleanupFailedCreateAuthorization {
  param(
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$ProvidedCleanupFailedCreateApprovalToken,
    [Parameter(Mandatory = $true)][string]$ExpectedCleanupFailedCreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$ProvidedCreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$ProvidedCleanupApprovalToken
  )
  $result = Test-CleanupFailedCreateAuthorization `
    -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
    -ProvidedCleanupFailedCreateApprovalToken $ProvidedCleanupFailedCreateApprovalToken `
    -ExpectedCleanupFailedCreateApprovalToken $ExpectedCleanupFailedCreateApprovalToken `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $ProvidedCreateApprovalToken `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $ProvidedCleanupApprovalToken
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
    [string[]]$entries = [System.IO.Directory]::GetFileSystemEntries($PathValue)
    return (New-CleanupDirectoryEntriesResult -Entries $entries)
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
  if (Test-CleanupPartialCreateStateReplaceResidual -Layout $Layout) { return }
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
  $instanceEntriesResult = Get-CleanupDirectoryEntries -PathValue $Layout.InstanceRoot
  Assert-CleanupDirectoryEntriesResult -Result $instanceEntriesResult
  [string[]]$instanceEntries = $instanceEntriesResult.Entries
  foreach ($entry in $instanceEntries) {
    Assert-CleanupEntrySafe -PathValue $entry
    Throw-SafeError -Code "cleanup_instance_not_empty"
  }
  $isolatedEntriesResult = Get-CleanupDirectoryEntries -PathValue $Layout.IsolatedRoot
  Assert-CleanupDirectoryEntriesResult -Result $isolatedEntriesResult
  [string[]]$isolatedEntries = $isolatedEntriesResult.Entries
  if ($isolatedEntries.Count -ne 1) {
    Throw-SafeError -Code "cleanup_unexpected_content"
  }
  Assert-CleanupEntrySafe -PathValue $isolatedEntries[0]
  $onlyEntry = [System.IO.Path]::GetFullPath($isolatedEntries[0])
  $trimSeparators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  if (-not [string]::Equals($onlyEntry.TrimEnd($trimSeparators), $Layout.InstanceRoot.TrimEnd($trimSeparators), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "cleanup_unexpected_content"
  }
}
function Read-ClusterStatePayloadForValidation {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  $text = [System.IO.File]::ReadAllText($PathValue)
  [void](Assert-StrictFlatStateJson -JsonText $text)
  return ($text | ConvertFrom-Json)
}

function Get-StateReplaceResidualTempPath {
  param([Parameter(Mandatory = $true)][object]$Layout)
  $entriesResult = Get-CleanupDirectoryEntries -PathValue $Layout.StateRoot
  Assert-CleanupDirectoryEntriesResult -Result $entriesResult
  [string[]]$entries = @($entriesResult.Entries)
  $temps = @()
  foreach ($entry in $entries) {
    Assert-CleanupEntrySafe -PathValue $entry
    $name = [System.IO.Path]::GetFileName($entry)
    if ($name -match '^cluster-state\.[0-9a-f]{32}\.tmp$') { $temps += [System.IO.Path]::GetFullPath($entry); continue }
    if ($name -match '^cleanup-partial\.[0-9a-f]{32}\.journal\.json$') { continue }
    if ($name -match '^cluster-state\.[0-9a-f]{32}\.bak$') { Throw-SafeError -Code "cleanup_unexpected_content" }
    if (-not [string]::Equals([System.IO.Path]::GetFullPath($entry).TrimEnd('\'), $Layout.StatePath.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase) -and
        -not [string]::Equals([System.IO.Path]::GetFullPath($entry).TrimEnd('\'), $Layout.MarkerPath.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-SafeError -Code "cleanup_unexpected_content"
    }
  }
  if ($temps.Count -ne 1) { Throw-SafeError -Code "cleanup_unexpected_content" }
  return $temps[0]
}

function Assert-CleanupPartialCreateStateReplaceResidual {
  param([Parameter(Mandatory = $true)][object]$Layout)
  Assert-CleanupDirectorySafe -PathValue $Layout.IsolatedRoot
  Assert-CleanupDirectorySafe -PathValue $Layout.InstanceRoot
  foreach ($dir in @($Layout.DataRoot, $Layout.LogRoot, $Layout.SecretRoot, $Layout.StateRoot)) {
    Assert-CleanupDirectorySafe -PathValue $dir
  }
  foreach ($file in @($Layout.StatePath, $Layout.MarkerPath, $Layout.CredentialPath)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Throw-SafeError -Code "cleanup_unexpected_content" }
    Assert-CleanupEntrySafe -PathValue $file
  }
  if (Test-Path -LiteralPath $Layout.PasswordFilePath -PathType Leaf) { Throw-SafeError -Code "cleanup_unexpected_content" }
  if (Test-Path -LiteralPath (Join-Path $Layout.DataRoot "postmaster.pid") -PathType Leaf) { Throw-SafeError -Code "cleanup_postmaster_pid_present" }
  if (-not (Test-Path -LiteralPath (Join-Path $Layout.DataRoot "PG_VERSION") -PathType Leaf)) { Throw-SafeError -Code "cleanup_unexpected_content" }
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.IsolatedRoot -ExpectedEntries @($Layout.InstanceRoot)
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.InstanceRoot -ExpectedEntries @($Layout.DataRoot, $Layout.LogRoot, $Layout.SecretRoot, $Layout.StateRoot)
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.SecretRoot -ExpectedEntries @($Layout.CredentialPath)
  $tmpPath = Get-StateReplaceResidualTempPath -Layout $Layout
  $marker = Read-MarkerMap -MarkerPath $Layout.MarkerPath
  $clusterId = [string]$marker["cluster_id"]
  Assert-MarkerStateConcordance -Layout $Layout -ClusterId $clusterId
  $main = Read-ClusterStatePayloadForValidation -PathValue $Layout.StatePath
  $temp = Read-ClusterStatePayloadForValidation -PathValue $tmpPath
  if ($main.cluster_id -ne $clusterId -or $temp.cluster_id -ne $clusterId -or
      $main.state -ne "initializing" -or $main.stage -ne "initdb" -or
      $temp.state -ne "initialized" -or $temp.stage -ne "initialized" -or
      $main.initdb_completed -ne $false -or $temp.initdb_completed -ne $true -or
      $main.server_started -ne $false -or $temp.server_started -ne $false -or
      $main.server_state -ne "not_started" -or $temp.server_state -ne "not_started" -or
      $main.server_cleanup_attempted -ne $false -or $temp.server_cleanup_attempted -ne $false -or
      $main.server_cleanup_completed -ne $false -or $temp.server_cleanup_completed -ne $false -or
      [string]$main.created_utc -ne [string]$temp.created_utc) {
    Throw-SafeError -Code "cleanup_unexpected_content"
  }
  $created = Convert-ClusterStateUtcForValidation -Value ([string]$main.created_utc) -FailureCode "cleanup_unexpected_content"
  $mainUpdated = Convert-ClusterStateUtcForValidation -Value ([string]$main.updated_utc) -FailureCode "cleanup_unexpected_content"
  $tempUpdated = Convert-ClusterStateUtcForValidation -Value ([string]$temp.updated_utc) -FailureCode "cleanup_unexpected_content"
  if ($created -gt $mainUpdated -or $created -gt $tempUpdated -or $tempUpdated -lt $mainUpdated) { Throw-SafeError -Code "cleanup_unexpected_content" }
  return [pscustomobject]@{ Valid = $true; TempPath = $tmpPath; ClusterId = $clusterId }
}

function Test-CleanupPartialCreateStateReplaceResidual {
  param([Parameter(Mandatory = $true)][object]$Layout)
  try {
    [void](Assert-CleanupPartialCreateStateReplaceResidual -Layout $Layout)
    return $true
  } catch {
    return $false
  }
}
function Get-FileSha256ForCleanupManifest {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  $stream = $null
  $sha = $null
  try {
    $stream = [System.IO.File]::Open($PathValue, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace("-", "").ToLowerInvariant())
  } finally {
    if ($null -ne $sha) { $sha.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
  }
}

function Assert-CleanupManifestChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$RootPath
  )
  $full = [System.IO.Path]::GetFullPath($PathValue)
  $root = [System.IO.Path]::GetFullPath($RootPath)
  $rootWithSlash = $root.TrimEnd('\') + [System.IO.Path]::DirectorySeparatorChar
  if (-not $full.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase) -and
      -not [string]::Equals($full.TrimEnd('\'), $root.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "cleanup_unexpected_content"
  }
  return $full
}

function Get-CleanupManifestTree {
  param(
    [Parameter(Mandatory = $true)][string]$RootPath,
    [Parameter(Mandatory = $true)][string]$AuthorizedRoot
  )
  $root = Assert-CleanupManifestChildPath -PathValue $RootPath -RootPath $AuthorizedRoot
  if (-not (Test-Path -LiteralPath $root -PathType Container)) { Throw-SafeError -Code "cleanup_unexpected_content" }
  $files = New-Object System.Collections.Generic.List[string]
  $dirs = New-Object System.Collections.Generic.List[string]
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($root)
  while ($stack.Count -gt 0) {
    $dir = $stack.Pop()
    $dirItem = Get-Item -LiteralPath $dir -Force
    if (($dirItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { Throw-SafeError -Code "cleanup_reparse_detected" }
    foreach ($entry in [System.IO.Directory]::GetFileSystemEntries($dir)) {
      $entryFull = Assert-CleanupManifestChildPath -PathValue $entry -RootPath $AuthorizedRoot
      $item = Get-Item -LiteralPath $entryFull -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { Throw-SafeError -Code "cleanup_reparse_detected" }
      if (($item.Attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
        [void]$dirs.Add($entryFull)
        $stack.Push($entryFull)
      } else {
        [void]$files.Add($entryFull)
      }
    }
  }
  return [pscustomobject]@{
    Files = [string[]]@($files.ToArray() | Sort-Object)
    Directories = [string[]]@($dirs.ToArray() | Sort-Object { $_.Length } -Descending)
  }
}

function Get-CleanupPartialManifestSignature {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$TempPath,
    [Parameter(Mandatory = $true)][object]$DataTree
  )
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($path in @($Layout.StatePath, $TempPath, $Layout.MarkerPath, $Layout.CredentialPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Throw-SafeError -Code "cleanup_unexpected_content" }
    $item = Get-Item -LiteralPath $path -Force
    [void]$parts.Add(([System.IO.Path]::GetFileName($path) + ":" + $item.Length + ":" + (Get-FileSha256ForCleanupManifest -PathValue $path)))
  }
  [void]$parts.Add("data_files=" + $DataTree.Files.Count)
  [void]$parts.Add("data_dirs=" + $DataTree.Directories.Count)
  foreach ($path in @($DataTree.Files + $DataTree.Directories)) {
    $relative = [System.IO.Path]::GetFullPath($path).Substring($Layout.DataRoot.TrimEnd('\').Length).TrimStart('\')
    [void]$parts.Add($relative)
  }
  return (Get-StableStringHashForCleanupManifest -Text ($parts -join "`n"))
}

function Get-StableStringHashForCleanupManifest {
  param([Parameter(Mandatory = $true)][string]$Text)
  $sha = $null
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant())
  } finally {
    if ($null -ne $sha) { $sha.Dispose() }
  }
}

function New-CleanupPartialManifest {
  param([Parameter(Mandatory = $true)][object]$Layout)
  $residual = Assert-CleanupPartialCreateStateReplaceResidual -Layout $Layout
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.InstanceRoot -ExpectedEntries @($Layout.DataRoot, $Layout.LogRoot, $Layout.SecretRoot, $Layout.StateRoot)
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.LogRoot -ExpectedEntries @()
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.SecretRoot -ExpectedEntries @($Layout.CredentialPath)
  if (Test-Path -LiteralPath $Layout.PasswordFilePath -PathType Leaf) { Throw-SafeError -Code "cleanup_unexpected_content" }
  if (Test-Path -LiteralPath (Join-Path $Layout.DataRoot "postmaster.pid") -PathType Leaf) { Throw-SafeError -Code "cleanup_postmaster_pid_present" }
  $pgVersionPath = Join-Path $Layout.DataRoot "PG_VERSION"
  if (-not (Test-Path -LiteralPath $pgVersionPath -PathType Leaf)) { Throw-SafeError -Code "cleanup_unexpected_content" }
  $pgVersion = ([System.IO.File]::ReadAllText($pgVersionPath)).Trim()
  if ($pgVersion -ne "17") { Throw-SafeError -Code "cleanup_unexpected_content" }
  $tblspc = Join-Path $Layout.DataRoot "pg_tblspc"
  if (Test-Path -LiteralPath $tblspc -PathType Container) {
    $tblspcEntries = @([System.IO.Directory]::GetFileSystemEntries($tblspc))
    if ($tblspcEntries.Count -ne 0) { Throw-SafeError -Code "cleanup_unexpected_content" }
  }
  $dataTree = Get-CleanupManifestTree -RootPath $Layout.DataRoot -AuthorizedRoot $Layout.InstanceRoot
  $signature = Get-CleanupPartialManifestSignature -Layout $Layout -TempPath $residual.TempPath -DataTree $dataTree
  $files = New-Object System.Collections.Generic.List[string]
  foreach ($file in $dataTree.Files) { [void]$files.Add($file) }
  [void]$files.Add($Layout.CredentialPath)
  [void]$files.Add($residual.TempPath)
  [void]$files.Add($Layout.StatePath)
  [void]$files.Add($Layout.MarkerPath)
  $dirs = New-Object System.Collections.Generic.List[string]
  foreach ($dir in $dataTree.Directories) { [void]$dirs.Add($dir) }
  foreach ($dir in @($Layout.DataRoot, $Layout.SecretRoot, $Layout.LogRoot, $Layout.StateRoot, $Layout.InstanceRoot, $Layout.IsolatedRoot)) { [void]$dirs.Add($dir) }
  return [pscustomobject]@{
    ClusterId = $residual.ClusterId
    TempPath = $residual.TempPath
    Files = [string[]]$files.ToArray()
    Directories = [string[]]$dirs.ToArray()
    DataFileCount = $dataTree.Files.Count
    DataDirectoryCount = $dataTree.Directories.Count
    Signature = $signature
  }
}

function Assert-CleanupPartialManifestUnchanged {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][object]$Manifest
  )
  $current = New-CleanupPartialManifest -Layout $Layout
  if (-not [string]::Equals($current.Signature, $Manifest.Signature, [System.StringComparison]::Ordinal) -or
      $current.Files.Count -ne $Manifest.Files.Count -or
      $current.Directories.Count -ne $Manifest.Directories.Count) {
    Throw-SafeError -Code "cleanup_state_changed"
  }
}

function New-CleanupPartialJournalPath {
  param([Parameter(Mandatory = $true)][object]$Layout)
  return (Join-Path $Layout.StateRoot ("cleanup-partial." + [Guid]::NewGuid().ToString("N") + ".journal.json"))
}

function Write-CleanupPartialJournal {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][object]$Manifest,
    [Parameter(Mandatory = $true)][string]$JournalPath,
    [Parameter(Mandatory = $true)][string]$Step
  )
  $leaf = [System.IO.Path]::GetFileName($JournalPath)
  if ($leaf -notmatch '^cleanup-partial\.[0-9a-f]{32}\.journal\.json$') { Throw-SafeError -Code "cleanup_unexpected_content" }
  [void](Assert-CleanupManifestChildPath -PathValue $JournalPath -RootPath $Layout.StateRoot)
  $payload = [ordered]@{
    artifact_type = "voto_claro_cleanup_partial_manifest_journal"
    schema_version = 1
    cluster_id = $Manifest.ClusterId
    step = $Step
    manifest_signature = $Manifest.Signature
    data_file_count = $Manifest.DataFileCount
    data_directory_count = $Manifest.DataDirectoryCount
    server_started = $false
    production_connection_used = $false
    sql_executed = $false
  }
  Write-Utf8NoBomFile -PathValue $JournalPath -Text ($payload | ConvertTo-Json -Depth 4)
  Set-RestrictedAcl -PathValue $JournalPath -TargetType File
}

function Get-CleanupDeleteFailureInfo {
  param(
    [AllowNull()][object]$Exception,
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][ValidateSet("File","Directory")][string]$Kind
  )
  $type = if ($Exception -is [System.Exception]) { $Exception.GetType().Name } else { "UnknownException" }
  if (@("IOException","UnauthorizedAccessException","DirectoryNotFoundException","FileNotFoundException","RuntimeException","MethodInvocationException") -notcontains $type) { $type = "UnknownException" }
  $hresult = if ($Exception -is [System.Exception]) { "0x{0:X8}" -f ($Exception.HResult -band 0xffffffff) } else { "0x00000000" }
  $exists = if ($Kind -eq "File") { Test-Path -LiteralPath $PathValue -PathType Leaf } else { Test-Path -LiteralPath $PathValue -PathType Container }
  $childCount = 0
  $empty = $true
  if ($Kind -eq "Directory" -and (Test-Path -LiteralPath $PathValue -PathType Container)) {
    $childCount = @([System.IO.Directory]::GetFileSystemEntries($PathValue)).Count
    $empty = $childCount -eq 0
  }
  return [pscustomobject]@{ Type = $type; HResult = $hresult; ExistsAfter = [bool]$exists; DirectoryEmpty = [bool]$empty; ChildCount = $childCount }
}

function Set-CleanupDeleteFailureTelemetry {
  param([Parameter(Mandatory = $true)][object]$Info)
  $script:CurrentExceptionType = [string]$Info.Type
  $script:CurrentSecondaryReason = ("delete_hresult={0};exists_after={1};directory_empty={2};child_count={3}" -f $Info.HResult, ([string]$Info.ExistsAfter).ToLowerInvariant(), ([string]$Info.DirectoryEmpty).ToLowerInvariant(), $Info.ChildCount)
}

function Invoke-CleanupPartialManifestDelete {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][object]$Manifest,
    [Parameter(Mandatory = $true)][object]$Package
  )
  $journal = New-CleanupPartialJournalPath -Layout $Layout
  $completed = $false
  Write-CleanupPartialJournal -Layout $Layout -Manifest $Manifest -JournalPath $journal -Step "prepared"
  try {
    Assert-CleanupPartialManifestUnchanged -Layout $Layout -Manifest $Manifest
    Assert-CleanupNoPostgresActivity -Package $Package -Layout $Layout
    Write-CleanupPartialJournal -Layout $Layout -Manifest $Manifest -JournalPath $journal -Step "deleting_files"
    foreach ($file in $Manifest.Files) {
      [void](Assert-CleanupManifestChildPath -PathValue $file -RootPath $Layout.InstanceRoot)
      try {
        if (Test-Path -LiteralPath $file -PathType Leaf) { [System.IO.File]::Delete($file) }
      } catch {
        $info = Get-CleanupDeleteFailureInfo -Exception $_.Exception -PathValue $file -Kind "File"
        Set-CleanupDeleteFailureTelemetry -Info $info
        Throw-SafeError -Code "cleanup_delete_instance_failed"
      }
    }
    Write-CleanupPartialJournal -Layout $Layout -Manifest $Manifest -JournalPath $journal -Step "deleting_directories"
    foreach ($dir in $Manifest.Directories) {
      $rootForCheck = if ([string]::Equals([System.IO.Path]::GetFullPath($dir).TrimEnd('\'), $Layout.IsolatedRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) { $Layout.IsolatedRoot } else { $Layout.InstanceRoot }
      [void](Assert-CleanupManifestChildPath -PathValue $dir -RootPath $rootForCheck)
      try {
        if ([string]::Equals([System.IO.Path]::GetFullPath($dir).TrimEnd('\'), $Layout.StateRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $journal -PathType Leaf)) {
          [System.IO.File]::Delete($journal)
        }
        if (Test-Path -LiteralPath $dir -PathType Container) { [System.IO.Directory]::Delete($dir, $false) }
      } catch {
        $info = Get-CleanupDeleteFailureInfo -Exception $_.Exception -PathValue $dir -Kind "Directory"
        Set-CleanupDeleteFailureTelemetry -Info $info
        Throw-SafeError -Code "cleanup_delete_instance_failed"
      }
    }
    $completed = $true
  } finally {
    if ($completed -and (Test-Path -LiteralPath $journal -PathType Leaf)) {
      try { [System.IO.File]::Delete($journal) } catch { }
    }
  }
}

function Remove-CleanupPartialSelfTestTreeControlled {
  param([Parameter(Mandatory = $true)][string]$RootPath)
  if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) { return }
  $root = [System.IO.Path]::GetFullPath($RootPath)
  if (-not [System.IO.Path]::GetFileName($root).StartsWith("vc-cleanup-partial-selftest-", [System.StringComparison]::Ordinal)) { return }
  $files = New-Object System.Collections.Generic.List[string]
  $dirs = New-Object System.Collections.Generic.List[string]
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($root)
  while ($stack.Count -gt 0) {
    $dir = $stack.Pop()
    foreach ($entry in [System.IO.Directory]::GetFileSystemEntries($dir)) {
      $full = [System.IO.Path]::GetFullPath($entry)
      if (-not $full.StartsWith(($root.TrimEnd('\') + [System.IO.Path]::DirectorySeparatorChar), [System.StringComparison]::OrdinalIgnoreCase)) { return }
      $item = Get-Item -LiteralPath $full -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { return }
      if (($item.Attributes -band [System.IO.FileAttributes]::Directory) -ne 0) { [void]$dirs.Add($full); $stack.Push($full) } else { [void]$files.Add($full) }
    }
  }
  foreach ($file in $files) { if (Test-Path -LiteralPath $file -PathType Leaf) { [System.IO.File]::Delete($file) } }
  foreach ($dir in @($dirs.ToArray() | Sort-Object { $_.Length } -Descending)) { if (Test-Path -LiteralPath $dir -PathType Container) { [System.IO.Directory]::Delete($dir, $false) } }
  if (Test-Path -LiteralPath $root -PathType Container) { [System.IO.Directory]::Delete($root, $false) }
}

function New-CleanupPartialSelfTestJson {
  param(
    [Parameter(Mandatory = $true)][string]$ClusterId,
    [Parameter(Mandatory = $true)][string]$State,
    [Parameter(Mandatory = $true)][string]$Stage,
    [Parameter(Mandatory = $true)][string]$CreatedUtc,
    [Parameter(Mandatory = $true)][string]$UpdatedUtc,
    [Parameter(Mandatory = $true)][bool]$InitdbCompleted
  )
  $payload = [ordered]@{
    artifact_type = "voto_claro_isolated_baseline_cluster_state"
    schema_version = 1
    cluster_id = $ClusterId
    state = $State
    stage = $Stage
    created_utc = $CreatedUtc
    updated_utc = $UpdatedUtc
    postgres_major = "17"
    postgres_version = "17.10"
    host = "127.0.0.1"
    port = 55432
    admin_role = $script:LocalAdminUser
    instance_name = $script:InstanceName
    data_directory_name = "data"
    server_log_name = "postgresql-server.log"
    last_error_code = $null
    initdb_completed = $InitdbCompleted
    configuration_completed = $false
    server_started = $false
    credential_protected = $true
    plaintext_password_file_present = $false
    server_state = "not_started"
    server_cleanup_attempted = $false
    server_cleanup_completed = $false
  }
  return ($payload | ConvertTo-Json -Depth 4)
}

function New-CleanupPartialSelfTestLayout {
  param([Parameter(Mandatory = $true)][string]$BaseRoot)
  $isolatedRoot = Join-Path $BaseRoot "isolated-baseline-test"
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

function Initialize-CleanupPartialSelfTestLayout {
  param([Parameter(Mandatory = $true)][object]$Layout)
  foreach ($dir in @($Layout.IsolatedRoot, $Layout.InstanceRoot, $Layout.DataRoot, $Layout.LogRoot, $Layout.StateRoot, $Layout.SecretRoot, (Join-Path $Layout.DataRoot "base"), (Join-Path $Layout.DataRoot "base\1"), (Join-Path $Layout.DataRoot "global"), (Join-Path $Layout.DataRoot "pg_tblspc"))) {
    [System.IO.Directory]::CreateDirectory($dir) | Out-Null
    Set-RestrictedAcl -PathValue $dir -TargetType Directory
  }
  $clusterId = [Guid]::NewGuid().ToString()
  $created = "2026-01-01T00:00:00.0000000+00:00"
  $mainUpdated = "2026-01-01T00:00:00.0000000+00:00"
  $tempUpdated = "2026-01-01T00:00:01.0000000+00:00"
  Write-Utf8NoBomFile -PathValue $Layout.MarkerPath -Text ((New-MarkerText -ClusterId $clusterId -LocalPort 55432) -join "`n")
  Write-Utf8NoBomFile -PathValue $Layout.StatePath -Text (New-CleanupPartialSelfTestJson -ClusterId $clusterId -State "initializing" -Stage "initdb" -CreatedUtc $created -UpdatedUtc $mainUpdated -InitdbCompleted:$false)
  $tmp = Join-Path $Layout.StateRoot ("cluster-state." + [Guid]::NewGuid().ToString("N") + ".tmp")
  Write-Utf8NoBomFile -PathValue $tmp -Text (New-CleanupPartialSelfTestJson -ClusterId $clusterId -State "initialized" -Stage "initialized" -CreatedUtc $created -UpdatedUtc $tempUpdated -InitdbCompleted:$true)
  Write-Utf8NoBomFile -PathValue $Layout.CredentialPath -Text "selftest-non-secret-placeholder"
  foreach ($file in @($Layout.MarkerPath, $Layout.StatePath, $tmp, $Layout.CredentialPath)) { Set-RestrictedAcl -PathValue $file -TargetType File }
  foreach ($file in @((Join-Path $Layout.DataRoot "PG_VERSION"), (Join-Path $Layout.DataRoot "global\pg_control"), (Join-Path $Layout.DataRoot "base\1\123"), (Join-Path $Layout.DataRoot "base\1\456"))) {
    Write-Utf8NoBomFile -PathValue $file -Text $(if ([System.IO.Path]::GetFileName($file) -eq "PG_VERSION") { "17" } else { "selftest" })
    Set-RestrictedAcl -PathValue $file -TargetType File
  }
}

function Invoke-CleanupPartialRealFilesystemSelfTest {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $base = Join-Path $tempRoot ("vc-cleanup-partial-selftest-" + [Guid]::NewGuid().ToString("N"))
  $packageSibling = Join-Path $base "package-out-of-scope"
  $repoSibling = Join-Path $base "repo-out-of-scope"
  try {
    [System.IO.Directory]::CreateDirectory($base) | Out-Null
    [System.IO.Directory]::CreateDirectory($packageSibling) | Out-Null
    [System.IO.Directory]::CreateDirectory($repoSibling) | Out-Null
    Write-Utf8NoBomFile -PathValue (Join-Path $packageSibling "keep.txt") -Text "package-intact"
    Write-Utf8NoBomFile -PathValue (Join-Path $repoSibling "keep.txt") -Text "repo-intact"
    $layout = New-CleanupPartialSelfTestLayout -BaseRoot $base
    Initialize-CleanupPartialSelfTestLayout -Layout $layout
    $package = Assert-PostgresTools -BinRoot $PostgresBin
    $manifest = New-CleanupPartialManifest -Layout $layout
    if ($manifest.DataFileCount -lt 4 -or $manifest.DataDirectoryCount -lt 4) { Throw-SafeError -Code "cleanup_unexpected_content" }
    Invoke-CleanupPartialManifestDelete -Layout $layout -Manifest $manifest -Package $package
    $isolatedStillExists = Test-Path -LiteralPath $layout.IsolatedRoot -PathType Container
    $packageSiblingIntact = Test-Path -LiteralPath (Join-Path $packageSibling "keep.txt") -PathType Leaf
    $repoSiblingIntact = Test-Path -LiteralPath (Join-Path $repoSibling "keep.txt") -PathType Leaf
    if ($isolatedStillExists -or -not $packageSiblingIntact -or -not $repoSiblingIntact) {
      Throw-SafeError -Code "cleanup_postcheck_failed"
    }
    $addedBase = Join-Path $base "file-added-after-manifest-case"
    $addedLayout = New-CleanupPartialSelfTestLayout -BaseRoot $addedBase
    Initialize-CleanupPartialSelfTestLayout -Layout $addedLayout
    $addedManifest = New-CleanupPartialManifest -Layout $addedLayout
    $authorizedProbeFiles = @(
      (Join-Path $addedLayout.DataRoot "PG_VERSION"),
      (Join-Path $addedLayout.DataRoot "global\pg_control"),
      (Join-Path $addedLayout.DataRoot "base\1\123"),
      $addedLayout.StatePath,
      $addedLayout.MarkerPath,
      $addedLayout.CredentialPath
    )
    $addedAfterManifestPath = Join-Path $addedLayout.DataRoot "added-after-manifest.txt"
    Write-Utf8NoBomFile -PathValue $addedAfterManifestPath -Text "added-after-manifest"
    try {
      Invoke-CleanupPartialManifestDelete -Layout $addedLayout -Manifest $addedManifest -Package $package
      Throw-SafeError -Code "cleanup_postcheck_failed"
    } catch {
      if ((Get-SafeReason -ErrorRecord $_) -ne "cleanup_state_changed") { throw }
    }
    foreach ($authorizedProbeFile in $authorizedProbeFiles) {
      if (-not (Test-Path -LiteralPath $authorizedProbeFile -PathType Leaf)) { Throw-SafeError -Code "cleanup_postcheck_failed" }
    }
    if (-not (Test-Path -LiteralPath $addedAfterManifestPath -PathType Leaf)) { Throw-SafeError -Code "cleanup_postcheck_failed" }
    if (-not (Test-Path -LiteralPath $addedLayout.InstanceRoot -PathType Container)) { Throw-SafeError -Code "cleanup_postcheck_failed" }
    if (-not (Test-Path -LiteralPath (Join-Path $packageSibling "keep.txt") -PathType Leaf)) { Throw-SafeError -Code "cleanup_postcheck_failed" }
    if (-not (Test-Path -LiteralPath (Join-Path $repoSibling "keep.txt") -PathType Leaf)) { Throw-SafeError -Code "cleanup_postcheck_failed" }
    Remove-CleanupPartialSelfTestTreeControlled -RootPath $addedBase
    Write-Output "CLEANUP_PARTIAL_FILE_ADDED_AFTER_MANIFEST_SELF_TEST_OK"
    $failureBase = Join-Path $base "failure-case"
    $failureLayout = New-CleanupPartialSelfTestLayout -BaseRoot $failureBase
    Initialize-CleanupPartialSelfTestLayout -Layout $failureLayout
    Write-Utf8NoBomFile -PathValue (Join-Path $failureLayout.InstanceRoot "unexpected.txt") -Text "unexpected"
    try { [void](New-CleanupPartialManifest -Layout $failureLayout); Throw-SafeError -Code "cleanup_postcheck_failed" } catch { $negativeReason = Get-SafeReason -ErrorRecord $_; if (@("cleanup_unexpected_content", "cleanup_failed_exact_state_invalid") -notcontains $negativeReason) { throw } }
    Remove-CleanupPartialSelfTestTreeControlled -RootPath $failureBase
    Write-Output "CLEANUP_PARTIAL_REAL_FILESYSTEM_SELF_TEST_OK"
  } finally {
    Remove-CleanupPartialSelfTestTreeControlled -RootPath $base
  }
}
function Get-CleanupPartialStateSignature {
  param([Parameter(Mandatory = $true)][object]$Layout)
  $isolatedEntriesResult = Get-CleanupDirectoryEntries -PathValue $Layout.IsolatedRoot
  Assert-CleanupDirectoryEntriesResult -Result $isolatedEntriesResult
  [string[]]$isolatedEntries = @($isolatedEntriesResult.Entries | Sort-Object)
  $instanceEntriesResult = Get-CleanupDirectoryEntries -PathValue $Layout.InstanceRoot
  Assert-CleanupDirectoryEntriesResult -Result $instanceEntriesResult
  [string[]]$instanceEntries = @($instanceEntriesResult.Entries | Sort-Object)
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
    [AllowNull()][string]$CreateApprovalToken,
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$CleanupFailedCreateApprovalToken
  )
  Set-Stage -Stage "cleanup_authorization"
  Assert-CleanupAuthorization `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $CleanupApprovalToken `
    -ExpectedCleanupApprovalToken $script:ExpectedCleanupApprovalToken `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $CreateApprovalToken `
    -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
    -ProvidedCleanupFailedCreateApprovalToken $CleanupFailedCreateApprovalToken
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
    $manifest = New-CleanupPartialManifest -Layout $layout
    $initialStateSignature = $manifest.Signature

    Set-Stage -Stage "cleanup_activity"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_revalidate_signature"
    Assert-CleanupPathFixed -Layout $layout
    Assert-CleanupPartialManifestUnchanged -Layout $layout -Manifest $manifest

    Set-Stage -Stage "cleanup_revalidate_state"
    Assert-CleanupExactPartialState -Layout $layout

    Set-Stage -Stage "cleanup_revalidate_activity"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_delete_instance"
    Assert-CleanupGitReady -RepoRoot $repoRoot
    Invoke-CleanupPartialManifestDelete -Layout $layout -Manifest $manifest -Package $package

    Set-Stage -Stage "cleanup_postcheck"
    if (Test-Path -LiteralPath $layout.InstanceRoot) {
      Throw-SafeError -Code "cleanup_postcheck_failed"
    }

    Set-Stage -Stage "cleanup_revalidate_activity_after_instance_delete"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_validate_parent_empty"
    if (Test-Path -LiteralPath $layout.IsolatedRoot) {
      $parentEntriesResult = Get-CleanupDirectoryEntries -PathValue $layout.IsolatedRoot
      Assert-CleanupDirectoryEntriesResult -Result $parentEntriesResult
      [string[]]$parentEntryValues = @($parentEntriesResult.Entries)
      if ($parentEntryValues.Count -ne 0) {
        Throw-SafeError -Code "cleanup_parent_not_empty"
      }
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

function Get-CleanupFailedCreateSafeFailure {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Stage,
    [AllowNull()][object]$Exception
  )
  $allowedStages = @(
    "cleanup_failed_layout",
    "cleanup_failed_environment",
    "cleanup_failed_git",
    "cleanup_failed_paths",
    "cleanup_failed_attributes",
    "cleanup_failed_isolated_root_acl",
    "cleanup_failed_internal_acl",
    "cleanup_failed_exact_state",
    "cleanup_failed_signature_initial",
    "cleanup_failed_activity",
    "cleanup_failed_revalidate_signature",
    "cleanup_failed_revalidate_state",
    "cleanup_failed_revalidate_activity",
    "cleanup_failed_delete_state_json",
    "cleanup_failed_delete_marker",
    "cleanup_failed_validate_state_empty",
    "cleanup_failed_delete_state_root",
    "cleanup_failed_validate_data_empty",
    "cleanup_failed_delete_data_root",
    "cleanup_failed_validate_log_empty",
    "cleanup_failed_delete_log_root",
    "cleanup_failed_validate_secret_empty",
    "cleanup_failed_delete_secret_root",
    "cleanup_failed_revalidate_activity_before_instance_delete",
    "cleanup_failed_validate_instance_empty",
    "cleanup_failed_delete_instance_root",
    "cleanup_failed_revalidate_activity_before_isolated_delete",
    "cleanup_failed_validate_isolated_empty",
    "cleanup_failed_delete_isolated_root",
    "cleanup_failed_package_postcheck",
    "cleanup_failed_final_activity",
    "cleanup_failed_postcheck",
    "cleanup_failed_preflight_unknown"
  )
  $allowedReasons = @(
    "cleanup_failed_layout_failed",
    "cleanup_failed_environment_invalid",
    "cleanup_failed_git_invalid",
    "cleanup_failed_paths_invalid",
    "cleanup_failed_attributes_invalid",
    "cleanup_failed_exact_state_invalid",
    "cleanup_failed_marker_state_invalid",
    "cleanup_failed_acl_invalid",
  "cleanup_failed_internal_acl_invalid",
  "cleanup_failed_isolated_root_acl_invalid",
  "cleanup_failed_acl_owner_invalid",
  "cleanup_failed_acl_fullcontrol_missing",
  "cleanup_failed_acl_deny_rule",
  "cleanup_failed_acl_unexpected_explicit_rule",
  "cleanup_failed_acl_identity_invalid",
  "cleanup_failed_acl_read_failed",
  "cleanup_failed_acl_enumeration_failed",
    "cleanup_failed_activity_detected",
    "cleanup_failed_state_changed",
    "cleanup_failed_delete_state_json_failed",
    "cleanup_failed_delete_marker_failed",
    "cleanup_failed_delete_state_root_failed",
    "cleanup_failed_delete_data_root_failed",
    "cleanup_failed_delete_log_root_failed",
    "cleanup_failed_delete_secret_root_failed",
    "cleanup_failed_delete_instance_root_failed",
    "cleanup_failed_delete_isolated_root_failed",
    "cleanup_failed_postcheck_failed",
    "cleanup_failed_package_modified",
    "cleanup_failed_preflight_unknown"
  )
  $allowedExceptionTypes = @(
    "UnauthorizedAccessException",
    "IOException",
    "DirectoryNotFoundException",
    "SecurityException",
    "InvalidOperationException",
    "ArgumentException",
    "MethodInvocationException",
    "PropertyNotFoundException",
    "RuntimeException",
    "ParentContainsErrorRecordException",
    "CmdletInvocationException",
    "ItemNotFoundException",
    "UnknownException"
  )
  $wrapperExceptionTypes = @("RuntimeException","ParentContainsErrorRecordException","CmdletInvocationException","MethodInvocationException")
  $safeStage = $(if ($allowedStages -contains $Stage) { $Stage } else { "cleanup_failed_preflight_unknown" })
  $safeReason = $null
  $current = $Exception
  $depth = 0
  $seenReasons = @{}
  while ($null -ne $current -and $depth -lt 8) {
    $objectId = [System.Runtime.CompilerServices.RuntimeHelpers]::GetHashCode($current)
    if ($seenReasons.ContainsKey($objectId)) { break }
    $seenReasons[$objectId] = $true
    $message = $null
    if ($current -is [System.Exception]) {
      $message = [string]$current.Message
    } elseif ($null -ne $current.PSObject.Properties["Message"]) {
      $message = [string]$current.Message
    }
    if ($null -ne $message -and $message -match "^VC_SAFE_REASON::([a-z0-9_]+)$") {
      $rawReason = $Matches[1]
      if ($allowedReasons -contains $rawReason) {
        $safeReason = $rawReason
      } else {
        $safeReason = switch ($rawReason) {
          "cleanup_layout_failed" { "cleanup_failed_layout_failed"; break }
          "cleanup_environment_invalid" { "cleanup_failed_environment_invalid"; break }
          "cleanup_git_invalid" { "cleanup_failed_git_invalid"; break }
          "cleanup_paths_invalid" { "cleanup_failed_paths_invalid"; break }
          "cleanup_path_validation_failed" { "cleanup_failed_paths_invalid"; break }
          "cleanup_attributes_invalid" { "cleanup_failed_attributes_invalid"; break }
          "cleanup_reparse_detected" { "cleanup_failed_attributes_invalid"; break }
          "cleanup_reparse_point_detected" { "cleanup_failed_attributes_invalid"; break }
          "cleanup_unexpected_content" { "cleanup_failed_exact_state_invalid"; break }
          "cleanup_instance_not_empty" { "cleanup_failed_exact_state_invalid"; break }
          "cleanup_enumeration_denied" { "cleanup_failed_exact_state_invalid"; break }
          "cleanup_enumeration_failed" { "cleanup_failed_exact_state_invalid"; break }
          "cleanup_signature_failed" { "cleanup_failed_state_changed"; break }
          "cleanup_state_changed" { "cleanup_failed_state_changed"; break }
          "cleanup_activity_detected" { "cleanup_failed_activity_detected"; break }
          "cleanup_postgres_process_detected" { "cleanup_failed_activity_detected"; break }
          "cleanup_postgres_process_ambiguous" { "cleanup_failed_activity_detected"; break }
          "cleanup_postgresql_service_running" { "cleanup_failed_activity_detected"; break }
          "cleanup_port_in_use" { "cleanup_failed_activity_detected"; break }
          "cleanup_postmaster_pid_present" { "cleanup_failed_activity_detected"; break }
          "state_schema_invalid" { "cleanup_failed_marker_state_invalid"; break }
          "state_duplicate_key" { "cleanup_failed_marker_state_invalid"; break }
          "marker_state_mismatch" { "cleanup_failed_marker_state_invalid"; break }
          "marker_missing" { "cleanup_failed_marker_state_invalid"; break }
          "marker_invalid" { "cleanup_failed_marker_state_invalid"; break }
          "acl_not_protected" { "cleanup_failed_internal_acl_invalid"; break }
          "acl_rules_missing" { "cleanup_failed_acl_read_failed"; break }
          "acl_rules_read_failed" { "cleanup_failed_acl_read_failed"; break }
          "acl_rules_collection_invalid" { "cleanup_failed_acl_enumeration_failed"; break }
          "acl_rules_enumeration_failed" { "cleanup_failed_acl_enumeration_failed"; break }
          "acl_unexpected_identity" { "cleanup_failed_acl_identity_invalid"; break }
          "acl_unexpected_deny_rule" { "cleanup_failed_acl_deny_rule"; break }
          "acl_inherited_rule_present" { "cleanup_failed_internal_acl_invalid"; break }
          "acl_missing_authorized_allow" { "cleanup_failed_acl_fullcontrol_missing"; break }
          "acl_rights_insufficient" { "cleanup_failed_acl_fullcontrol_missing"; break }
          "acl_inheritance_flags_mismatch" { "cleanup_failed_internal_acl_invalid"; break }
          "acl_propagation_flags_mismatch" { "cleanup_failed_internal_acl_invalid"; break }
          default { $null }
        }
      }
      break
    }
    $current = $(if ($current -is [System.Exception]) { $current.InnerException } elseif ($null -ne $current.PSObject.Properties["InnerException"]) { $current.InnerException } else { $null })
    $depth += 1
  }
  if ($null -ne $safeReason) {
    return [pscustomobject]@{ Reason = $safeReason; ExceptionType = $null; SafeSubstage = $safeStage }
  }
  $selectedType = $null
  $selectedWrapper = $null
  $current = $Exception
  $depth = 0
  $seenTypes = @{}
  while ($null -ne $current -and $depth -lt 8) {
    $objectId = [System.Runtime.CompilerServices.RuntimeHelpers]::GetHashCode($current)
    if ($seenTypes.ContainsKey($objectId)) { break }
    $seenTypes[$objectId] = $true
    $rawType = "UnknownException"
    if ($null -ne $current.PSObject.Properties["SimulatedTypeName"]) {
      $rawType = [string]$current.SimulatedTypeName
    } else {
      $rawType = $current.GetType().Name
    }
    $safeType = $(if ($allowedExceptionTypes -contains $rawType) { $rawType } else { "UnknownException" })
    if ($wrapperExceptionTypes -contains $safeType) {
      if ($null -eq $selectedWrapper) { $selectedWrapper = $safeType }
    } elseif ($safeType -ne "UnknownException") {
      $selectedType = $safeType
    }
    $current = $(if ($current -is [System.Exception]) { $current.InnerException } elseif ($null -ne $current.PSObject.Properties["InnerException"]) { $current.InnerException } else { $null })
    $depth += 1
  }
  $exceptionType = $(if ($null -ne $selectedType) { $selectedType } elseif ($null -ne $selectedWrapper) { $selectedWrapper } else { "UnknownException" })
  $reason = switch ($safeStage) {
    "cleanup_failed_layout" { "cleanup_failed_layout_failed"; break }
    "cleanup_failed_environment" { "cleanup_failed_environment_invalid"; break }
    "cleanup_failed_git" { "cleanup_failed_git_invalid"; break }
    "cleanup_failed_paths" { "cleanup_failed_paths_invalid"; break }
    "cleanup_failed_attributes" { "cleanup_failed_attributes_invalid"; break }
    "cleanup_failed_isolated_root_acl" { "cleanup_failed_isolated_root_acl_invalid"; break }
    "cleanup_failed_internal_acl" { "cleanup_failed_internal_acl_invalid"; break }
    "cleanup_failed_exact_state" { "cleanup_failed_exact_state_invalid"; break }
    "cleanup_failed_signature_initial" { "cleanup_failed_state_changed"; break }
    "cleanup_failed_activity" { "cleanup_failed_activity_detected"; break }
    "cleanup_failed_revalidate_signature" { "cleanup_failed_state_changed"; break }
    "cleanup_failed_revalidate_state" { "cleanup_failed_state_changed"; break }
    "cleanup_failed_revalidate_activity" { "cleanup_failed_activity_detected"; break }
    "cleanup_failed_delete_state_json" { "cleanup_failed_delete_state_json_failed"; break }
    "cleanup_failed_delete_marker" { "cleanup_failed_delete_marker_failed"; break }
    "cleanup_failed_delete_state_root" { "cleanup_failed_delete_state_root_failed"; break }
    "cleanup_failed_delete_data_root" { "cleanup_failed_delete_data_root_failed"; break }
    "cleanup_failed_delete_log_root" { "cleanup_failed_delete_log_root_failed"; break }
    "cleanup_failed_delete_secret_root" { "cleanup_failed_delete_secret_root_failed"; break }
    "cleanup_failed_revalidate_activity_before_instance_delete" { "cleanup_failed_activity_detected"; break }
    "cleanup_failed_delete_instance_root" { "cleanup_failed_delete_instance_root_failed"; break }
    "cleanup_failed_revalidate_activity_before_isolated_delete" { "cleanup_failed_activity_detected"; break }
    "cleanup_failed_delete_isolated_root" { "cleanup_failed_delete_isolated_root_failed"; break }
    "cleanup_failed_package_postcheck" { "cleanup_failed_package_modified"; break }
    "cleanup_failed_final_activity" { "cleanup_failed_activity_detected"; break }
    "cleanup_failed_postcheck" { "cleanup_failed_postcheck_failed"; break }
    default { "cleanup_failed_preflight_unknown" }
  }
  return [pscustomobject]@{ Reason = $reason; ExceptionType = $exceptionType; SafeSubstage = $safeStage }
}

function Assert-CleanupFailedCreateFileSafe {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  try {
    if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
      Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
    }
    $item = Get-Item -LiteralPath $PathValue -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or
        ($item.Attributes -band [System.IO.FileAttributes]::Hidden) -ne 0 -or
        ($item.Attributes -band [System.IO.FileAttributes]::System) -ne 0) {
      Throw-SafeError -Code "cleanup_failed_attributes_invalid"
    }
    $acl = Get-Acl -LiteralPath $PathValue
    Assert-RestrictedAclSemantics -Acl $acl -ExpectedSid ([System.Security.Principal.WindowsIdentity]::GetCurrent().User) -TargetType File
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::(cleanup_failed_|cleanup_|acl_)") { throw }
    Throw-SafeError -Code "cleanup_failed_acl_invalid"
  }
}

function Assert-CleanupFailedCreateAclRulesReadable {
  param([Parameter(Mandatory = $true)][object]$Acl)
  $rulesResult = Get-RestrictedAclRulesForValidation -Acl $Acl
  if (-not $rulesResult.Success) {
    switch ($rulesResult.SafeErrorCode) {
      "acl_rules_read_failed" { Throw-SafeError -Code "cleanup_failed_acl_read_failed" }
      "acl_rules_enumeration_failed" { Throw-SafeError -Code "cleanup_failed_acl_enumeration_failed" }
      "acl_rules_missing" { Throw-SafeError -Code "cleanup_failed_acl_read_failed" }
      default { Throw-SafeError -Code "cleanup_failed_acl_enumeration_failed" }
    }
  }
  return $rulesResult.Rules
}

function Assert-CleanupFailedCreateAclOwnerCurrent {
  param(
    [Parameter(Mandatory = $true)][object]$Acl,
    [Parameter(Mandatory = $true)][System.Security.Principal.SecurityIdentifier]$ExpectedSid
  )
  try {
    $ownerSid = $Acl.GetOwner([System.Security.Principal.SecurityIdentifier])
  } catch {
    Throw-SafeError -Code "cleanup_failed_acl_owner_invalid"
  }
  if ($null -eq $ownerSid -or -not ($ownerSid -is [System.Security.Principal.SecurityIdentifier])) {
    Throw-SafeError -Code "cleanup_failed_acl_owner_invalid"
  }
  if (-not [string]::Equals($ownerSid.Value, $ExpectedSid.Value, [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "cleanup_failed_acl_owner_invalid"
  }
}

function Assert-CleanupFailedCreateIsolatedRootSafe {
  param([Parameter(Mandatory = $true)][object]$Layout)
  try {
    $expectedRoot = Get-IsolatedRoot
    $isolatedRoot = [System.IO.Path]::GetFullPath($Layout.IsolatedRoot)
    $trimSeparators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    if (-not [string]::Equals($isolatedRoot.TrimEnd($trimSeparators), $expectedRoot.TrimEnd($trimSeparators), [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-SafeError -Code "cleanup_failed_paths_invalid"
    }
    if (-not (Test-Path -LiteralPath $isolatedRoot -PathType Container)) {
      Throw-SafeError -Code "cleanup_failed_paths_invalid"
    }
    $item = Get-Item -LiteralPath $isolatedRoot -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      Throw-SafeError -Code "cleanup_failed_attributes_invalid"
    }
    if (($item.Attributes -band [System.IO.FileAttributes]::Hidden) -ne 0 -or
        ($item.Attributes -band [System.IO.FileAttributes]::System) -ne 0) {
      Throw-SafeError -Code "cleanup_failed_attributes_invalid"
    }
    try {
      $acl = Get-Acl -LiteralPath $isolatedRoot
    } catch {
      Throw-SafeError -Code "cleanup_failed_acl_read_failed"
    }
    $expectedSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    Assert-CleanupFailedCreateAclOwnerCurrent -Acl $acl -ExpectedSid $expectedSid
    if ($acl.AreAccessRulesProtected -eq $true) {
      Assert-RestrictedAclSemantics -Acl $acl -ExpectedSid $expectedSid -TargetType Directory
    } else {
      $rules = @(Assert-CleanupFailedCreateAclRulesReadable -Acl $acl)
      if ($rules.Count -eq 0) {
        Throw-SafeError -Code "cleanup_failed_acl_fullcontrol_missing"
      }
      $requiredRights = [int64][System.Security.AccessControl.FileSystemRights]::FullControl
      $combinedAllowRights = [int64]0
      $currentAllowFound = $false
      foreach ($access in $rules) {
        if ($null -eq $access) {
          Throw-SafeError -Code "cleanup_failed_acl_enumeration_failed"
        }
        if (-not $access.IsInherited) {
          Throw-SafeError -Code "cleanup_failed_acl_unexpected_explicit_rule"
        }
        if ($access.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Deny) {
          Throw-SafeError -Code "cleanup_failed_acl_deny_rule"
        }
        if ($access.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
          Throw-SafeError -Code "cleanup_failed_acl_enumeration_failed"
        }
        $identity = Convert-IdentityReferenceToSidValue -IdentityReference $access.IdentityReference
        if (-not $identity.Success) {
          Throw-SafeError -Code "cleanup_failed_acl_identity_invalid"
        }
        if ([string]::Equals($identity.SidValue, $expectedSid.Value, [System.StringComparison]::OrdinalIgnoreCase)) {
          $currentAllowFound = $true
          $combinedAllowRights = $combinedAllowRights -bor [int64]$access.FileSystemRights
        }
      }
      if (-not $currentAllowFound -or (($combinedAllowRights -band $requiredRights) -ne $requiredRights)) {
        Throw-SafeError -Code "cleanup_failed_acl_fullcontrol_missing"
      }
    }
    Assert-CleanupFailedCreateExactEntries -PathValue $isolatedRoot -ExpectedEntries @($Layout.InstanceRoot)
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::cleanup_failed_") { throw }
    if ($_.Exception.Message -match "^VC_SAFE_REASON::acl_unexpected_deny_rule") { Throw-SafeError -Code "cleanup_failed_acl_deny_rule" }
    if ($_.Exception.Message -match "^VC_SAFE_REASON::acl_unexpected_identity|^VC_SAFE_REASON::acl_identity_") { Throw-SafeError -Code "cleanup_failed_acl_identity_invalid" }
    if ($_.Exception.Message -match "^VC_SAFE_REASON::acl_missing_authorized_allow|^VC_SAFE_REASON::acl_rights_insufficient") { Throw-SafeError -Code "cleanup_failed_acl_fullcontrol_missing" }
    if ($_.Exception.Message -match "^VC_SAFE_REASON::acl_rules_read_failed|^VC_SAFE_REASON::acl_rules_missing") { Throw-SafeError -Code "cleanup_failed_acl_read_failed" }
    if ($_.Exception.Message -match "^VC_SAFE_REASON::acl_rules_") { Throw-SafeError -Code "cleanup_failed_acl_enumeration_failed" }
    Throw-SafeError -Code "cleanup_failed_isolated_root_acl_invalid"
  }
}

function Assert-CleanupFailedCreateDirectorySafe {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  try {
    Assert-CleanupDirectorySafe -PathValue $PathValue
    $acl = Get-Acl -LiteralPath $PathValue
    Assert-RestrictedAclSemantics -Acl $acl -ExpectedSid ([System.Security.Principal.WindowsIdentity]::GetCurrent().User) -TargetType Directory
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::(cleanup_failed_|cleanup_|acl_)") { throw }
    Throw-SafeError -Code "cleanup_failed_acl_invalid"
  }
}

function Assert-CleanupFailedCreateExactEntries {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [AllowEmptyCollection()][string[]]$ExpectedEntries
  )
  $entriesResult = Get-CleanupDirectoryEntries -PathValue $PathValue
  Assert-CleanupDirectoryEntriesResult -Result $entriesResult
  [string[]]$entries = @($entriesResult.Entries)
  [string[]]$expected = @($ExpectedEntries)
  if ($entries.Count -ne $expected.Count) {
    Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
  }
  $trimSeparators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  [string[]]$actualComparable = @($entries | ForEach-Object { [System.IO.Path]::GetFullPath($_).TrimEnd($trimSeparators) } | Sort-Object)
  [string[]]$expectedComparable = @($expected | ForEach-Object { [System.IO.Path]::GetFullPath($_).TrimEnd($trimSeparators) } | Sort-Object)
  for ($i = 0; $i -lt $expectedComparable.Count; $i += 1) {
    if (-not [string]::Equals($actualComparable[$i], $expectedComparable[$i], [System.StringComparison]::OrdinalIgnoreCase)) {
      Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
    }
  }
}

function Assert-CleanupFailedCreateEmptyDirectory {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  $entriesResult = Get-CleanupDirectoryEntries -PathValue $PathValue
  Assert-CleanupDirectoryEntriesResult -Result $entriesResult
  [string[]]$entries = @($entriesResult.Entries)
  if ($entries.Count -ne 0) {
    Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
  }
}

function Assert-CleanupFailedCreateStatePayload {
  param([Parameter(Mandatory = $true)][object]$Layout)
  $marker = Read-MarkerMap -MarkerPath $Layout.MarkerPath
  $clusterId = [string]$marker["cluster_id"]
  $parsedGuid = [Guid]::Empty
  if (-not [Guid]::TryParse($clusterId, [ref]$parsedGuid)) {
    Throw-SafeError -Code "cleanup_failed_marker_state_invalid"
  }
  Assert-MarkerStateConcordance -Layout $Layout -ClusterId $clusterId
  $stateText = [System.IO.File]::ReadAllText($Layout.StatePath)
  [void](Assert-StrictFlatStateJson -JsonText $stateText)
  $state = $stateText | ConvertFrom-Json
  $allowedFailureCodes = @(
    "state_write_failed",
    "state_validate_input_failed",
    "state_get_created_utc_failed",
    "state_build_payload_failed",
    "state_serialize_json_failed",
    "state_write_temp_failed",
    "state_move_initial_failed",
    "state_replace_existing_failed",
    "state_apply_acl_failed",
    "state_acl_readback_failed",
    "state_schema_readback_failed",
    "state_marker_concordance_failed",
    "state_temp_file_residual",
    "acl_apply_failed",
    "acl_validation_failed"
  )
  if ($state.state -ne "failed" -or
      @("create_directories","state_get_created_utc") -notcontains $state.stage -or
      $state.host -ne "127.0.0.1" -or
      [int]$state.port -ne 55432 -or
      $state.instance_name -ne $script:InstanceName -or
      $state.server_state -ne "not_started" -or
      $state.initdb_completed -ne $false -or
      $state.configuration_completed -ne $false -or
      $state.server_started -ne $false -or
      $state.credential_protected -ne $false -or
      $state.plaintext_password_file_present -ne $false -or
      $state.server_cleanup_attempted -ne $false -or
      $state.server_cleanup_completed -ne $false) {
    Throw-SafeError -Code "cleanup_failed_marker_state_invalid"
  }
  if ($null -eq $state.last_error_code -or $allowedFailureCodes -notcontains [string]$state.last_error_code) {
    Throw-SafeError -Code "cleanup_failed_marker_state_invalid"
  }
  if ($state.stage -eq "state_get_created_utc" -and [string]$state.last_error_code -ne "state_get_created_utc_failed") {
    Throw-SafeError -Code "cleanup_failed_marker_state_invalid"
  }
  if ($state.stage -eq "create_directories" -and [string]$state.last_error_code -eq "state_get_created_utc_failed") {
    Throw-SafeError -Code "cleanup_failed_marker_state_invalid"
  }
}

function Assert-CleanupFailedCreateStateFileSize {
  param([Parameter(Mandatory = $true)][object]$Layout)
  try {
    $stateLength = (Get-Item -LiteralPath $Layout.StatePath -Force).Length
    $markerLength = (Get-Item -LiteralPath $Layout.MarkerPath -Force).Length
    if ($stateLength -lt 700 -or $stateLength -gt 4096) {
      Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
    }
    if ($markerLength -lt 80 -or $markerLength -gt 512) {
      Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
    }
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
  }
}
function Assert-CleanupFailedCreateExactState {
  param([Parameter(Mandatory = $true)][object]$Layout)
  Assert-CleanupFailedCreateIsolatedRootSafe -Layout $Layout
  foreach ($dir in @($Layout.InstanceRoot, $Layout.DataRoot, $Layout.LogRoot, $Layout.SecretRoot, $Layout.StateRoot)) {
    Assert-CleanupFailedCreateDirectorySafe -PathValue $dir
  }
  foreach ($file in @($Layout.StatePath, $Layout.MarkerPath)) {
    Assert-CleanupFailedCreateFileSafe -PathValue $file
  }
  Assert-CleanupFailedCreateStateFileSize -Layout $Layout
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.IsolatedRoot -ExpectedEntries @($Layout.InstanceRoot)
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.InstanceRoot -ExpectedEntries @($Layout.DataRoot, $Layout.LogRoot, $Layout.SecretRoot, $Layout.StateRoot)
  Assert-CleanupFailedCreateEmptyDirectory -PathValue $Layout.DataRoot
  Assert-CleanupFailedCreateEmptyDirectory -PathValue $Layout.LogRoot
  Assert-CleanupFailedCreateEmptyDirectory -PathValue $Layout.SecretRoot
  Assert-CleanupFailedCreateExactEntries -PathValue $Layout.StateRoot -ExpectedEntries @($Layout.StatePath, $Layout.MarkerPath)
  $stateTempEntriesResult = Get-CleanupDirectoryEntries -PathValue $Layout.StateRoot
  Assert-CleanupDirectoryEntriesResult -Result $stateTempEntriesResult
  [string[]]$stateTempEntries = @($stateTempEntriesResult.Entries)
  foreach ($entry in $stateTempEntries) {
    if ([System.IO.Path]::GetFileName($entry) -like "cluster-state.*.tmp") {
      Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
    }
  }
  foreach ($forbidden in @(
      (Join-Path $Layout.DataRoot "PG_VERSION"),
      (Join-Path $Layout.DataRoot "postmaster.pid"),
      (Join-Path $Layout.DataRoot "postgresql.conf"),
      (Join-Path $Layout.DataRoot "pg_hba.conf"),
      $Layout.CredentialPath,
      $Layout.PasswordFilePath,
      $Layout.ServerLog
    )) {
    if (Test-Path -LiteralPath $forbidden) {
      Throw-SafeError -Code "cleanup_failed_exact_state_invalid"
    }
  }
  Assert-CleanupFailedCreateStatePayload -Layout $Layout
}

function Get-CleanupFailedCreateStateSignature {
  param([Parameter(Mandatory = $true)][object]$Layout)
  $parts = @()
  foreach ($dir in @($Layout.IsolatedRoot, $Layout.InstanceRoot, $Layout.DataRoot, $Layout.LogRoot, $Layout.SecretRoot, $Layout.StateRoot)) {
    $entriesResult = Get-CleanupDirectoryEntries -PathValue $dir
    Assert-CleanupDirectoryEntriesResult -Result $entriesResult
    [string[]]$entries = @($entriesResult.Entries | Sort-Object)
    $parts += ($dir + "=" + ($entries -join "|"))
  }
  foreach ($file in @($Layout.StatePath, $Layout.MarkerPath)) {
    $item = Get-Item -LiteralPath $file -Force
    $parts += ($file + ":" + [string]$item.Length + ":" + $item.LastWriteTimeUtc.ToString("O"))
  }
  return ($parts -join "::")
}

function Invoke-CleanupFailedCreate {
  param(
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$CleanupFailedCreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCreate,
    [AllowNull()][string]$CreateApprovalToken,
    [Parameter(Mandatory = $true)][System.Management.Automation.SwitchParameter]$ConfirmCleanupPartialCreate,
    [AllowNull()][string]$CleanupApprovalToken
  )
  Set-Stage -Stage "cleanup_failed_authorization"
  Assert-CleanupFailedCreateAuthorization `
    -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
    -ProvidedCleanupFailedCreateApprovalToken $CleanupFailedCreateApprovalToken `
    -ExpectedCleanupFailedCreateApprovalToken $script:ExpectedCleanupFailedCreateApprovalToken `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $CreateApprovalToken `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $CleanupApprovalToken
  try {
    Set-Stage -Stage "cleanup_failed_layout"
    $layout = Get-InstanceLayout

    Set-Stage -Stage "cleanup_failed_environment"
    $package = Assert-CleanupEnvironment

    Set-Stage -Stage "cleanup_failed_git"
    Assert-CleanupGitReady

    Set-Stage -Stage "cleanup_failed_paths"
    Assert-CleanupPathFixed -Layout $layout

    Set-Stage -Stage "cleanup_failed_isolated_root_acl"
    Assert-CleanupFailedCreateIsolatedRootSafe -Layout $layout

    Set-Stage -Stage "cleanup_failed_internal_acl"
    foreach ($dir in @($layout.InstanceRoot, $layout.DataRoot, $layout.LogRoot, $layout.SecretRoot, $layout.StateRoot)) {
      Assert-CleanupFailedCreateDirectorySafe -PathValue $dir
    }

    Set-Stage -Stage "cleanup_failed_exact_state"
    Assert-CleanupFailedCreateExactState -Layout $layout

    Set-Stage -Stage "cleanup_failed_signature_initial"
    $initialStateSignature = Get-CleanupFailedCreateStateSignature -Layout $layout

    Set-Stage -Stage "cleanup_failed_activity"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_failed_revalidate_signature"
    $revalidatedStateSignature = Get-CleanupFailedCreateStateSignature -Layout $layout
    if (-not [string]::Equals($initialStateSignature, $revalidatedStateSignature, [System.StringComparison]::Ordinal)) {
      Throw-SafeError -Code "cleanup_failed_state_changed"
    }

    Set-Stage -Stage "cleanup_failed_revalidate_state"
    Assert-CleanupFailedCreateExactState -Layout $layout

    Set-Stage -Stage "cleanup_failed_revalidate_activity"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_failed_delete_state_json"
    try { [System.IO.File]::Delete($layout.StatePath) } catch { Throw-SafeError -Code "cleanup_failed_delete_state_json_failed" }
    if (Test-Path -LiteralPath $layout.StatePath) { Throw-SafeError -Code "cleanup_failed_postcheck_failed" }

    Set-Stage -Stage "cleanup_failed_delete_marker"
    try { [System.IO.File]::Delete($layout.MarkerPath) } catch { Throw-SafeError -Code "cleanup_failed_delete_marker_failed" }
    if (Test-Path -LiteralPath $layout.MarkerPath) { Throw-SafeError -Code "cleanup_failed_postcheck_failed" }

    Set-Stage -Stage "cleanup_failed_validate_state_empty"
    Assert-CleanupFailedCreateEmptyDirectory -PathValue $layout.StateRoot

    Set-Stage -Stage "cleanup_failed_delete_state_root"
    try { [System.IO.Directory]::Delete($layout.StateRoot, $false) } catch { Throw-SafeError -Code "cleanup_failed_delete_state_root_failed" }
    if (Test-Path -LiteralPath $layout.StateRoot) { Throw-SafeError -Code "cleanup_failed_postcheck_failed" }

    Set-Stage -Stage "cleanup_failed_validate_data_empty"
    Assert-CleanupFailedCreateEmptyDirectory -PathValue $layout.DataRoot
    Set-Stage -Stage "cleanup_failed_delete_data_root"
    try { [System.IO.Directory]::Delete($layout.DataRoot, $false) } catch { Throw-SafeError -Code "cleanup_failed_delete_data_root_failed" }
    if (Test-Path -LiteralPath $layout.DataRoot) { Throw-SafeError -Code "cleanup_failed_postcheck_failed" }

    Set-Stage -Stage "cleanup_failed_validate_log_empty"
    Assert-CleanupFailedCreateEmptyDirectory -PathValue $layout.LogRoot
    Set-Stage -Stage "cleanup_failed_delete_log_root"
    try { [System.IO.Directory]::Delete($layout.LogRoot, $false) } catch { Throw-SafeError -Code "cleanup_failed_delete_log_root_failed" }
    if (Test-Path -LiteralPath $layout.LogRoot) { Throw-SafeError -Code "cleanup_failed_postcheck_failed" }

    Set-Stage -Stage "cleanup_failed_validate_secret_empty"
    Assert-CleanupFailedCreateEmptyDirectory -PathValue $layout.SecretRoot
    Set-Stage -Stage "cleanup_failed_delete_secret_root"
    try { [System.IO.Directory]::Delete($layout.SecretRoot, $false) } catch { Throw-SafeError -Code "cleanup_failed_delete_secret_root_failed" }
    if (Test-Path -LiteralPath $layout.SecretRoot) { Throw-SafeError -Code "cleanup_failed_postcheck_failed" }

    Set-Stage -Stage "cleanup_failed_revalidate_activity_before_instance_delete"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_failed_validate_instance_empty"
    Assert-CleanupFailedCreateEmptyDirectory -PathValue $layout.InstanceRoot

    Set-Stage -Stage "cleanup_failed_delete_instance_root"
    try { [System.IO.Directory]::Delete($layout.InstanceRoot, $false) } catch { Throw-SafeError -Code "cleanup_failed_delete_instance_root_failed" }
    if (Test-Path -LiteralPath $layout.InstanceRoot) { Throw-SafeError -Code "cleanup_failed_postcheck_failed" }

    Set-Stage -Stage "cleanup_failed_revalidate_activity_before_isolated_delete"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Set-Stage -Stage "cleanup_failed_validate_isolated_empty"
    Assert-CleanupFailedCreateEmptyDirectory -PathValue $layout.IsolatedRoot

    Set-Stage -Stage "cleanup_failed_delete_isolated_root"
    try { [System.IO.Directory]::Delete($layout.IsolatedRoot, $false) } catch { Throw-SafeError -Code "cleanup_failed_delete_isolated_root_failed" }
    if (Test-Path -LiteralPath $layout.IsolatedRoot) { Throw-SafeError -Code "cleanup_failed_postcheck_failed" }

    Set-Stage -Stage "cleanup_failed_package_postcheck"
    [void](Assert-PostgresTools -BinRoot $PostgresBin)

    Set-Stage -Stage "cleanup_failed_final_activity"
    Assert-CleanupNoPostgresActivity -Package $package -Layout $layout

    Write-Output "FAILED_CREATE_CLEANUP_OK"
    Write-Output "isolated_root_removed=true"
    Write-Output "instance_root_removed=true"
    Write-Output "state_json_removed=true"
    Write-Output "marker_removed=true"
    Write-Output "state_root_removed=true"
    Write-Output "data_root_removed=true"
    Write-Output "log_root_removed=true"
    Write-Output "secret_root_removed=true"
    Write-Output "postgres_process_detected=false"
    Write-Output "postgres_service_detected=false"
    Write-Output "port_55432_listening=false"
    Write-Output "sql_executed=false"
    Write-Output "production_connection_used=false"
    Write-Output "package_directory_modified=false"
    Write-Output "ready_for_create_recheck=true"
  } catch {
    $failure = Get-CleanupFailedCreateSafeFailure -Stage $script:CurrentStage -Exception $_.Exception
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
    $acl = if ($TargetType -eq "Directory") {
      [System.Security.AccessControl.DirectorySecurity]::new()
    } else {
      [System.Security.AccessControl.FileSecurity]::new()
    }
    $acl.SetAccessRuleProtection($true, $false)
    $inherit = if ($TargetType -eq "Directory") {
      [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"
    } else {
      [System.Security.AccessControl.InheritanceFlags]"None"
    }
    $propagation = [System.Security.AccessControl.PropagationFlags]"None"
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, "FullControl", $inherit, $propagation, "Allow")
    $acl.AddAccessRule($rule)
    if ($TargetType -eq "Directory") {
      [System.IO.Directory]::SetAccessControl($PathValue, $acl)
    } else {
      [System.IO.File]::SetAccessControl($PathValue, $acl)
    }
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
function Assert-StateRootChildFilePath {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][bool]$MustExist
  )
  try {
    if ([string]::IsNullOrWhiteSpace($PathValue) -or [string]::IsNullOrWhiteSpace($StateRoot)) { Throw-SafeError -Code "state_validate_input_failed" }
    $full = [System.IO.Path]::GetFullPath($PathValue)
    $root = [System.IO.Path]::GetFullPath($StateRoot)
    $parent = [System.IO.Path]::GetFullPath((Split-Path -Parent $full))
    $leaf = [System.IO.Path]::GetFileName($full)
    if (-not [string]::Equals($parent.TrimEnd('\'), $root.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) { Throw-SafeError -Code "state_validate_input_failed" }
    if ($leaf -notmatch $Pattern) { Throw-SafeError -Code "state_validate_input_failed" }
    if ($MustExist -and -not (Test-Path -LiteralPath $full -PathType Leaf)) { Throw-SafeError -Code "state_validate_input_failed" }
    if (Test-Path -LiteralPath $full) {
      $item = Get-Item -LiteralPath $full -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::Directory) -ne 0 -or
          ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Throw-SafeError -Code "state_validate_input_failed"
      }
      if ($item.Length -lt 100 -or $item.Length -gt 4096) { Throw-SafeError -Code "state_validate_input_failed" }
    }
    return $full
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "state_validate_input_failed"
  }
}

function New-StateRootGuidFilePath {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][ValidateSet("tmp","bak")][string]$Kind
  )
  $suffix = if ($Kind -eq "tmp") { ".tmp" } else { ".bak" }
  $path = Join-Path $StateRoot ("cluster-state." + [Guid]::NewGuid().ToString("N") + $suffix)
  [void](Assert-StateRootChildFilePath -PathValue $path -StateRoot $StateRoot -Pattern ("^cluster-state\.[0-9a-f]{32}\" + $suffix + "$") -MustExist:$false)
  return $path
}

function Test-ExclusiveFileOpen {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) { return $false }
  $stream = $null
  try {
    $stream = [System.IO.File]::Open($PathValue, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $stream) { $stream.Dispose() }
  }
}

function Get-StateReplaceFailureClassification {
  param(
    [AllowNull()][object]$Exception,
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][string]$BackupPath
  )
  $current = $Exception
  $selected = $null
  $depth = 0
  while ($null -ne $current -and $depth -lt 8) {
    if ($current -is [System.IO.IOException] -or
        $current -is [System.UnauthorizedAccessException] -or
        $current -is [System.PlatformNotSupportedException]) {
      $selected = $current
      break
    }
    if ($current -is [System.Exception]) { $current = $current.InnerException } else { $current = $null }
    $depth += 1
  }
  if ($null -eq $selected -and $Exception -is [System.Exception]) { $selected = $Exception }
  $type = if ($null -ne $selected) { $selected.GetType().Name } else { "UnknownException" }
  if (@("IOException","UnauthorizedAccessException","PlatformNotSupportedException","RuntimeException","MethodInvocationException") -notcontains $type) { $type = "UnknownException" }
  $hresult = "0x00000000"
  if ($null -ne $selected) { $hresult = ("0x{0:X8}" -f ($selected.HResult -band 0xffffffff)) }
  $category = switch ($type) {
    "IOException" { "io_exception"; break }
    "UnauthorizedAccessException" { "unauthorized_access"; break }
    "PlatformNotSupportedException" { "platform_not_supported"; break }
    default { "unknown_exception" }
  }
  $sourceExists = Test-Path -LiteralPath $SourcePath -PathType Leaf
  $destExists = Test-Path -LiteralPath $DestinationPath -PathType Leaf
  $backupExists = Test-Path -LiteralPath $BackupPath -PathType Leaf
  $sourceOpen = Test-ExclusiveFileOpen -PathValue $SourcePath
  $destOpen = Test-ExclusiveFileOpen -PathValue $DestinationPath
  $backupOpen = Test-ExclusiveFileOpen -PathValue $BackupPath
  return [pscustomobject]@{
    Type = $type
    HResult = $hresult
    Category = $category
    IsIOException = [bool]($type -eq "IOException")
    IsUnauthorizedAccessException = [bool]($type -eq "UnauthorizedAccessException")
    IsPlatformNotSupportedException = [bool]($type -eq "PlatformNotSupportedException")
    SourceExists = [bool]$sourceExists
    DestinationExists = [bool]$destExists
    BackupExists = [bool]$backupExists
    SourceExclusiveOpen = [bool]$sourceOpen
    DestinationExclusiveOpen = [bool]$destOpen
    BackupExclusiveOpen = [bool]$backupOpen
  }
}

function Set-StateReplaceFailureTelemetry {
  param([Parameter(Mandatory = $true)][object]$Info)
  $script:CurrentExceptionType = [string]$Info.Type
  $script:CurrentSecondaryReason = ("state_replace_category={0};hresult={1};io={2};unauthorized={3};platform={4};source_exists={5};destination_exists={6};backup_exists={7};source_exclusive={8};destination_exclusive={9};backup_exclusive={10}" -f `
    $Info.Category,
    $Info.HResult,
    ([string]$Info.IsIOException).ToLowerInvariant(),
    ([string]$Info.IsUnauthorizedAccessException).ToLowerInvariant(),
    ([string]$Info.IsPlatformNotSupportedException).ToLowerInvariant(),
    ([string]$Info.SourceExists).ToLowerInvariant(),
    ([string]$Info.DestinationExists).ToLowerInvariant(),
    ([string]$Info.BackupExists).ToLowerInvariant(),
    ([string]$Info.SourceExclusiveOpen).ToLowerInvariant(),
    ([string]$Info.DestinationExclusiveOpen).ToLowerInvariant(),
    ([string]$Info.BackupExclusiveOpen).ToLowerInvariant())
}

function Assert-StateJsonPayloadFile {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$ExpectedClusterId,
    [Parameter(Mandatory = $true)][string]$ExpectedCreatedUtc,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ExpectedUpdatedUtc,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ExpectedState,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ExpectedStage
  )
  $text = [System.IO.File]::ReadAllText($PathValue)
  [void](Assert-StrictFlatStateJson -JsonText $text)
  $state = $text | ConvertFrom-Json
  if ($state.artifact_type -ne "voto_claro_isolated_baseline_cluster_state" -or
      [int]$state.schema_version -ne 1 -or
      $state.cluster_id -ne $ExpectedClusterId -or
      $state.instance_name -ne $script:InstanceName -or
      $state.host -ne "127.0.0.1" -or
      [int]$state.port -ne 55432 -or
      [string]$state.created_utc -ne $ExpectedCreatedUtc) {
    Throw-SafeError -Code "state_schema_invalid"
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedUpdatedUtc) -and [string]$state.updated_utc -ne $ExpectedUpdatedUtc) { Throw-SafeError -Code "state_schema_invalid" }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedState) -and [string]$state.state -ne $ExpectedState) { Throw-SafeError -Code "state_schema_invalid" }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedStage) -and [string]$state.stage -ne $ExpectedStage) { Throw-SafeError -Code "state_schema_invalid" }
}

function Invoke-StateFileReplace {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$TempPath,
    [Parameter(Mandatory = $true)][string]$ClusterId,
    [Parameter(Mandatory = $true)][string]$ExpectedCreatedUtc,
    [Parameter(Mandatory = $true)][string]$ExpectedUpdatedUtc,
    [Parameter(Mandatory = $true)][string]$ExpectedState,
    [Parameter(Mandatory = $true)][string]$ExpectedStage
  )
  $backup = New-StateRootGuidFilePath -StateRoot $Layout.StateRoot -Kind "bak"
  try {
    [void](Assert-StateRootChildFilePath -PathValue $TempPath -StateRoot $Layout.StateRoot -Pattern '^cluster-state\.[0-9a-f]{32}\.tmp$' -MustExist:$true)
    [void](Assert-StateRootChildFilePath -PathValue $Layout.StatePath -StateRoot $Layout.StateRoot -Pattern '^cluster-state\.json$' -MustExist:$true)
    Set-RestrictedAcl -PathValue $TempPath -TargetType File
    $tmpAcl = Get-Acl -LiteralPath $TempPath
    Assert-RestrictedAclSemantics -Acl $tmpAcl -ExpectedSid ([System.Security.Principal.WindowsIdentity]::GetCurrent().User) -TargetType File
    Assert-StateJsonPayloadFile -PathValue $TempPath -ExpectedClusterId $ClusterId -ExpectedCreatedUtc $ExpectedCreatedUtc -ExpectedUpdatedUtc $ExpectedUpdatedUtc -ExpectedState $ExpectedState -ExpectedStage $ExpectedStage
    [System.IO.File]::Replace($TempPath, $Layout.StatePath, $backup, $true)
    if (Test-Path -LiteralPath $TempPath -PathType Leaf) { Throw-SafeError -Code "state_temp_file_residual" }
    if (-not (Test-Path -LiteralPath $Layout.StatePath -PathType Leaf)) { Throw-SafeError -Code "state_replace_existing_failed" }
    Set-RestrictedAcl -PathValue $Layout.StatePath -TargetType File
    Assert-StateJsonPayloadFile -PathValue $Layout.StatePath -ExpectedClusterId $ClusterId -ExpectedCreatedUtc $ExpectedCreatedUtc -ExpectedUpdatedUtc $ExpectedUpdatedUtc -ExpectedState $ExpectedState -ExpectedStage $ExpectedStage
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      Set-RestrictedAcl -PathValue $backup -TargetType File
      [System.IO.File]::Delete($backup)
    }
    if (Test-Path -LiteralPath $backup -PathType Leaf) { Throw-SafeError -Code "state_temp_file_residual" }
  } catch {
    $info = Get-StateReplaceFailureClassification -Exception $_.Exception -SourcePath $TempPath -DestinationPath $Layout.StatePath -BackupPath $backup
    Set-StateReplaceFailureTelemetry -Info $info
    if ((Get-SafeReason -ErrorRecord $_) -eq "state_temp_file_residual") { Throw-SafeError -Code "state_temp_file_residual" }
    Throw-SafeError -Code "state_replace_existing_failed"
  }
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

function Convert-ClusterStateUtcForValidation {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value,
    [Parameter(Mandatory = $true)][string]$FailureCode
  )
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Throw-SafeError -Code $FailureCode
  }
  $parsed = [DateTimeOffset]::MinValue
  $styles = [System.Globalization.DateTimeStyles]::RoundtripKind
  if (-not [DateTimeOffset]::TryParseExact($Value, "o", [System.Globalization.CultureInfo]::InvariantCulture, $styles, [ref]$parsed)) {
    Throw-SafeError -Code $FailureCode
  }
  if ($parsed.Offset -ne [TimeSpan]::Zero) {
    Throw-SafeError -Code $FailureCode
  }
  return $parsed
}

function Get-StableCreatedUtc {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$ClusterId,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$FallbackCreatedUtc
  )
  $operationUtc = Convert-ClusterStateUtcForValidation -Value $FallbackCreatedUtc -FailureCode "state_get_created_utc_failed"
  if (-not (Test-Path -LiteralPath $Layout.StatePath -PathType Leaf)) {
    return $FallbackCreatedUtc
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
      Throw-SafeError -Code "state_get_created_utc_failed"
    }
    $existingCreatedUtc = Convert-ClusterStateUtcForValidation -Value ([string]$existing.created_utc) -FailureCode "state_get_created_utc_failed"
    if ($existingCreatedUtc -gt $operationUtc) {
      Throw-SafeError -Code "state_get_created_utc_failed"
    }
    return [string]$existing.created_utc
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::") { throw }
    Throw-SafeError -Code "state_get_created_utc_failed"
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
  $previousStage = $script:CurrentStage
  $now = $null
  $createdUtc = $null
  $payload = $null
  $json = $null
  $tmp = $null

  Set-Stage -Stage "state_validate_input"
  try {
    if ($script:CreateStates -notcontains $State) { Throw-SafeError -Code "state_validate_input_failed" }
    if ([string]::IsNullOrWhiteSpace($ClusterId) -or [string]::IsNullOrWhiteSpace($Stage)) { Throw-SafeError -Code "state_validate_input_failed" }
    if (-not (Test-Path -LiteralPath $Layout.StateRoot -PathType Container)) { Throw-SafeError -Code "state_validate_input_failed" }
    $residualTemps = @(Get-ChildItem -LiteralPath $Layout.StateRoot -Force -File -ErrorAction Stop | Where-Object { $_.Name -match '^cluster-state\.[0-9a-f]{32}\.(tmp|bak)$' })
    if ($residualTemps.Count -ne 0) { Throw-SafeError -Code "state_temp_file_residual" }
    $operationUtc = [DateTimeOffset]::UtcNow
    if ($operationUtc.Offset -ne [TimeSpan]::Zero) { Throw-SafeError -Code "state_validate_input_failed" }
    $now = $operationUtc.ToString("o")
    [void](Convert-ClusterStateUtcForValidation -Value $now -FailureCode "state_validate_input_failed")
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_validate_input"
    if ((Get-SafeReason -ErrorRecord $_) -eq "state_temp_file_residual") { Throw-SafeError -Code "state_temp_file_residual" }
    Throw-SafeError -Code "state_validate_input_failed"
  }

  Set-Stage -Stage "state_get_created_utc"
  try {
    $createdUtc = Get-StableCreatedUtc -Layout $Layout -ClusterId $ClusterId -FallbackCreatedUtc $now
    $createdUtcParsed = Convert-ClusterStateUtcForValidation -Value $createdUtc -FailureCode "state_get_created_utc_failed"
    $operationUtcParsed = Convert-ClusterStateUtcForValidation -Value $now -FailureCode "state_get_created_utc_failed"
    if ($createdUtcParsed -gt $operationUtcParsed) { Throw-SafeError -Code "state_get_created_utc_failed" }
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_get_created_utc"
    Throw-SafeError -Code "state_get_created_utc_failed"
  }

  Set-Stage -Stage "state_build_payload"
  try {
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
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_build_payload"
    Throw-SafeError -Code "state_build_payload_failed"
  }

  Set-Stage -Stage "state_serialize_json"
  try {
    $json = $payload | ConvertTo-Json -Depth 4
    [void](Assert-StrictFlatStateJson -JsonText $json)
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_serialize_json"
    Throw-SafeError -Code "state_serialize_json_failed"
  }

  Set-Stage -Stage "state_write_temp"
  try {
    $tmp = New-StateRootGuidFilePath -StateRoot $Layout.StateRoot -Kind "tmp"
    Write-Utf8NoBomFile -PathValue $tmp -Text $json
    if (-not (Test-Path -LiteralPath $tmp -PathType Leaf)) { Throw-SafeError -Code "state_write_temp_failed" }
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_write_temp"
    Throw-SafeError -Code "state_write_temp_failed"
  }

  if (Test-Path -LiteralPath $Layout.StatePath -PathType Leaf) {
    Set-Stage -Stage "state_replace_existing"
    try {
      Invoke-StateFileReplace -Layout $Layout -TempPath $tmp -ClusterId $ClusterId -ExpectedCreatedUtc $createdUtc -ExpectedUpdatedUtc $now -ExpectedState $State -ExpectedStage $Stage
      Set-Stage -Stage $previousStage
    } catch {
      Set-Stage -Stage "state_replace_existing"
      if ((Get-SafeReason -ErrorRecord $_) -eq "state_temp_file_residual") { Throw-SafeError -Code "state_temp_file_residual" }
      if ((Get-SafeReason -ErrorRecord $_) -eq "state_replace_existing_failed") { Throw-SafeError -Code "state_replace_existing_failed" }
      Throw-SafeError -Code "state_replace_existing_failed"
    }
  } else {
    Set-Stage -Stage "state_move_initial"
    try {
      [System.IO.File]::Move($tmp, $Layout.StatePath)
      if (Test-Path -LiteralPath $tmp -PathType Leaf) { Throw-SafeError -Code "state_temp_file_residual" }
      Set-Stage -Stage $previousStage
    } catch {
      Set-Stage -Stage "state_move_initial"
      if ((Get-SafeReason -ErrorRecord $_) -eq "state_temp_file_residual") { Throw-SafeError -Code "state_temp_file_residual" }
      Throw-SafeError -Code "state_move_initial_failed"
    }
  }

  Set-Stage -Stage "state_apply_acl"
  try {
    Set-RestrictedAcl -PathValue $Layout.StatePath -TargetType File
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_apply_acl"
    $aclReason = Get-SafeReason -ErrorRecord $_
    if ($aclReason -match '^acl_(readback|rules|identity|unexpected|inherited|missing|rights|inheritance|propagation|not_protected|validation)') { Throw-SafeError -Code "state_acl_readback_failed" }
    Throw-SafeError -Code "state_apply_acl_failed"
  }

  Set-Stage -Stage "state_acl_readback"
  try {
    $stateAcl = Get-Acl -LiteralPath $Layout.StatePath
    Assert-RestrictedAclSemantics -Acl $stateAcl -ExpectedSid ([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value) -TargetType File
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_acl_readback"
    Throw-SafeError -Code "state_acl_readback_failed"
  }

  Set-Stage -Stage "state_schema_readback"
  try {
    $stateText = [System.IO.File]::ReadAllText($Layout.StatePath)
    [void](Assert-StrictFlatStateJson -JsonText $stateText)
    [void]($stateText | ConvertFrom-Json)
    $residualTemps = @(Get-ChildItem -LiteralPath $Layout.StateRoot -Force -File -ErrorAction Stop | Where-Object { $_.Name -match '^cluster-state\.[0-9a-f]{32}\.(tmp|bak)$' })
    if ($residualTemps.Count -ne 0) { Throw-SafeError -Code "state_temp_file_residual" }
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_schema_readback"
    if ((Get-SafeReason -ErrorRecord $_) -eq "state_temp_file_residual") { Throw-SafeError -Code "state_temp_file_residual" }
    Throw-SafeError -Code "state_schema_readback_failed"
  }
}

function Assert-CreateStateMarkerConcordance {
  param(
    [Parameter(Mandatory = $true)][object]$Layout,
    [Parameter(Mandatory = $true)][string]$ClusterId
  )
  $previousStage = $script:CurrentStage
  Set-Stage -Stage "state_marker_concordance"
  try {
    Assert-MarkerStateConcordance -Layout $Layout -ClusterId $ClusterId
    Set-Stage -Stage $previousStage
  } catch {
    Set-Stage -Stage "state_marker_concordance"
    Throw-SafeError -Code "state_marker_concordance_failed"
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
    if ($null -ne $stdoutTask -and $stdoutTask.IsCompleted) { try { $stdoutTask.Dispose() } catch { } }
    if ($null -ne $stderrTask -and $stderrTask.IsCompleted) { try { $stderrTask.Dispose() } catch { } }
    try { $process.Dispose() } catch { }
  }
}

function Read-PersistentProcessOutputTail {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  try {
    if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
      return [pscustomobject]@{ Ok = $false; SafeErrorCode = "persistent_process_output_missing"; Tail = "" }
    }
    $stream = $null
    $reader = $null
    try {
      $stream = [System.IO.FileStream]::new($PathValue, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.UTF8Encoding]::new($false), $true)
      $text = $reader.ReadToEnd()
    } finally {
      if ($null -ne $reader) { $reader.Dispose() }
      elseif ($null -ne $stream) { $stream.Dispose() }
    }
    return [pscustomobject]@{ Ok = $true; SafeErrorCode = "none"; Tail = (Get-SafeOutputTail -Text $text) }
  } catch {
    return [pscustomobject]@{ Ok = $false; SafeErrorCode = "persistent_process_output_read_failed"; Tail = "" }
  }
}

function Invoke-PersistentChildSafeProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
    [Parameter(Mandatory = $true)][string]$ToolName
  )
  if (-not [System.IO.Path]::IsPathRooted($FilePath) -or -not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { Throw-SafeError -Code "postgres_tools_missing" }
  if (-not (Test-Path -LiteralPath $WorkingDirectory -PathType Container)) { Throw-SafeError -Code "postgres_tools_missing" }
  if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) { Throw-SafeError -Code "postgres_tools_missing" }
  $workFull = [System.IO.Path]::GetFullPath($WorkingDirectory)
  $outFull = [System.IO.Path]::GetFullPath($OutputDirectory)
  if (-not (Test-IsInsideDirectory -ChildPath $outFull -ParentPath $workFull)) { Throw-SafeError -Code "postgres_tools_missing" }
  $runId = [Guid]::NewGuid().ToString("N")
  $stdoutPath = Join-Path $outFull ("persistent-child." + $runId + ".stdout.log")
  $stderrPath = Join-Path $outFull ("persistent-child." + $runId + ".stderr.log")
  if (-not ("VotoClaroPersistentChildProcess" -as [type])) {
    $sourceLines = @(
      'using System;',
      'using System.IO;',
      'using System.Runtime.InteropServices;',
      'public static class VotoClaroPersistentChildProcess {',
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct STARTUPINFO {',
      '    public UInt32 cb; public IntPtr lpReserved; public IntPtr lpDesktop; public IntPtr lpTitle;',
      '    public UInt32 dwX; public UInt32 dwY; public UInt32 dwXSize; public UInt32 dwYSize;',
      '    public UInt32 dwXCountChars; public UInt32 dwYCountChars; public UInt32 dwFillAttribute;',
      '    public UInt32 dwFlags; public UInt16 wShowWindow; public UInt16 cbReserved2;',
      '    public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;',
      '  }',
      '  [StructLayout(LayoutKind.Sequential)] public struct PROCESS_INFORMATION {',
      '    public IntPtr hProcess; public IntPtr hThread; public UInt32 dwProcessId; public UInt32 dwThreadId;',
      '  }',
      '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool CreateProcessW(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, UInt32 flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetStdHandle(Int32 n);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetCurrentProcess();',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool DuplicateHandle(IntPtr sp, IntPtr sh, IntPtr tp, ref IntPtr th, UInt32 access, bool inherit, UInt32 opts);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern UInt32 WaitForSingleObject(IntPtr h, UInt32 ms);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool TerminateProcess(IntPtr h, UInt32 exitCode);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetExitCodeProcess(IntPtr h, out UInt32 exitCode);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);',
      '  private static string Quote(string value) {',
      '    if (value == null) { value = String.Empty; }',
      '    if (value.Length == 0) { return "\"\""; }',
      '    bool needs = false;',
      '    for (int i = 0; i < value.Length; i++) { char c = value[i]; if (Char.IsWhiteSpace(c) || c == ''"'') { needs = true; break; } }',
      '    if (!needs) { return value; }',
      '    System.Text.StringBuilder b = new System.Text.StringBuilder(); b.Append(''"''); int slash = 0;',
      '    foreach (char c in value) {',
      '      if (c == ''\\'') { slash++; continue; }',
      '      if (c == ''"'') { b.Append(''\\'', slash * 2 + 1); b.Append(''"''); slash = 0; continue; }',
      '      if (slash > 0) { b.Append(''\\'', slash); slash = 0; }',
      '      b.Append(c);',
      '    }',
      '    if (slash > 0) { b.Append(''\\'', slash * 2); } b.Append(''"''); return b.ToString();',
      '  }',
      '  public static int[] Run(string file, string[] args, string cwd, string stdout, string stderr, int timeoutMs) {',
      '    string cmd = Quote(file); foreach (string a in args) { cmd += " " + Quote(a); }',
      '    using (FileStream outStream = new FileStream(stdout, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))',
      '    using (FileStream errStream = new FileStream(stderr, FileMode.Create, FileAccess.Write, FileShare.ReadWrite)) {',
      '      IntPtr current = GetCurrentProcess(); IntPtr hIn = IntPtr.Zero; IntPtr hOut = IntPtr.Zero; IntPtr hErr = IntPtr.Zero;',
      '      DuplicateHandle(current, GetStdHandle(-10), current, ref hIn, 0, true, 2);',
      '      if (!DuplicateHandle(current, outStream.SafeFileHandle.DangerousGetHandle(), current, ref hOut, 0, true, 2)) { return new int[] { -1, 0, 0, 0 }; }',
      '      if (!DuplicateHandle(current, errStream.SafeFileHandle.DangerousGetHandle(), current, ref hErr, 0, true, 2)) { if (hOut != IntPtr.Zero) CloseHandle(hOut); return new int[] { -1, 0, 0, 0 }; }',
      '      STARTUPINFO si = new STARTUPINFO(); si.cb = (UInt32)Marshal.SizeOf(typeof(STARTUPINFO)); si.dwFlags = 0x00000100; si.hStdInput = hIn; si.hStdOutput = hOut; si.hStdError = hErr;',
      '      PROCESS_INFORMATION pi; bool ok = CreateProcessW(file, cmd, IntPtr.Zero, IntPtr.Zero, true, 0, IntPtr.Zero, cwd, ref si, out pi);',
      '      if (hIn != IntPtr.Zero) CloseHandle(hIn); if (hOut != IntPtr.Zero) CloseHandle(hOut); if (hErr != IntPtr.Zero) CloseHandle(hErr);',
      '      if (!ok) { return new int[] { -1, 0, 0, 0 }; }',
      '      if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);',
      '      UInt32 wait = WaitForSingleObject(pi.hProcess, (UInt32)timeoutMs);',
      '      if (wait == 258) { TerminateProcess(pi.hProcess, 1); CloseHandle(pi.hProcess); return new int[] { -1, 1, 1, 1 }; }',
      '      UInt32 exitCode; if (!GetExitCodeProcess(pi.hProcess, out exitCode)) { CloseHandle(pi.hProcess); return new int[] { -1, 0, 0, 1 }; }',
      '      CloseHandle(pi.hProcess); return new int[] { unchecked((int)exitCode), 0, 0, 1 };',
      '    }',
      '  }',
      '}'
    )
    Add-Type -TypeDefinition ($sourceLines -join "`r`n")
  }
  try {
    $native = [VotoClaroPersistentChildProcess]::Run($FilePath, [string[]]$Arguments, $WorkingDirectory, $stdoutPath, $stderrPath, ($TimeoutSeconds * 1000))
  } catch {
    return [pscustomobject]@{ Tool = $ToolName; ExitCode = $null; TimedOut = $false; ProcessKilled = $false; OutputDrainCompleted = $true; Success = $false; SafeErrorCode = ($ToolName + "_failed"); StdOut = ""; StdErr = ""; StdOutTailSanitized = ""; StdErrTailSanitized = ""; PersistentChildStrategy = "FILE_REDIRECT_NATIVE" }
  }
  $stdout = Read-PersistentProcessOutputTail -PathValue $stdoutPath
  $stderr = Read-PersistentProcessOutputTail -PathValue $stderrPath
  $exitCode = [int]$native[0]
  $timedOut = ([int]$native[1] -eq 1)
  $killed = ([int]$native[2] -eq 1)
  $started = ([int]$native[3] -eq 1)
  $success = ($started -and -not $timedOut -and $exitCode -eq 0)
  if (-not $started) { $success = $false }
  if (-not $stdout.Ok -and -not $success) {
    return [pscustomobject]@{ Tool = $ToolName; ExitCode = $exitCode; TimedOut = $timedOut; ProcessKilled = $killed; OutputDrainCompleted = $true; Success = $false; SafeErrorCode = $stdout.SafeErrorCode; StdOut = ""; StdErr = ""; StdOutTailSanitized = ""; StdErrTailSanitized = ""; PersistentChildStrategy = "FILE_REDIRECT_NATIVE" }
  }
  if (-not $stderr.Ok -and -not $success) {
    return [pscustomobject]@{ Tool = $ToolName; ExitCode = $exitCode; TimedOut = $timedOut; ProcessKilled = $killed; OutputDrainCompleted = $true; Success = $false; SafeErrorCode = $stderr.SafeErrorCode; StdOut = $(if ($stdout.Ok) { $stdout.Tail } else { "" }); StdErr = ""; StdOutTailSanitized = $(if ($stdout.Ok) { $stdout.Tail } else { "" }); StdErrTailSanitized = ""; PersistentChildStrategy = "FILE_REDIRECT_NATIVE" }
  }
  $stdoutTail = if ($stdout.Ok) { $stdout.Tail } else { "" }
  $stderrTail = if ($stderr.Ok) { $stderr.Tail } else { "" }
  $safeCode = if ($success) { "none" } elseif ($timedOut) { $ToolName + "_timeout" } else { $ToolName + "_failed" }
  return [pscustomobject]@{ Tool = $ToolName; ExitCode = $exitCode; TimedOut = $timedOut; ProcessKilled = $killed; OutputDrainCompleted = $true; Success = $success; SafeErrorCode = $safeCode; StdOut = $stdoutTail; StdErr = $stderrTail; StdOutTailSanitized = $stdoutTail; StdErrTailSanitized = $stderrTail; PersistentChildStrategy = "FILE_REDIRECT_NATIVE" }
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
    [AllowNull()][string]$CleanupApprovalToken,
    [System.Management.Automation.SwitchParameter]$ConfirmCleanupFailedCreate,
    [AllowNull()][string]$CleanupFailedCreateApprovalToken
  )
  Set-Stage -Stage "create_authorization"
  Assert-CreateAuthorization `
    -ConfirmCreate:$ConfirmCreate `
    -ProvidedCreateApprovalToken $CreateApprovalToken `
    -ExpectedCreateApprovalToken $script:ExpectedCreateApprovalToken `
    -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
    -ProvidedCleanupApprovalToken $CleanupApprovalToken `
    -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
    -ProvidedCleanupFailedCreateApprovalToken $CleanupFailedCreateApprovalToken
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
    if (-not (Test-Path -LiteralPath $layout.IsolatedRoot -PathType Container)) {
      New-Item -ItemType Directory -Path $layout.IsolatedRoot -ErrorAction Stop | Out-Null
    }
    Set-RestrictedAcl -PathValue $layout.IsolatedRoot -TargetType Directory
    foreach ($dir in @($layout.InstanceRoot, $layout.DataRoot, $layout.LogRoot, $layout.StateRoot, $layout.SecretRoot)) {
      New-Item -ItemType Directory -Path $dir -ErrorAction Stop | Out-Null
      Set-RestrictedAcl -PathValue $dir -TargetType Directory
    }
    Assert-CreateLayout -Layout $layout -RepoRoot $repoRoot
    $markerText = New-MarkerText -ClusterId $clusterId -LocalPort 55432
    Write-Utf8NoBomFile -PathValue $layout.MarkerPath -Text ($markerText -join "`n")
    Set-RestrictedAcl -PathValue $layout.MarkerPath -TargetType File
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "initializing" -Stage "initdb"
    Assert-CreateStateMarkerConcordance -Layout $layout -ClusterId $clusterId

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
    Assert-CreateStateMarkerConcordance -Layout $layout -ClusterId $clusterId

    Set-Stage -Stage "postgresql_conf"
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "configuring" -Stage "postgresql_conf" -InitdbCompleted:$true -CredentialProtected:$credentialProtected
    Add-ManagedPostgresqlConf -Layout $layout
    Set-Stage -Stage "pg_hba"
    Set-ManagedPgHba -Layout $layout
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "configured" -Stage "configured" -InitdbCompleted:$true -ConfigurationCompleted:$true -CredentialProtected:$credentialProtected
    Assert-CreateStateMarkerConcordance -Layout $layout -ClusterId $clusterId

    Set-Stage -Stage "pg_ctl_start"
    if (-not (Test-CreatePortAvailable)) {
      Throw-SafeError -Code "port_race_detected"
    }
    Write-ClusterState -Layout $layout -ClusterId $clusterId -State "starting" -Stage "pg_ctl_start" -InitdbCompleted:$true -ConfigurationCompleted:$true -CredentialProtected:$credentialProtected -ServerState $serverState -ServerCleanupAttempted:$serverCleanupAttempted -ServerCleanupCompleted:$serverCleanupCompleted
    Assert-CreateStateMarkerConcordance -Layout $layout -ClusterId $clusterId
    $pgCtl = Get-ToolPath -BinRoot $package.Bin -ToolName "pg_ctl"
    $startArgs = @("start", "-D", $layout.DataRoot, "-l", $layout.ServerLog, "-w", "-t", "60")
    $startResult = Invoke-PersistentChildSafeProcess -FilePath $pgCtl -Arguments $startArgs -WorkingDirectory $layout.InstanceRoot -OutputDirectory $layout.StateRoot -TimeoutSeconds 75 -ToolName "pg_ctl_start"
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
    Assert-CreateStateMarkerConcordance -Layout $layout -ClusterId $clusterId

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
    $primaryStage = $script:CurrentStage
    try { Remove-PasswordFileStrict -Layout $layout } catch { if ([string]::IsNullOrWhiteSpace($script:CurrentSecondaryReason)) { $script:CurrentSecondaryReason = "password_file_cleanup_failed" } }
    if ($initdbCompleted -ne $true -and (Test-Path -LiteralPath $layout.CredentialPath -PathType Leaf)) {
      try { [System.IO.File]::Delete($layout.CredentialPath) } catch { }
    }
    if (Test-Path -LiteralPath $layout.StateRoot -PathType Container) {
      try {
        Write-ClusterState -Layout $layout -ClusterId $clusterId -State "failed" -Stage $primaryStage -ErrorCode $reason -InitdbCompleted:$initdbCompleted -CredentialProtected:$credentialProtected -ServerState $serverState -ServerCleanupAttempted:$serverCleanupAttempted -ServerCleanupCompleted:$serverCleanupCompleted
      } catch {
        if ([string]::IsNullOrWhiteSpace($script:CurrentSecondaryReason)) { $script:CurrentSecondaryReason = Get-SafeReason -ErrorRecord $_ }
      }
    }
    Set-Stage -Stage $primaryStage
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
  $usingDefaultDataRoot = [string]::IsNullOrWhiteSpace($DataRoot)
  $resolvedDataRoot = if ($usingDefaultDataRoot) { $layout.DataRoot } else { $DataRoot }
  $cleanupPartialCreateExactStateValid = Test-CleanupPartialCreateStateReplaceResidual -Layout $layout
  if (-not $cleanupPartialCreateExactStateValid -or -not $usingDefaultDataRoot) {
    [void](Assert-DataRoot -Root $resolvedDataRoot -RepoRoot $repoRoot -ExpectedClusterName $ClusterName -RequireMarker:$false)
  }
  $baselineValid = Invoke-BaselineValidator -RepoRoot $repoRoot
  $portAvailable = Test-PortAvailable -Value $Port
  $dependencies = Get-DependencyScan -RepoRoot $repoRoot
  $localCompat = Invoke-LocalCompatPreflightValidator -RepoRoot $repoRoot
  $partialInstanceCleanupRequired = Test-Path -LiteralPath $layout.InstanceRoot -PathType Container
  $cleanupPartialCreateRequired = $partialInstanceCleanupRequired -and $cleanupPartialCreateExactStateValid
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
  Write-Output "cleanup_partial_create_required=$(([string]$cleanupPartialCreateRequired).ToLowerInvariant())"
  Write-Output "cleanup_partial_create_exact_state_valid=$(([string]$cleanupPartialCreateExactStateValid).ToLowerInvariant())"
  Write-Output "cleanup_partial_create_state_replace_residual_supported=true"
  Write-Output "state_replace_strategy_windows_compatible=true"
  Write-Output "state_replace_temp_acl_hardened=true"
  Write-Output "state_replace_real_filesystem_self_test=true"
  Write-Output "state_replace_failure_classification=true"
  Write-Output "marker_state_concordance_required=true"
  Write-Output "created_utc_stable=true"
  Write-Output "state_initial_created_utc_single_clock=true"
  Write-Output "state_created_utc_preserved_on_rewrite=true"
  Write-Output "state_created_utc_future_rejected=true"
  Write-Output "state_created_utc_tolerance_used=false"
  Write-Output "state_write_substeps=state_validate_input,state_get_created_utc,state_build_payload,state_serialize_json,state_write_temp,state_move_initial,state_replace_existing,state_apply_acl,state_acl_readback,state_schema_readback,state_marker_concordance"
  Write-Output "state_write_substep_reasons=true"
  Write-Output "state_initial_write_fail_closed=true"
  Write-Output "state_failed_write_secondary_reason_preserved=true"
  Write-Output "state_primary_reason_preserved=true"
  Write-Output "state_temp_residual_detection=true"
  Write-Output "state_readback_schema_validation=true"
  Write-Output "git_working_directory_enforced=true"
  Write-Output "process_output_drain_verified=true"
  Write-Output "process_output_drain_failure_code=process_output_drain_failed"
  Write-Output "pg_ctl_start_process_strategy=FILE_REDIRECT_NO_PIPE_INHERITANCE"
  Write-Output "pg_ctl_start_output_capture=CONTROLLED_FILES_SANITIZED_TAIL"
  Write-Output "process_incomplete_task_dispose_safe=true"
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
  Write-Output "cleanup_directory_entries_contract=WRAPPED_STRING_ARRAY"
  Write-Output "cleanup_directory_entries_zero_shape=STRING_ARRAY_0"
  Write-Output "cleanup_directory_entries_one_shape=STRING_ARRAY_1"
  Write-Output "cleanup_directory_entries_many_shape=STRING_ARRAY_N"
  Write-Output "cleanup_pipeline_unrolling_fixed=true"
  Write-Output "cleanup_strictmode_single_entry_fixed=true"
  Write-Output "cleanup_propertynotfound_classified=true"
  Write-Output "cleanup_wrapper_unwrap_depth=8"
  Write-Output "cleanup_exact_state_shape_selftest=true"
  Write-Output "cleanup_directory_entries_all_callers_wrapped=true"
  Write-Output "cleanup_delete_root_uses_entries_property=true"
  Write-Output "cleanup_parent_empty_symbolic_selftest=true"
  Write-Output "cleanup_container_direct_count_rejected=true"
  Write-Output "cleanup_container_direct_index_rejected=true"
  Write-Output "cleanup_contract_validator_complete=true"
  Write-Output "cleanup_parent_validation_stage=CLEANUP_VALIDATE_PARENT_EMPTY"
  Write-Output "cleanup_parent_not_empty_reason_preserved=true"
  Write-Output "cleanup_delete_root_stage_is_delete_only=true"
  Write-Output "cleanup_post_instance_activity_stage=cleanup_revalidate_activity_after_instance_delete"
  Write-Output "cleanup_post_instance_activity_stage_correct=true"
  Write-Output "cleanup_activity_before_parent_validation=true"
  Write-Output "cleanup_parent_validation_is_last_predelete_check=true"
  Write-Output "cleanup_delete_root_immediate_delete=true"
  Write-Output "cleanup_activity_failure_not_enumeration=true"
  Write-Output "cleanup_activity_sequence_validator_complete=true"
  Write-Output "cleanup_parent_nonempty_blocks_second_delete=true"
  Write-Output "cleanup_second_delete_reachable_only_when_parent_empty=true"
  Write-Output "cleanup_parent_stage_reason_validator_complete=true"
  Write-Output "cleanup_real_execution_tested=false"
  Write-Output "cleanup_action_present=true"
  Write-Output "cleanup_authorized=false"
  Write-Output "cleanup_execution_blocked=true"
  Write-Output "cleanup_failed_create_action_present=true"
  Write-Output "cleanup_failed_create_authorized=false"
  Write-Output "cleanup_failed_create_execution_blocked=true"
  Write-Output "cleanup_failed_create_exact_state_required=true"
  Write-Output "cleanup_failed_create_recursive_delete_allowed=false"
  Write-Output "cleanup_failed_create_acl_modification_allowed=false"
  Write-Output "cleanup_failed_create_package_directory_in_scope=false"
  Write-Output "cleanup_failed_create_marker_state_validation=true"
  Write-Output "cleanup_failed_create_activity_revalidation=true"
  Write-Output "cleanup_failed_create_isolated_root_acl_contract=SAFE_INHERITED_OWNER_FULLCONTROL"
  Write-Output "cleanup_failed_create_isolated_root_acl_modified=false"
  Write-Output "cleanup_failed_create_internal_acl_contract=STRICT_PROTECTED_SINGLE_SID"
  Write-Output "cleanup_failed_create_acl_contracts_separated=true"
  Write-Output "create_isolated_root_acl_hardened=true"
  Write-Output "cleanup_failed_create_expected_delete_file_count=2"
  Write-Output "cleanup_failed_create_expected_delete_directory_count=6"
  Write-Output "cleanup_failed_create_state_length_exact_hardcode=false"
  Write-Output "cleanup_failed_create_state_size_bounded=true"
  Write-Output "cleanup_failed_create_state_get_created_utc_failure_supported=true"
  Write-Output "cleanup_partial_create_nonempty_instance_supported=true"
  Write-Output "cleanup_partial_create_manifest_valid=$(([string]$cleanupPartialCreateExactStateValid).ToLowerInvariant())"
  Write-Output "cleanup_partial_create_bottom_up_delete=true"
  Write-Output "cleanup_partial_create_recursive_delete_used=false"
  Write-Output "cleanup_partial_create_recovery_deterministic=true"
  Write-Output "cleanup_partial_create_real_filesystem_self_test=true"
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
    Invoke-CleanupPartialRealFilesystemSelfTest
    exit 0
  }

  switch ($Action) {
    "Plan" { Invoke-Plan }
    "Create" {
      Invoke-Create `
        -ConfirmCreate:$ConfirmCreate `
        -CreateApprovalToken $CreateApprovalToken `
        -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
        -CleanupApprovalToken $CleanupApprovalToken `
        -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
        -CleanupFailedCreateApprovalToken $CleanupFailedCreateApprovalToken
    }
    "CleanupPartialCreate" {
      Invoke-CleanupPartialCreate `
        -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
        -CleanupApprovalToken $CleanupApprovalToken `
        -ConfirmCreate:$ConfirmCreate `
        -CreateApprovalToken $CreateApprovalToken `
        -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
        -CleanupFailedCreateApprovalToken $CleanupFailedCreateApprovalToken
    }
    "CleanupFailedCreate" {
      Invoke-CleanupFailedCreate `
        -ConfirmCleanupFailedCreate:$ConfirmCleanupFailedCreate `
        -CleanupFailedCreateApprovalToken $CleanupFailedCreateApprovalToken `
        -ConfirmCreate:$ConfirmCreate `
        -CreateApprovalToken $CreateApprovalToken `
        -ConfirmCleanupPartialCreate:$ConfirmCleanupPartialCreate `
        -CleanupApprovalToken $CleanupApprovalToken
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
  if (-not [string]::IsNullOrWhiteSpace($script:CurrentSecondaryReason)) {
    Write-Output "secondary_reason=$script:CurrentSecondaryReason"
  }
  Write-Output "production_connection_used=false"
  Write-Output "sql_executed=false"
  exit 1
}
