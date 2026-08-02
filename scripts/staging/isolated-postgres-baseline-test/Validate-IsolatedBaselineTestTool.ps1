[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail {
  param([Parameter(Mandatory = $true)][string]$Code)
  throw "SELF_TEST_FAILED::$Code"
}

function Assert-Contains {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Code
  )
  if ($Text -notmatch $Pattern) { Fail -Code $Code }
}

function Assert-NotContains {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Code
  )
  if ($Text -match $Pattern) { Fail -Code $Code }
}

function Invoke-Tool {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  return @(powershell -ExecutionPolicy Bypass -File $script:InvokePath @Arguments)
}

function Assert-ToolFailure {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$ExpectedReason,
    [Parameter(Mandatory = $true)][string]$Code
  )
  $output = Invoke-Tool -Arguments $Arguments
  if ($LASTEXITCODE -eq 0 -or $output -notcontains ("reason=" + $ExpectedReason)) {
    Fail -Code $Code
  }
}

$toolDir = $PSScriptRoot
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $toolDir "..\..\.."))
$readme = Join-Path $toolDir "README.txt"
$script:InvokePath = Join-Path $toolDir "Invoke-IsolatedBaselineTest.ps1"
$validator = Join-Path $toolDir "Validate-IsolatedBaselineTestTool.ps1"
$compatSql = Join-Path $toolDir "local-compat-preflight.candidate.sql"
$compatManifest = Join-Path $toolDir "local-compat-preflight.candidate.manifest.txt"
$compatValidator = Join-Path $toolDir "Validate-LocalCompatPreflightCandidate.ps1"

foreach ($file in @($readme, $script:InvokePath, $validator, $compatSql, $compatManifest, $compatValidator)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    Fail -Code "file_missing"
  }
}

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($script:InvokePath, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) {
  Fail -Code "invoke_parse_failed"
}

$validatorTokens = $null
$validatorErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($validator, [ref]$validatorTokens, [ref]$validatorErrors) | Out-Null
if ($validatorErrors.Count -ne 0) {
  Fail -Code "validator_parse_failed"
}
$compatValidatorTokens = $null
$compatValidatorErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($compatValidator, [ref]$compatValidatorTokens, [ref]$compatValidatorErrors) | Out-Null
if ($compatValidatorErrors.Count -ne 0) {
  Fail -Code "compat_validator_parse_failed"
}

$text = Get-Content -LiteralPath $script:InvokePath -Raw
$readmeText = Get-Content -LiteralPath $readme -Raw
$compatSqlText = Get-Content -LiteralPath $compatSql -Raw
$compatManifestText = Get-Content -LiteralPath $compatManifest -Raw
$compatValidatorText = Get-Content -LiteralPath $compatValidator -Raw

$commands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
$commandNames = @($commands | ForEach-Object { $_.GetCommandName() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

function Get-FunctionText {
  param([Parameter(Mandatory = $true)][string]$Name)
  $matches = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name }, $true))
  if ($matches.Count -ne 1) { Fail -Code ("function_missing_" + $Name) }
  return $matches[0].Extent.Text
}

