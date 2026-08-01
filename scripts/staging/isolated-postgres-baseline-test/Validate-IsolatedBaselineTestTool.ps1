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

Assert-Contains -Text $text -Pattern '\[ValidateSet\("Plan","Create","Apply","Verify","Destroy","FullTest"\)\]' -Code "actions_missing"
Assert-Contains -Text $text -Pattern 'switch \(\$Action\)' -Code "switch_dispatch_missing"
Assert-Contains -Text $text -Pattern '"Plan" \{ Invoke-Plan \}' -Code "plan_branch_missing"
Assert-Contains -Text $text -Pattern '"Create" \{ Invoke-BlockedFutureAction -RequestedAction "Create" \}' -Code "create_branch_not_blocked"
Assert-Contains -Text $text -Pattern '"Apply" \{ Invoke-BlockedFutureAction -RequestedAction "Apply" \}' -Code "apply_branch_not_blocked"
Assert-Contains -Text $text -Pattern '"Verify" \{ Invoke-BlockedFutureAction -RequestedAction "Verify" \}' -Code "verify_branch_not_blocked"
Assert-Contains -Text $text -Pattern '"FullTest" \{ Invoke-BlockedFutureAction -RequestedAction "FullTest" \}' -Code "fulltest_branch_not_blocked"
Assert-NotContains -Text $text -Pattern '"FullTest"[^\r\n]+Destroy|Invoke-BlockedFutureAction -RequestedAction "Destroy"[^\r\n]+FullTest' -Code "fulltest_destroy_detected"
Assert-NotContains -Text $text -Pattern '(?s)finally\s*\{.*DataRoot|finally\s*\{.*Assert-DataRoot' -Code "finally_dataroot_cleanup_detected"

$planFunction = [regex]::Match($text, "(?s)function Invoke-Plan \{.*?\n\}")
if (-not $planFunction.Success) { Fail -Code "plan_function_missing" }
Assert-NotContains -Text $planFunction.Value -Pattern "initdb|pg_ctl|createdb|dropdb|psql|pg_restore|pg_dump|pg_isready|postgres\.exe|Remove-Item|New-Item|Read-Host" -Code "plan_contains_forbidden_operation"

Assert-Contains -Text $text -Pattern '\$script:AllowedHost\s*=\s*"127\.0\.0\.1"' -Code "fixed_host_missing"
Assert-Contains -Text $text -Pattern '\[string\]\$PostgresBin\s*=\s*\(Join-Path \$env:LOCALAPPDATA "VotoClaro\\PostgreSQL\\17\.10-complete\\bin"\)' -Code "dynamic_postgresbin_missing"
Assert-NotContains -Text $text -Pattern "C:\\Users\\|HP\\AppData" -Code "hardcoded_user_path_detected"
Assert-NotContains -Text $text -Pattern "localhost" -Code "localhost_operational_host_detected"
Assert-NotContains -Text $text -Pattern "supabase\.co|pooler\.supabase\.com|amazonaws\.com" -Code "remote_host_literal_detected"
Assert-NotContains -Text $text -Pattern "NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|DATABASE_URL|POSTGRES_URL" -Code "forbidden_env_variable_detected"
Assert-NotContains -Text $text -Pattern "Get-Content\s+[^\r\n]*\.env|\.env\.local" -Code "env_file_read_detected"
Assert-Contains -Text $text -Pattern 'if \(\$Value -eq 5432\)' -Code "port_5432_rejection_missing"
Assert-Contains -Text $text -Pattern "Test-PortAvailable" -Code "port_availability_missing"
Assert-Contains -Text $text -Pattern "vc_staging_baseline_test_" -Code "prefix_missing"
Assert-Contains -Text $text -Pattern "vc_isolated_admin" -Code "admin_user_missing"
Assert-Contains -Text $text -Pattern "scram-sha-256" -Code "scram_missing"
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
    "ready_for_create=",
    "ready_for_apply=",
    "ready_for_verify=",
    "ready_for_destroy=",
    "grant_revoke_source_counts_only=true",
    "restored_acl_semantic_verification_required=true",
    "human_approval_required_for_create=true",
    "human_approval_required_for_apply=true",
    "human_approval_required_for_destroy=true",
    "destroy_requires_separate_action=true"
    "local_compat_preflight_valid="
    "local_compat_preflight_ready_for_execution="
    "local_compat_preflight_human_review_required="
    "local_compat_preflight_extension_strategy="
    "local_compat_preflight_unresolved_dependency_count="
    "compatibility_strategy_complete="
    "complete_postgres_package="
    "postgres_bki_present="
    "pgcrypto_control_present="
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
    "ninguna accion distinta de Plan"
  )) {
  Assert-Contains -Text $readmeText -Pattern ([regex]::Escape($needle)) -Code ("readme_missing_" + ($needle -replace "[^a-zA-Z0-9]", "_"))
}

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
    "postgres_bki_present=true",
    "pgcrypto_control_present=true",
    "pgcrypto_library_present=true",
    "local_compat_preflight_valid=true",
    "local_compat_preflight_extension_strategy=INSTALL_EXTENSION_LOCAL",
    "local_compat_preflight_unresolved_dependency_count=0",
    "local_compat_preflight_ready_for_execution=false",
    "local_compat_preflight_human_review_required=true",
    "compatibility_strategy_complete=true",
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

Assert-ToolFailure -Arguments @("-Action","Create") -ExpectedReason "action_not_approved" -Code "create_not_blocked"
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

$commonParent = Join-Path $env:LOCALAPPDATA "VotoClaro\isolated-postgres-baseline-test"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",$commonParent) -ExpectedReason "data_root_invalid" -Code "common_parent_allowed"
$wrongLeaf = Join-Path $commonParent "vc_staging_baseline_test_other"
Assert-ToolFailure -Arguments @("-Action","Plan","-DataRoot",$wrongLeaf) -ExpectedReason "data_root_invalid" -Code "wrong_leaf_allowed"

Assert-Contains -Text $text -Pattern "required_dependencies_count" -Code "dependency_count_missing"
Assert-Contains -Text $text -Pattern 'readyForApply = \$false' -Code "dependencies_do_not_block_apply"
Assert-Contains -Text $text -Pattern "source_counts_only" -Code "source_counts_strategy_missing"
Assert-Contains -Text $text -Pattern "semantic_verification_required" -Code "acl_strategy_missing"

Write-Output "SELF_TEST_OK"