function ConvertTo-WindowsProcessArgumentForSelfTest {
  param([AllowNull()][object]$Value)
  if ($null -eq $Value) { throw "null_rejected" }
  $Value = [string]$Value
  if ($Value.Length -eq 0) { return '""' }
  if ($Value -notmatch '[\s"]') { return $Value }
  function New-BackslashRunForSelfTest {
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
      [void]$builder.Append((New-BackslashRunForSelfTest -Count (($slashCount * 2) + 1)))
      [void]$builder.Append('"')
      $slashCount = 0
      continue
    }
    if ($slashCount -gt 0) {
      [void]$builder.Append((New-BackslashRunForSelfTest -Count $slashCount))
      $slashCount = 0
    }
    [void]$builder.Append($ch)
  }
  if ($slashCount -gt 0) {
    [void]$builder.Append((New-BackslashRunForSelfTest -Count ($slashCount * 2)))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

foreach ($blockedCommand in @("Invoke-Expression","iex","cmd","Start-Process","initdb","postgres","pg_ctl","createdb","dropdb","psql","pg_restore","pg_dump","pg_isready","docker","supabase")) {
  if ($commandNames -contains $blockedCommand) {
    Fail -Code ("blocked_command_detected_" + $blockedCommand)
  }
}

foreach ($command in $commands) {
  $name = $command.GetCommandName()
  $commandText = $command.Extent.Text
  if ($name -eq "powershell" -and $commandText -match "\s-Command\s") {
    Fail -Code "dynamic_powershell_command_detected"
  }
  if ($name -eq "Remove-Item" -and $commandText -match "-Recurse") {
    Fail -Code "recursive_remove_detected"
  }
}

Assert-Contains -Text $text -Pattern '\[ValidateSet\("Plan","Create","CleanupPartialCreate","Apply","Verify","Destroy","FullTest"\)\]' -Code "actions_missing"
Assert-Contains -Text $text -Pattern 'switch \(\$Action\)' -Code "switch_dispatch_missing"
Assert-Contains -Text $text -Pattern '"Plan" \{ Invoke-Plan \}' -Code "plan_branch_missing"
Assert-Contains -Text $text -Pattern '"Create" \{ Invoke-Create \}' -Code "create_branch_missing"
Assert-Contains -Text $text -Pattern '"CleanupPartialCreate" \{ Invoke-CleanupPartialCreate \}' -Code "cleanup_branch_missing"
Assert-Contains -Text $text -Pattern '"Apply" \{ Invoke-BlockedFutureAction -RequestedAction "Apply" \}' -Code "apply_branch_not_blocked"
Assert-Contains -Text $text -Pattern '"Verify" \{ Invoke-BlockedFutureAction -RequestedAction "Verify" \}' -Code "verify_branch_not_blocked"
Assert-Contains -Text $text -Pattern '"FullTest" \{ Invoke-BlockedFutureAction -RequestedAction "FullTest" \}' -Code "fulltest_branch_not_blocked"
Assert-NotContains -Text $text -Pattern '"FullTest"[^\r\n]+Destroy|Invoke-BlockedFutureAction -RequestedAction "Destroy"[^\r\n]+FullTest' -Code "fulltest_destroy_detected"
Assert-NotContains -Text $text -Pattern '(?s)finally\s*\{.*Remove-Item[^\r\n]*(DataRoot|InstanceRoot)|finally\s*\{.*\[System\.IO\.Directory\]::Delete[^\r\n]*(DataRoot|InstanceRoot)' -Code "finally_dataroot_cleanup_detected"

$planFunctionText = Get-FunctionText -Name "Invoke-Plan"
$createFunctionText = Get-FunctionText -Name "Invoke-Create"
$cleanupFunctionText = Get-FunctionText -Name "Invoke-CleanupPartialCreate"
$cleanupAuthorizationFunctionText = Get-FunctionText -Name "Assert-CleanupAuthorization"
$cleanupPathFunctionText = Get-FunctionText -Name "Assert-CleanupPathFixed"
$cleanupStateFunctionText = Get-FunctionText -Name "Assert-CleanupExactPartialState"
$cleanupSignatureFunctionText = Get-FunctionText -Name "Get-CleanupPartialStateSignature"
$cleanupProcessFunctionText = Get-FunctionText -Name "Assert-CleanupNoPostgresActivity"
$runnerFunctionText = Get-FunctionText -Name "Invoke-SafeProcess"
$gitCommandFunctionText = Get-FunctionText -Name "Invoke-GitCommand"
$gitFunctionText = Get-FunctionText -Name "Assert-GitReadyForCreate"
$quoteFunctionText = Get-FunctionText -Name "ConvertTo-WindowsProcessArgument"
$aclFunctionText = Get-FunctionText -Name "Set-RestrictedAcl"
$aclIdentityFunctionText = Get-FunctionText -Name "Convert-IdentityReferenceToSidValue"
$aclRulesFunctionText = Get-FunctionText -Name "Get-RestrictedAclRulesForValidation"
$aclSemanticFunctionText = Get-FunctionText -Name "Assert-RestrictedAclSemantics"
$stateFunctionText = Get-FunctionText -Name "Write-ClusterState"
$concordanceFunctionText = Get-FunctionText -Name "Assert-MarkerStateConcordance"
$dataRootFunctionText = Get-FunctionText -Name "Assert-DataRoot"
$pidFunctionText = Get-FunctionText -Name "Get-PostmasterPidInfo"
$processEvidenceFunctionText = Get-FunctionText -Name "Get-LocalPostgresProcessEvidence"
$originalProcessStateFunctionText = Get-FunctionText -Name "Get-OriginalPostgresProcessState"
$processExecutableFunctionText = Get-FunctionText -Name "Get-ProcessExecutablePathCompatible"
$serverStateFunctionText = Get-FunctionText -Name "Get-VerifiedServerState"
$pgCtlStopFunctionText = Get-FunctionText -Name "Invoke-VerifiedPgCtlStop"
$pgCtlFailureFunctionText = Get-FunctionText -Name "Resolve-VerifiedPgCtlStartFailure"
$postStopWaitFunctionText = Get-FunctionText -Name "Wait-ForVerifiedServerStopState"
$strictJsonFunctionText = Get-FunctionText -Name "Assert-StrictFlatStateJson"
Assert-NotContains -Text $planFunctionText -Pattern "Invoke-SafeProcess|Invoke-GitCommand|Remove-Item|New-Item|Read-Host|TcpListener|RandomNumberGenerator|ConvertFrom-SecureString|Set-Acl|Start-Process|&\s*" -Code "plan_contains_forbidden_operation"
Assert-NotContains -Text $planFunctionText -Pattern "Get-LocalPostgresProcessEvidence|GetProcessesByName|Test-LocalServerDetected|Get-Process|Get-Service" -Code "plan_enumerates_processes"
Assert-NotContains -Text $planFunctionText -Pattern "Invoke-CleanupPartialCreate|Get-CleanupDirectoryEntries|Assert-CleanupExactPartialState|Assert-CleanupNoPostgresActivity|\[System\.IO\.Directory\]::Delete|Get-Acl|Set-Acl|\.GetAccessRules\(" -Code "plan_cleanup_side_effect_detected"
Assert-NotContains -Text $text -Pattern '\$(process|Process|proc|Proc|postgresProcess|postgresProc)\.Path\b' -Code "process_path_property_detected"
Assert-NotContains -Text $text -Pattern 'Get-Process[^\r\n|]*\|\s*Select(-Object)?\s+Path\b' -Code "get_process_select_path_detected"
Assert-NotContains -Text $text -Pattern 'Get-CimInstance|Get-WmiObject|\bWMI\b|CIM' -Code "wmi_cim_detected"

Assert-Contains -Text $text -Pattern '\$script:AllowedHost\s*=\s*"127\.0\.0\.1"' -Code "fixed_host_missing"
Assert-Contains -Text $text -Pattern '\$script:CreatePort\s*=\s*55432' -Code "fixed_create_port_missing"
Assert-Contains -Text $text -Pattern '\[switch\]\$ConfirmCreate' -Code "confirm_create_missing"
Assert-Contains -Text $text -Pattern '\[string\]\$CreateApprovalToken' -Code "create_approval_token_param_missing"
Assert-Contains -Text $text -Pattern '\[switch\]\$ConfirmCleanupPartialCreate' -Code "confirm_cleanup_missing"
Assert-Contains -Text $text -Pattern '\[string\]\$CleanupApprovalToken' -Code "cleanup_token_param_missing"
Assert-Contains -Text $text -Pattern 'CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432' -Code "exact_create_token_missing"
Assert-Contains -Text $text -Pattern 'CLEANUP_PARTIAL_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432' -Code "exact_cleanup_token_missing"
Assert-NotContains -Text $cleanupAuthorizationFunctionText -Pattern 'ConfirmCreate\s*\)|CreateApprovalToken\s*,\s*\$script:CreateApprovalToken|CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432' -Code "cleanup_reuses_create_authorization"
Assert-Contains -Text $cleanupAuthorizationFunctionText -Pattern 'ConfirmCleanupPartialCreate[\s\S]+CleanupApprovalToken[\s\S]+\$script:CleanupApprovalToken[\s\S]+StringComparison\]::Ordinal' -Code "cleanup_double_authorization_missing"
Assert-Contains -Text $cleanupPathFunctionText -Pattern 'IsolatedRootRelativePath[\s\S]+InstanceName[\s\S]+PostgresPackageRelativePath|Get-PostgresRoot' -Code "cleanup_fixed_paths_missing"
Assert-Contains -Text $cleanupPathFunctionText -Pattern 'OrdinalIgnoreCase[\s\S]+Test-IsInsideDirectory[\s\S]+cleanup_path_validation_failed' -Code "cleanup_path_validation_missing"
Assert-Contains -Text $cleanupStateFunctionText -Pattern 'DataRoot[\s\S]+LogRoot[\s\S]+StateRoot[\s\S]+SecretRoot[\s\S]+MarkerPath[\s\S]+StatePath[\s\S]+CredentialPath[\s\S]+PasswordFilePath[\s\S]+postmaster\.pid[\s\S]+PG_VERSION[\s\S]+postgresql\.conf[\s\S]+pg_hba\.conf' -Code "cleanup_exact_state_missing"
Assert-Contains -Text $cleanupStateFunctionText -Pattern 'Get-CleanupDirectoryEntries[\s\S]+InstanceRoot[\s\S]+cleanup_unexpected_content[\s\S]+Get-CleanupDirectoryEntries[\s\S]+IsolatedRoot[\s\S]+Count -ne 1' -Code "cleanup_empty_content_validation_missing"
Assert-Contains -Text $cleanupStateFunctionText -Pattern 'Assert-CleanupEntrySafe' -Code "cleanup_entry_validation_missing"
Assert-Contains -Text $cleanupSignatureFunctionText -Pattern 'Get-CleanupDirectoryEntries[\s\S]+Sort-Object[\s\S]+postmaster\.pid[\s\S]+PG_VERSION[\s\S]+postgresql\.conf[\s\S]+pg_hba\.conf' -Code "cleanup_signature_missing"
Assert-Contains -Text $text -Pattern 'FileAttributes\]::ReparsePoint' -Code "cleanup_reparse_validation_missing"
Assert-Contains -Text $cleanupProcessFunctionText -Pattern 'Get-LocalPostgresProcessEvidence[\s\S]+AmbiguousCount[\s\S]+cleanup_postgres_process_ambiguous[\s\S]+AuthorizedCount[\s\S]+OtherCount[\s\S]+cleanup_postgres_process_detected[\s\S]+Get-Service[\s\S]+cleanup_postgresql_service_running[\s\S]+Test-PortAvailable[\s\S]+cleanup_port_in_use[\s\S]+postmaster\.pid' -Code "cleanup_process_service_port_missing"
Assert-Contains -Text $cleanupFunctionText -Pattern 'Assert-CleanupExactPartialState[\s\S]+Get-CleanupPartialStateSignature[\s\S]+Assert-CleanupNoPostgresActivity[\s\S]+Get-CleanupPartialStateSignature[\s\S]+cleanup_state_changed_during_validation[\s\S]+Assert-CleanupExactPartialState[\s\S]+Directory\]::Delete\(\$layout\.InstanceRoot, \$false\)[\s\S]+Directory\]::Delete\(\$layout\.IsolatedRoot, \$false\)' -Code "cleanup_delete_sequence_missing"
Assert-NotContains -Text $cleanupFunctionText -Pattern 'Remove-Item|Directory\]::Delete\([^\r\n]+,\s*\$true\)|-Recurse|-Force|Stop-Process|taskkill|Set-Acl|takeown|icacls|Invoke-Create|Invoke-BlockedFutureAction -RequestedAction "Destroy"|[?*]' -Code "cleanup_forbidden_operation_detected"
Assert-Contains -Text $text -Pattern '\[string\]\$PostgresBin\s*=\s*\(Join-Path \$env:LOCALAPPDATA "VotoClaro\\PostgreSQL\\17\.10-complete\\bin"\)' -Code "dynamic_postgresbin_missing"
Assert-Contains -Text $text -Pattern 'VotoClaro\\PostgreSQL\\isolated-baseline-test' -Code "isolated_root_new_missing"
Assert-Contains -Text $text -Pattern 'pg17-port55432' -Code "instance_name_missing"
Assert-Contains -Text $text -Pattern '\$data = Join-Path \$instanceRoot "data"' -Code "dataroot_layout_missing"
Assert-Contains -Text $text -Pattern '\$logs = Join-Path \$instanceRoot "logs"' -Code "logroot_layout_missing"
Assert-Contains -Text $text -Pattern '\$state = Join-Path \$instanceRoot "state"' -Code "stateroot_layout_missing"
Assert-Contains -Text $text -Pattern '\$secrets = Join-Path \$instanceRoot "secrets"' -Code "secretroot_layout_missing"
Assert-Contains -Text $text -Pattern 'vc_isolated_admin\.dpapi' -Code "credential_path_missing"
Assert-Contains -Text $text -Pattern 'initdb-password\.tmp' -Code "password_file_path_missing"
Assert-NotContains -Text $text -Pattern "C:\\Users\\|HP\\AppData" -Code "hardcoded_user_path_detected"
Assert-NotContains -Text $text -Pattern "localhost" -Code "localhost_operational_host_detected"
Assert-NotContains -Text $text -Pattern "supabase\.co|pooler\.supabase\.com|amazonaws\.com" -Code "remote_host_literal_detected"
Assert-NotContains -Text $text -Pattern "NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|DATABASE_URL|POSTGRES_URL" -Code "forbidden_env_variable_detected"
Assert-NotContains -Text $text -Pattern "Get-Content\s+[^\r\n]*\.env|\.env\.local" -Code "env_file_read_detected"
Assert-Contains -Text $text -Pattern 'if \(\$Value -eq 5432\)' -Code "port_5432_rejection_missing"
Assert-Contains -Text $text -Pattern '\$Value -ne 55432' -Code "port_exact_55432_missing"
Assert-Contains -Text $text -Pattern "Test-PortAvailable" -Code "port_availability_missing"
Assert-Contains -Text $text -Pattern "TcpListener" -Code "tcp_listener_port_check_missing"
Assert-Contains -Text $text -Pattern "vc_staging_baseline_test_" -Code "prefix_missing"
Assert-Contains -Text $text -Pattern "vc_isolated_admin" -Code "admin_user_missing"
Assert-Contains -Text $text -Pattern "scram-sha-256" -Code "scram_missing"
Assert-Contains -Text $text -Pattern "--encoding=UTF8" -Code "initdb_utf8_missing"
Assert-Contains -Text $text -Pattern "--locale=C" -Code "initdb_locale_missing"
Assert-Contains -Text $text -Pattern "--pwfile=" -Code "initdb_pwfile_missing"
Assert-Contains -Text $text -Pattern "RandomNumberGenerator" -Code "rng_missing"
Assert-NotContains -Text $text -Pattern "System\.Random|Get-Random|NewGuid\(\)\.ToString\(\).*password|password\s*=\s*['""][^'""]+" -Code "weak_password_generation_detected"
Assert-Contains -Text $text -Pattern "ConvertFrom-SecureString -SecureString" -Code "dpapi_missing"
Assert-NotContains -Text $text -Pattern "ConvertFrom-SecureString[^\r\n]+-(Key|SecureKey)" -Code "dpapi_explicit_key_detected"
Assert-Contains -Text $text -Pattern 'SetAccessRuleProtection\(\$true, \$false\)' -Code "acl_inheritance_disable_missing"
Assert-NotContains -Text $text -Pattern "Everyone|Authenticated Users|Builtin\\Users|BUILTIN\\Users" -Code "broad_acl_literal_detected"
Assert-Contains -Text $text -Pattern "password_encryption" -Code "password_encryption_design_missing"
Assert-Contains -Text $text -Pattern "GetFullPath" -Code "canonical_path_missing"
Assert-Contains -Text $text -Pattern "Get-RequiredDataRootParent" -Code "required_parent_missing"
Assert-Contains -Text $text -Pattern "ReparsePoint" -Code "reparse_guard_missing"
Assert-Contains -Text $text -Pattern "marker_missing" -Code "marker_required_missing"
Assert-Contains -Text $text -Pattern "Assert-Marker" -Code "marker_validation_missing"
Assert-Contains -Text $text -Pattern 'Assert-DataRoot -Root \$resolvedDataRoot[^\r\n]+RequireMarker:\$true[\s\S]+Assert-DataRoot -Root \$resolvedDataRoot[^\r\n]+RequireMarker:\$true' -Code "destroy_double_marker_validation_missing"
Assert-Contains -Text $text -Pattern "Get-FutureInitDbArgumentTemplate" -Code "initdb_argument_template_missing"
Assert-Contains -Text $text -Pattern "Get-FuturePsqlArgumentTemplate" -Code "psql_argument_template_missing"
Assert-Contains -Text $text -Pattern "return @\(" -Code "array_argument_template_missing"
Assert-NotContains -Text $text -Pattern 'ArgumentList\s+\([^\)]*-join|ArgumentList\s+"' -Code "unsafe_argument_list_detected"
Assert-Contains -Text $text -Pattern "Get-GitExecutable" -Code "git_executable_resolver_missing"
Assert-Contains -Text $gitCommandFunctionText -Pattern 'WorkingDirectory' -Code "git_working_directory_param_missing"
Assert-Contains -Text $gitCommandFunctionText -Pattern '\$full = \[System\.IO\.Path\]::GetFullPath\(\$WorkingDirectory\)' -Code "git_working_directory_canonical_missing"
Assert-Contains -Text $gitCommandFunctionText -Pattern 'Invoke-SafeProcess[\s\S]+-WorkingDirectory \$full' -Code "git_working_directory_not_enforced"
Assert-NotContains -Text $gitCommandFunctionText -Pattern '& \$git @Arguments' -Code "git_working_directory_ignored"
Assert-Contains -Text $gitFunctionText -Pattern '"rev-parse","--show-toplevel"' -Code "git_toplevel_missing"
Assert-Contains -Text $gitFunctionText -Pattern '"rev-parse","--verify","fe899a1\^\{commit\}"' -Code "git_base_verify_missing"
Assert-Contains -Text $gitFunctionText -Pattern '"merge-base","--is-ancestor","fe899a1","HEAD"' -Code "git_merge_base_missing"
Assert-Contains -Text $gitFunctionText -Pattern '"status","--porcelain=v1","--untracked-files=all"' -Code "git_status_untracked_missing"
Assert-NotContains -Text $gitFunctionText -Pattern '\[0-9a-f\]\{7,\}' -Code "git_generic_hash_regex_detected"
Assert-Contains -Text $text -Pattern "System\.Diagnostics\.ProcessStartInfo" -Code "process_runner_missing"
Assert-Contains -Text $text -Pattern '"--version"' -Code "postgres_version_check_missing"
Assert-Contains -Text $text -Pattern "postgres_version_invalid" -Code "postgres_version_invalid_code_missing"
Assert-Contains -Text $text -Pattern 'UseShellExecute = \$false' -Code "process_no_shell_missing"
Assert-Contains -Text $text -Pattern 'CreateNoWindow = \$true' -Code "process_no_window_missing"
Assert-Contains -Text $text -Pattern 'RedirectStandardOutput = \$true' -Code "process_stdout_redirect_missing"
Assert-Contains -Text $text -Pattern 'RedirectStandardError = \$true' -Code "process_stderr_redirect_missing"
Assert-Contains -Text $runnerFunctionText -Pattern 'StandardOutput\.ReadToEndAsync\(\)' -Code "stdout_async_drain_missing"
Assert-Contains -Text $runnerFunctionText -Pattern 'StandardError\.ReadToEndAsync\(\)' -Code "stderr_async_drain_missing"
Assert-Contains -Text $runnerFunctionText -Pattern '\$stdoutTask\.Wait\(5000\)' -Code "stdout_task_timeout_missing"
Assert-Contains -Text $runnerFunctionText -Pattern '\$stderrTask\.Wait\(5000\)' -Code "stderr_task_timeout_missing"
Assert-Contains -Text $runnerFunctionText -Pattern '\$stdoutDoneAfterTimeout = \$stdoutTask\.Wait\(5000\)' -Code "stdout_timeout_wait_result_ignored"
Assert-Contains -Text $runnerFunctionText -Pattern '\$stderrDoneAfterTimeout = \$stderrTask\.Wait\(5000\)' -Code "stderr_timeout_wait_result_ignored"
Assert-Contains -Text $runnerFunctionText -Pattern 'OutputDrainCompleted' -Code "output_drain_completed_flag_missing"
Assert-Contains -Text $runnerFunctionText -Pattern 'ProcessKilled' -Code "process_killed_flag_missing"
Assert-Contains -Text $runnerFunctionText -Pattern 'process_output_drain_failed' -Code "output_drain_failure_missing"
Assert-Contains -Text $runnerFunctionText -Pattern 'process_timeout_cleanup_failed' -Code "timeout_cleanup_failure_missing"
Assert-Contains -Text $text -Pattern 'Get-SafeOutputTail' -Code "output_tail_sanitizer_missing"
Assert-Contains -Text $text -Pattern '4096' -Code "output_tail_limit_missing"
Assert-NotContains -Text $runnerFunctionText -Pattern 'Standard(Output|Error)\.ReadToEnd\(\)' -Code "sync_readtoend_detected"
if ($runnerFunctionText.IndexOf("ReadToEndAsync()", [System.StringComparison]::Ordinal) -lt 0 -or
    $runnerFunctionText.IndexOf("ReadToEndAsync()", [System.StringComparison]::Ordinal) -gt $runnerFunctionText.IndexOf("WaitForExit", [System.StringComparison]::Ordinal)) {
  Fail -Code "async_drain_not_before_wait"
}
Assert-Contains -Text $quoteFunctionText -Pattern "Value\.Length -eq 0" -Code "empty_argument_branch_missing"
Assert-Contains -Text $quoteFunctionText -Pattern 'return ''""''' -Code "empty_argument_quote_missing"
Assert-NotContains -Text $text -Pattern "Invoke-Expression|iex|cmd\.exe|Start-Process|sc\.exe|netsh|New-Service|Start-Service|Set-Service|Register-ScheduledTask" -Code "forbidden_process_or_service_detected"
Assert-Contains -Text $text -Pattern "# BEGIN VOTO_CLARO_ISOLATED_BASELINE_TEST" -Code "postgresql_conf_block_missing"
Assert-Contains -Text $text -Pattern "listen_addresses = '127\.0\.0\.1'" -Code "postgresql_conf_host_missing"
Assert-Contains -Text $text -Pattern "port = 55432" -Code "postgresql_conf_port_missing"
Assert-Contains -Text $text -Pattern "ssl = off" -Code "postgresql_conf_ssl_off_missing"
Assert-Contains -Text $text -Pattern "timezone = 'UTC'" -Code "postgresql_conf_timezone_missing"
Assert-NotContains -Text $text -Pattern "fsync\s*=\s*off|full_page_writes\s*=\s*off|synchronous_commit\s*=\s*off|shared_preload_libraries" -Code "unsafe_postgresql_conf_detected"
Assert-Contains -Text $text -Pattern "127\.0\.0\.1/32\s+scram-sha-256" -Code "pg_hba_loopback_scram_missing"
Assert-Contains -Text $text -Pattern "0\.0\.0\.0/0\s+reject" -Code "pg_hba_ipv4_reject_missing"
Assert-Contains -Text $text -Pattern "::/0\s+reject" -Code "pg_hba_ipv6_reject_missing"
Assert-NotContains -Text $text -Pattern "::0/0" -Code "pg_hba_ipv6_ambiguous_detected"
Assert-NotContains -Text $text -Pattern "\btrust\b|\bmd5\b|\bident\b|\bpeer\b|\bsspi\b|::1|host\s+all\s+all[^\r\n]+\bpassword\b" -Code "unsafe_pg_hba_method_detected"
if (@([regex]::Matches($text, "host\s+all\s+all\s+127\.0\.0\.1/32\s+scram-sha-256")).Count -ne 1) { Fail -Code "pg_hba_scram_count_invalid" }
if (@([regex]::Matches($text, "host\s+all\s+all\s+(0\.0\.0\.0/0|::/0)\s+reject")).Count -ne 2) { Fail -Code "pg_hba_reject_count_invalid" }
Assert-Contains -Text $aclFunctionText -Pattern '\[ValidateSet\("Directory","File"\)\]' -Code "acl_target_type_missing"
Assert-Contains -Text $aclFunctionText -Pattern 'TargetType -eq "Directory"[\s\S]+ContainerInherit,ObjectInherit' -Code "directory_acl_inheritance_missing"
Assert-Contains -Text $aclFunctionText -Pattern 'else \{[\s\S]+InheritanceFlags\]"None"' -Code "file_acl_none_missing"
Assert-NotContains -Text $aclFunctionText -Pattern 'IdentityReference\.Value\s*,\s*\$sid\.Value|IdentityReference\.Value\s+-[ceiqn]*eq\s+\$sid\.Value|\.Access\b' -Code "acl_raw_identity_or_access_property_detected"
Assert-Contains -Text $text -Pattern "Convert-IdentityReferenceToSidValue" -Code "acl_identity_normalizer_missing"
Assert-Contains -Text $aclIdentityFunctionText -Pattern '\[System\.Security\.Principal\.IdentityReference\]\$IdentityReference' -Code "acl_identity_reference_param_missing"
Assert-Contains -Text $aclIdentityFunctionText -Pattern '\[System\.Security\.Principal\.SecurityIdentifier\]' -Code "acl_security_identifier_missing"
Assert-Contains -Text $aclIdentityFunctionText -Pattern 'Translate\(\[System\.Security\.Principal\.SecurityIdentifier\]\)' -Code "acl_translate_sid_missing"
Assert-Contains -Text $aclIdentityFunctionText -Pattern 'IdentityNotMappedException' -Code "acl_identity_not_mapped_missing"
Assert-Contains -Text $aclIdentityFunctionText -Pattern 'acl_identity_translation_failed' -Code "acl_identity_translation_code_missing"
Assert-Contains -Text $aclRulesFunctionText -Pattern '\[System\.Security\.AccessControl\.FileSystemSecurity\]\$Acl' -Code "acl_rules_filesystemsecurity_param_missing"
Assert-Contains -Text $aclRulesFunctionText -Pattern 'GetAccessRules\(\s*\$true\s*,\s*\$true\s*,\s*\[System\.Security\.Principal\.SecurityIdentifier\]\s*\)' -Code "acl_rules_getaccessrules_signature_missing"
Assert-NotContains -Text $aclRulesFunctionText -Pattern 'GetAccessRules\(\s*\$true\s*,\s*\$false|GetAccessRules\(\s*\$false\s*,|NTAccount|\[string\]|\.Access\b|Where-Object|catch\s*\{[^\}]*Success\s*=\s*\$true' -Code "acl_rules_retrieval_unsafe"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'AreAccessRulesProtected' -Code "acl_protected_validation_missing"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'Get-RestrictedAclRulesForValidation' -Code "acl_semantic_rules_function_missing"
Assert-NotContains -Text $aclSemanticFunctionText -Pattern '\.Access\b|Where-Object|continue\b' -Code "acl_semantic_filter_or_access_detected"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'foreach \(\$access in @\(\$rulesResult\.Rules\)\)[\s\S]+if \(\$null -eq \$access\)[\s\S]+if \(\$access\.IsInherited\)[\s\S]+AccessControlType\]::Deny[\s\S]+Convert-IdentityReferenceToSidValue[\s\S]+acl_unexpected_identity[\s\S]+InheritanceFlags[\s\S]+PropagationFlags[\s\S]+FileSystemRights' -Code "acl_semantic_validation_order_invalid"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'AccessControlType\]::Deny' -Code "acl_deny_rejection_missing"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'IsInherited' -Code "acl_inherited_rejection_missing"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'acl_unexpected_identity' -Code "acl_additional_identity_rejection_missing"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'FullControl' -Code "acl_fullcontrol_missing"
Assert-Contains -Text $aclSemanticFunctionText -Pattern '\-band\s+\$requiredRights' -Code "acl_fullcontrol_bitmask_missing"
Assert-Contains -Text $aclSemanticFunctionText -Pattern '\-bor\s+\[int64\]\$access\.FileSystemRights' -Code "acl_split_allow_or_missing"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'InheritanceFlags' -Code "acl_inheritance_flags_validation_missing"
Assert-Contains -Text $aclSemanticFunctionText -Pattern 'PropagationFlags' -Code "acl_propagation_flags_validation_missing"
Assert-NotContains -Text $aclSemanticFunctionText -Pattern '\.Count\s+-eq|AccessRuleCount|access_rule_count|Sort-Object|Select-Object\s+-First' -Code "acl_order_or_count_dependency_detected"
Assert-Contains -Text $text -Pattern 'CredentialPath -TargetType File' -Code "credential_file_acl_missing"
Assert-Contains -Text $text -Pattern 'PasswordFilePath -TargetType File' -Code "pwfile_file_acl_missing"
Assert-Contains -Text $text -Pattern 'MarkerPath -TargetType File' -Code "marker_file_acl_missing"
Assert-Contains -Text $text -Pattern 'StatePath -TargetType File' -Code "state_file_acl_missing"
Assert-NotContains -Text $text -Pattern 'CredentialPath\)[\s\S]{0,120}TargetType Directory|PasswordFilePath\)[\s\S]{0,120}TargetType Directory|MarkerPath[\s\S]{0,120}TargetType Directory|StatePath[\s\S]{0,120}TargetType Directory' -Code "file_acl_directory_inheritance_detected"
Assert-Contains -Text $text -Pattern '"start", "-D", \$layout\.DataRoot, "-l", \$layout\.ServerLog, "-w", "-t", "60"' -Code "pg_ctl_start_args_missing"
Assert-Contains -Text $text -Pattern "Resolve-VerifiedPgCtlStartFailure" -Code "pg_ctl_start_failure_recovery_missing"
Assert-Contains -Text $text -Pattern "Get-LocalPostgresProcessEvidence" -Code "process_inventory_missing"
Assert-Contains -Text $text -Pattern "Get-ProcessExecutablePathCompatible" -Code "process_executable_resolver_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern '\[System\.Diagnostics\.Process\]\$Process' -Code "process_resolver_param_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'Refresh\(\)' -Code "process_refresh_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'HasExited' -Code "process_has_exited_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'MainModule\.FileName' -Code "process_mainmodule_filename_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'System\.ComponentModel\.Win32Exception' -Code "process_win32_exception_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'System\.InvalidOperationException' -Code "process_invalid_operation_exception_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'process_access_denied' -Code "process_access_denied_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'process_main_module_unavailable' -Code "process_main_module_unavailable_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'process_already_exited' -Code "process_already_exited_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'process_executable_path_empty' -Code "process_executable_path_empty_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'process_executable_path_invalid' -Code "process_executable_path_invalid_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern 'process_query_failed' -Code "process_query_failed_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern '\[System\.IO\.Path\]::IsPathRooted' -Code "process_relative_path_rejection_missing"
Assert-Contains -Text $processExecutableFunctionText -Pattern '\[System\.IO\.Path\]::GetFullPath' -Code "process_fullpath_missing"
Assert-Contains -Text $text -Pattern 'Convert-ToComparableExecutablePath' -Code "process_comparable_path_missing"
Assert-Contains -Text $processEvidenceFunctionText -Pattern '\[System\.Diagnostics\.Process\]::GetProcessesByName\("postgres"\)' -Code "dotnet_postgres_inventory_missing"
Assert-NotContains -Text $processEvidenceFunctionText -Pattern "Get-CimInstance|Get-WmiObject|tasklist|wmic|Stop-Process|taskkill|Kill\(\)" -Code "process_inventory_unsafe"
Assert-Contains -Text $processEvidenceFunctionText -Pattern "Get-ProcessExecutablePathCompatible" -Code "inventory_process_resolver_missing"
Assert-Contains -Text $processEvidenceFunctionText -Pattern "AUTHORIZED_PACKAGE_PROCESS" -Code "authorized_process_classification_missing"
Assert-Contains -Text $processEvidenceFunctionText -Pattern "AMBIGUOUS_POSTGRES_PROCESS" -Code "ambiguous_process_classification_missing"
Assert-Contains -Text $processEvidenceFunctionText -Pattern "OTHER_POSTGRES_PROCESS" -Code "other_process_classification_missing"
Assert-Contains -Text $processEvidenceFunctionText -Pattern "StartTime\.ToUniversalTime\(\)" -Code "inventory_starttime_utc_missing"
Assert-Contains -Text $processEvidenceFunctionText -Pattern "process_query_failed" -Code "inventory_ambiguous_error_code_missing"
Assert-Contains -Text $processEvidenceFunctionText -Pattern "Dispose\(\)" -Code "inventory_process_dispose_missing"
Assert-NotContains -Text $processEvidenceFunctionText -Pattern "Write-Output|Write-Host|Write-Verbose|Write-Warning" -Code "process_inventory_outputs_detected"
Assert-Contains -Text $pgCtlFailureFunctionText -Pattern "NO_SERVER_EVIDENCE" -Code "no_server_evidence_state_missing"
Assert-Contains -Text $pgCtlFailureFunctionText -Pattern "VERIFIED_SERVER_RUNNING" -Code "verified_server_running_state_missing"
Assert-Contains -Text $serverStateFunctionText -Pattern "SERVER_STATE_UNRESOLVED" -Code "server_state_unresolved_missing"
Assert-Contains -Text $serverStateFunctionText -Pattern "Get-LocalPostgresProcessEvidence" -Code "no_pidfile_inventory_not_used"
Assert-Contains -Text $serverStateFunctionText -Pattern "AuthorizedCount -gt 0" -Code "authorized_process_unresolved_missing"
Assert-Contains -Text $serverStateFunctionText -Pattern "AmbiguousCount -gt 0" -Code "ambiguous_process_unresolved_missing"
Assert-Contains -Text $serverStateFunctionText -Pattern "VERIFIED_SERVER_RUNNING" -Code "valid_pidfile_running_missing"
Assert-Contains -Text $pgCtlStopFunctionText -Pattern '"stop", "-D", \$Layout\.DataRoot, "-m", "fast", "-w", "-t", "30"' -Code "pg_ctl_stop_args_missing"
Assert-Contains -Text $pgCtlStopFunctionText -Pattern "Get-PostmasterPidInfo" -Code "pg_ctl_stop_pre_pid_validation_missing"
Assert-Contains -Text $pgCtlStopFunctionText -Pattern "Wait-ForVerifiedServerStopState" -Code "pg_ctl_stop_post_recheck_missing"
Assert-NotContains -Text $pgCtlStopFunctionText -Pattern 'if \(-not \$stopResult\.Success\)' -Code "pg_ctl_stop_immediate_failure_detected"
Assert-Contains -Text $postStopWaitFunctionText -Pattern '\[System\.Diagnostics\.Stopwatch\]::StartNew\(\)' -Code "post_stop_stopwatch_missing"
Assert-Contains -Text $postStopWaitFunctionText -Pattern 'Elapsed\.TotalSeconds -lt 15' -Code "post_stop_timeout_15_missing"
Assert-Contains -Text $postStopWaitFunctionText -Pattern 'Start-Sleep -Milliseconds 300' -Code "post_stop_poll_interval_missing"
Assert-Contains -Text $postStopWaitFunctionText -Pattern "Test-LoopbackListenerOpen" -Code "post_stop_listener_check_missing"
Assert-Contains -Text $postStopWaitFunctionText -Pattern "Get-OriginalPostgresProcessState" -Code "post_stop_original_identity_missing"
Assert-Contains -Text $originalProcessStateFunctionText -Pattern "Get-ProcessExecutablePathCompatible" -Code "original_process_resolver_missing"
Assert-Contains -Text $originalProcessStateFunctionText -Pattern "StartTime\.ToUniversalTime\(\)" -Code "original_starttime_missing"
Assert-Contains -Text $originalProcessStateFunctionText -Pattern "ORIGINAL_PROCESS_RUNNING" -Code "original_running_state_missing"
Assert-Contains -Text $originalProcessStateFunctionText -Pattern "ORIGINAL_PROCESS_EXITED" -Code "original_exited_state_missing"
Assert-Contains -Text $originalProcessStateFunctionText -Pattern "PROCESS_STATE_UNRESOLVED" -Code "original_unresolved_state_missing"
Assert-Contains -Text $originalProcessStateFunctionText -Pattern "PID_REUSED" -Code "pid_reuse_detection_missing"
Assert-Contains -Text $createFunctionText -Pattern "pg_ctl_start_failed_no_server" -Code "pg_ctl_no_server_error_missing"
Assert-Contains -Text $createFunctionText -Pattern "pg_ctl_start_failed_server_stopped" -Code "pg_ctl_server_stopped_error_missing"
Assert-Contains -Text $createFunctionText -Pattern "postgres_server_cleanup_failed" -Code "pg_ctl_cleanup_failed_error_missing"
Assert-Contains -Text $createFunctionText -Pattern "postgres_server_state_unresolved" -Code "pg_ctl_state_unresolved_error_missing"
Assert-NotContains -Text $createFunctionText -Pattern 'Throw-SafeError -Code "pg_ctl_timeout"' -Code "direct_pg_ctl_timeout_throw_detected"
Assert-NotContains -Text $text -Pattern "Stop-Process|taskkill|ProcessName[^\r\n]+Kill|Kill\(\)[^\r\n]+postgres" -Code "unsafe_process_kill_detected"
Assert-NotContains -Text $text -Pattern '"register"|"service"|"\-N"|"\-U"|"\-P"|"\-S"' -Code "pg_ctl_service_arg_detected"
Assert-Contains -Text $text -Pattern "postmaster\.pid" -Code "postmaster_pid_validation_missing"
Assert-Contains -Text $pidFunctionText -Pattern '\$lines\[1\]' -Code "postmaster_dataroot_line_missing"
Assert-Contains -Text $pidFunctionText -Pattern 'postmaster_dataroot_mismatch' -Code "postmaster_dataroot_mismatch_missing"
Assert-Contains -Text $pidFunctionText -Pattern 'postmaster_port_mismatch' -Code "postmaster_port_mismatch_missing"
Assert-Contains -Text $text -Pattern "Assert-PostgresProcessForInstance" -Code "postgres_process_validation_missing"
Assert-Contains -Text $text -Pattern "Assert-LoopbackListener" -Code "listener_validation_missing"
Assert-Contains -Text $text -Pattern "Write-ClusterState" -Code "cluster_state_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'Get-StableCreatedUtc' -Code "stable_created_utc_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'created_utc = \$createdUtc' -Code "created_utc_not_stable"
Assert-Contains -Text $stateFunctionText -Pattern 'updated_utc = \$now' -Code "updated_utc_not_updated"
Assert-NotContains -Text $stateFunctionText -Pattern 'created_utc = \$now' -Code "created_utc_regenerated"
Assert-Contains -Text $stateFunctionText -Pattern 'server_state = \$ServerState' -Code "server_state_field_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'server_cleanup_attempted = \$ServerCleanupAttempted' -Code "server_cleanup_attempted_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'server_cleanup_completed = \$ServerCleanupCompleted' -Code "server_cleanup_completed_missing"
Assert-Contains -Text $concordanceFunctionText -Pattern '\$allowedStateKeys = @\(' -Code "state_allowlist_missing"
Assert-Contains -Text $concordanceFunctionText -Pattern 'state_schema_invalid' -Code "state_schema_invalid_missing"
Assert-Contains -Text $concordanceFunctionText -Pattern 'server_state' -Code "state_server_state_validation_missing"
Assert-Contains -Text $text -Pattern "Assert-StrictFlatStateJson" -Code "strict_json_scan_missing"
Assert-Contains -Text $strictJsonFunctionText -Pattern "Read-StrictJsonString" -Code "json_string_parser_missing"
Assert-Contains -Text $strictJsonFunctionText -Pattern "state_duplicate_key" -Code "json_duplicate_key_error_missing"
Assert-Contains -Text $strictJsonFunctionText -Pattern '\$JsonText\[\$indexRef\.Value\] -ne ''\{''' -Code "json_root_object_check_missing"
Assert-Contains -Text $strictJsonFunctionText -Pattern '\$valueStart -eq ''\{''\s+-or\s+\$valueStart -eq ''\[''' -Code "json_array_rejection_missing"
Assert-Contains -Text $strictJsonFunctionText -Pattern '\$indexRef\.Value -ne \$JsonText\.Length' -Code "json_trailing_garbage_check_missing"
if ($text.IndexOf("Assert-StrictFlatStateJson", [System.StringComparison]::Ordinal) -gt $text.IndexOf("ConvertFrom-Json", [System.StringComparison]::Ordinal)) {
  Fail -Code "json_duplicate_scan_after_parse"
}
Assert-Contains -Text $concordanceFunctionText -Pattern 'cluster_id' -Code "concordance_cluster_id_missing"
Assert-Contains -Text $concordanceFunctionText -Pattern 'instance_name' -Code "concordance_instance_name_missing"
Assert-Contains -Text $concordanceFunctionText -Pattern 'marker_state_mismatch' -Code "marker_state_error_missing"
if (@([regex]::Matches($createFunctionText, "Assert-MarkerStateConcordance")).Count -lt 5) { Fail -Code "marker_state_concordance_calls_missing" }
Assert-Contains -Text $dataRootFunctionText -Pattern 'Assert-Marker[\s\S]+return \$full' -Code "dataroot_marker_success_return_missing"
Assert-Contains -Text $text -Pattern "VOTO_CLARO_ISOLATED_BASELINE_TEST_V1" -Code "marker_magic_missing"
Assert-NotContains -Text $text -Pattern "Remove-Item\s+[^\r\n]*-Recurse" -Code "recursive_remove_detected"
Assert-Contains -Text $text -Pattern "Invoke-LocalCompatPreflightValidator" -Code "compat_preflight_validator_missing"
Assert-Contains -Text $text -Pattern "Validate-LocalCompatPreflightCandidate\.ps1" -Code "compat_validator_not_referenced"
Assert-NotContains -Text $text -Pattern "local-compat-preflight\.candidate\.sql[^\r\n]*(psql|--file|Invoke-Expression)" -Code "compat_sql_execution_detected"
Assert-NotContains -Text $compatManifestText -Pattern "ready_for_execution=true|ready_for_apply=true|safe_to_apply_production=true|safe_to_apply_remote=true" -Code "compat_manifest_unsafe"
Assert-Contains -Text $compatManifestText -Pattern "ready_for_execution=false" -Code "compat_manifest_ready_missing"
Assert-Contains -Text $compatManifestText -Pattern "ready_for_apply=false" -Code "compat_manifest_apply_missing"
Assert-Contains -Text $compatManifestText -Pattern "pgcrypto_control_present=true" -Code "compat_manifest_pgcrypto_missing"
Assert-Contains -Text $compatManifestText -Pattern "extension_strategy=INSTALL_EXTENSION_LOCAL" -Code "compat_manifest_extension_strategy_missing"
Assert-Contains -Text $compatManifestText -Pattern "extension_count=1" -Code "compat_manifest_extension_count_missing"
Assert-Contains -Text $compatManifestText -Pattern "unresolved_dependency_count=0" -Code "compat_manifest_unresolved_count_invalid"
Assert-Contains -Text $compatManifestText -Pattern "compatibility_strategy_complete=true" -Code "compat_manifest_strategy_incomplete"
if (@([regex]::Matches($compatSqlText, "(?im)^\s*CREATE\s+EXTENSION\b")).Count -ne 1) {
  Fail -Code "compat_sql_extension_count_invalid"
}
Assert-Contains -Text $compatSqlText -Pattern "(?im)^\s*CREATE\s+EXTENSION\s+pgcrypto\s+WITH\s+SCHEMA\s+extensions\s*;" -Code "compat_sql_pgcrypto_statement_missing"
Assert-NotContains -Text $compatSqlText -Pattern "(?im)^\s*CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\b|CREATE\s+FUNCTION\s+(extensions\.)?gen_random_uuid|WITH\s+SCHEMA\s+public" -Code "compat_sql_extension_statement_invalid"
Assert-NotContains -Text $compatSql -Pattern "\\supabase\\migrations\\" -Code "compat_preflight_inside_migrations"
$compatAstTokensForCommands = $null
$compatAstErrorsForCommands = $null
$compatAstForCommands = [System.Management.Automation.Language.Parser]::ParseFile($compatValidator, [ref]$compatAstTokensForCommands, [ref]$compatAstErrorsForCommands)
$compatAstCommands = @($compatAstForCommands.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
foreach ($compatCommand in $compatAstCommands) {
  $compatCommandName = $compatCommand.GetCommandName()
  if (@("psql","initdb","pg_ctl","createdb","dropdb","pg_restore","pg_dump","pg_isready","docker","supabase") -contains $compatCommandName) {
    Fail -Code "compat_validator_forbidden_tool"
  }
}

foreach ($code in @(
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
    "cleanup_failed",
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
  )) {
  Assert-Contains -Text $text -Pattern $code -Code ("safe_code_missing_" + $code)
}

foreach ($line in @(
    "dependency_names=",
    "isolated_root=",
    "instance_name=",
    "admin_role=",
    "credential_strategy=WINDOWS_DPAPI_CURRENT_USER",
    "authentication=scram-sha-256",
    "create_implementation_present=true",
    "cleanup_action_present=true",
    "cleanup_authorized=false",
    "cleanup_execution_blocked=true",
    "cleanup_requires_empty_instance=true",
    "cleanup_recursive_delete_allowed=false",
    "cleanup_acl_modification_allowed=false",
    "cleanup_reparse_points_allowed=false",
    "cleanup_package_directory_in_scope=false",
    "git_ancestry_strategy=MERGE_BASE_IS_ANCESTOR",
    "process_output_strategy=ASYNC_DUAL_STREAM_DRAIN",
    "windows_argument_empty_value_safe=true",
    "pg_hba_ipv6_reject=::/0",
    "file_acl_inheritance=NONE",
    "acl_rules_api=GETACCESSRULES",
    "acl_include_explicit=true",
    "acl_include_inherited=true",
    "acl_identity_target=SECURITYIDENTIFIER",
    "acl_access_property_used=false",
    "acl_rules_fallback_allowed=false",
    "acl_identity_normalization=SECURITYIDENTIFIER_TRANSLATE",
    "acl_identity_name_comparison=false",
    "acl_validation_semantic_set=true",
    "acl_rule_order_dependency=false",
    "acl_fullcontrol_bitmask_validation=true",
    "partial_instance_cleanup_required=",
    "create_retry_blocked_until_cleanup=",
    "marker_state_concordance_required=true",
    "created_utc_stable=true",
    "git_working_directory_enforced=true",
    "process_output_drain_verified=true",
    "process_output_drain_failure_code=process_output_drain_failed",
    "no_pidfile_process_inventory=DOTNET_LOCAL_PROCESS_ENUMERATION",
    "no_server_evidence_requires_zero_authorized_or_ambiguous_processes=true",
    "process_executable_path_strategy=MAINMODULE_FILENAME_PS51",
    "process_path_property_used=false",
    "process_access_failure_strategy=AMBIGUOUS_FAIL_CLOSED",
    "process_identity_strategy=PID_MAINMODULE_STARTTIME",
    "real_process_enumeration_in_plan=false",
    "pg_ctl_start_failure_recovery=VERIFIED_PID_DATAROOT_EXECUTABLE_LISTENER",
    "pg_ctl_stop_strategy=FAST_WAIT_30_VERIFIED",
    "pg_ctl_stop_recheck_always=true",
    "pg_ctl_stop_recheck_timeout_seconds=15",
    "pid_reuse_detection=true",
    "postmaster_dataroot_validation=true",
    "raw_json_duplicate_scan_before_parse=true",
    "server_state_schema_strict=true",
    "state_schema_flat_strict=true",
    "server_state_unresolved_fail_closed=true",
    "ready_for_create=",
    "create_authorized=false",
    "create_execution_blocked=true",
    "create_execution_requires_exact_approval=true",
    "cleanup_action_present=true",
    "cleanup_authorized=false",
    "cleanup_execution_blocked=true",
    "cleanup_requires_empty_instance=true",
    "cleanup_recursive_delete_allowed=false",
    "cleanup_acl_modification_allowed=false",
    "cleanup_reparse_points_allowed=false",
    "cleanup_package_directory_in_scope=false",
    "apply_implementation_present=false",
    "verify_implementation_present=false",
    "destroy_implementation_present=false",
    "fulltest_implementation_present=false",
    "ready_for_apply=",
    "ready_for_verify=",
    "ready_for_destroy=",
    "grant_revoke_source_counts_only=true",
    "restored_acl_semantic_verification_required=true",
    "human_approval_required_for_create=true",
    "human_approval_required_for_apply=true",
    "human_approval_required_for_destroy=true",
    "destroy_requires_separate_action=true",
    "local_compat_preflight_valid=",
    "local_compat_preflight_ready_for_execution=",
    "local_compat_preflight_human_review_required=",
    "local_compat_preflight_extension_strategy=",
    "local_compat_preflight_unresolved_dependency_count=",
    "compatibility_strategy_complete=",
    "complete_postgres_package=",
    "postgres_bki_present=",
    "pgcrypto_control_present=",
    "pgcrypto_library_present="
  )) {
  Assert-Contains -Text $text -Pattern ([regex]::Escape($line)) -Code ("plan_output_missing_" + ($line -replace "[^a-z_]", ""))
}

foreach ($needle in @(
    "ready_for_create no equivale a autorizacion",
    "Apply permanece bloqueado",
    "auth.users",
    "storage.objects",
    "extensions.gen_random_uuid",
    "preflight local",
    "compatibilidad minima",
    "Auth no funcional",
    "Storage no funcional",
    "Realtime no funcional",
    "cron no funcional",
    "Apply continua bloqueado",
    "GRANT",
    "REVOKE",
    "FullTest no destruye",
    "Destroy siempre es accion separada",
    "Create esta implementada",
    "doble autorizacion exacta",
    "descendencia Git real",
    "merge-base --is-ancestor",
    "drenaje concurrente",
    "argumento vacio",
    "::/0",
    "ACL diferenciada",
    "created_utc estable",
    "concordancia marker/state",
    "System.String no puede borrarse",
    "LOCALAPPDATA\VotoClaro\PostgreSQL\isolated-baseline-test\pg17-port55432",
    "127.0.0.1:55432",
    "SCRAM-SHA-256",
    "DPAPI",
    "pwfile temporal",
    "no crea servicio Windows",
    "no modifica Firewall",
    "no ejecuta SQL",
    "no se conecta a Supabase",
    "Windows PowerShell 5.1",
    "Process.MainModule.FileName",
    "Process.Path no se utiliza",
    "evidencia queda ambigua",
    "PID, ExecutablePath y StartTimeUtc",
    "dispone cada objeto Process",
    "Incidente acl_validation_failed",
    "comparacion fragil entre SID y NTAccount",
    "Translate(SecurityIdentifier)",
    "no compara nombres de cuenta",
    "validacion de ACL es semantica",
    "sin depender del orden",
    "reglas Allow equivalentes fusionadas o divididas",
    "Owner no forma parte de esta correccion minima",
    "estado parcial requiere limpieza controlada",
    "No volver a ejecutar Create todavia",
    "no usar Destroy",
    "Una instancia parcial no se borra automaticamente",
    "no copiar, abrir ni compartir archivos de secrets"
  )) {
  Assert-Contains -Text $readmeText -Pattern ([regex]::Escape($needle)) -Code ("readme_missing_" + ($needle -replace "[^a-zA-Z0-9]", "_"))
}

function Assert-MutationRemovesRequired {
  param(
    [Parameter(Mandatory = $true)][string]$MutatedText,
    [Parameter(Mandatory = $true)][string]$RequiredPattern,
    [Parameter(Mandatory = $true)][string]$Code
  )
  if ($MutatedText -cmatch $RequiredPattern) {
    Fail -Code $Code
  }
}

function Assert-MutationAddsForbidden {
  param(
    [Parameter(Mandatory = $true)][string]$MutatedText,
    [Parameter(Mandatory = $true)][string]$ForbiddenPattern,
    [Parameter(Mandatory = $true)][string]$Code
  )
  if ($MutatedText -cnotmatch $ForbiddenPattern) {
    Fail -Code $Code
  }
}

function Resolve-SimulatedProcessExecutablePathForSelfTest {
  param([AllowNull()][object]$Process)
  if ($null -eq $Process) {
    return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_object_missing" }
  }
  if ($Process.HasExited -eq $true) {
    return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_already_exited" }
  }
  if ($Process.AccessDenied -eq $true) {
    return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_access_denied" }
  }
  if ($Process.MainModuleUnavailable -eq $true) {
    return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_main_module_unavailable" }
  }
  if ([string]::IsNullOrWhiteSpace($Process.MainModuleFileName)) {
    return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_executable_path_empty" }
  }
  if (-not [System.IO.Path]::IsPathRooted([string]$Process.MainModuleFileName)) {
    return [pscustomobject]@{ Success = $false; ExecutablePath = $null; SafeErrorCode = "process_executable_path_invalid" }
  }
  return [pscustomobject]@{ Success = $true; ExecutablePath = [System.IO.Path]::GetFullPath([string]$Process.MainModuleFileName); SafeErrorCode = "none" }
}

function Get-SimulatedLocalPostgresClassificationForSelfTest {
  param(
    [Parameter(Mandatory = $true)][object]$Process,
    [Parameter(Mandatory = $true)][string]$ExpectedExecutable
  )
  $resolved = Resolve-SimulatedProcessExecutablePathForSelfTest -Process $Process
  if (-not $resolved.Success) { return "AMBIGUOUS_POSTGRES_PROCESS" }
  if ($Process.StartTimeAvailable -ne $true) { return "AMBIGUOUS_POSTGRES_PROCESS" }
  if ($Process.ProcessName -ne "postgres") { return "AMBIGUOUS_POSTGRES_PROCESS" }
  $actual = [System.IO.Path]::GetFullPath($resolved.ExecutablePath).TrimEnd([char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar))
  $expected = [System.IO.Path]::GetFullPath($ExpectedExecutable).TrimEnd([char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar))
  if ([string]::Equals($actual, $expected, [System.StringComparison]::OrdinalIgnoreCase)) {
    return "AUTHORIZED_PACKAGE_PROCESS"
  }
  return "OTHER_POSTGRES_PROCESS"
}

function Get-SimulatedOriginalPostgresStateForSelfTest {
  param(
    [AllowNull()][object]$Process,
    [Parameter(Mandatory = $true)][object]$OriginalIdentity
  )
  if ($null -eq $Process) { return "ORIGINAL_PROCESS_EXITED" }
  $resolved = Resolve-SimulatedProcessExecutablePathForSelfTest -Process $Process
  if (-not $resolved.Success) {
    if ($resolved.SafeErrorCode -eq "process_already_exited") { return "ORIGINAL_PROCESS_EXITED" }
    return "PROCESS_STATE_UNRESOLVED"
  }
  if ($Process.StartTimeAvailable -ne $true) { return "PROCESS_STATE_UNRESOLVED" }
  $actual = [System.IO.Path]::GetFullPath($resolved.ExecutablePath).TrimEnd([char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar))
  $expected = [System.IO.Path]::GetFullPath($OriginalIdentity.ExecutablePath).TrimEnd([char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar))
  if ($Process.Pid -eq $OriginalIdentity.Pid -and
      $Process.ProcessName -eq $OriginalIdentity.ProcessName -and
      [string]::Equals($actual, $expected, [System.StringComparison]::OrdinalIgnoreCase) -and
      $Process.StartTimeUtc -eq $OriginalIdentity.StartTimeUtc) {
    return "ORIGINAL_PROCESS_RUNNING"
  }
  return "PID_REUSED"
}

function Get-SimulatedNoPidServerStateForSelfTest {
  param(
    [Parameter(Mandatory = $true)][bool]$ListenerOpen,
    [Parameter(Mandatory = $true)][int]$AuthorizedCount,
    [Parameter(Mandatory = $true)][int]$AmbiguousCount
  )
  if ($ListenerOpen -or $AuthorizedCount -gt 0 -or $AmbiguousCount -gt 0) {
    return "SERVER_STATE_UNRESOLVED"
  }
  return "NO_SERVER_EVIDENCE"
}

function Convert-SimulatedAclIdentityToSidForSelfTest {
  param([AllowNull()][object]$Identity)
  if ($null -eq $Identity) { return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_missing" } }
  if ($Identity.Kind -eq "SecurityIdentifier") {
    if ([string]::IsNullOrWhiteSpace($Identity.SidValue)) { return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_sid_empty" } }
    return [pscustomobject]@{ Success = $true; SidValue = $Identity.SidValue; SafeErrorCode = "none" }
  }
  if ($Identity.Kind -eq "NTAccount") {
    if ($Identity.TranslateFails -eq $true) { return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_translation_failed" } }
    if ([string]::IsNullOrWhiteSpace($Identity.SidValue)) { return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_sid_empty" } }
    return [pscustomobject]@{ Success = $true; SidValue = $Identity.SidValue; SafeErrorCode = "none" }
  }
  return [pscustomobject]@{ Success = $false; SidValue = $null; SafeErrorCode = "acl_identity_not_sid" }
}

function Get-SimulatedPropertyForSelfTest {
  param(
    [Parameter(Mandatory = $true)][object]$ObjectValue,
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowNull()][object]$DefaultValue
  )
  $property = $ObjectValue.PSObject.Properties[$Name]
  if ($null -eq $property) { return $DefaultValue }
  return $property.Value
}

function Get-SimulatedRestrictedAclRulesForSelfTest {
  param([AllowNull()][object]$Acl)
  if ($null -eq $Acl) { return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_missing" } }
  if ((Get-SimulatedPropertyForSelfTest -ObjectValue $Acl -Name "ReadFails" -DefaultValue $false) -eq $true) { return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_read_failed" } }
  if ((Get-SimulatedPropertyForSelfTest -ObjectValue $Acl -Name "ReturnsNull" -DefaultValue $false) -eq $true) { return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_collection_invalid" } }
  $api = Get-SimulatedPropertyForSelfTest -ObjectValue $Acl -Name "RulesApi" -DefaultValue "GetAccessRules"
  $includeExplicit = Get-SimulatedPropertyForSelfTest -ObjectValue $Acl -Name "IncludeExplicit" -DefaultValue $true
  $includeInherited = Get-SimulatedPropertyForSelfTest -ObjectValue $Acl -Name "IncludeInherited" -DefaultValue $true
  $targetType = Get-SimulatedPropertyForSelfTest -ObjectValue $Acl -Name "TargetType" -DefaultValue "SecurityIdentifier"
  if ($api -ne "GetAccessRules" -or $includeExplicit -ne $true -or $includeInherited -ne $true -or $targetType -ne "SecurityIdentifier") {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_collection_invalid" }
  }
  try {
    $rules = @()
    foreach ($rule in @($Acl.Rules)) {
      $rules += $rule
    }
    return [pscustomobject]@{ Success = $true; Rules = $rules; SafeErrorCode = "none" }
  } catch {
    return [pscustomobject]@{ Success = $false; Rules = @(); SafeErrorCode = "acl_rules_enumeration_failed" }
  }
}

function Test-SimulatedRestrictedAclForSelfTest {
  param(
    [Parameter(Mandatory = $true)][object]$Acl,
    [Parameter(Mandatory = $true)][string]$ExpectedSid,
    [Parameter(Mandatory = $true)][ValidateSet("Directory","File")][string]$TargetType
  )
  if ($Acl.Protected -ne $true) { return "acl_not_protected" }
  $expectedInheritance = if ($TargetType -eq "Directory") {
    [int]([System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit")
  } else {
    [int][System.Security.AccessControl.InheritanceFlags]::None
  }
  $expectedPropagation = [int][System.Security.AccessControl.PropagationFlags]::None
  $requiredRights = [int64][System.Security.AccessControl.FileSystemRights]::FullControl
  $combined = [int64]0
  $allowFound = $false
  $rulesResult = Get-SimulatedRestrictedAclRulesForSelfTest -Acl $Acl
  if (-not $rulesResult.Success) { return $rulesResult.SafeErrorCode }
  foreach ($rule in @($rulesResult.Rules)) {
    if ($null -eq $rule) { return "acl_rules_collection_invalid" }
    if ($rule.Inherited -eq $true) { return "acl_inherited_rule_present" }
    if ($rule.Type -eq "Deny") { return "acl_unexpected_deny_rule" }
    $identity = Convert-SimulatedAclIdentityToSidForSelfTest -Identity $rule.Identity
    if (-not $identity.Success) { return $identity.SafeErrorCode }
    if (-not [string]::Equals($identity.SidValue, $ExpectedSid, [System.StringComparison]::OrdinalIgnoreCase)) { return "acl_unexpected_identity" }
    if ([int]$rule.InheritanceValue -ne $expectedInheritance) { return "acl_inheritance_flags_mismatch" }
    if ([int]$rule.PropagationValue -ne $expectedPropagation) { return "acl_propagation_flags_mismatch" }
    if ($rule.Type -eq "Allow") {
      $allowFound = $true
      $combined = $combined -bor [int64]$rule.RightsValue
    }
  }
  if (-not $allowFound) { return "acl_missing_authorized_allow" }
  if (($combined -band $requiredRights) -ne $requiredRights) { return "acl_rights_insufficient" }
  return "ok"
}

$aclExpectedSid = "SID_EXPECTED"
$aclOtherSid = "SID_OTHER"
$aclSidIdentity = [pscustomobject]@{ Kind = "SecurityIdentifier"; SidValue = $aclExpectedSid; TranslateFails = $false }
$aclNtIdentity = [pscustomobject]@{ Kind = "NTAccount"; SidValue = $aclExpectedSid; TranslateFails = $false }
$aclUnmappedIdentity = [pscustomobject]@{ Kind = "NTAccount"; SidValue = $null; TranslateFails = $true }
$aclOtherIdentity = [pscustomobject]@{ Kind = "SecurityIdentifier"; SidValue = $aclOtherSid; TranslateFails = $false }
$aclDirectoryFlags = [int]([System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit")
$aclFileFlags = [int][System.Security.AccessControl.InheritanceFlags]::None
$aclPropagationNone = [int][System.Security.AccessControl.PropagationFlags]::None
$aclPropagationInheritOnly = [int][System.Security.AccessControl.PropagationFlags]::InheritOnly
$aclFull = [int64][System.Security.AccessControl.FileSystemRights]::FullControl
$aclSynchronize = [int64][System.Security.AccessControl.FileSystemRights]::Synchronize
$aclRead = [int64][System.Security.AccessControl.FileSystemRights]::ReadAndExecute
$aclWrite = [int64][System.Security.AccessControl.FileSystemRights]::Write
$aclRuleAllowFull = [pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }
$aclRuleAllowFullNt = [pscustomobject]@{ Identity = $aclNtIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }

if ((Get-SimulatedRestrictedAclRulesForSelfTest -Acl $null).SafeErrorCode -ne "acl_rules_missing") { Fail -Code "selftest_acl_rules_null_failed" }
if ((Get-SimulatedRestrictedAclRulesForSelfTest -Acl ([pscustomobject]@{ Protected = $true; ReadFails = $true; Rules = @() })).SafeErrorCode -ne "acl_rules_read_failed") { Fail -Code "selftest_acl_rules_read_failed" }
if ((Get-SimulatedRestrictedAclRulesForSelfTest -Acl ([pscustomobject]@{ Protected = $true; ReturnsNull = $true; Rules = @() })).SafeErrorCode -ne "acl_rules_collection_invalid") { Fail -Code "selftest_acl_rules_null_collection_failed" }
if ((Get-SimulatedRestrictedAclRulesForSelfTest -Acl ([pscustomobject]@{ Protected = $true; RulesApi = "Access"; IncludeExplicit = $true; IncludeInherited = $true; TargetType = "SecurityIdentifier"; Rules = @($aclRuleAllowFull) })).SafeErrorCode -ne "acl_rules_collection_invalid") { Fail -Code "selftest_acl_rules_access_api_failed" }
if ((Get-SimulatedRestrictedAclRulesForSelfTest -Acl ([pscustomobject]@{ Protected = $true; RulesApi = "GetAccessRules"; IncludeExplicit = $false; IncludeInherited = $true; TargetType = "SecurityIdentifier"; Rules = @($aclRuleAllowFull) })).SafeErrorCode -ne "acl_rules_collection_invalid") { Fail -Code "selftest_acl_rules_include_explicit_failed" }
if ((Get-SimulatedRestrictedAclRulesForSelfTest -Acl ([pscustomobject]@{ Protected = $true; RulesApi = "GetAccessRules"; IncludeExplicit = $true; IncludeInherited = $false; TargetType = "SecurityIdentifier"; Rules = @($aclRuleAllowFull) })).SafeErrorCode -ne "acl_rules_collection_invalid") { Fail -Code "selftest_acl_rules_include_inherited_failed" }
if ((Get-SimulatedRestrictedAclRulesForSelfTest -Acl ([pscustomobject]@{ Protected = $true; RulesApi = "GetAccessRules"; IncludeExplicit = $true; IncludeInherited = $true; TargetType = "NTAccount"; Rules = @($aclRuleAllowFull) })).SafeErrorCode -ne "acl_rules_collection_invalid") { Fail -Code "selftest_acl_rules_target_type_failed" }
if ((Convert-SimulatedAclIdentityToSidForSelfTest -Identity $aclSidIdentity).SidValue -ne $aclExpectedSid) { Fail -Code "selftest_acl_sid_identity_failed" }
if ((Convert-SimulatedAclIdentityToSidForSelfTest -Identity $aclNtIdentity).SidValue -ne $aclExpectedSid) { Fail -Code "selftest_acl_ntaccount_translation_failed" }
if ((Convert-SimulatedAclIdentityToSidForSelfTest -Identity $aclUnmappedIdentity).SafeErrorCode -ne "acl_identity_translation_failed") { Fail -Code "selftest_acl_identity_not_mapped_failed" }
if ((Convert-SimulatedAclIdentityToSidForSelfTest -Identity $null).SafeErrorCode -ne "acl_identity_missing") { Fail -Code "selftest_acl_null_identity_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @($aclRuleAllowFull) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "ok") { Fail -Code "selftest_acl_expected_sid_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclOtherIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_unexpected_identity") { Fail -Code "selftest_acl_other_sid_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @($aclRuleAllowFull, [pscustomobject]@{ Identity = $aclOtherIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_unexpected_identity") { Fail -Code "selftest_acl_additional_identity_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Deny"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_unexpected_deny_rule") { Fail -Code "selftest_acl_deny_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $true; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_inherited_rule_present") { Fail -Code "selftest_acl_inherited_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Deny"; Inherited = $true; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_inherited_rule_present") { Fail -Code "selftest_acl_inherited_deny_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $false; Rules = @($aclRuleAllowFull) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_not_protected") { Fail -Code "selftest_acl_not_protected_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "ok") { Fail -Code "selftest_acl_fullcontrol_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = ($aclFull -bor $aclSynchronize); InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "ok") { Fail -Code "selftest_acl_fullcontrol_synchronize_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclRead; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_rights_insufficient") { Fail -Code "selftest_acl_lower_rights_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclRead; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }, [pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = ($aclFull -band (-bnot $aclRead)); InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "ok") { Fail -Code "selftest_acl_split_allow_full_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclRead; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }, [pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclWrite; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_rights_insufficient") { Fail -Code "selftest_acl_split_allow_insufficient_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "ok") { Fail -Code "selftest_acl_directory_flags_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclFileFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_inheritance_flags_mismatch") { Fail -Code "selftest_acl_incomplete_flags_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationInheritOnly }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_propagation_flags_mismatch") { Fail -Code "selftest_acl_propagation_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = ($aclFull -band (-bnot $aclRead)); InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }, [pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclRead; InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "ok") { Fail -Code "selftest_acl_order_independent_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = ($aclFull -band (-bnot $aclRead)); InheritanceValue = $aclDirectoryFlags; PropagationValue = $aclPropagationNone }, [pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclRead; InheritanceValue = $aclFileFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_inheritance_flags_mismatch") { Fail -Code "selftest_acl_split_flags_mismatch_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @() }) -ExpectedSid $aclExpectedSid -TargetType Directory) -ne "acl_missing_authorized_allow") { Fail -Code "selftest_acl_missing_allow_failed" }
if ((Test-SimulatedRestrictedAclForSelfTest -Acl ([pscustomobject]@{ Protected = $true; Rules = @([pscustomobject]@{ Identity = $aclSidIdentity; Type = "Allow"; Inherited = $false; RightsValue = $aclFull; InheritanceValue = $aclFileFlags; PropagationValue = $aclPropagationNone }) }) -ExpectedSid $aclExpectedSid -TargetType File) -ne "ok") { Fail -Code "selftest_acl_file_flags_failed" }

function Test-SimulatedCleanupAuthorizationForSelfTest {
  param(
    [Parameter(Mandatory = $true)][bool]$Confirm,
    [AllowNull()][string]$Token,
    [Parameter(Mandatory = $true)][bool]$CreateConfirm,
    [AllowNull()][string]$CreateToken
  )
  if (-not $Confirm) { return "cleanup_not_authorized" }
  if ($CreateConfirm -or -not [string]::IsNullOrWhiteSpace($CreateToken)) { return "cleanup_not_authorized" }
  if (-not [string]::Equals($Token, "CLEANUP_PARTIAL_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432", [System.StringComparison]::Ordinal)) { return "cleanup_not_authorized" }
  return "ok"
}

function Test-SimulatedCleanupStateForSelfTest {
  param([Parameter(Mandatory = $true)][object]$State)
  if ($State.LocalAppDataValid -ne $true -or $State.InstanceDirectChild -ne $true -or $State.PathEqualsPackage -eq $true) { return "cleanup_path_validation_failed" }
  if ($State.IsolatedExists -ne $true -or $State.InstanceExists -ne $true) { return "cleanup_unexpected_content" }
  if ($State.AccessDenied -eq $true) { return "cleanup_access_denied" }
  if ($State.ReparsePoint -eq $true) { return "cleanup_reparse_point_detected" }
  if ($State.DataRootPresent -eq $true -or $State.StateRootPresent -eq $true -or $State.SecretRootPresent -eq $true -or $State.PostmasterPidPresent -eq $true -or $State.PgVersionPresent -eq $true) {
    if ($State.PostmasterPidPresent -eq $true) { return "cleanup_postmaster_pid_present" }
    return "cleanup_unexpected_content"
  }
  if ($State.PostgresProcessDetected -eq $true) { return "cleanup_postgres_process_detected" }
  if ($State.PostgresProcessAmbiguous -eq $true) { return "cleanup_postgres_process_ambiguous" }
  if ($State.PostgresServiceRunning -eq $true) { return "cleanup_postgresql_service_running" }
  if ($State.PortInUse -eq $true) { return "cleanup_port_in_use" }
  if ($State.StateChanged -eq $true) { return "cleanup_state_changed_during_validation" }
  if ($State.InstanceDeleteFails -eq $true) { return "cleanup_instance_delete_failed" }
  if ($State.ParentDeleteFails -eq $true) { return "cleanup_partial_success_parent_remains" }
  foreach ($entry in @($State.InstanceEntries)) {
    if ($entry.ReparsePoint -eq $true) { return "cleanup_reparse_point_detected" }
    if ($entry.Kind -eq "File" -or $entry.Kind -eq "Directory" -or $entry.Hidden -eq $true -or $entry.System -eq $true) { return "cleanup_unexpected_content" }
  }
  foreach ($entry in @($State.IsolatedEntries)) {
    if ($entry.Name -ne "pg17-port55432" -or $entry.ReparsePoint -eq $true -or $entry.Hidden -eq $true -or $entry.System -eq $true) {
      if ($entry.ReparsePoint -eq $true) { return "cleanup_reparse_point_detected" }
      return "cleanup_unexpected_content"
    }
  }
  if (@($State.IsolatedEntries).Count -ne 1) { return "cleanup_unexpected_content" }
  return "ok"
}

$cleanupGoodState = [pscustomobject]@{
  LocalAppDataValid = $true; InstanceDirectChild = $true; PathEqualsPackage = $false; IsolatedExists = $true; InstanceExists = $true;
  AccessDenied = $false; ReparsePoint = $false; DataRootPresent = $false; StateRootPresent = $false; SecretRootPresent = $false;
  PostmasterPidPresent = $false; PgVersionPresent = $false; PostgresProcessDetected = $false; PostgresProcessAmbiguous = $false;
  PostgresServiceRunning = $false; PortInUse = $false; StateChanged = $false; InstanceDeleteFails = $false; ParentDeleteFails = $false;
  InstanceEntries = @(); IsolatedEntries = @([pscustomobject]@{ Name = "pg17-port55432"; ReparsePoint = $false; Hidden = $false; System = $false })
}
if ((Test-SimulatedCleanupAuthorizationForSelfTest -Confirm:$false -Token "x" -CreateConfirm:$false -CreateToken $null) -ne "cleanup_not_authorized") { Fail -Code "selftest_cleanup_missing_confirm_failed" }
if ((Test-SimulatedCleanupAuthorizationForSelfTest -Confirm:$true -Token "wrong" -CreateConfirm:$false -CreateToken $null) -ne "cleanup_not_authorized") { Fail -Code "selftest_cleanup_bad_token_failed" }
if ((Test-SimulatedCleanupAuthorizationForSelfTest -Confirm:$true -Token "CLEANUP_PARTIAL_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432" -CreateConfirm:$false -CreateToken $null) -ne "ok") { Fail -Code "selftest_cleanup_auth_ok_failed" }
if ((Test-SimulatedCleanupAuthorizationForSelfTest -Confirm:$true -Token "CLEANUP_PARTIAL_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432" -CreateConfirm:$true -CreateToken $null) -ne "cleanup_not_authorized") { Fail -Code "selftest_cleanup_exclusive_failed" }
if ((Test-SimulatedCleanupStateForSelfTest -State ([pscustomobject]@{ LocalAppDataValid = $false; InstanceDirectChild = $true; PathEqualsPackage = $false; IsolatedExists = $true; InstanceExists = $true; AccessDenied = $false; ReparsePoint = $false; InstanceEntries = @(); IsolatedEntries = @() })) -ne "cleanup_path_validation_failed") { Fail -Code "selftest_cleanup_localappdata_failed" }
foreach ($case in @(
    @{ Name = "direct_child"; State = ($cleanupGoodState | Select-Object *); Property = "InstanceDirectChild"; Value = $false; Expected = "cleanup_path_validation_failed" },
    @{ Name = "package"; State = ($cleanupGoodState | Select-Object *); Property = "PathEqualsPackage"; Value = $true; Expected = "cleanup_path_validation_failed" },
    @{ Name = "isolated_absent"; State = ($cleanupGoodState | Select-Object *); Property = "IsolatedExists"; Value = $false; Expected = "cleanup_unexpected_content" },
    @{ Name = "instance_absent"; State = ($cleanupGoodState | Select-Object *); Property = "InstanceExists"; Value = $false; Expected = "cleanup_unexpected_content" },
    @{ Name = "data"; State = ($cleanupGoodState | Select-Object *); Property = "DataRootPresent"; Value = $true; Expected = "cleanup_unexpected_content" },
    @{ Name = "state"; State = ($cleanupGoodState | Select-Object *); Property = "StateRootPresent"; Value = $true; Expected = "cleanup_unexpected_content" },
    @{ Name = "secrets"; State = ($cleanupGoodState | Select-Object *); Property = "SecretRootPresent"; Value = $true; Expected = "cleanup_unexpected_content" },
    @{ Name = "pid"; State = ($cleanupGoodState | Select-Object *); Property = "PostmasterPidPresent"; Value = $true; Expected = "cleanup_postmaster_pid_present" },
    @{ Name = "pgversion"; State = ($cleanupGoodState | Select-Object *); Property = "PgVersionPresent"; Value = $true; Expected = "cleanup_unexpected_content" },
    @{ Name = "process"; State = ($cleanupGoodState | Select-Object *); Property = "PostgresProcessDetected"; Value = $true; Expected = "cleanup_postgres_process_detected" },
    @{ Name = "ambiguous"; State = ($cleanupGoodState | Select-Object *); Property = "PostgresProcessAmbiguous"; Value = $true; Expected = "cleanup_postgres_process_ambiguous" },
    @{ Name = "service"; State = ($cleanupGoodState | Select-Object *); Property = "PostgresServiceRunning"; Value = $true; Expected = "cleanup_postgresql_service_running" },
    @{ Name = "port"; State = ($cleanupGoodState | Select-Object *); Property = "PortInUse"; Value = $true; Expected = "cleanup_port_in_use" },
    @{ Name = "access"; State = ($cleanupGoodState | Select-Object *); Property = "AccessDenied"; Value = $true; Expected = "cleanup_access_denied" },
    @{ Name = "toc"; State = ($cleanupGoodState | Select-Object *); Property = "StateChanged"; Value = $true; Expected = "cleanup_state_changed_during_validation" },
    @{ Name = "delete"; State = ($cleanupGoodState | Select-Object *); Property = "InstanceDeleteFails"; Value = $true; Expected = "cleanup_instance_delete_failed" },
    @{ Name = "parent"; State = ($cleanupGoodState | Select-Object *); Property = "ParentDeleteFails"; Value = $true; Expected = "cleanup_partial_success_parent_remains" }
  )) {
  $case.State.($case.Property) = $case.Value
  if ((Test-SimulatedCleanupStateForSelfTest -State $case.State) -ne $case.Expected) { Fail -Code ("selftest_cleanup_" + $case.Name + "_failed") }
}
$cleanupFileState = $cleanupGoodState | Select-Object *
$cleanupFileState.InstanceEntries = @([pscustomobject]@{ Kind = "File"; Hidden = $false; System = $false; ReparsePoint = $false })
if ((Test-SimulatedCleanupStateForSelfTest -State $cleanupFileState) -ne "cleanup_unexpected_content") { Fail -Code "selftest_cleanup_file_failed" }
$cleanupDirState = $cleanupGoodState | Select-Object *
$cleanupDirState.InstanceEntries = @([pscustomobject]@{ Kind = "Directory"; Hidden = $false; System = $false; ReparsePoint = $false })
if ((Test-SimulatedCleanupStateForSelfTest -State $cleanupDirState) -ne "cleanup_unexpected_content") { Fail -Code "selftest_cleanup_directory_failed" }
$cleanupHiddenState = $cleanupGoodState | Select-Object *
$cleanupHiddenState.InstanceEntries = @([pscustomobject]@{ Kind = "File"; Hidden = $true; System = $false; ReparsePoint = $false })
if ((Test-SimulatedCleanupStateForSelfTest -State $cleanupHiddenState) -ne "cleanup_unexpected_content") { Fail -Code "selftest_cleanup_hidden_failed" }
$cleanupReparseState = $cleanupGoodState | Select-Object *
$cleanupReparseState.InstanceEntries = @([pscustomobject]@{ Kind = "File"; Hidden = $false; System = $false; ReparsePoint = $true })
if ((Test-SimulatedCleanupStateForSelfTest -State $cleanupReparseState) -ne "cleanup_reparse_point_detected") { Fail -Code "selftest_cleanup_reparse_failed" }
$cleanupOtherRootState = $cleanupGoodState | Select-Object *
$cleanupOtherRootState.IsolatedEntries = @([pscustomobject]@{ Name = "pg17-port55432"; ReparsePoint = $false; Hidden = $false; System = $false }, [pscustomobject]@{ Name = "other"; ReparsePoint = $false; Hidden = $false; System = $false })
if ((Test-SimulatedCleanupStateForSelfTest -State $cleanupOtherRootState) -ne "cleanup_unexpected_content") { Fail -Code "selftest_cleanup_other_root_failed" }
if ((Test-SimulatedCleanupStateForSelfTest -State $cleanupGoodState) -ne "ok") { Fail -Code "selftest_cleanup_success_failed" }

$expectedSelfTestPath = "C:\vc\pg\bin\postgres.exe"
$otherSelfTestPath = "D:\other\pg\bin\postgres.exe"
$sameStartTime = [datetime]"2026-01-01T00:00:00Z"
$simulatedAuthorized = [pscustomobject]@{ Pid = 10; ProcessName = "postgres"; MainModuleFileName = $expectedSelfTestPath; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $false; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }
$simulatedOther = [pscustomobject]@{ Pid = 11; ProcessName = "postgres"; MainModuleFileName = $otherSelfTestPath; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $false; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }
$simulatedNoPath = [pscustomobject]@{ Pid = 12; ProcessName = "postgres"; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $false; MainModuleFileName = $expectedSelfTestPath; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }
$simulatedMainModuleUnavailable = [pscustomobject]@{ Pid = 13; ProcessName = "postgres"; MainModuleFileName = $expectedSelfTestPath; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $true; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }
$simulatedAccessDenied = [pscustomobject]@{ Pid = 14; ProcessName = "postgres"; MainModuleFileName = $expectedSelfTestPath; HasExited = $false; AccessDenied = $true; MainModuleUnavailable = $false; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }
$simulatedExited = [pscustomobject]@{ Pid = 15; ProcessName = "postgres"; MainModuleFileName = $expectedSelfTestPath; HasExited = $true; AccessDenied = $false; MainModuleUnavailable = $false; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }
$simulatedEmptyPath = [pscustomobject]@{ Pid = 16; ProcessName = "postgres"; MainModuleFileName = " "; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $false; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }
$simulatedRelativePath = [pscustomobject]@{ Pid = 17; ProcessName = "postgres"; MainModuleFileName = "postgres.exe"; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $false; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }
$simulatedNoStartTime = [pscustomobject]@{ Pid = 18; ProcessName = "postgres"; MainModuleFileName = $expectedSelfTestPath; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $false; StartTimeAvailable = $false; StartTimeUtc = $sameStartTime }
$originalIdentity = [pscustomobject]@{ Pid = 10; ProcessName = "postgres"; ExecutablePath = $expectedSelfTestPath; StartTimeUtc = $sameStartTime }

if ((Resolve-SimulatedProcessExecutablePathForSelfTest -Process $null).SafeErrorCode -ne "process_object_missing") { Fail -Code "selftest_simulated_null_process_failed" }
if ((Resolve-SimulatedProcessExecutablePathForSelfTest -Process $simulatedNoPath).SafeErrorCode -ne "none") { Fail -Code "selftest_simulated_without_path_property_failed" }
if ((Resolve-SimulatedProcessExecutablePathForSelfTest -Process $simulatedMainModuleUnavailable).SafeErrorCode -ne "process_main_module_unavailable") { Fail -Code "selftest_simulated_mainmodule_unavailable_failed" }
if ((Resolve-SimulatedProcessExecutablePathForSelfTest -Process $simulatedAccessDenied).SafeErrorCode -ne "process_access_denied") { Fail -Code "selftest_simulated_access_denied_failed" }
if ((Resolve-SimulatedProcessExecutablePathForSelfTest -Process $simulatedExited).SafeErrorCode -ne "process_already_exited") { Fail -Code "selftest_simulated_exited_failed" }
if ((Resolve-SimulatedProcessExecutablePathForSelfTest -Process $simulatedEmptyPath).SafeErrorCode -ne "process_executable_path_empty") { Fail -Code "selftest_simulated_empty_path_failed" }
if ((Resolve-SimulatedProcessExecutablePathForSelfTest -Process $simulatedRelativePath).SafeErrorCode -ne "process_executable_path_invalid") { Fail -Code "selftest_simulated_relative_path_failed" }
if ((Get-SimulatedLocalPostgresClassificationForSelfTest -Process $simulatedAuthorized -ExpectedExecutable $expectedSelfTestPath) -ne "AUTHORIZED_PACKAGE_PROCESS") { Fail -Code "selftest_simulated_authorized_failed" }
if ((Get-SimulatedLocalPostgresClassificationForSelfTest -Process $simulatedOther -ExpectedExecutable $expectedSelfTestPath) -ne "OTHER_POSTGRES_PROCESS") { Fail -Code "selftest_simulated_other_failed" }
if ((Get-SimulatedLocalPostgresClassificationForSelfTest -Process $simulatedNoStartTime -ExpectedExecutable $expectedSelfTestPath) -ne "AMBIGUOUS_POSTGRES_PROCESS") { Fail -Code "selftest_simulated_missing_starttime_failed" }
if ((Get-SimulatedOriginalPostgresStateForSelfTest -Process $simulatedAuthorized -OriginalIdentity $originalIdentity) -ne "ORIGINAL_PROCESS_RUNNING") { Fail -Code "selftest_simulated_original_same_failed" }
if ((Get-SimulatedOriginalPostgresStateForSelfTest -Process ([pscustomobject]@{ Pid = 10; ProcessName = "postgres"; MainModuleFileName = $expectedSelfTestPath; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $false; StartTimeAvailable = $true; StartTimeUtc = ([datetime]"2026-01-01T00:00:01Z") }) -OriginalIdentity $originalIdentity) -ne "PID_REUSED") { Fail -Code "selftest_simulated_starttime_reuse_failed" }
if ((Get-SimulatedOriginalPostgresStateForSelfTest -Process ([pscustomobject]@{ Pid = 10; ProcessName = "postgres"; MainModuleFileName = $otherSelfTestPath; HasExited = $false; AccessDenied = $false; MainModuleUnavailable = $false; StartTimeAvailable = $true; StartTimeUtc = $sameStartTime }) -OriginalIdentity $originalIdentity) -ne "PID_REUSED") { Fail -Code "selftest_simulated_path_reuse_failed" }
if ((Get-SimulatedOriginalPostgresStateForSelfTest -Process $null -OriginalIdentity $originalIdentity) -ne "ORIGINAL_PROCESS_EXITED") { Fail -Code "selftest_simulated_process_gone_failed" }
if ((Get-SimulatedOriginalPostgresStateForSelfTest -Process $simulatedAccessDenied -OriginalIdentity $originalIdentity) -ne "PROCESS_STATE_UNRESOLVED") { Fail -Code "selftest_simulated_ambiguous_original_failed" }
if ((Get-SimulatedNoPidServerStateForSelfTest -ListenerOpen:$false -AuthorizedCount 0 -AmbiguousCount 0) -ne "NO_SERVER_EVIDENCE") { Fail -Code "selftest_simulated_no_server_failed" }
if ((Get-SimulatedNoPidServerStateForSelfTest -ListenerOpen:$false -AuthorizedCount 1 -AmbiguousCount 0) -ne "SERVER_STATE_UNRESOLVED") { Fail -Code "selftest_simulated_no_server_authorized_failed" }
if ((Get-SimulatedNoPidServerStateForSelfTest -ListenerOpen:$false -AuthorizedCount 0 -AmbiguousCount 1) -ne "SERVER_STATE_UNRESOLVED") { Fail -Code "selftest_simulated_no_server_ambiguous_failed" }

Assert-MutationRemovesRequired -MutatedText ($text -replace "127\.0\.0\.1", "0.0.0.0") -RequiredPattern "listen_addresses = '127\.0\.0\.1'" -Code "selftest_host_0000_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nlocalhost") -ForbiddenPattern "localhost" -Code "selftest_localhost_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`n::1") -ForbiddenPattern "::1" -Code "selftest_ipv6_loopback_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "55432", "5432") -RequiredPattern "port = 55432" -Code "selftest_port_5432_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "55432", "55433") -RequiredPattern '\$script:CreatePort\s*=\s*55432' -Code "selftest_other_port_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "VotoClaro\\PostgreSQL\\isolated-baseline-test", "VotoClaro\\elsewhere") -RequiredPattern "VotoClaro\\PostgreSQL\\isolated-baseline-test" -Code "selftest_bad_root_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nC:\Program Files\PostgreSQL") -ForbiddenPattern "Program Files" -Code "selftest_program_files_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`n\\server\share") -ForbiddenPattern "\\\\server\\share" -Code "selftest_unc_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace '\[switch\]\$ConfirmCreate', '[switch]$ConfirmMaybe') -RequiredPattern '\[switch\]\$ConfirmCreate' -Code "selftest_confirm_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432", "CREATE_VOTO_CLARO_ISOLATED") -RequiredPattern "CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432" -Code "selftest_token_partial_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text -replace "vc_isolated_admin", "postgres") -ForbiddenPattern "admin_user_invalid" -Code "selftest_admin_postgres_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`ntrust") -ForbiddenPattern "\btrust\b" -Code "selftest_trust_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nmd5") -ForbiddenPattern "\bmd5\b" -Code "selftest_md5_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`n--password=secret") -ForbiddenPattern "password=secret" -Code "selftest_password_argument_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`npassword = 'fixed'") -ForbiddenPattern "password\s*=\s*'fixed'" -Code "selftest_fixed_password_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "RandomNumberGenerator", "Random") -RequiredPattern "RandomNumberGenerator" -Code "selftest_rng_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "ConvertFrom-SecureString", "ConvertTo-InsecureString") -RequiredPattern "ConvertFrom-SecureString" -Code "selftest_dpapi_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace 'vc_isolated_admin\.dpapi', 'outside.dpapi') -RequiredPattern 'vc_isolated_admin\.dpapi' -Code "selftest_credential_path_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace 'initdb-password\.tmp', 'outside.tmp') -RequiredPattern 'initdb-password\.tmp' -Code "selftest_pwfile_path_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "finally", "afterwards") -RequiredPattern "finally" -Code "selftest_finally_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "Remove-PasswordFileStrict", "Skip-PasswordFileCleanup") -RequiredPattern "Remove-PasswordFileStrict" -Code "selftest_pwfile_cleanup_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nEveryone") -ForbiddenPattern "Everyone" -Code "selftest_everyone_acl_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nAuthenticated Users") -ForbiddenPattern "Authenticated Users" -Code "selftest_authenticated_users_acl_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nfsync = off") -ForbiddenPattern "fsync\s*=\s*off" -Code "selftest_fsync_off_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nfull_page_writes = off") -ForbiddenPattern "full_page_writes\s*=\s*off" -Code "selftest_full_page_writes_off_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nregister") -ForbiddenPattern "register" -Code "selftest_pg_ctl_register_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nsc.exe") -ForbiddenPattern "sc\.exe" -Code "selftest_sc_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nnetsh") -ForbiddenPattern "netsh" -Code "selftest_netsh_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nInvoke-Expression") -ForbiddenPattern "Invoke-Expression" -Code "selftest_invoke_expression_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`ncmd.exe") -ForbiddenPattern "cmd\.exe" -Code "selftest_cmd_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`npsql") -ForbiddenPattern "\bpsql\b" -Code "selftest_psql_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`ncreatedb") -ForbiddenPattern "\bcreatedb\b" -Code "selftest_createdb_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nSELECT 1") -ForbiddenPattern "SELECT 1" -Code "selftest_sql_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nRemove-Item -Recurse") -ForbiddenPattern "Remove-Item\s+-Recurse" -Code "selftest_recursive_remove_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace '"Apply" \{ Invoke-BlockedFutureAction -RequestedAction "Apply" \}', '"Apply" { Invoke-Apply }') -RequiredPattern '"Apply" \{ Invoke-BlockedFutureAction -RequestedAction "Apply" \}' -Code "selftest_apply_unblocked_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace '"Verify" \{ Invoke-BlockedFutureAction -RequestedAction "Verify" \}', '"Verify" { Invoke-Verify }') -RequiredPattern '"Verify" \{ Invoke-BlockedFutureAction -RequestedAction "Verify" \}' -Code "selftest_verify_unblocked_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace 'Invoke-BlockedFutureAction -RequestedAction "Destroy"', 'Invoke-Destroy') -RequiredPattern 'Invoke-BlockedFutureAction -RequestedAction "Destroy"' -Code "selftest_destroy_unblocked_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace '"FullTest" \{ Invoke-BlockedFutureAction -RequestedAction "FullTest" \}', '"FullTest" { Invoke-FullTest }') -RequiredPattern '"FullTest" \{ Invoke-BlockedFutureAction -RequestedAction "FullTest" \}' -Code "selftest_fulltest_unblocked_not_detected"
Assert-MutationAddsForbidden -MutatedText ($planFunctionText + "`nNew-Item x") -ForbiddenPattern "New-Item" -Code "selftest_plan_write_not_detected"
Assert-MutationAddsForbidden -MutatedText ($planFunctionText + "`nTcpListener") -ForbiddenPattern "TcpListener" -Code "selftest_plan_listener_not_detected"
Assert-MutationAddsForbidden -MutatedText ($planFunctionText + "`nRandomNumberGenerator") -ForbiddenPattern "RandomNumberGenerator" -Code "selftest_plan_password_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nWrite-Output `$plainTextPassword") -ForbiddenPattern "plainTextPassword" -Code "selftest_password_output_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nstate_password=secret") -ForbiddenPattern "state_password" -Code "selftest_state_secret_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nmarker_password=secret") -ForbiddenPattern "marker_password" -Code "selftest_marker_secret_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "postmaster\.pid", "postmaster.missing") -RequiredPattern "postmaster\.pid" -Code "selftest_postmaster_pid_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "Assert-PostgresProcessForInstance", "Skip-PostgresProcessValidation") -RequiredPattern "Assert-PostgresProcessForInstance" -Code "selftest_postgres_process_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace "port_race_detected", "port_race_skipped") -RequiredPattern "port_race_detected" -Code "selftest_port_revalidation_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($gitFunctionText + "`n[0-9a-f]{7,}") -ForbiddenPattern '\[0-9a-f\]\{7,\}' -Code "selftest_git_hash_regex_not_detected"
Assert-MutationRemovesRequired -MutatedText ($gitFunctionText -replace '"merge-base","--is-ancestor","fe899a1","HEAD"', '"merge-base","--is-ancestor","HEAD","fe899a1"') -RequiredPattern '"merge-base","--is-ancestor","fe899a1","HEAD"' -Code "selftest_merge_base_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($gitFunctionText -replace '"rev-parse","--verify","fe899a1\^\{commit\}"', '"rev-parse","--verify","HEAD"') -RequiredPattern '"rev-parse","--verify","fe899a1\^\{commit\}"' -Code "selftest_base_commit_verify_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($gitFunctionText -replace '"status","--porcelain=v1","--untracked-files=all"', '"status","--short"') -RequiredPattern '"status","--porcelain=v1","--untracked-files=all"' -Code "selftest_untracked_status_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($runnerFunctionText -replace 'StandardOutput\.ReadToEndAsync\(\)', 'StandardOutput.ReadToEnd()') -RequiredPattern 'StandardOutput\.ReadToEndAsync\(\)' -Code "selftest_stdout_async_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($runnerFunctionText -replace 'StandardError\.ReadToEndAsync\(\)', 'StandardError.ReadToEnd()') -RequiredPattern 'StandardError\.ReadToEndAsync\(\)' -Code "selftest_stderr_async_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($runnerFunctionText + "`nStandardOutput.ReadToEnd()") -ForbiddenPattern 'StandardOutput\.ReadToEnd\(\)' -Code "selftest_sync_read_not_detected"
Assert-MutationRemovesRequired -MutatedText ($runnerFunctionText -replace '4096', '999999') -RequiredPattern '4096' -Code "selftest_output_tail_limit_missing_not_detected"
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value "") -ne '""') { Fail -Code "selftest_empty_argument_failed" }
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value "abc") -ne "abc") { Fail -Code "selftest_simple_argument_failed" }
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value "a b") -ne '"a b"') { Fail -Code "selftest_space_argument_failed" }
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value 'C:\Ruta con espacios\archivo.txt') -ne '"C:\Ruta con espacios\archivo.txt"') { Fail -Code "selftest_path_space_argument_failed" }
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value 'valor con "comillas"') -ne '"valor con \"comillas\""') { Fail -Code "selftest_quote_argument_failed" }
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value 'a\"b') -ne '"a\\\"b"') { Fail -Code "selftest_backslash_quote_argument_failed" }
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value 'C:\fin con espacio\') -ne '"C:\fin con espacio\\"') { Fail -Code "selftest_trailing_backslash_argument_failed" }
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value 'Peru-ñ') -ne 'Peru-ñ') { Fail -Code "selftest_unicode_argument_failed" }
$nullRejected = $false
try { [void](ConvertTo-WindowsProcessArgumentForSelfTest -Value $null) } catch { $nullRejected = $true }
if (-not $nullRejected) { Fail -Code "selftest_null_argument_not_rejected" }
Assert-MutationAddsForbidden -MutatedText ($text + "`n::0/0") -ForbiddenPattern "::0/0" -Code "selftest_pg_hba_ambiguous_ipv6_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nhost all all ::1/128 scram-sha-256") -ForbiddenPattern "::1/128" -Code "selftest_pg_hba_ipv6_allow_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nhost all all 127.0.0.1/32 scram-sha-256") -ForbiddenPattern "scram-sha-256" -Code "selftest_pg_hba_second_scram_not_detected"
Assert-MutationAddsForbidden -MutatedText ($aclFunctionText + "`nFile ContainerInherit,ObjectInherit") -ForbiddenPattern "File ContainerInherit,ObjectInherit" -Code "selftest_file_acl_inheritance_not_detected"
Assert-MutationAddsForbidden -MutatedText ($aclFunctionText + "`nif (`$access.IdentityReference.Value -eq `$sid.Value) { }") -ForbiddenPattern 'IdentityReference\.Value\s+-[ceiqn]*eq\s+\$sid\.Value' -Code "selftest_acl_raw_identity_comparison_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclIdentityFunctionText -replace 'Translate\(\[System\.Security\.Principal\.SecurityIdentifier\]\)', 'ToString()') -RequiredPattern 'Translate\(\[System\.Security\.Principal\.SecurityIdentifier\]\)' -Code "selftest_acl_translate_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclIdentityFunctionText -replace 'IdentityNotMappedException', 'SystemException') -RequiredPattern 'IdentityNotMappedException' -Code "selftest_acl_identity_not_mapped_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclRulesFunctionText -replace 'GetAccessRules\(\$true, \$true, \[System\.Security\.Principal\.SecurityIdentifier\]\)', 'GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier])') -RequiredPattern 'GetAccessRules\(\s*\$true\s*,\s*\$true\s*,\s*\[System\.Security\.Principal\.SecurityIdentifier\]\s*\)' -Code "selftest_acl_include_inherited_false_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclRulesFunctionText -replace 'GetAccessRules\(\$true, \$true, \[System\.Security\.Principal\.SecurityIdentifier\]\)', 'GetAccessRules($false, $true, [System.Security.Principal.SecurityIdentifier])') -RequiredPattern 'GetAccessRules\(\s*\$true\s*,\s*\$true\s*,\s*\[System\.Security\.Principal\.SecurityIdentifier\]\s*\)' -Code "selftest_acl_include_explicit_false_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclRulesFunctionText -replace '\[System\.Security\.Principal\.SecurityIdentifier\]', '[System.Security.Principal.NTAccount]') -RequiredPattern 'GetAccessRules\(\s*\$true\s*,\s*\$true\s*,\s*\[System\.Security\.Principal\.SecurityIdentifier\]\s*\)' -Code "selftest_acl_target_type_not_detected"
Assert-MutationAddsForbidden -MutatedText ($aclRulesFunctionText + "`n`$fallback = `$Acl.Access") -ForbiddenPattern '\.Access\b' -Code "selftest_acl_access_fallback_not_detected"
Assert-MutationAddsForbidden -MutatedText ($aclSemanticFunctionText + "`n`$rulesResult.Rules = `$rulesResult.Rules | Where-Object { `$_.IdentityReference }") -ForbiddenPattern 'Where-Object' -Code "selftest_acl_sid_prefilter_not_detected"
Assert-MutationAddsForbidden -MutatedText ($aclSemanticFunctionText + "`n`$rulesResult.Rules = `$rulesResult.Rules | Where-Object { -not `$_.IsInherited }") -ForbiddenPattern 'Where-Object' -Code "selftest_acl_inherited_prefilter_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclSemanticFunctionText -replace 'AccessControlType\]::Deny', 'AccessControlType]::Allow') -RequiredPattern 'AccessControlType\]::Deny' -Code "selftest_acl_deny_rejection_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclSemanticFunctionText -replace 'IsInherited', 'IsExplicit') -RequiredPattern 'IsInherited' -Code "selftest_acl_inherited_rejection_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclSemanticFunctionText -replace 'acl_unexpected_identity', 'acl_validation_failed') -RequiredPattern 'acl_unexpected_identity' -Code "selftest_acl_additional_identity_rejection_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclSemanticFunctionText -replace '\-band\s+\$requiredRights', '-eq $requiredRights') -RequiredPattern '\-band\s+\$requiredRights' -Code "selftest_acl_bitmask_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclSemanticFunctionText -replace '\-bor\s+\[int64\]\$access\.FileSystemRights', '= [int64]$access.FileSystemRights') -RequiredPattern '\-bor\s+\[int64\]\$access\.FileSystemRights' -Code "selftest_acl_split_allow_or_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclSemanticFunctionText -replace 'InheritanceFlags', 'InheritFlagsRemoved') -RequiredPattern 'InheritanceFlags' -Code "selftest_acl_inheritance_validation_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($aclSemanticFunctionText -replace 'PropagationFlags', 'PropFlagsRemoved') -RequiredPattern 'PropagationFlags' -Code "selftest_acl_propagation_validation_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($aclSemanticFunctionText + "`nif (`$Acl.Access.Count -eq 1) { return }") -ForbiddenPattern '\.Count\s+-eq' -Code "selftest_acl_rule_count_dependency_not_detected"
Assert-MutationAddsForbidden -MutatedText ($aclSemanticFunctionText + "`nSet-Acl -LiteralPath x") -ForbiddenPattern 'Set-Acl' -Code "selftest_acl_selftest_set_acl_not_detected"
Assert-MutationAddsForbidden -MutatedText ($stateFunctionText -replace 'created_utc = \$createdUtc', 'created_utc = $now') -ForbiddenPattern 'created_utc = \$now' -Code "selftest_created_utc_regeneration_not_detected"
Assert-MutationRemovesRequired -MutatedText ($createFunctionText -replace "Assert-MarkerStateConcordance", "Skip-MarkerStateConcordance") -RequiredPattern "Assert-MarkerStateConcordance" -Code "selftest_marker_state_concordance_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace 'CleanupPartialCreate', 'CleanupMissing') -RequiredPattern 'CleanupPartialCreate' -Code "selftest_cleanup_action_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($cleanupAuthorizationFunctionText -replace 'ConfirmCleanupPartialCreate', 'ConfirmCreate') -RequiredPattern 'ConfirmCleanupPartialCreate' -Code "selftest_cleanup_confirm_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($cleanupAuthorizationFunctionText + "`n`$CreateApprovalToken = `$script:CreateApprovalToken") -ForbiddenPattern 'CreateApprovalToken\s*=\s*\$script:CreateApprovalToken' -Code "selftest_cleanup_create_token_reuse_not_detected"
Assert-MutationAddsForbidden -MutatedText ($cleanupFunctionText + "`n[System.IO.Directory]::Delete(`$layout.InstanceRoot, `$true)") -ForbiddenPattern 'Directory\]::Delete\([^\r\n]+,\s*\$true\)' -Code "selftest_cleanup_recursive_delete_not_detected"
Assert-MutationAddsForbidden -MutatedText ($cleanupFunctionText + "`nRemove-Item -LiteralPath `$layout.InstanceRoot") -ForbiddenPattern 'Remove-Item' -Code "selftest_cleanup_remove_item_not_detected"
Assert-MutationAddsForbidden -MutatedText ($cleanupFunctionText + "`nInvoke-Create") -ForbiddenPattern 'Invoke-Create' -Code "selftest_cleanup_chained_create_not_detected"
Assert-MutationRemovesRequired -MutatedText ($cleanupStateFunctionText -replace 'ReparsePoint', 'NoReparse') -RequiredPattern 'ReparsePoint' -Code "selftest_cleanup_reparse_check_not_detected"
Assert-MutationRemovesRequired -MutatedText ($cleanupProcessFunctionText -replace 'Test-PortAvailable', 'Skip-Port') -RequiredPattern 'Test-PortAvailable' -Code "selftest_cleanup_port_check_not_detected"
Assert-MutationRemovesRequired -MutatedText ($concordanceFunctionText -replace "cluster_id", "cluster_missing") -RequiredPattern "cluster_id" -Code "selftest_concordance_cluster_id_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($dataRootFunctionText + "`nif (`$RequireMarker) { Throw-SafeError -Code `"marker_missing`" }") -ForbiddenPattern 'if \(\$RequireMarker\) \{ Throw-SafeError -Code "marker_missing" \}' -Code "selftest_unconditional_marker_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($gitCommandFunctionText -replace 'Invoke-SafeProcess -FilePath \$git -Arguments \$Arguments -WorkingDirectory \$full', 'Invoke-SafeProcess -FilePath $git -Arguments $Arguments -WorkingDirectory $PWD') -RequiredPattern 'Invoke-SafeProcess -FilePath \$git -Arguments \$Arguments -WorkingDirectory \$full' -Code "selftest_git_working_directory_ignored_not_detected"
Assert-MutationRemovesRequired -MutatedText ($gitCommandFunctionText -replace '\$full = \[System\.IO\.Path\]::GetFullPath\(\$WorkingDirectory\)', '$full = $WorkingDirectory') -RequiredPattern '\$full = \[System\.IO\.Path\]::GetFullPath\(\$WorkingDirectory\)' -Code "selftest_git_working_directory_not_canonical_not_detected"
Assert-MutationRemovesRequired -MutatedText ($runnerFunctionText -replace '\$stdoutDoneAfterTimeout = \$stdoutTask\.Wait\(5000\)', '[void]$stdoutTask.Wait(5000)') -RequiredPattern '\$stdoutDoneAfterTimeout = \$stdoutTask\.Wait\(5000\)' -Code "selftest_stdout_timeout_wait_ignored_not_detected"
Assert-MutationRemovesRequired -MutatedText ($runnerFunctionText -replace '\$stderrDoneAfterTimeout = \$stderrTask\.Wait\(5000\)', '[void]$stderrTask.Wait(5000)') -RequiredPattern '\$stderrDoneAfterTimeout = \$stderrTask\.Wait\(5000\)' -Code "selftest_stderr_timeout_wait_ignored_not_detected"
Assert-MutationAddsForbidden -MutatedText ($runnerFunctionText + "`n`$x = `$stdoutTask.Result") -ForbiddenPattern '\.Result' -Code "selftest_task_result_unchecked_not_detected"
Assert-MutationRemovesRequired -MutatedText ($runnerFunctionText -replace 'process_output_drain_failed', 'process_timeout') -RequiredPattern 'process_output_drain_failed' -Code "selftest_output_drain_code_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($createFunctionText + "`nif (`$startResult.TimedOut) { Throw-SafeError -Code `"pg_ctl_timeout`" }") -ForbiddenPattern 'Throw-SafeError -Code "pg_ctl_timeout"' -Code "selftest_direct_pg_ctl_timeout_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace 'Resolve-VerifiedPgCtlStartFailure', 'Skip-PgCtlRecovery') -RequiredPattern 'Resolve-VerifiedPgCtlStartFailure' -Code "selftest_pg_ctl_recovery_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($serverStateFunctionText -replace 'Get-LocalPostgresProcessEvidence', 'Skip-ProcessInventory') -RequiredPattern 'Get-LocalPostgresProcessEvidence' -Code "selftest_no_pidfile_inventory_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($processEvidenceFunctionText -replace '\[System\.Diagnostics\.Process\]::GetProcessesByName\("postgres"\)', '@()') -RequiredPattern '\[System\.Diagnostics\.Process\]::GetProcessesByName\("postgres"\)' -Code "selftest_dotnet_inventory_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`n`$process.Path") -ForbiddenPattern '\$(process|Process|proc|Proc|postgresProcess|postgresProc)\.Path\b' -Code "selftest_process_path_not_detected"
Assert-MutationAddsForbidden -MutatedText ($text + "`nGet-Process postgres | Select-Object Path") -ForbiddenPattern 'Get-Process[^\r\n|]*\|\s*Select(-Object)?\s+Path\b' -Code "selftest_get_process_select_path_not_detected"
Assert-MutationRemovesRequired -MutatedText ($processExecutableFunctionText -replace 'MainModule\.FileName', 'Path') -RequiredPattern 'MainModule\.FileName' -Code "selftest_mainmodule_filename_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($processExecutableFunctionText -replace 'System\.ComponentModel\.Win32Exception', 'System.Exception') -RequiredPattern 'System\.ComponentModel\.Win32Exception' -Code "selftest_win32_exception_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($processExecutableFunctionText -replace 'System\.InvalidOperationException', 'System.Exception') -RequiredPattern 'System\.InvalidOperationException' -Code "selftest_invalid_operation_exception_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($processEvidenceFunctionText -replace 'Get-ProcessExecutablePathCompatible', 'Skip-ProcessExecutablePath') -RequiredPattern 'Get-ProcessExecutablePathCompatible' -Code "selftest_inventory_resolver_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($processEvidenceFunctionText -replace 'StartTime\.ToUniversalTime\(\)', 'StartTime') -RequiredPattern 'StartTime\.ToUniversalTime\(\)' -Code "selftest_inventory_starttime_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($processEvidenceFunctionText -replace 'AMBIGUOUS_POSTGRES_PROCESS', 'OTHER_POSTGRES_PROCESS') -RequiredPattern 'AMBIGUOUS_POSTGRES_PROCESS' -Code "selftest_ambiguous_classification_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($processEvidenceFunctionText + "`nStop-Process -Id 1") -ForbiddenPattern "Stop-Process" -Code "selftest_inventory_stop_process_not_detected"
Assert-MutationAddsForbidden -MutatedText ($processEvidenceFunctionText + "`ntaskkill /PID 1") -ForbiddenPattern "taskkill" -Code "selftest_inventory_taskkill_not_detected"
Assert-MutationAddsForbidden -MutatedText ($processEvidenceFunctionText + "`nWrite-Output `$process.Id") -ForbiddenPattern "Write-Output" -Code "selftest_inventory_pid_output_not_detected"
Assert-MutationRemovesRequired -MutatedText ($serverStateFunctionText -replace 'AuthorizedCount -gt 0', 'AuthorizedCount -lt 0') -RequiredPattern 'AuthorizedCount -gt 0' -Code "selftest_authorized_without_pidfile_not_detected"
Assert-MutationRemovesRequired -MutatedText ($serverStateFunctionText -replace 'AmbiguousCount -gt 0', 'AmbiguousCount -lt 0') -RequiredPattern 'AmbiguousCount -gt 0' -Code "selftest_ambiguous_without_pidfile_not_detected"
Assert-MutationRemovesRequired -MutatedText ($serverStateFunctionText -replace 'VERIFIED_SERVER_RUNNING', 'SERVER_STATE_UNRESOLVED') -RequiredPattern 'VERIFIED_SERVER_RUNNING' -Code "selftest_valid_pidfile_listener_closed_not_running"
Assert-MutationAddsForbidden -MutatedText ($pgCtlFailureFunctionText + "`nStop-Process -Id 1") -ForbiddenPattern "Stop-Process" -Code "selftest_stop_process_not_detected"
Assert-MutationAddsForbidden -MutatedText ($pgCtlFailureFunctionText + "`ntaskkill /PID 1") -ForbiddenPattern "taskkill" -Code "selftest_taskkill_not_detected"
Assert-MutationAddsForbidden -MutatedText ($pgCtlFailureFunctionText + "`nGet-Process postgres | ForEach-Object { `$_.Kill() }") -ForbiddenPattern 'Get-Process postgres|\.Kill\(\)' -Code "selftest_kill_by_process_name_not_detected"
Assert-MutationRemovesRequired -MutatedText ($pgCtlStopFunctionText -replace '"-m", "fast"', '"-m", "smart"') -RequiredPattern '"-m", "fast"' -Code "selftest_pg_ctl_stop_fast_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($pgCtlStopFunctionText -replace '"-w"', '"-W"') -RequiredPattern '"-w"' -Code "selftest_pg_ctl_stop_wait_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($pgCtlStopFunctionText -replace '"-t", "30"', '"-t", "5"') -RequiredPattern '"-t", "30"' -Code "selftest_pg_ctl_stop_timeout_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($pgCtlStopFunctionText + "`nif (-not `$stopResult.Success) { return }") -ForbiddenPattern 'if \(-not \$stopResult\.Success\)' -Code "selftest_stop_immediate_return_not_detected"
Assert-MutationRemovesRequired -MutatedText ($pgCtlStopFunctionText -replace 'Wait-ForVerifiedServerStopState', 'Skip-PostStopRecheck') -RequiredPattern 'Wait-ForVerifiedServerStopState' -Code "selftest_stop_timeout_recheck_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($postStopWaitFunctionText -replace '\[System\.Diagnostics\.Stopwatch\]::StartNew\(\)', '$null') -RequiredPattern '\[System\.Diagnostics\.Stopwatch\]::StartNew\(\)' -Code "selftest_post_stop_stopwatch_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($postStopWaitFunctionText -replace 'Elapsed\.TotalSeconds -lt 15', 'Elapsed.TotalSeconds -lt 9999') -RequiredPattern 'Elapsed\.TotalSeconds -lt 15' -Code "selftest_post_stop_timeout_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($originalProcessStateFunctionText -replace 'StartTime\.ToUniversalTime\(\)', 'StartTime') -RequiredPattern 'StartTime\.ToUniversalTime\(\)' -Code "selftest_starttime_utc_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($originalProcessStateFunctionText -replace 'PID_REUSED', 'SAME_PROCESS') -RequiredPattern 'PID_REUSED' -Code "selftest_pid_reuse_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($pidFunctionText -replace '\$lines\[1\]', '$missingDataRootLine') -RequiredPattern '\$lines\[1\]' -Code "selftest_postmaster_dataroot_line_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($pidFunctionText -replace 'postmaster_dataroot_mismatch', 'postmaster_pid_invalid') -RequiredPattern 'postmaster_dataroot_mismatch' -Code "selftest_postmaster_dataroot_mismatch_not_detected"
Assert-MutationRemovesRequired -MutatedText ($pidFunctionText -replace 'postmaster_port_mismatch', 'postmaster_pid_invalid') -RequiredPattern 'postmaster_port_mismatch' -Code "selftest_postmaster_port_mismatch_not_detected"
Assert-MutationRemovesRequired -MutatedText ($serverStateFunctionText -replace 'SERVER_STATE_UNRESOLVED', 'NO_SERVER_EVIDENCE') -RequiredPattern 'SERVER_STATE_UNRESOLVED' -Code "selftest_unresolved_server_state_not_detected"
Assert-MutationRemovesRequired -MutatedText ($pgCtlStopFunctionText -replace 'Test-LoopbackListenerOpen', 'Skip-ListenerCheck') -RequiredPattern 'Test-LoopbackListenerOpen' -Code "selftest_stop_listener_check_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($concordanceFunctionText + "`nunknown_extra_field") -ForbiddenPattern "unknown_extra_field" -Code "selftest_state_extra_field_not_detected"
Assert-MutationAddsForbidden -MutatedText ($concordanceFunctionText + "`npid = 123") -ForbiddenPattern "\bpid\b" -Code "selftest_state_pid_field_not_detected"
Assert-MutationAddsForbidden -MutatedText ($concordanceFunctionText + "`nstdout = x`nstderr = y") -ForbiddenPattern "stdout|stderr" -Code "selftest_state_stdout_stderr_not_detected"
Assert-MutationRemovesRequired -MutatedText ($text -replace 'Assert-StrictFlatStateJson', 'Skip-StrictFlatStateJson') -RequiredPattern 'Assert-StrictFlatStateJson' -Code "selftest_raw_json_scan_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($strictJsonFunctionText -replace 'state_duplicate_key', 'state_schema_invalid') -RequiredPattern 'state_duplicate_key' -Code "selftest_duplicate_key_missing_not_detected"
Assert-MutationAddsForbidden -MutatedText ($strictJsonFunctionText -replace "Throw-SafeError -Code `"state_duplicate_key`"", "return") -ForbiddenPattern '\breturn\b' -Code "selftest_duplicate_key_acceptance_not_detected"
Assert-MutationRemovesRequired -MutatedText ($strictJsonFunctionText -replace '\$valueStart -eq ''\{'' -or \$valueStart -eq ''\[''', '$false') -RequiredPattern '\$valueStart -eq ''\{'' -or \$valueStart -eq ''\[''' -Code "selftest_nested_json_acceptance_not_detected"
Assert-MutationRemovesRequired -MutatedText ($strictJsonFunctionText -replace '\$indexRef\.Value -ne \$JsonText\.Length', '$false') -RequiredPattern '\$indexRef\.Value -ne \$JsonText\.Length' -Code "selftest_trailing_garbage_acceptance_not_detected"

$planOutput = Invoke-Tool -Arguments @("-Action","Plan")
if ($LASTEXITCODE -ne 0 -or $planOutput -notcontains "ISOLATED_BASELINE_TEST_PLAN_OK") {
  Fail -Code "plan_action_failed"
}
foreach ($expectedLine in @(
    "ready_for_apply=false",
    "ready_for_verify=false",
    "ready_for_destroy=false",
    "postgres_major=17",
    "postgres_version=17.10",
    "complete_postgres_package=true",
    "isolated_root=LOCALAPPDATA\VotoClaro\PostgreSQL\isolated-baseline-test",
    "instance_name=pg17-port55432",
    "host=127.0.0.1",
    "port=55432",
    "admin_role=vc_isolated_admin",
    "credential_strategy=WINDOWS_DPAPI_CURRENT_USER",
    "authentication=scram-sha-256",
    "create_implementation_present=true",
    "git_ancestry_strategy=MERGE_BASE_IS_ANCESTOR",
    "process_output_strategy=ASYNC_DUAL_STREAM_DRAIN",
    "windows_argument_empty_value_safe=true",
    "pg_hba_ipv6_reject=::/0",
    "file_acl_inheritance=NONE",
    "acl_rules_api=GETACCESSRULES",
    "acl_include_explicit=true",
    "acl_include_inherited=true",
    "acl_identity_target=SECURITYIDENTIFIER",
    "acl_access_property_used=false",
    "acl_rules_fallback_allowed=false",
    "acl_identity_normalization=SECURITYIDENTIFIER_TRANSLATE",
    "acl_identity_name_comparison=false",
    "acl_validation_semantic_set=true",
    "acl_rule_order_dependency=false",
    "acl_fullcontrol_bitmask_validation=true",
    "partial_instance_cleanup_required=true",
    "create_retry_blocked_until_cleanup=true",
    "marker_state_concordance_required=true",
    "created_utc_stable=true",
    "git_working_directory_enforced=true",
    "process_output_drain_verified=true",
    "process_output_drain_failure_code=process_output_drain_failed",
    "no_pidfile_process_inventory=DOTNET_LOCAL_PROCESS_ENUMERATION",
    "no_server_evidence_requires_zero_authorized_or_ambiguous_processes=true",
    "process_executable_path_strategy=MAINMODULE_FILENAME_PS51",
    "process_path_property_used=false",
    "process_access_failure_strategy=AMBIGUOUS_FAIL_CLOSED",
    "process_identity_strategy=PID_MAINMODULE_STARTTIME",
    "real_process_enumeration_in_plan=false",
    "pg_ctl_start_failure_recovery=VERIFIED_PID_DATAROOT_EXECUTABLE_LISTENER",
    "pg_ctl_stop_strategy=FAST_WAIT_30_VERIFIED",
    "pg_ctl_stop_recheck_always=true",
    "pg_ctl_stop_recheck_timeout_seconds=15",
    "pid_reuse_detection=true",
    "postmaster_dataroot_validation=true",
    "raw_json_duplicate_scan_before_parse=true",
    "server_state_schema_strict=true",
    "state_schema_flat_strict=true",
    "server_state_unresolved_fail_closed=true",
    "postgres_bki_present=true",
    "pgcrypto_control_present=true",
    "pgcrypto_library_present=true",
    "local_compat_preflight_valid=true",
    "local_compat_preflight_extension_strategy=INSTALL_EXTENSION_LOCAL",
    "local_compat_preflight_unresolved_dependency_count=0",
    "local_compat_preflight_ready_for_execution=false",
    "local_compat_preflight_human_review_required=true",
    "compatibility_strategy_complete=true",
    "create_authorized=false",
    "create_execution_blocked=true",
    "create_execution_requires_exact_approval=true",
    "apply_implementation_present=false",
    "verify_implementation_present=false",
    "destroy_implementation_present=false",
    "fulltest_implementation_present=false",
    "grant_revoke_source_counts_only=true",
    "restored_acl_semantic_verification_required=true",
    "human_approval_required_for_create=true",
    "human_approval_required_for_apply=true",
    "human_approval_required_for_destroy=true",
    "destroy_requires_separate_action=true",
    "production_connection_used=false",
    "sql_executed=false"
  )) {
  if ($planOutput -notcontains $expectedLine) {
    Fail -Code ("plan_line_missing_" + ($expectedLine -replace "[^a-z_]", ""))
  }
}
if (-not (($planOutput | Where-Object { $_ -like "dependency_names=*" }) -match "auth.users") -or
    -not (($planOutput | Where-Object { $_ -like "dependency_names=*" }) -match "storage.objects") -or
    -not (($planOutput | Where-Object { $_ -like "dependency_names=*" }) -match "extensions.gen_random_uuid")) {
  Fail -Code "dependency_names_missing"
}
if (-not (($planOutput | Where-Object { $_ -like "local_compat_preflight_dependency_names=*" }) -match "extensions.gen_random_uuid")) {
  Fail -Code "compat_dependency_names_missing"
}

Assert-ToolFailure -Arguments @("-Action","Create") -ExpectedReason "create_not_authorized" -Code "create_not_authorized_missing"
Assert-ToolFailure -Arguments @("-Action","CleanupPartialCreate") -ExpectedReason "cleanup_not_authorized" -Code "cleanup_not_authorized_missing"
Assert-ToolFailure -Arguments @("-Action","Apply") -ExpectedReason "action_not_approved" -Code "apply_not_blocked"
Assert-ToolFailure -Arguments @("-Action","Verify") -ExpectedReason "action_not_approved" -Code "verify_not_blocked"
Assert-ToolFailure -Arguments @("-Action","FullTest") -ExpectedReason "action_not_approved" -Code "fulltest_not_blocked"
Assert-ToolFailure -Arguments @("-Action","Plan","-Port","5432") -ExpectedReason "port_reserved" -Code "port_5432_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-ClusterName","bad_cluster") -ExpectedReason "cluster_name_invalid" -Code "bad_cluster_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-DatabaseName","postgres") -ExpectedReason "database_name_invalid" -Code "postgres_database_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-DatabaseName","template0") -ExpectedReason "database_name_invalid" -Code "template0_database_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-DatabaseName","template1") -ExpectedReason "database_name_invalid" -Code "template1_database_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",([System.IO.Path]::GetPathRoot($repoRoot))) -ExpectedReason "data_root_invalid" -Code "drive_root_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",(Join-Path ([System.IO.Path]::GetPathRoot($repoRoot)) "Users\..\Windows\vc_staging_baseline_test_local")) -ExpectedReason "data_root_invalid" -Code "dotdot_path_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",(Join-Path $repoRoot "tmp\vc_staging_baseline_test_local")) -ExpectedReason "data_root_invalid" -Code "repo_path_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",(Join-Path $env:ProgramFiles "vc_staging_baseline_test_local")) -ExpectedReason "data_root_invalid" -Code "program_files_allowed"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",(Join-Path $env:WINDIR "vc_staging_baseline_test_local")) -ExpectedReason "data_root_invalid" -Code "windows_path_allowed"

$commonParent = Join-Path $env:LOCALAPPDATA "VotoClaro\PostgreSQL\isolated-baseline-test"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",$commonParent) -ExpectedReason "protected_path" -Code "common_parent_allowed"
$wrongLeaf = Join-Path $commonParent "vc_staging_baseline_test_other"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",$wrongLeaf) -ExpectedReason "data_root_invalid" -Code "wrong_leaf_allowed"

Assert-Contains -Text $text -Pattern "required_dependencies_count" -Code "dependency_count_missing"
Assert-Contains -Text $text -Pattern 'readyForApply = \$false' -Code "dependencies_do_not_block_apply"
Assert-Contains -Text $text -Pattern "source_counts_only" -Code "source_counts_strategy_missing"
Assert-Contains -Text $text -Pattern "semantic_verification_required" -Code "acl_strategy_missing"

Write-Output "SELF_TEST_OK"
