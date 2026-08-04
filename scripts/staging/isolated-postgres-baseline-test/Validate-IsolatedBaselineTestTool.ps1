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

function Get-TypeText {
  param([Parameter(Mandatory = $true)][string]$Name)
  $matches = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.TypeDefinitionAst] -and $node.Name -eq $Name }, $true))
  if ($matches.Count -ne 1) { Fail -Code ("type_missing_" + $Name) }
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

Assert-Contains -Text $text -Pattern '\[ValidateSet\("Plan","Create","CleanupPartialCreate","CleanupFailedCreate","Apply","Verify","Destroy","FullTest"\)\]' -Code "actions_missing"
Assert-Contains -Text $text -Pattern 'switch \(\$Action\)' -Code "switch_dispatch_missing"
Assert-Contains -Text $text -Pattern '"Plan" \{ Invoke-Plan \}' -Code "plan_branch_missing"
Assert-Contains -Text $text -Pattern '"Create" \{[\s\S]+Invoke-Create[\s\S]+-ConfirmCreate:\$ConfirmCreate[\s\S]+-CreateApprovalToken \$CreateApprovalToken' -Code "create_branch_missing"
Assert-Contains -Text $text -Pattern '"CleanupPartialCreate" \{[\s\S]+Invoke-CleanupPartialCreate[\s\S]+-ConfirmCleanupPartialCreate:\$ConfirmCleanupPartialCreate[\s\S]+-CleanupApprovalToken \$CleanupApprovalToken' -Code "cleanup_branch_missing"
Assert-Contains -Text $text -Pattern '"CleanupFailedCreate" \{[\s\S]+Invoke-CleanupFailedCreate[\s\S]+-ConfirmCleanupFailedCreate:\$ConfirmCleanupFailedCreate[\s\S]+-CleanupFailedCreateApprovalToken \$CleanupFailedCreateApprovalToken' -Code "cleanup_failed_branch_missing"
Assert-Contains -Text $text -Pattern '"Apply" \{ Invoke-BlockedFutureAction -RequestedAction "Apply" \}' -Code "apply_branch_not_blocked"
Assert-Contains -Text $text -Pattern '"Verify" \{ Invoke-BlockedFutureAction -RequestedAction "Verify" \}' -Code "verify_branch_not_blocked"
Assert-Contains -Text $text -Pattern '"FullTest" \{ Invoke-BlockedFutureAction -RequestedAction "FullTest" \}' -Code "fulltest_branch_not_blocked"
Assert-NotContains -Text $text -Pattern '"FullTest"[^\r\n]+Destroy|Invoke-BlockedFutureAction -RequestedAction "Destroy"[^\r\n]+FullTest' -Code "fulltest_destroy_detected"

$planFunctionText = Get-FunctionText -Name "Invoke-Plan"
$createFunctionText = Get-FunctionText -Name "Invoke-Create"
$createAuthorizationFunctionText = Get-FunctionText -Name "Assert-CreateAuthorization"
$createAuthorizationTestFunctionText = Get-FunctionText -Name "Test-CreateAuthorization"
$cleanupFunctionText = Get-FunctionText -Name "Invoke-CleanupPartialCreate"
$cleanupAuthorizationTestFunctionText = Get-FunctionText -Name "Test-CleanupAuthorization"
$cleanupAuthorizationFunctionText = Get-FunctionText -Name "Assert-CleanupAuthorization"
$cleanupFailedFunctionText = Get-FunctionText -Name "Invoke-CleanupFailedCreate"
$cleanupFailedAuthorizationTestFunctionText = Get-FunctionText -Name "Test-CleanupFailedCreateAuthorization"
$cleanupFailedAuthorizationFunctionText = Get-FunctionText -Name "Assert-CleanupFailedCreateAuthorization"
$cleanupFailedStateFunctionText = Get-FunctionText -Name "Assert-CleanupFailedCreateExactState"
$cleanupFailedStateFileSizeFunctionText = Get-FunctionText -Name "Assert-CleanupFailedCreateStateFileSize"
$cleanupFailedPayloadFunctionText = Get-FunctionText -Name "Assert-CleanupFailedCreateStatePayload"
$cleanupFailedPgCtlPayloadFunctionText = Get-FunctionText -Name "Assert-CleanupFailedPgCtlStartStatePayload"
$cleanupFailedPgCtlResidualFunctionText = Get-FunctionText -Name "Assert-CleanupFailedPgCtlStartResidual"
$cleanupFailedPgCtlManifestFunctionText = Get-FunctionText -Name "New-CleanupFailedPgCtlStartManifest"
$cleanupFailedPgCtlManifestDeleteFunctionText = Get-FunctionText -Name "Invoke-CleanupFailedPgCtlStartManifestDelete"
$cleanupFailedPgCtlSelfTestFunctionText = Get-FunctionText -Name "Invoke-CleanupFailedPgCtlStartRealFilesystemSelfTest"
$cleanupFailedFailureFunctionText = Get-FunctionText -Name "Get-CleanupFailedCreateSafeFailure"
$cleanupFailedIsolatedRootFunctionText = Get-FunctionText -Name "Assert-CleanupFailedCreateIsolatedRootSafe"
$cleanupFailedDirectorySafeFunctionText = Get-FunctionText -Name "Assert-CleanupFailedCreateDirectorySafe"
$cleanupFailedAclRulesFunctionText = Get-FunctionText -Name "Assert-CleanupFailedCreateAclRulesReadable"
$cleanupFailedAclOwnerFunctionText = Get-FunctionText -Name "Assert-CleanupFailedCreateAclOwnerCurrent"
$cleanupFailureFunctionText = Get-FunctionText -Name "Get-CleanupSafeFailure"
$cleanupEntriesClassText = ""
$cleanupEntriesNewFunctionText = Get-FunctionText -Name "New-CleanupDirectoryEntriesResult"
$cleanupEntriesAssertFunctionText = Get-FunctionText -Name "Assert-CleanupDirectoryEntriesResult"
$cleanupEntriesFunctionText = Get-FunctionText -Name "Get-CleanupDirectoryEntries"
$cleanupPathFunctionText = Get-FunctionText -Name "Assert-CleanupPathFixed"
$cleanupStateFunctionText = Get-FunctionText -Name "Assert-CleanupExactPartialState"
$cleanupSignatureFunctionText = Get-FunctionText -Name "Get-CleanupPartialStateSignature"
$cleanupProcessFunctionText = Get-FunctionText -Name "Assert-CleanupNoPostgresActivity"
$runnerFunctionText = Get-FunctionText -Name "Invoke-SafeProcess"
$persistentRunnerFunctionText = Get-FunctionText -Name "Invoke-PersistentChildSafeProcess"
$persistentOutputFunctionText = Get-FunctionText -Name "Read-PersistentProcessOutputTail"
$gitCommandFunctionText = Get-FunctionText -Name "Invoke-GitCommand"
$gitFunctionText = Get-FunctionText -Name "Assert-GitReadyForCreate"
$quoteFunctionText = Get-FunctionText -Name "ConvertTo-WindowsProcessArgument"
$aclFunctionText = Get-FunctionText -Name "Set-RestrictedAcl"
$aclIdentityFunctionText = Get-FunctionText -Name "Convert-IdentityReferenceToSidValue"
$aclRulesFunctionText = Get-FunctionText -Name "Get-RestrictedAclRulesForValidation"
$aclSemanticFunctionText = Get-FunctionText -Name "Assert-RestrictedAclSemantics"
$clusterStateUtcFunctionText = Get-FunctionText -Name "Convert-ClusterStateUtcForValidation"
$stableCreatedUtcFunctionText = Get-FunctionText -Name "Get-StableCreatedUtc"
$stateReplaceFunctionText = Get-FunctionText -Name "Invoke-StateFileReplace"
$stateReplaceTelemetryFunctionText = Get-FunctionText -Name "Get-StateReplaceFailureClassification"
$cleanupStateReplaceResidualFunctionText = Get-FunctionText -Name "Assert-CleanupPartialCreateStateReplaceResidual"
$cleanupManifestTreeFunctionText = Get-FunctionText -Name "Get-CleanupManifestTree"
$cleanupManifestFunctionText = Get-FunctionText -Name "New-CleanupPartialManifest"
$cleanupManifestDeleteFunctionText = Get-FunctionText -Name "Invoke-CleanupPartialManifestDelete"
$cleanupJournalFunctionText = Get-FunctionText -Name "Write-CleanupPartialJournal"
$cleanupPartialSelfTestFunctionText = Get-FunctionText -Name "Invoke-CleanupPartialRealFilesystemSelfTest"
$cleanupDeleteFailureInfoFunctionText = Get-FunctionText -Name "Get-CleanupDeleteFailureInfo"
$stateFunctionText = Get-FunctionText -Name "Write-ClusterState"
$stateConcordanceWrapperFunctionText = Get-FunctionText -Name "Assert-CreateStateMarkerConcordance"
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
Assert-NotContains -Text ($createFunctionText + "`n" + $cleanupFunctionText + "`n" + $cleanupFailedFunctionText) -Pattern 'finally[^\r\n]*(Remove-Item|\[System\.IO\.Directory\]::Delete)[^\r\n]*(DataRoot|InstanceRoot)' -Code "finally_dataroot_cleanup_detected"
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
Assert-Contains -Text $text -Pattern '\[switch\]\$ConfirmCleanupFailedCreate' -Code "confirm_cleanup_failed_missing"
Assert-Contains -Text $text -Pattern '\[string\]\$CleanupFailedCreateApprovalToken' -Code "cleanup_failed_token_param_missing"
Assert-Contains -Text $text -Pattern 'CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432' -Code "exact_create_token_missing"
Assert-Contains -Text $text -Pattern 'CLEANUP_PARTIAL_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432' -Code "exact_cleanup_token_missing"
Assert-Contains -Text $text -Pattern 'CLEANUP_FAILED_CREATE_VOTO_CLARO_ISOLATED_PG17_127001_55432' -Code "exact_cleanup_failed_token_missing"
Assert-Contains -Text $text -Pattern '\$script:ExpectedCreateApprovalToken\s*=' -Code "expected_create_token_missing"
Assert-Contains -Text $text -Pattern '\$script:ExpectedCleanupApprovalToken\s*=' -Code "expected_cleanup_token_missing"
Assert-Contains -Text $text -Pattern '\$script:ExpectedCleanupFailedCreateApprovalToken\s*=' -Code "expected_cleanup_failed_token_missing"
Assert-NotContains -Text $text -Pattern '\$script:CreateApprovalToken\s*=' -Code "homonymous_create_token_constant_detected"
Assert-NotContains -Text $text -Pattern '\$script:CleanupApprovalToken\s*=' -Code "homonymous_cleanup_token_constant_detected"
Assert-NotContains -Text $text -Pattern '(?m)^\s*\$(CreateApprovalToken|CleanupApprovalToken|CleanupFailedCreateApprovalToken|ConfirmCreate|ConfirmCleanupPartialCreate|ConfirmCleanupFailedCreate)\s*=' -Code "authorization_input_parameter_reassignment_detected"
Assert-NotContains -Text ($createAuthorizationFunctionText + $cleanupAuthorizationFunctionText + $cleanupFailedAuthorizationFunctionText + $createAuthorizationTestFunctionText + $cleanupAuthorizationTestFunctionText + $cleanupFailedAuthorizationTestFunctionText) -Pattern '\$PSBoundParameters|ContainsKey\(' -Code "authorization_scope_or_containskey_detected"
Assert-Contains -Text $createAuthorizationTestFunctionText -Pattern 'ProvidedCreateApprovalToken[\s\S]+ExpectedCreateApprovalToken[\s\S]+ConfirmCleanupPartialCreate[\s\S]+ProvidedCleanupApprovalToken[\s\S]+StringComparison\]::Ordinal' -Code "pure_create_authorization_missing"
Assert-Contains -Text $cleanupAuthorizationTestFunctionText -Pattern 'ProvidedCleanupApprovalToken[\s\S]+ExpectedCleanupApprovalToken[\s\S]+ConfirmCreate[\s\S]+ProvidedCreateApprovalToken[\s\S]+StringComparison\]::Ordinal' -Code "pure_cleanup_authorization_missing"
Assert-Contains -Text $createAuthorizationFunctionText -Pattern 'Test-CreateAuthorization[\s\S]+ExpectedCreateApprovalToken' -Code "assert_create_forwarding_missing"
Assert-Contains -Text $cleanupAuthorizationFunctionText -Pattern 'Test-CleanupAuthorization[\s\S]+ExpectedCleanupApprovalToken' -Code "assert_cleanup_forwarding_missing"
Assert-Contains -Text $createFunctionText -Pattern 'param\([\s\S]+ConfirmCreate[\s\S]+CreateApprovalToken[\s\S]+ConfirmCleanupPartialCreate[\s\S]+CleanupApprovalToken[\s\S]+Assert-CreateAuthorization' -Code "invoke_create_explicit_authorization_missing"
Assert-Contains -Text $cleanupFunctionText -Pattern 'param\([\s\S]+ConfirmCleanupPartialCreate[\s\S]+CleanupApprovalToken[\s\S]+ConfirmCreate[\s\S]+CreateApprovalToken[\s\S]+Assert-CleanupAuthorization' -Code "invoke_cleanup_explicit_authorization_missing"
Assert-Contains -Text $text -Pattern '"Create" \{[\s\S]+Invoke-Create[\s\S]+-ConfirmCreate:\$ConfirmCreate[\s\S]+-CreateApprovalToken \$CreateApprovalToken[\s\S]+-ConfirmCleanupPartialCreate:\$ConfirmCleanupPartialCreate[\s\S]+-CleanupApprovalToken \$CleanupApprovalToken' -Code "dispatcher_create_forwarding_missing"
Assert-Contains -Text $text -Pattern '"CleanupPartialCreate" \{[\s\S]+Invoke-CleanupPartialCreate[\s\S]+-ConfirmCleanupPartialCreate:\$ConfirmCleanupPartialCreate[\s\S]+-CleanupApprovalToken \$CleanupApprovalToken[\s\S]+-ConfirmCreate:\$ConfirmCreate[\s\S]+-CreateApprovalToken \$CreateApprovalToken' -Code "dispatcher_cleanup_forwarding_missing"
Assert-Contains -Text $cleanupPathFunctionText -Pattern 'IsolatedRootRelativePath[\s\S]+InstanceName[\s\S]+PostgresPackageRelativePath|Get-PostgresRoot' -Code "cleanup_fixed_paths_missing"
Assert-Contains -Text $cleanupPathFunctionText -Pattern 'OrdinalIgnoreCase[\s\S]+Test-IsInsideDirectory[\s\S]+cleanup_path_validation_failed' -Code "cleanup_path_validation_missing"
Assert-Contains -Text $cleanupStateFunctionText -Pattern 'DataRoot[\s\S]+LogRoot[\s\S]+StateRoot[\s\S]+SecretRoot[\s\S]+MarkerPath[\s\S]+StatePath[\s\S]+CredentialPath[\s\S]+PasswordFilePath[\s\S]+postmaster\.pid[\s\S]+PG_VERSION[\s\S]+postgresql\.conf[\s\S]+pg_hba\.conf' -Code "cleanup_exact_state_missing"
Assert-NotContains -Text $text -Pattern 'class\s+CleanupDirectoryEntriesResult' -Code "cleanup_entries_custom_class_detected"
Assert-Contains -Text $cleanupEntriesNewFunctionText -Pattern 'New-CleanupDirectoryEntriesResult[\s\S]+\[AllowEmptyCollection\(\)\]\[string\[\]\]\$Entries[\s\S]+\[pscustomobject\]@\{[\s\S]+Entries\s*=\s*\[string\[\]\]\$Entries[\s\S]+\}' -Code "cleanup_entries_new_contract_missing"
Assert-Contains -Text $cleanupEntriesFunctionText -Pattern '\[string\[\]\]\$entries\s*=\s*\[System\.IO\.Directory\]::GetFileSystemEntries\(\$PathValue\)[\s\S]+New-CleanupDirectoryEntriesResult -Entries \$entries' -Code "cleanup_entries_materialization_missing"
Assert-NotContains -Text $cleanupEntriesFunctionText -Pattern 'return\s+@\(|EnumerateFileSystemEntries|Write-Output|\$PSBoundParameters' -Code "cleanup_entries_unstable_return_detected"
Assert-Contains -Text $cleanupEntriesAssertFunctionText -Pattern 'PSObject\.Properties\["Entries"\][\s\S]+-not \(\$Result\.Entries -is \[string\[\]\]\)' -Code "cleanup_entries_assert_contract_missing"
Assert-Contains -Text $cleanupStateFunctionText -Pattern 'InstanceRoot[\s\S]+Assert-CleanupDirectoryEntriesResult[\s\S]+\[string\[\]\]\$instanceEntries\s*=\s*\$instanceEntriesResult\.Entries[\s\S]+cleanup_instance_not_empty[\s\S]+IsolatedRoot[\s\S]+Assert-CleanupDirectoryEntriesResult[\s\S]+\[string\[\]\]\$isolatedEntries\s*=\s*\$isolatedEntriesResult\.Entries[\s\S]+\$isolatedEntries\.Count -ne 1' -Code "cleanup_empty_content_validation_missing"
Assert-Contains -Text $cleanupStateFunctionText -Pattern '\$isolatedEntries\[0\][\s\S]+\[char\[\]\]@\(\[System\.IO\.Path\]::DirectorySeparatorChar, \[System\.IO\.Path\]::AltDirectorySeparatorChar\)[\s\S]+TrimEnd\(\$trimSeparators\)' -Code "cleanup_entry_indexing_or_trim_missing"
Assert-Contains -Text $cleanupStateFunctionText -Pattern 'Assert-CleanupEntrySafe' -Code "cleanup_entry_validation_missing"
Assert-Contains -Text $cleanupSignatureFunctionText -Pattern 'Assert-CleanupDirectoryEntriesResult[\s\S]+\[string\[\]\]\$isolatedEntries\s*=\s*@\(\$isolatedEntriesResult\.Entries \| Sort-Object\)[\s\S]+Assert-CleanupDirectoryEntriesResult[\s\S]+\[string\[\]\]\$instanceEntries\s*=\s*@\(\$instanceEntriesResult\.Entries \| Sort-Object\)[\s\S]+postmaster\.pid[\s\S]+PG_VERSION[\s\S]+postgresql\.conf[\s\S]+pg_hba\.conf' -Code "cleanup_signature_missing"
Assert-Contains -Text $cleanupFunctionText -Pattern 'cleanup_revalidate_signature[
	 -~]+Assert-CleanupPartialManifestUnchanged[
	 -~]+cleanup_revalidate_state[
	 -~]+Assert-CleanupExactPartialState[
	 -~]+cleanup_revalidate_activity[
	 -~]+Assert-CleanupNoPostgresActivity[
	 -~]+cleanup_delete_instance[
	 -~]+Assert-CleanupGitReady[
	 -~]+Invoke-CleanupPartialManifestDelete' -Code "cleanup_manifest_delete_sequence_missing"
Assert-Contains -Text $cleanupManifestFunctionText -Pattern 'Assert-CleanupPartialCreateStateReplaceResidual[
	 -~]+DataRoot[
	 -~]+LogRoot[
	 -~]+SecretRoot[
	 -~]+StateRoot[
	 -~]+postmaster\.pid[
	 -~]+PG_VERSION[
	 -~]+\$pgVersion -ne "17"[
	 -~]+pg_tblspc[
	 -~]+CredentialPath[
	 -~]+TempPath[
	 -~]+StatePath[
	 -~]+MarkerPath' -Code "cleanup_partial_manifest_state_missing"
Assert-Contains -Text $cleanupManifestTreeFunctionText -Pattern 'Stack\[string\][
	 -~]+GetFileSystemEntries[
	 -~]+ReparsePoint[
	 -~]+Files = \[string\[\]\]@\(\$files\.ToArray\(\) \| Sort-Object\)[
	 -~]+Directories = \[string\[\]\]@\(\$dirs\.ToArray\(\) \| Sort-Object \{ \$_\.Length \} -Descending\)' -Code "cleanup_manifest_tree_bottom_up_missing"
foreach ($journalPattern in @(
    'cleanup-partial[\s\S]+journal[\s\S]+json',
    'artifact_type = "voto_claro_cleanup_partial_manifest_journal"',
    'manifest_signature = \$Manifest\.Signature',
    'server_started = \$false',
    'production_connection_used = \$false',
    'sql_executed = \$false',
    'Set-RestrictedAcl -PathValue \$JournalPath -TargetType File'
  )) {
  Assert-Contains -Text $cleanupJournalFunctionText -Pattern $journalPattern -Code "cleanup_manifest_journal_missing"
}
Assert-Contains -Text $cleanupManifestDeleteFunctionText -Pattern 'Write-CleanupPartialJournal[
	 -~]+Step "prepared"[
	 -~]+Assert-CleanupPartialManifestUnchanged[
	 -~]+Assert-CleanupNoPostgresActivity[
	 -~]+Step "deleting_files"[
	 -~]+File\]::Delete\(\$file\)[
	 -~]+Step "deleting_directories"[
	 -~]+Directory\]::Delete\(\$dir, \$false\)' -Code "cleanup_manifest_delete_helper_missing"
Assert-Contains -Text $cleanupDeleteFailureInfoFunctionText -Pattern 'HResult[
	 -~]+ExistsAfter[
	 -~]+DirectoryEmpty[
	 -~]+ChildCount' -Code "cleanup_delete_failure_telemetry_missing"
Assert-Contains -Text $cleanupPartialSelfTestFunctionText -Pattern 'Path\]::GetTempPath\(\)[
	 -~]+package-out-of-scope[
	 -~]+repo-out-of-scope[
	 -~]+Invoke-CleanupPartialManifestDelete[
	 -~]+CLEANUP_PARTIAL_REAL_FILESYSTEM_SELF_TEST_OK' -Code "cleanup_partial_real_filesystem_selftest_missing"
Assert-Contains -Text $cleanupPartialSelfTestFunctionText -Pattern 'file-added-after-manifest-case[
	 -~]+\$addedManifest = New-CleanupPartialManifest[
	 -~]+added-after-manifest\.txt[
	 -~]+Invoke-CleanupPartialManifestDelete[
	 -~]+cleanup_state_changed[
	 -~]+\$authorizedProbeFiles[
	 -~]+packageSibling[
	 -~]+repoSibling[
	 -~]+CLEANUP_PARTIAL_FILE_ADDED_AFTER_MANIFEST_SELF_TEST_OK' -Code "cleanup_partial_file_added_after_manifest_selftest_missing"
Assert-NotContains -Text ($cleanupFunctionText + "`n" + $cleanupManifestDeleteFunctionText) -Pattern 'Remove-Item|Directory\]::Delete\([^\r\n]+,\s*\$true\)|-Recurse|Stop-Process|taskkill|takeown|icacls|Invoke-Create|Invoke-BlockedFutureAction -RequestedAction "Destroy"|\[?\*\]' -Code "cleanup_forbidden_operation_detected"
Assert-NotContains -Text $cleanupFunctionText -Pattern 'Remove-Item|Directory\]::Delete\([^\r\n]+,\s*\$true\)|-Recurse|-Force|Stop-Process|taskkill|Set-Acl|takeown|icacls|Invoke-Create|Invoke-BlockedFutureAction -RequestedAction "Destroy"|[?*]' -Code "cleanup_forbidden_operation_detected"
Assert-NotContains -Text $cleanupFunctionText -Pattern 'Throw-SafeError -Code "cleanup_failed"' -Code "cleanup_generic_failure_detected"
Assert-Contains -Text $cleanupFailedAuthorizationTestFunctionText -Pattern 'ProvidedCleanupFailedCreateApprovalToken[
	 -~]+ExpectedCleanupFailedCreateApprovalToken[
	 -~]+ConfirmCreate[
	 -~]+ProvidedCreateApprovalToken[
	 -~]+ConfirmCleanupPartialCreate[
	 -~]+ProvidedCleanupApprovalToken[
	 -~]+StringComparison\]::Ordinal' -Code "pure_cleanup_failed_authorization_missing"
Assert-Contains -Text $cleanupFailedFunctionText -Pattern 'Assert-CleanupFailedCreateAuthorization[
	 -~]+Assert-CleanupFailedCreateExactState[
	 -~]+Assert-CleanupNoPostgresActivity[
	 -~]+Get-CleanupFailedCreateStateSignature' -Code "cleanup_failed_flow_missing"
Assert-Contains -Text $cleanupFailedStateFunctionText -Pattern 'DataRoot[
	 -~]+LogRoot[
	 -~]+SecretRoot[
	 -~]+StateRoot[
	 -~]+PG_VERSION[
	 -~]+postmaster\.pid[
	 -~]+CredentialPath[
	 -~]+PasswordFilePath[
	 -~]+ServerLog' -Code "cleanup_failed_exact_paths_missing"
foreach ($payloadPattern in @('state -ne "failed"','create_directories','state_get_created_utc','state_get_created_utc_failed','server_state -ne "not_started"','initdb_completed -ne \$false','configuration_completed -ne \$false','server_started -ne \$false','credential_protected -ne \$false','plaintext_password_file_present -ne \$false')) {
  Assert-Contains -Text $cleanupFailedPayloadFunctionText -Pattern $payloadPattern -Code "cleanup_failed_payload_validation_missing"
}
Assert-Contains -Text $cleanupFailedPayloadFunctionText -Pattern 'state\.stage -eq "state_get_created_utc"[\s\S]+last_error_code -ne "state_get_created_utc_failed"' -Code "cleanup_failed_state_get_created_utc_guard_missing"
Assert-Contains -Text $cleanupFailedPayloadFunctionText -Pattern 'state\.stage -eq "create_directories"[\s\S]+last_error_code -eq "state_get_created_utc_failed"' -Code "cleanup_failed_create_directories_error_guard_missing"
Assert-Contains -Text $cleanupFailedStateFunctionText -Pattern 'Assert-CleanupFailedCreateStateFileSize' -Code "cleanup_failed_state_size_guard_missing"
Assert-Contains -Text $cleanupFailedStateFileSizeFunctionText -Pattern 'stateLength -lt 700[\s\S]+stateLength -gt 4096[\s\S]+markerLength -lt 80[\s\S]+markerLength -gt 512' -Code "cleanup_failed_state_size_bounds_missing"
Assert-NotContains -Text $cleanupFailedStateFunctionText -Pattern 'Length\s+-ne\s+975|Length\s+-ne\s+146' -Code "cleanup_failed_fixed_length_detected"
Assert-Contains -Text $cleanupFailedPgCtlPayloadFunctionText -Pattern 'stage -ne "pg_ctl_start"[\s\S]+last_error_code -ne "unexpected_failure"[\s\S]+initdb_completed -ne \$true[\s\S]+configuration_completed -ne \$false[\s\S]+server_started -ne \$false[\s\S]+server_state -ne "not_started"[\s\S]+credential_protected -ne \$true[\s\S]+plaintext_password_file_present -ne \$false' -Code "cleanup_failed_pg_ctl_payload_contract_missing"
Assert-Contains -Text $cleanupFailedPgCtlResidualFunctionText -Pattern 'Assert-CleanupPathFixed[\s\S]+Get-PostgresRoot[\s\S]+Assert-CleanupFailedCreateDirectorySafe[\s\S]+StatePath[\s\S]+MarkerPath[\s\S]+CredentialPath[\s\S]+ServerLog[\s\S]+PasswordFilePath[\s\S]+postmaster\.pid[\s\S]+PG_VERSION[\s\S]+postgresql\.conf[\s\S]+pg_hba\.conf[\s\S]+pg_tblspc' -Code "cleanup_failed_pg_ctl_residual_contract_missing"
Assert-Contains -Text $cleanupFailedPgCtlResidualFunctionText -Pattern 'Assert-CleanupFailedCreateExactEntries -PathValue \$Layout\.InstanceRoot -ExpectedEntries @\(\$Layout\.DataRoot, \$Layout\.LogRoot, \$Layout\.SecretRoot, \$Layout\.StateRoot\)[\s\S]+Assert-CleanupFailedCreateExactEntries -PathValue \$Layout\.LogRoot -ExpectedEntries @\(\$Layout\.ServerLog\)[\s\S]+Assert-CleanupFailedCreateExactEntries -PathValue \$Layout\.SecretRoot -ExpectedEntries @\(\$Layout\.CredentialPath\)[\s\S]+Assert-CleanupFailedCreateExactEntries -PathValue \$Layout\.StateRoot -ExpectedEntries @\(\$Layout\.StatePath, \$Layout\.MarkerPath\)' -Code "cleanup_failed_pg_ctl_exact_entries_missing"
Assert-Contains -Text $cleanupFailedPgCtlManifestFunctionText -Pattern 'Assert-CleanupFailedPgCtlStartResidual[\s\S]+Get-CleanupManifestTree -RootPath \$Layout\.DataRoot[\s\S]+Mode = "PG_CTL_START_INITIALIZED_RESIDUAL"[\s\S]+FixedPathValidationSkipped[\s\S]+Files = \$fileArray[\s\S]+Directories = \$dirArray[\s\S]+Signature = \(Get-CleanupFailedPgCtlStartManifestSignature' -Code "cleanup_failed_pg_ctl_manifest_contract_missing"
Assert-Contains -Text $text -Pattern 'function Get-CleanupFailedPgCtlStartManifestSignature[\s\S]+Get-FileSha256ForCleanupManifest[\s\S]+Get-StableStringHashForCleanupManifest' -Code "cleanup_failed_pg_ctl_manifest_signature_missing"
Assert-Contains -Text $cleanupFailedPgCtlManifestDeleteFunctionText -Pattern 'Assert-CleanupFailedPgCtlStartManifestUnchanged[\s\S]+Assert-CleanupNoPostgresActivity[\s\S]+foreach \(\$file in \$Manifest\.Files\)[\s\S]+File\]::Delete\(\$file\)[\s\S]+foreach \(\$dir in \$Manifest\.Directories\)[\s\S]+Directory\]::Delete\(\$dir, \$false\)[\s\S]+Assert-PostgresTools' -Code "cleanup_failed_pg_ctl_manifest_delete_contract_missing"
Assert-NotContains -Text ($cleanupFailedFunctionText + "`n" + $cleanupFailedPgCtlManifestDeleteFunctionText) -Pattern 'Remove-Item|Directory\]::Delete\([^\r\n]+,\s*\$true\)|-Recurse|Set-Acl|takeown|icacls|Stop-Process|taskkill' -Code "cleanup_failed_pg_ctl_forbidden_operation_detected"
Assert-Contains -Text $cleanupFailedFunctionText -Pattern 'PG_CTL_START_INITIALIZED_RESIDUAL[\s\S]+New-CleanupFailedPgCtlStartManifest[\s\S]+Assert-CleanupFailedPgCtlStartManifestUnchanged[\s\S]+cleanup_failed_delete_pg_ctl_start_manifest[\s\S]+Invoke-CleanupFailedPgCtlStartManifestDelete[\s\S]+cleanup_failed_create_manifest_valid=true' -Code "cleanup_failed_pg_ctl_flow_missing"
Assert-Contains -Text $cleanupFailedPgCtlSelfTestFunctionText -Pattern 'Path\]::GetTempPath\(\)[\s\S]+package-out-of-scope[\s\S]+repo-out-of-scope[\s\S]+New-CleanupFailedPgCtlStartManifest[\s\S]+Invoke-CleanupFailedPgCtlStartManifestDelete[\s\S]+CLEANUP_FAILED_PG_CTL_START_RESIDUAL_SELF_TEST_OK[\s\S]+CLEANUP_FAILED_PG_CTL_START_MUTATION_SELF_TEST_OK[\s\S]+CLEANUP_FAILED_PG_CTL_START_PLAN_SELF_TEST_OK' -Code "cleanup_failed_pg_ctl_selftest_missing"
if (@([regex]::Matches($cleanupFailedFunctionText, '\[System\.IO\.File\]::Delete\(')).Count -ne 2) { Fail -Code "cleanup_failed_file_delete_count_invalid" }
if (@([regex]::Matches($cleanupFailedFunctionText, '\[System\.IO\.Directory\]::Delete\([^\r\n]+, \$false\)')).Count -ne 6) { Fail -Code "cleanup_failed_directory_delete_count_invalid" }
Assert-NotContains -Text $cleanupFailedFunctionText -Pattern 'Directory\]::Delete\([^\r\n]+,\s*\$true\)|Remove-Item|Set-Acl|Invoke-Create|Invoke-CleanupPartialCreate|Invoke-BlockedFutureAction|Stop-Process|taskkill' -Code "cleanup_failed_forbidden_operation_detected"
Assert-Contains -Text $cleanupFailedFunctionText -Pattern 'cleanup_failed_delete_state_json[
	 -~]+File\]::Delete\(\$layout\.StatePath\)[
	 -~]+cleanup_failed_delete_marker[
	 -~]+File\]::Delete\(\$layout\.MarkerPath\)[
	 -~]+cleanup_failed_delete_state_root[
	 -~]+Directory\]::Delete\(\$layout\.StateRoot, \$false\)[
	 -~]+cleanup_failed_delete_data_root[
	 -~]+Directory\]::Delete\(\$layout\.DataRoot, \$false\)[
	 -~]+cleanup_failed_delete_log_root[
	 -~]+Directory\]::Delete\(\$layout\.LogRoot, \$false\)[
	 -~]+cleanup_failed_delete_secret_root[
	 -~]+Directory\]::Delete\(\$layout\.SecretRoot, \$false\)[
	 -~]+cleanup_failed_revalidate_activity_before_instance_delete[
	 -~]+cleanup_failed_delete_instance_root[
	 -~]+Directory\]::Delete\(\$layout\.InstanceRoot, \$false\)[
	 -~]+cleanup_failed_revalidate_activity_before_isolated_delete[
	 -~]+cleanup_failed_delete_isolated_root[
	 -~]+Directory\]::Delete\(\$layout\.IsolatedRoot, \$false\)' -Code "cleanup_failed_delete_order_missing"
Assert-Contains -Text $cleanupFailedIsolatedRootFunctionText -Pattern 'Get-IsolatedRoot[
	 -~]+GetFullPath[
	 -~]+PathType Container[
	 -~]+ReparsePoint[
	 -~]+Hidden[
	 -~]+System' -Code "cleanup_failed_isolated_root_path_guard_missing"
Assert-Contains -Text $cleanupFailedAclOwnerFunctionText -Pattern 'GetOwner\(\[System\.Security\.Principal\.SecurityIdentifier\]\)' -Code "cleanup_failed_isolated_root_owner_missing"
Assert-Contains -Text $cleanupFailedIsolatedRootFunctionText -Pattern 'WindowsIdentity\]::GetCurrent\(\)\.User' -Code "cleanup_failed_isolated_root_owner_missing"
Assert-Contains -Text $cleanupFailedAclOwnerFunctionText -Pattern 'OrdinalIgnoreCase' -Code "cleanup_failed_isolated_root_owner_missing"
Assert-Contains -Text $cleanupFailedIsolatedRootFunctionText -Pattern 'AreAccessRulesProtected -eq \$true[
	 -~]+Assert-RestrictedAclSemantics[
	 -~]+else[
	 -~]+Assert-CleanupFailedCreateAclRulesReadable' -Code "cleanup_failed_isolated_root_contract_split_missing"
Assert-Contains -Text $cleanupFailedIsolatedRootFunctionText -Pattern 'IsInherited[
	 -~]+cleanup_failed_acl_unexpected_explicit_rule[
	 -~]+AccessControlType\]::Deny[
	 -~]+cleanup_failed_acl_deny_rule[
	 -~]+Convert-IdentityReferenceToSidValue[
	 -~]+cleanup_failed_acl_identity_invalid[
	 -~]+FullControl[
	 -~]+cleanup_failed_acl_fullcontrol_missing' -Code "cleanup_failed_isolated_root_acl_checks_missing"
Assert-Contains -Text $cleanupFailedIsolatedRootFunctionText -Pattern 'Assert-CleanupFailedCreateExactEntries -PathValue \$isolatedRoot -ExpectedEntries @\(\$Layout\.InstanceRoot\)' -Code "cleanup_failed_isolated_root_content_check_missing"
Assert-Contains -Text $cleanupFailedStateFunctionText -Pattern 'Assert-CleanupFailedCreateIsolatedRootSafe -Layout \$Layout[
	 -~]+foreach \(\$dir in @\(\$Layout\.InstanceRoot, \$Layout\.DataRoot, \$Layout\.LogRoot, \$Layout\.SecretRoot, \$Layout\.StateRoot\)\)' -Code "cleanup_failed_exact_state_acl_split_missing"
Assert-Contains -Text $cleanupFailedFunctionText -Pattern 'cleanup_failed_isolated_root_acl[
	 -~]+Assert-CleanupFailedCreateIsolatedRootSafe -Layout \$layout[
	 -~]+cleanup_failed_internal_acl[
	 -~]+foreach \(\$dir in @\(\$layout\.InstanceRoot, \$layout\.DataRoot, \$layout\.LogRoot, \$layout\.SecretRoot, \$layout\.StateRoot\)\)' -Code "cleanup_failed_action_acl_split_missing"
Assert-NotContains -Text $cleanupFailedFunctionText -Pattern 'Set-RestrictedAcl|Set-Acl|icacls|takeown' -Code "cleanup_failed_acl_mutation_detected"
Assert-Contains -Text $createFunctionText -Pattern 'create_directories[
	 -~]+Test-Path -LiteralPath \$layout\.IsolatedRoot[
	 -~]+New-Item -ItemType Directory -Path \$layout\.IsolatedRoot[
	 -~]+Set-RestrictedAcl -PathValue \$layout\.IsolatedRoot -TargetType Directory[
	 -~]+foreach \(\$dir in @\(\$layout\.InstanceRoot' -Code "create_isolated_root_acl_hardening_missing"
foreach ($cleanupFailedPlanLine in @(
    "cleanup_failed_create_isolated_root_acl_contract=SAFE_INHERITED_OWNER_FULLCONTROL",
    "cleanup_failed_create_isolated_root_acl_modified=false",
    "cleanup_failed_create_internal_acl_contract=STRICT_PROTECTED_SINGLE_SID",
    "cleanup_failed_create_acl_contracts_separated=true",
    "create_isolated_root_acl_hardened=true"
  )) {
  Assert-Contains -Text $planFunctionText -Pattern ([regex]::Escape($cleanupFailedPlanLine)) -Code "cleanup_failed_plan_acl_line_missing"
}
Assert-Contains -Text $cleanupFailedFailureFunctionText -Pattern 'cleanup_failed_exact_state_invalid[
	 -~]+cleanup_failed_marker_state_invalid[
	 -~]+cleanup_failed_acl_invalid[
	 -~]+cleanup_failed_activity_detected[
	 -~]+cleanup_failed_delete_state_json_failed' -Code "cleanup_failed_classifier_missing"
Assert-Contains -Text $cleanupFunctionText -Pattern 'Get-CleanupSafeFailure[\s\S]+ExceptionType[\s\S]+Throw-SafeError -Code \$failure\.Reason' -Code "cleanup_safe_classifier_not_used"
Assert-Contains -Text $text -Pattern 'Write-Output "exception_type=\$script:CurrentExceptionType"' -Code "exception_type_output_missing"
Assert-Contains -Text $cleanupFailureFunctionText -Pattern 'UnauthorizedAccessException[\s\S]+IOException[\s\S]+DirectoryNotFoundException[\s\S]+SecurityException[\s\S]+InvalidOperationException[\s\S]+ArgumentException[\s\S]+MethodInvocationException[\s\S]+PropertyNotFoundException[\s\S]+RuntimeException[\s\S]+ParentContainsErrorRecordException[\s\S]+CmdletInvocationException[\s\S]+ItemNotFoundException[\s\S]+UnknownException' -Code "cleanup_exception_allowlist_missing"
Assert-Contains -Text $cleanupFailureFunctionText -Pattern '\$depth -lt 8[\s\S]+RuntimeHelpers[\s\S]+wrapperExceptionTypes[\s\S]+selectedType[\s\S]+selectedWrapper' -Code "cleanup_exception_unwrap_depth_missing"
Assert-Contains -Text $cleanupFailureFunctionText -Pattern 'cleanup_exact_state[\s\S]+cleanup_enumeration_denied[\s\S]+cleanup_enumeration_failed[\s\S]+cleanup_signature_initial[\s\S]+cleanup_signature_failed[\s\S]+cleanup_revalidate_activity_after_instance_delete[\s\S]+cleanup_activity_detected[\s\S]+cleanup_delete_instance[\s\S]+cleanup_delete_instance_failed[\s\S]+cleanup_delete_root[\s\S]+cleanup_delete_root_failed[\s\S]+cleanup_postcheck[\s\S]+cleanup_postcheck_failed' -Code "cleanup_failure_mapping_missing"
Assert-NotContains -Text $cleanupFailureFunctionText -Pattern 'StackTrace|TargetSite|HResult|\.Data|\.Source|\$PSBoundParameters|Get-Item|Test-Path|EnumerateFileSystemEntries|GetFileSystemEntries|Get-CleanupDirectoryEntries' -Code "cleanup_classifier_forbidden_dependency"
Assert-NotContains -Text $cleanupFailureFunctionText -Pattern 'Write-Output|Write-Host|Write-Error|Write-Warning' -Code "cleanup_classifier_outputs_detected"
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
Assert-Contains -Text $runnerFunctionText -Pattern '\$stdoutTask\.IsCompleted' -Code "stdout_task_completed_guard_missing"
Assert-Contains -Text $runnerFunctionText -Pattern '\$stderrTask\.IsCompleted' -Code "stderr_task_completed_guard_missing"
Assert-Contains -Text $persistentRunnerFunctionText -Pattern 'FILE_REDIRECT_NATIVE' -Code "persistent_child_file_redirect_missing"
Assert-Contains -Text $persistentRunnerFunctionText -Pattern 'persistent-child\.[\s\S]+\.stdout\.log[\s\S]+persistent-child\.[\s\S]+\.stderr\.log' -Code "persistent_child_output_files_missing"
Assert-Contains -Text $persistentRunnerFunctionText -Pattern 'CreateProcessW' -Code "persistent_child_wrapper_missing"
Assert-Contains -Text $persistentRunnerFunctionText -Pattern 'DuplicateHandle[\s\S]+SafeFileHandle\.DangerousGetHandle' -Code "persistent_child_file_redirection_missing"
Assert-NotContains -Text $persistentRunnerFunctionText -Pattern 'ReadToEndAsync\(|RedirectStandardOutput = \$true|RedirectStandardError = \$true' -Code "persistent_child_pipe_strategy_detected"
Assert-Contains -Text $persistentOutputFunctionText -Pattern 'FileShare\]::ReadWrite' -Code "persistent_output_retained_file_read_missing"
Assert-Contains -Text $createFunctionText -Pattern 'Invoke-PersistentChildSafeProcess[\s\S]+-OutputDirectory \$layout\.StateRoot[\s\S]+-ToolName "pg_ctl_start"' -Code "pg_ctl_start_persistent_runner_missing"
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
if (@([regex]::Matches($text, "host    all    all    127\.0\.0\.1/32    scram-sha-256")).Count -ne 1) { Fail -Code "pg_hba_scram_count_invalid" }
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
if (@([regex]::Matches($stateFunctionText, 'DateTimeOffset\]::UtcNow')).Count -ne 1) { Fail -Code "state_single_utcnow_capture_missing" }
Assert-Contains -Text $stateFunctionText -Pattern 'FallbackCreatedUtc \$now' -Code "state_created_utc_fallback_not_authoritative"
Assert-Contains -Text $stateFunctionText -Pattern 'Convert-ClusterStateUtcForValidation' -Code "state_utc_validation_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'createdUtcParsed -gt \$operationUtcParsed' -Code "state_future_created_utc_rejection_missing"
Assert-Contains -Text $stableCreatedUtcFunctionText -Pattern 'FallbackCreatedUtc' -Code "stable_created_utc_fallback_param_missing"
Assert-Contains -Text $stableCreatedUtcFunctionText -Pattern 'Test-Path -LiteralPath \$Layout\.StatePath[\s\S]+return \$FallbackCreatedUtc' -Code "stable_created_utc_initial_fallback_missing"
Assert-Contains -Text $stableCreatedUtcFunctionText -Pattern 'existingCreatedUtc -gt \$operationUtc' -Code "stable_created_utc_future_rejection_missing"
Assert-Contains -Text $clusterStateUtcFunctionText -Pattern 'TryParseExact[\s\S]+"o"[\s\S]+InvariantCulture[\s\S]+Offset -ne \[TimeSpan\]::Zero' -Code "state_utc_tryparse_exact_missing"
Assert-NotContains -Text $stableCreatedUtcFunctionText -Pattern 'UtcNow|Start-Sleep|CreationTimeUtc|DateTime\]::Now|AddMilliseconds|TotalMilliseconds|tolerance' -Code "stable_created_utc_second_clock_or_tolerance_detected"
Assert-NotContains -Text $stateFunctionText -Pattern 'Start-Sleep|CreationTimeUtc|DateTime\]::Now|AddMilliseconds|TotalMilliseconds|tolerance' -Code "state_write_tolerance_or_filesystem_clock_detected"
Assert-Contains -Text $stateFunctionText -Pattern 'server_state = \$ServerState' -Code "server_state_field_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'server_cleanup_attempted = \$ServerCleanupAttempted' -Code "server_cleanup_attempted_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'server_cleanup_completed = \$ServerCleanupCompleted' -Code "server_cleanup_completed_missing"
foreach ($stateStep in @("state_validate_input","state_get_created_utc","state_build_payload","state_serialize_json","state_write_temp","state_move_initial","state_replace_existing","state_apply_acl","state_acl_readback","state_schema_readback")) {
  Assert-Contains -Text $stateFunctionText -Pattern $stateStep -Code ("state_write_substep_missing_" + $stateStep)
}
foreach ($stateReason in @("state_validate_input_failed","state_get_created_utc_failed","state_build_payload_failed","state_serialize_json_failed","state_write_temp_failed","state_move_initial_failed","state_replace_existing_failed","state_apply_acl_failed","state_acl_readback_failed","state_schema_readback_failed","state_temp_file_residual")) {
  Assert-Contains -Text $stateFunctionText -Pattern $stateReason -Code ("state_write_reason_missing_" + $stateReason)
}
Assert-Contains -Text $stateFunctionText -Pattern 'cluster-state\\\.\[0-9a-f\]\{32\}\\\.\(tmp\|bak\)' -Code "state_temp_filter_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'File\]::Move\(\$tmp, \$Layout\.StatePath\)' -Code "state_move_initial_missing"
Assert-Contains -Text $stateReplaceFunctionText -Pattern 'File\]::Replace\(\$TempPath, \$Layout\.StatePath, \$backup, \$true\)' -Code "state_replace_existing_missing"
Assert-NotContains -Text $stateFunctionText -Pattern 'File\]::Replace\(\$tmp, \$Layout\.StatePath, \$null\)' -Code "state_replace_null_backup_detected"
Assert-Contains -Text $stateReplaceFunctionText -Pattern 'Set-RestrictedAcl -PathValue \$TempPath -TargetType File' -Code "state_replace_temp_acl_missing"
Assert-Contains -Text $stateReplaceFunctionText -Pattern 'New-StateRootGuidFilePath -StateRoot \$Layout\.StateRoot -Kind "bak"' -Code "state_replace_backup_guid_missing"
Assert-Contains -Text $stateReplaceTelemetryFunctionText -Pattern 'HResult[\s\S]+IsIOException[\s\S]+IsUnauthorizedAccessException[\s\S]+IsPlatformNotSupportedException[\s\S]+SourceExclusiveOpen[\s\S]+DestinationExclusiveOpen[\s\S]+BackupExclusiveOpen' -Code "state_replace_failure_telemetry_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'Set-RestrictedAcl -PathValue \$Layout\.StatePath -TargetType File' -Code "state_file_acl_apply_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'Get-Acl -LiteralPath \$Layout\.StatePath' -Code "state_acl_readback_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'Assert-RestrictedAclSemantics[\s\S]+TargetType File' -Code "state_acl_semantic_readback_missing"
Assert-Contains -Text $stateFunctionText -Pattern 'ReadAllText\(\$Layout\.StatePath\)[\s\S]+Assert-StrictFlatStateJson' -Code "state_schema_readback_missing"
Assert-Contains -Text $stateConcordanceWrapperFunctionText -Pattern 'state_marker_concordance[\s\S]+Assert-MarkerStateConcordance[\s\S]+state_marker_concordance_failed' -Code "state_marker_concordance_wrapper_missing"
Assert-Contains -Text $createFunctionText -Pattern 'Write-ClusterState[\s\S]+State "initializing"[\s\S]+Assert-CreateStateMarkerConcordance[\s\S]+Set-Stage -Stage "credential"' -Code "create_initial_state_gate_missing"
Assert-Contains -Text $createFunctionText -Pattern 'catch \{[\s\S]+\$reason = Get-SafeReason[\s\S]+CurrentSecondaryReason[\s\S]+Write-ClusterState[\s\S]+State "failed"[\s\S]+ErrorCode \$reason[\s\S]+catch \{[\s\S]+CurrentSecondaryReason = Get-SafeReason[\s\S]+Throw-SafeError -Code \$reason' -Code "create_primary_secondary_preservation_missing"
Assert-NotContains -Text $createFunctionText -Pattern '\$reason\s*=\s*"password_file_cleanup_failed"' -Code "create_primary_reason_replaced_by_cleanup"
Assert-Contains -Text $text -Pattern 'secondary_reason=\$script:CurrentSecondaryReason' -Code "secondary_reason_output_missing"
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
if (@([regex]::Matches($createFunctionText, "Assert-CreateStateMarkerConcordance")).Count -lt 5) { Fail -Code "marker_state_concordance_calls_missing" }
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
    "cleanup_failed_manifest_invalid",
    "cleanup_failed_manifest_changed",
    "cleanup_failed_delete_file_failed",
    "cleanup_failed_delete_directory_failed",
    "cleanup_failed_parent_not_empty",
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
    "cleanup_partial_create_nonempty_instance_supported=true",
    "cleanup_partial_create_manifest_valid=",
    "cleanup_partial_create_bottom_up_delete=true",
    "cleanup_partial_create_recursive_delete_used=false",
    "cleanup_partial_create_recovery_deterministic=true",
    "cleanup_partial_create_real_filesystem_self_test=true",
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
    "state_initial_created_utc_single_clock=true",
    "state_created_utc_preserved_on_rewrite=true",
    "state_created_utc_future_rejected=true",
    "state_created_utc_tolerance_used=false",
    "state_write_substep_reasons=true",
    "state_initial_write_fail_closed=true",
    "state_failed_write_secondary_reason_preserved=true",
    "state_primary_reason_preserved=true",
    "state_temp_residual_detection=true",
    "state_readback_schema_validation=true",
    "git_working_directory_enforced=true",
    "process_output_drain_verified=true",
    "process_output_drain_failure_code=process_output_drain_failed",
    "pg_ctl_start_process_strategy=FILE_REDIRECT_NO_PIPE_INHERITANCE",
    "pg_ctl_start_output_capture=CONTROLLED_FILES_SANITIZED_TAIL",
    "process_incomplete_task_dispose_safe=true",
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
    "cleanup_failed_create_required=",
    "cleanup_failed_create_exact_state_valid=",
    "cleanup_failed_create_mode=",
    "cleanup_failed_create_manifest_valid=",
    "create_authorized=false",
    "create_execution_blocked=true",
    "create_execution_requires_exact_approval=true",
    "cleanup_action_present=true",
    "cleanup_authorized=false",
    "cleanup_execution_blocked=true",
    "cleanup_partial_create_nonempty_instance_supported=true",
    "cleanup_partial_create_manifest_valid=",
    "cleanup_partial_create_bottom_up_delete=true",
    "cleanup_partial_create_recursive_delete_used=false",
    "cleanup_partial_create_recovery_deterministic=true",
    "cleanup_partial_create_real_filesystem_self_test=true",
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
  if ($State.ParentDeleteFails -eq $true) { return "cleanup_delete_root_failed" }
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
    @{ Name = "parent"; State = ($cleanupGoodState | Select-Object *); Property = "ParentDeleteFails"; Value = $true; Expected = "cleanup_delete_root_failed" }
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
if ((ConvertTo-WindowsProcessArgumentForSelfTest -Value 'Peru-ascii') -ne 'Peru-ascii') { Fail -Code "selftest_unicode_argument_failed" }
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
Assert-MutationRemovesRequired -MutatedText ($stateFunctionText -replace 'FallbackCreatedUtc \$now', 'FallbackCreatedUtc ([DateTimeOffset]::UtcNow.ToString("o"))') -RequiredPattern 'FallbackCreatedUtc \$now' -Code "selftest_state_fallback_clock_not_detected"
Assert-MutationAddsForbidden -MutatedText ($stableCreatedUtcFunctionText + "`n`$now = [DateTimeOffset]::UtcNow") -ForbiddenPattern 'UtcNow' -Code "selftest_stable_created_utc_second_clock_not_detected"
Assert-MutationAddsForbidden -MutatedText ($stableCreatedUtcFunctionText + "`nStart-Sleep -Milliseconds 1") -ForbiddenPattern 'Start-Sleep' -Code "selftest_stable_created_utc_sleep_not_detected"
Assert-MutationAddsForbidden -MutatedText ($stateFunctionText + "`n`$createdUtc = (Get-Item `$Layout.StatePath).CreationTimeUtc") -ForbiddenPattern 'CreationTimeUtc' -Code "selftest_state_filesystem_clock_not_detected"
Assert-MutationRemovesRequired -MutatedText ($clusterStateUtcFunctionText -replace 'TryParseExact', 'Parse') -RequiredPattern 'TryParseExact' -Code "selftest_state_tryparse_exact_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($clusterStateUtcFunctionText -replace 'Offset -ne \[TimeSpan\]::Zero', 'Offset -eq [TimeSpan]::Zero') -RequiredPattern 'Offset -ne \[TimeSpan\]::Zero' -Code "selftest_state_utc_offset_missing_not_detected"

function Convert-UtcForSelfTest {
  param(
    [AllowEmptyString()][string]$Value
  )
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $parsed = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParseExact($Value, "o", [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)) { return $null }
  if ($parsed.Offset -ne [TimeSpan]::Zero) { return $null }
  return $parsed
}

function Resolve-StableCreatedUtcForSelfTest {
  param(
    [Parameter(Mandatory = $true)][bool]$ExistingState,
    [AllowEmptyString()][string]$ExistingCreatedUtc,
    [AllowEmptyString()][string]$FallbackCreatedUtc,
    [Parameter(Mandatory = $true)][bool]$SchemaValid,
    [Parameter(Mandatory = $true)][bool]$ClusterMatches
  )
  $operationUtc = Convert-UtcForSelfTest -Value $FallbackCreatedUtc
  if ($null -eq $operationUtc) { return [pscustomobject]@{ Ok = $false; Reason = "state_get_created_utc_failed"; CreatedUtc = $null } }
  if (-not $ExistingState) { return [pscustomobject]@{ Ok = $true; Reason = $null; CreatedUtc = $FallbackCreatedUtc } }
  if (-not $SchemaValid -or -not $ClusterMatches) { return [pscustomobject]@{ Ok = $false; Reason = "state_get_created_utc_failed"; CreatedUtc = $null } }
  $existingUtc = Convert-UtcForSelfTest -Value $ExistingCreatedUtc
  if ($null -eq $existingUtc -or $existingUtc -gt $operationUtc) { return [pscustomobject]@{ Ok = $false; Reason = "state_get_created_utc_failed"; CreatedUtc = $null } }
  return [pscustomobject]@{ Ok = $true; Reason = $null; CreatedUtc = $ExistingCreatedUtc }
}

$clockFirst = Resolve-StableCreatedUtcForSelfTest -ExistingState:$false -ExistingCreatedUtc $null -FallbackCreatedUtc "2026-01-01T00:00:00.0000000+00:00" -SchemaValid:$true -ClusterMatches:$true
if (-not $clockFirst.Ok -or $clockFirst.CreatedUtc -ne "2026-01-01T00:00:00.0000000+00:00") { Fail -Code "selftest_single_clock_initial_created_utc_failed" }
$clockPreserved = Resolve-StableCreatedUtcForSelfTest -ExistingState:$true -ExistingCreatedUtc "2025-12-31T23:59:59.0000000+00:00" -FallbackCreatedUtc "2026-01-01T00:00:00.0000000+00:00" -SchemaValid:$true -ClusterMatches:$true
if (-not $clockPreserved.Ok -or $clockPreserved.CreatedUtc -ne "2025-12-31T23:59:59.0000000+00:00") { Fail -Code "selftest_created_utc_preservation_failed" }
$clockEqual = Resolve-StableCreatedUtcForSelfTest -ExistingState:$true -ExistingCreatedUtc "2026-01-01T00:00:00.0000000+00:00" -FallbackCreatedUtc "2026-01-01T00:00:00.0000000+00:00" -SchemaValid:$true -ClusterMatches:$true
if (-not $clockEqual.Ok) { Fail -Code "selftest_created_utc_equal_operation_rejected" }
$clockFuture = Resolve-StableCreatedUtcForSelfTest -ExistingState:$true -ExistingCreatedUtc "2026-01-01T00:00:00.0000001+00:00" -FallbackCreatedUtc "2026-01-01T00:00:00.0000000+00:00" -SchemaValid:$true -ClusterMatches:$true
if ($clockFuture.Ok -or $clockFuture.Reason -ne "state_get_created_utc_failed") { Fail -Code "selftest_created_utc_future_not_rejected" }
$clockMissingFallback = Resolve-StableCreatedUtcForSelfTest -ExistingState:$false -ExistingCreatedUtc $null -FallbackCreatedUtc "" -SchemaValid:$true -ClusterMatches:$true
if ($clockMissingFallback.Ok -or $clockMissingFallback.Reason -ne "state_get_created_utc_failed") { Fail -Code "selftest_created_utc_missing_fallback_not_rejected" }
$clockNonUtcFallback = Resolve-StableCreatedUtcForSelfTest -ExistingState:$false -ExistingCreatedUtc $null -FallbackCreatedUtc "2026-01-01T00:00:00.0000000-05:00" -SchemaValid:$true -ClusterMatches:$true
if ($clockNonUtcFallback.Ok -or $clockNonUtcFallback.Reason -ne "state_get_created_utc_failed") { Fail -Code "selftest_created_utc_non_utc_fallback_not_rejected" }
$clockBadExisting = Resolve-StableCreatedUtcForSelfTest -ExistingState:$true -ExistingCreatedUtc "2026-01-01 00:00:00" -FallbackCreatedUtc "2026-01-01T00:00:00.0000000+00:00" -SchemaValid:$true -ClusterMatches:$true
if ($clockBadExisting.Ok -or $clockBadExisting.Reason -ne "state_get_created_utc_failed") { Fail -Code "selftest_created_utc_bad_existing_not_rejected" }
$clockBadSchema = Resolve-StableCreatedUtcForSelfTest -ExistingState:$true -ExistingCreatedUtc "2025-12-31T23:59:59.0000000+00:00" -FallbackCreatedUtc "2026-01-01T00:00:00.0000000+00:00" -SchemaValid:$false -ClusterMatches:$true
if ($clockBadSchema.Ok -or $clockBadSchema.Reason -ne "state_get_created_utc_failed") { Fail -Code "selftest_created_utc_bad_schema_not_rejected" }
$clockClusterMismatch = Resolve-StableCreatedUtcForSelfTest -ExistingState:$true -ExistingCreatedUtc "2025-12-31T23:59:59.0000000+00:00" -FallbackCreatedUtc "2026-01-01T00:00:00.0000000+00:00" -SchemaValid:$true -ClusterMatches:$false
if ($clockClusterMismatch.Ok -or $clockClusterMismatch.Reason -ne "state_get_created_utc_failed") { Fail -Code "selftest_created_utc_cluster_mismatch_not_rejected" }

function Test-CleanupFailedCreateStateCompatibilityForSelfTest {
  param(
    [Parameter(Mandatory = $true)][int]$StateLength,
    [Parameter(Mandatory = $true)][int]$MarkerLength,
    [Parameter(Mandatory = $true)][string]$Stage,
    [Parameter(Mandatory = $true)][string]$LastErrorCode,
    [Parameter(Mandatory = $true)][bool]$ServerStarted,
    [Parameter(Mandatory = $true)][bool]$ServerCleanupCompleted,
    [Parameter(Mandatory = $true)][bool]$StrictSchema,
    [Parameter(Mandatory = $true)][bool]$MarkerConcordant
  )
  if ($StateLength -lt 700 -or $StateLength -gt 4096 -or $MarkerLength -lt 80 -or $MarkerLength -gt 512) { return "cleanup_failed_exact_state_invalid" }
  if (-not $StrictSchema) { return "cleanup_failed_state_schema_invalid" }
  if (-not $MarkerConcordant) { return "cleanup_failed_marker_state_invalid" }
  if ($Stage -notin @("create_directories","state_get_created_utc")) { return "cleanup_failed_marker_state_invalid" }
  if ($LastErrorCode -notin @("create_directories_failed","state_get_created_utc_failed")) { return "cleanup_failed_marker_state_invalid" }
  if ($Stage -eq "state_get_created_utc" -and $LastErrorCode -ne "state_get_created_utc_failed") { return "cleanup_failed_marker_state_invalid" }
  if ($Stage -eq "create_directories" -and $LastErrorCode -eq "state_get_created_utc_failed") { return "cleanup_failed_marker_state_invalid" }
  if ($ServerStarted -or $ServerCleanupCompleted) { return "cleanup_failed_marker_state_invalid" }
  return "OK"
}

if ((Test-CleanupFailedCreateStateCompatibilityForSelfTest -StateLength 988 -MarkerLength 146 -Stage "state_get_created_utc" -LastErrorCode "state_get_created_utc_failed" -ServerStarted:$false -ServerCleanupCompleted:$false -StrictSchema:$true -MarkerConcordant:$true) -ne "OK") { Fail -Code "selftest_cleanup_failed_state_get_created_utc_not_supported" }
if ((Test-CleanupFailedCreateStateCompatibilityForSelfTest -StateLength 975 -MarkerLength 146 -Stage "create_directories" -LastErrorCode "create_directories_failed" -ServerStarted:$false -ServerCleanupCompleted:$false -StrictSchema:$true -MarkerConcordant:$true) -ne "OK") { Fail -Code "selftest_cleanup_failed_create_directories_regressed" }
if ((Test-CleanupFailedCreateStateCompatibilityForSelfTest -StateLength 699 -MarkerLength 146 -Stage "state_get_created_utc" -LastErrorCode "state_get_created_utc_failed" -ServerStarted:$false -ServerCleanupCompleted:$false -StrictSchema:$true -MarkerConcordant:$true) -ne "cleanup_failed_exact_state_invalid") { Fail -Code "selftest_cleanup_failed_state_min_size_not_detected" }
if ((Test-CleanupFailedCreateStateCompatibilityForSelfTest -StateLength 4097 -MarkerLength 146 -Stage "state_get_created_utc" -LastErrorCode "state_get_created_utc_failed" -ServerStarted:$false -ServerCleanupCompleted:$false -StrictSchema:$true -MarkerConcordant:$true) -ne "cleanup_failed_exact_state_invalid") { Fail -Code "selftest_cleanup_failed_state_max_size_not_detected" }
if ((Test-CleanupFailedCreateStateCompatibilityForSelfTest -StateLength 988 -MarkerLength 146 -Stage "state_get_created_utc" -LastErrorCode "create_directories_failed" -ServerStarted:$false -ServerCleanupCompleted:$false -StrictSchema:$true -MarkerConcordant:$true) -ne "cleanup_failed_marker_state_invalid") { Fail -Code "selftest_cleanup_failed_stage_error_mismatch_not_detected" }
if ((Test-CleanupFailedCreateStateCompatibilityForSelfTest -StateLength 988 -MarkerLength 146 -Stage "create_directories" -LastErrorCode "state_get_created_utc_failed" -ServerStarted:$false -ServerCleanupCompleted:$false -StrictSchema:$true -MarkerConcordant:$true) -ne "cleanup_failed_marker_state_invalid") { Fail -Code "selftest_cleanup_failed_cross_stage_error_not_detected" }
if ((Test-CleanupFailedCreateStateCompatibilityForSelfTest -StateLength 988 -MarkerLength 146 -Stage "state_get_created_utc" -LastErrorCode "state_get_created_utc_failed" -ServerStarted:$true -ServerCleanupCompleted:$false -StrictSchema:$true -MarkerConcordant:$true) -ne "cleanup_failed_marker_state_invalid") { Fail -Code "selftest_cleanup_failed_server_started_not_detected" }
Assert-MutationAddsForbidden -MutatedText ($cleanupFailedStateFunctionText + "`nif ((Get-Item -LiteralPath `$Layout.StatePath).Length -ne 975) { }") -ForbiddenPattern 'Length\s+-ne\s+975' -Code "selftest_cleanup_failed_exact_state_length_not_detected"
Assert-MutationRemovesRequired -MutatedText ($cleanupFailedPayloadFunctionText -replace 'state_get_created_utc', 'state_missing') -RequiredPattern 'state_get_created_utc' -Code "selftest_cleanup_failed_state_stage_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($cleanupFailedPayloadFunctionText -replace 'state_get_created_utc_failed', 'state_missing_failed') -RequiredPattern 'state_get_created_utc_failed' -Code "selftest_cleanup_failed_state_error_missing_not_detected"
function Test-SimulatedStateWriteForSelfTest {
  param(
    [Parameter(Mandatory = $true)][bool]$ExistingState,
    [Parameter(Mandatory = $true)][bool]$ResidualTemp,
    [Parameter(Mandatory = $true)][bool]$AclRuleValid,
    [Parameter(Mandatory = $true)][bool]$MarkerConcordant,
    [Parameter(Mandatory = $true)][bool]$FailInitialWrite,
    [Parameter(Mandatory = $true)][bool]$FailFailedWrite,
    [AllowNull()][string]$ExistingCreatedUtc
  )
  $primaryReason = $null
  $secondaryReason = $null
  $createdUtc = $(if ([string]::IsNullOrWhiteSpace($ExistingCreatedUtc)) { "2026-01-01T00:00:00.0000000Z" } else { $ExistingCreatedUtc })
  $operation = $(if ($ExistingState) { "state_replace_existing" } else { "state_move_initial" })
  if ($ResidualTemp) { $primaryReason = "state_temp_file_residual" }
  elseif ($FailInitialWrite) { $primaryReason = "state_write_temp_failed" }
  elseif (-not $AclRuleValid) { $primaryReason = "state_acl_readback_failed" }
  elseif (-not $MarkerConcordant) { $primaryReason = "state_marker_concordance_failed" }
  if ($null -ne $primaryReason -and $FailFailedWrite) { $secondaryReason = "state_write_temp_failed" }
  return [pscustomobject]@{
    Operation = $operation
    CreatedUtc = $createdUtc
    PrimaryReason = $primaryReason
    SecondaryReason = $secondaryReason
    CredentialReached = ($null -eq $primaryReason)
    InitdbReached = ($null -eq $primaryReason)
    TempResidualDetected = $ResidualTemp
  }
}
$stateInitialOk = Test-SimulatedStateWriteForSelfTest -ExistingState:$false -ResidualTemp:$false -AclRuleValid:$true -MarkerConcordant:$true -FailInitialWrite:$false -FailFailedWrite:$false -ExistingCreatedUtc $null
if ($stateInitialOk.Operation -ne "state_move_initial" -or $stateInitialOk.CreatedUtc -ne "2026-01-01T00:00:00.0000000Z" -or $stateInitialOk.PrimaryReason -ne $null -or -not $stateInitialOk.CredentialReached) { Fail -Code "selftest_state_initial_write_failed" }
$stateReplaceOk = Test-SimulatedStateWriteForSelfTest -ExistingState:$true -ResidualTemp:$false -AclRuleValid:$true -MarkerConcordant:$true -FailInitialWrite:$false -FailFailedWrite:$false -ExistingCreatedUtc "2025-12-31T00:00:00.0000000Z"
if ($stateReplaceOk.Operation -ne "state_replace_existing" -or $stateReplaceOk.CreatedUtc -ne "2025-12-31T00:00:00.0000000Z") { Fail -Code "selftest_state_replace_or_created_utc_failed" }
$stateAclFail = Test-SimulatedStateWriteForSelfTest -ExistingState:$true -ResidualTemp:$false -AclRuleValid:$false -MarkerConcordant:$true -FailInitialWrite:$false -FailFailedWrite:$false -ExistingCreatedUtc "2025-12-31T00:00:00.0000000Z"
if ($stateAclFail.PrimaryReason -ne "state_acl_readback_failed" -or $stateAclFail.CredentialReached) { Fail -Code "selftest_state_acl_readback_failure_failed" }
$stateMarkerFail = Test-SimulatedStateWriteForSelfTest -ExistingState:$true -ResidualTemp:$false -AclRuleValid:$true -MarkerConcordant:$false -FailInitialWrite:$false -FailFailedWrite:$false -ExistingCreatedUtc "2025-12-31T00:00:00.0000000Z"
if ($stateMarkerFail.PrimaryReason -ne "state_marker_concordance_failed" -or $stateMarkerFail.InitdbReached) { Fail -Code "selftest_state_marker_concordance_failure_failed" }
$statePrimaryPreserved = Test-SimulatedStateWriteForSelfTest -ExistingState:$false -ResidualTemp:$false -AclRuleValid:$true -MarkerConcordant:$true -FailInitialWrite:$true -FailFailedWrite:$false -ExistingCreatedUtc $null
if ($statePrimaryPreserved.PrimaryReason -ne "state_write_temp_failed" -or $statePrimaryPreserved.SecondaryReason -ne $null -or $statePrimaryPreserved.CredentialReached) { Fail -Code "selftest_state_primary_preservation_success_failed" }
$stateSecondaryPreserved = Test-SimulatedStateWriteForSelfTest -ExistingState:$false -ResidualTemp:$false -AclRuleValid:$true -MarkerConcordant:$true -FailInitialWrite:$true -FailFailedWrite:$true -ExistingCreatedUtc $null
if ($stateSecondaryPreserved.PrimaryReason -ne "state_write_temp_failed" -or $stateSecondaryPreserved.SecondaryReason -ne "state_write_temp_failed" -or $stateSecondaryPreserved.CredentialReached) { Fail -Code "selftest_state_secondary_preservation_failed" }
$stateResidualTemp = Test-SimulatedStateWriteForSelfTest -ExistingState:$false -ResidualTemp:$true -AclRuleValid:$true -MarkerConcordant:$true -FailInitialWrite:$false -FailFailedWrite:$false -ExistingCreatedUtc $null
if ($stateResidualTemp.PrimaryReason -ne "state_temp_file_residual" -or -not $stateResidualTemp.TempResidualDetected) { Fail -Code "selftest_state_temp_residual_failed" }
foreach ($stateStepForMutation in @("state_validate_input","state_get_created_utc","state_build_payload","state_serialize_json","state_write_temp","state_move_initial","state_replace_existing","state_apply_acl","state_acl_readback","state_schema_readback")) {
  Assert-MutationRemovesRequired -MutatedText ($stateFunctionText -replace $stateStepForMutation, "state_step_removed") -RequiredPattern $stateStepForMutation -Code ("selftest_state_step_missing_not_detected_" + $stateStepForMutation)
}
Assert-MutationRemovesRequired -MutatedText ($stateFunctionText -replace 'File\]::Replace\(\$tmp, \$Layout\.StatePath, \$null\)', 'File]::Move($tmp, $Layout.StatePath)') -RequiredPattern 'File\]::Replace\(\$tmp, \$Layout\.StatePath, \$null\)' -Code "selftest_state_replace_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($stateFunctionText -replace 'File\]::Move\(\$tmp, \$Layout\.StatePath\)', 'File]::Replace($tmp, $Layout.StatePath, $null)') -RequiredPattern 'File\]::Move\(\$tmp, \$Layout\.StatePath\)' -Code "selftest_state_move_missing_not_detected"
Assert-MutationRemovesRequired -MutatedText ($stateFunctionText -replace 'state_temp_file_residual', 'state_write_temp_failed') -RequiredPattern 'state_temp_file_residual' -Code "selftest_state_temp_residual_not_detected"
Assert-MutationRemovesRequired -MutatedText ($stateFunctionText -replace 'Assert-StrictFlatStateJson -JsonText \$stateText', 'Skip-StateSchemaReadback') -RequiredPattern 'Assert-StrictFlatStateJson -JsonText \$stateText' -Code "selftest_state_schema_readback_not_detected"
Assert-MutationRemovesRequired -MutatedText ($stateFunctionText -replace 'Get-Acl -LiteralPath \$Layout\.StatePath', 'Skip-StateAclReadback') -RequiredPattern 'Get-Acl -LiteralPath \$Layout\.StatePath' -Code "selftest_state_acl_readback_not_detected"
Assert-MutationRemovesRequired -MutatedText ($createFunctionText -replace 'Throw-SafeError -Code \$reason', 'Throw-SafeError -Code $script:CurrentSecondaryReason') -RequiredPattern 'Throw-SafeError -Code \$reason' -Code "selftest_primary_reason_preservation_not_detected"
Assert-MutationAddsForbidden -MutatedText ($createFunctionText + "`n`$reason = `"password_file_cleanup_failed`"") -ForbiddenPattern '\$reason\s*=\s*"password_file_cleanup_failed"' -Code "selftest_secondary_reason_overwrites_primary_not_detected"
Assert-MutationRemovesRequired -MutatedText ($createFunctionText -replace "Assert-CreateStateMarkerConcordance", "Skip-StateMarkerConcordance") -RequiredPattern "Assert-CreateStateMarkerConcordance" -Code "selftest_marker_state_concordance_missing_not_detected"
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

. ([scriptblock]::Create($cleanupEntriesNewFunctionText))
. ([scriptblock]::Create($cleanupEntriesAssertFunctionText))

function Throw-SafeError {
  param([Parameter(Mandatory = $true)][string]$Code)
  throw ("VC_SAFE_REASON::" + $Code)
}

function Assert-CleanupEntriesShapeForSelfTest {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowEmptyCollection()][string[]]$Entries,
    [Parameter(Mandatory = $true)][int]$ExpectedCount
  )
  $outputs = @(New-CleanupDirectoryEntriesResult -Entries $Entries)
  if ($outputs.Count -ne 1) { Fail -Code ("cleanup_entries_output_count_" + $Name) }
  $result = $outputs[0]
  Assert-CleanupDirectoryEntriesResult -Result $result
  if (-not ($result.Entries -is [string[]])) { Fail -Code ("cleanup_entries_type_" + $Name) }
  if ($result.Entries.Count -ne $ExpectedCount) { Fail -Code ("cleanup_entries_count_" + $Name) }
  if ($ExpectedCount -eq 0 -and $null -eq $result.Entries) { Fail -Code "cleanup_entries_zero_null" }
  if ($ExpectedCount -eq 1) {
    if (-not ($result.Entries[0] -is [string])) { Fail -Code "cleanup_entries_one_not_string" }
    if ($result.Entries[0] -is [char]) { Fail -Code "cleanup_entries_one_char" }
  }
  foreach ($entry in $result.Entries) {
    if (-not ($entry -is [string])) { Fail -Code ("cleanup_entries_member_type_" + $Name) }
  }
  $assertOutput = @(Assert-CleanupDirectoryEntriesResult -Result $result)
  if ($assertOutput.Count -ne 0) { Fail -Code ("cleanup_entries_assert_output_" + $Name) }
}

Assert-CleanupEntriesShapeForSelfTest -Name "zero" -Entries @() -ExpectedCount 0
Assert-CleanupEntriesShapeForSelfTest -Name "one" -Entries @("synthetic-one") -ExpectedCount 1
Assert-CleanupEntriesShapeForSelfTest -Name "many" -Entries @("synthetic-one", "synthetic-two", "synthetic-three") -ExpectedCount 3

function Get-CleanupEntriesFromResultForSelfTest {
  param([AllowNull()][object]$Result)
  $assertOutput = @(Assert-CleanupDirectoryEntriesResult -Result $Result)
  if ($assertOutput.Count -ne 0) { Fail -Code "cleanup_entries_consumer_assert_output" }
  [string[]]$entryValues = @($Result.Entries)
  return [pscustomobject]@{
    Valid = $true
    Entries = [string[]]$entryValues
    SafeErrorCode = $null
  }
}

function Test-CleanupDeleteRootParentShapeForSelfTest {
  param([AllowNull()][object]$Result)
  try {
    $stage = "cleanup_validate_parent_empty"
    $consumer = Get-CleanupEntriesFromResultForSelfTest -Result $Result
    [string[]]$parentEntryValues = @($consumer.Entries)
    if ($parentEntryValues.Count -ne 0) {
      return [pscustomobject]@{ Stage = $stage; Reason = "cleanup_parent_not_empty"; NextStage = $null; SecondDeleteReachable = $false; ExceptionType = $null }
    }
    return [pscustomobject]@{ Stage = $stage; Reason = $null; NextStage = "cleanup_delete_root"; SecondDeleteReachable = $true; ExceptionType = $null }
  } catch {
    return [pscustomobject]@{ Stage = "cleanup_validate_parent_empty"; Reason = "blocked"; NextStage = $null; SecondDeleteReachable = $false; ExceptionType = $null }
  }
}
function Test-CleanupPostInstanceActivitySequenceForSelfTest {
  param(
    [Parameter(Mandatory = $true)][bool]$ActivityAbsent,
    [Parameter(Mandatory = $true)][bool]$TechnicalActivityFailure,
    [AllowNull()][object]$ParentResult
  )
  $activityStage = "cleanup_revalidate_activity_after_instance_delete"
  if (-not $ActivityAbsent -or $TechnicalActivityFailure) {
    return [pscustomobject]@{
      Stage = $activityStage
      Reason = "cleanup_activity_detected"
      ParentValidationReached = $false
      NextStage = $null
      SecondDeleteReachable = $false
      ActivityFailureConvertedToEnumeration = $false
      ActivityFailureConvertedToDeleteRoot = $false
    }
  }
  $parentFlow = Test-CleanupDeleteRootParentShapeForSelfTest -Result $ParentResult
  return [pscustomobject]@{
    Stage = $parentFlow.Stage
    Reason = $parentFlow.Reason
    ParentValidationReached = $true
    NextStage = $parentFlow.NextStage
    SecondDeleteReachable = $parentFlow.SecondDeleteReachable
    ActivityFailureConvertedToEnumeration = $false
    ActivityFailureConvertedToDeleteRoot = $false
  }
}

$parentEmptyContainer = New-CleanupDirectoryEntriesResult -Entries @()
$parentOneContainer = New-CleanupDirectoryEntriesResult -Entries @("synthetic-parent-child")
$parentManyContainer = New-CleanupDirectoryEntriesResult -Entries @("synthetic-one", "synthetic-two")
if ((Get-CleanupEntriesFromResultForSelfTest -Result $parentEmptyContainer).Entries.Count -ne 0) { Fail -Code "cleanup_parent_empty_count_failed" }
if ((Get-CleanupEntriesFromResultForSelfTest -Result $parentOneContainer).Entries.Count -ne 1) { Fail -Code "cleanup_parent_one_count_failed" }
if ((Get-CleanupEntriesFromResultForSelfTest -Result $parentManyContainer).Entries.Count -ne 2) { Fail -Code "cleanup_parent_many_count_failed" }
$activityAbsentEmptyFlow = Test-CleanupPostInstanceActivitySequenceForSelfTest -ActivityAbsent:$true -TechnicalActivityFailure:$false -ParentResult $parentEmptyContainer
if ($activityAbsentEmptyFlow.Stage -ne "cleanup_validate_parent_empty" -or -not $activityAbsentEmptyFlow.ParentValidationReached -or $activityAbsentEmptyFlow.NextStage -ne "cleanup_delete_root" -or -not $activityAbsentEmptyFlow.SecondDeleteReachable) { Fail -Code "cleanup_activity_absent_parent_empty_flow_failed" }
$activityAbsentNonEmptyFlow = Test-CleanupPostInstanceActivitySequenceForSelfTest -ActivityAbsent:$true -TechnicalActivityFailure:$false -ParentResult $parentOneContainer
if ($activityAbsentNonEmptyFlow.Stage -ne "cleanup_validate_parent_empty" -or $activityAbsentNonEmptyFlow.Reason -ne "cleanup_parent_not_empty" -or $activityAbsentNonEmptyFlow.SecondDeleteReachable) { Fail -Code "cleanup_activity_absent_parent_nonempty_flow_failed" }
$activityDetectedFlow = Test-CleanupPostInstanceActivitySequenceForSelfTest -ActivityAbsent:$false -TechnicalActivityFailure:$false -ParentResult $parentEmptyContainer
if ($activityDetectedFlow.Stage -ne "cleanup_revalidate_activity_after_instance_delete" -or $activityDetectedFlow.Reason -ne "cleanup_activity_detected" -or $activityDetectedFlow.ParentValidationReached -or $activityDetectedFlow.SecondDeleteReachable) { Fail -Code "cleanup_activity_detected_blocks_failed" }
$activityTechnicalFlow = Test-CleanupPostInstanceActivitySequenceForSelfTest -ActivityAbsent:$true -TechnicalActivityFailure:$true -ParentResult $parentEmptyContainer
if ($activityTechnicalFlow.Stage -ne "cleanup_revalidate_activity_after_instance_delete" -or $activityTechnicalFlow.Reason -ne "cleanup_activity_detected" -or $activityTechnicalFlow.ActivityFailureConvertedToEnumeration -or $activityTechnicalFlow.ActivityFailureConvertedToDeleteRoot) { Fail -Code "cleanup_activity_technical_mapping_failed" }
$parentEmptyFlow = Test-CleanupDeleteRootParentShapeForSelfTest -Result $parentEmptyContainer
if ($parentEmptyFlow.Stage -ne "cleanup_validate_parent_empty" -or $parentEmptyFlow.Reason -ne $null -or $parentEmptyFlow.NextStage -ne "cleanup_delete_root" -or -not $parentEmptyFlow.SecondDeleteReachable) { Fail -Code "cleanup_parent_empty_symbolic_failed" }
$parentNonEmptyFlow = Test-CleanupDeleteRootParentShapeForSelfTest -Result $parentOneContainer
if ($parentNonEmptyFlow.Stage -ne "cleanup_validate_parent_empty" -or $parentNonEmptyFlow.Reason -ne "cleanup_parent_not_empty" -or $parentNonEmptyFlow.NextStage -ne $null -or $parentNonEmptyFlow.SecondDeleteReachable) { Fail -Code "cleanup_parent_nonempty_symbolic_failed" }
if ((Test-CleanupDeleteRootParentShapeForSelfTest -Result $null).Reason -ne "blocked") { Fail -Code "cleanup_parent_null_not_blocked" }
if ((Test-CleanupDeleteRootParentShapeForSelfTest -Result ([pscustomobject]@{})).Reason -ne "blocked") { Fail -Code "cleanup_parent_entries_missing_not_blocked" }
if ((Test-CleanupDeleteRootParentShapeForSelfTest -Result ([pscustomobject]@{ Entries = 7 })).Reason -ne "blocked") { Fail -Code "cleanup_parent_entries_bad_type_not_blocked" }
try {
  [void]$parentEmptyContainer.Count
  Fail -Code "cleanup_container_direct_count_not_rejected"
} catch [System.Management.Automation.PropertyNotFoundException] {
}
try {
  [void]$parentOneContainer[0]
  Fail -Code "cleanup_container_direct_index_not_rejected"
} catch [System.Management.Automation.RuntimeException] {
}

function Test-CleanupExactStateShapeForSelfTest {
  param(
    [AllowEmptyCollection()][string[]]$InstanceEntries,
    [AllowEmptyCollection()][string[]]$IsolatedEntries,
    [Parameter(Mandatory = $true)][string]$ExpectedInstancePath,
    [Parameter(Mandatory = $true)][string]$OnlyIsolatedEntryPath
  )
  [string[]]$safeInstanceEntries = $InstanceEntries
  [string[]]$safeIsolatedEntries = $IsolatedEntries
  if ($safeInstanceEntries.Count -ne 0) { return "cleanup_instance_not_empty" }
  if ($safeIsolatedEntries.Count -ne 1) { return "cleanup_unexpected_content" }
  if (-not ($safeIsolatedEntries[0] -is [string])) { return "cleanup_entry_not_string" }
  if ($safeIsolatedEntries[0] -is [char]) { return "cleanup_entry_char" }
  $trimSeparators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  if (-not [string]::Equals($OnlyIsolatedEntryPath.TrimEnd($trimSeparators), $ExpectedInstancePath.TrimEnd($trimSeparators), [System.StringComparison]::OrdinalIgnoreCase)) {
    return "cleanup_unexpected_content"
  }
  return "OK"
}

if ((Test-CleanupExactStateShapeForSelfTest -InstanceEntries @() -IsolatedEntries @("C:\synthetic\instance") -ExpectedInstancePath "C:\synthetic\instance" -OnlyIsolatedEntryPath "C:\synthetic\instance") -ne "OK") { Fail -Code "cleanup_exact_shape_valid_failed" }
if ((Test-CleanupExactStateShapeForSelfTest -InstanceEntries @("content") -IsolatedEntries @("C:\synthetic\instance") -ExpectedInstancePath "C:\synthetic\instance" -OnlyIsolatedEntryPath "C:\synthetic\instance") -ne "cleanup_instance_not_empty") { Fail -Code "cleanup_exact_shape_instance_content_failed" }
if ((Test-CleanupExactStateShapeForSelfTest -InstanceEntries @() -IsolatedEntries @() -ExpectedInstancePath "C:\synthetic\instance" -OnlyIsolatedEntryPath "C:\synthetic\instance") -ne "cleanup_unexpected_content") { Fail -Code "cleanup_exact_shape_zero_isolated_failed" }
if ((Test-CleanupExactStateShapeForSelfTest -InstanceEntries @() -IsolatedEntries @("C:\synthetic\one", "C:\synthetic\two") -ExpectedInstancePath "C:\synthetic\instance" -OnlyIsolatedEntryPath "C:\synthetic\one") -ne "cleanup_unexpected_content") { Fail -Code "cleanup_exact_shape_two_isolated_failed" }
if ((Test-CleanupExactStateShapeForSelfTest -InstanceEntries @() -IsolatedEntries @("C:\synthetic\other") -ExpectedInstancePath "C:\synthetic\instance" -OnlyIsolatedEntryPath "C:\synthetic\other") -ne "cleanup_unexpected_content") { Fail -Code "cleanup_exact_shape_mismatch_failed" }
. ([scriptblock]::Create($cleanupFailureFunctionText))
function Assert-CleanupFailureForSelfTest {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Stage,
    [Parameter(Mandatory = $true)][object]$Exception,
    [Parameter(Mandatory = $true)][string]$ExpectedReason,
    [AllowNull()][string]$ExpectedExceptionType,
    [Parameter(Mandatory = $true)][string]$ExpectedSubstage
  )
  $result = Get-CleanupSafeFailure -Stage $Stage -Exception $Exception
  if ($result.Reason -ne $ExpectedReason) { Fail -Code ("cleanup_failure_reason_" + $Name) }
  if ([string]::IsNullOrEmpty($ExpectedExceptionType)) {
    if (-not [string]::IsNullOrEmpty($result.ExceptionType)) { Fail -Code ("cleanup_failure_exception_type_" + $Name) }
  } elseif ($result.ExceptionType -ne $ExpectedExceptionType) {
    Fail -Code ("cleanup_failure_exception_type_" + $Name)
  }
  if ($result.SafeSubstage -ne $ExpectedSubstage) { Fail -Code ("cleanup_failure_substage_" + $Name) }
  $serialized = ($result | Out-String)
  foreach ($forbidden in @("C:\", "Users\", "S-1-", "CREATE_VOTO", "CLEANUP_PARTIAL_CREATE", "secret", "stack", "trace")) {
    if ($serialized.IndexOf($forbidden, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      Fail -Code ("cleanup_failure_sensitive_output_" + $Name)
    }
  }
}
function New-SimulatedExceptionForSelfTest {
  param(
    [Parameter(Mandatory = $true)][string]$TypeName,
    [AllowNull()][object]$InnerException,
    [AllowNull()][string]$Message
  )
  $properties = [ordered]@{ SimulatedTypeName = $TypeName }
  if ($null -ne $InnerException) { $properties.InnerException = $InnerException }
  if ($null -ne $Message) { $properties.Message = $Message }
  return [pscustomobject]$properties
}
Assert-CleanupFailureForSelfTest -Name "exact_access" -Stage "cleanup_exact_state" -Exception ([pscustomobject]@{ SimulatedTypeName = "UnauthorizedAccessException" }) -ExpectedReason "cleanup_enumeration_denied" -ExpectedExceptionType "UnauthorizedAccessException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "exact_io" -Stage "cleanup_exact_state" -Exception ([pscustomobject]@{ SimulatedTypeName = "IOException" }) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "IOException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "sig_io" -Stage "cleanup_signature_initial" -Exception ([pscustomobject]@{ SimulatedTypeName = "IOException" }) -ExpectedReason "cleanup_signature_failed" -ExpectedExceptionType "IOException" -ExpectedSubstage "cleanup_signature_initial"
Assert-CleanupFailureForSelfTest -Name "activity_invalid" -Stage "cleanup_activity" -Exception ([pscustomobject]@{ SimulatedTypeName = "InvalidOperationException" }) -ExpectedReason "cleanup_activity_detected" -ExpectedExceptionType "InvalidOperationException" -ExpectedSubstage "cleanup_activity"
Assert-CleanupFailureForSelfTest -Name "post_instance_activity_invalid" -Stage "cleanup_revalidate_activity_after_instance_delete" -Exception ([pscustomobject]@{ SimulatedTypeName = "InvalidOperationException" }) -ExpectedReason "cleanup_activity_detected" -ExpectedExceptionType "InvalidOperationException" -ExpectedSubstage "cleanup_revalidate_activity_after_instance_delete"
Assert-CleanupFailureForSelfTest -Name "delete_instance" -Stage "cleanup_delete_instance" -Exception ([pscustomobject]@{ SimulatedTypeName = "IOException" }) -ExpectedReason "cleanup_delete_instance_failed" -ExpectedExceptionType "IOException" -ExpectedSubstage "cleanup_delete_instance"
Assert-CleanupFailureForSelfTest -Name "delete_root" -Stage "cleanup_delete_root" -Exception ([pscustomobject]@{ SimulatedTypeName = "IOException" }) -ExpectedReason "cleanup_delete_root_failed" -ExpectedExceptionType "IOException" -ExpectedSubstage "cleanup_delete_root"
Assert-CleanupFailureForSelfTest -Name "postcheck" -Stage "cleanup_postcheck" -Exception ([pscustomobject]@{ SimulatedTypeName = "IOException" }) -ExpectedReason "cleanup_postcheck_failed" -ExpectedExceptionType "IOException" -ExpectedSubstage "cleanup_postcheck"
Assert-CleanupFailureForSelfTest -Name "parent_not_empty_safe" -Stage "cleanup_validate_parent_empty" -Exception ([System.Exception]::new("VC_SAFE_REASON::cleanup_parent_not_empty")) -ExpectedReason "cleanup_parent_not_empty" -ExpectedExceptionType $null -ExpectedSubstage "cleanup_validate_parent_empty"
Assert-CleanupFailureForSelfTest -Name "parent_access_denied" -Stage "cleanup_validate_parent_empty" -Exception (New-SimulatedExceptionForSelfTest -TypeName "UnauthorizedAccessException" -InnerException $null -Message $null) -ExpectedReason "cleanup_enumeration_denied" -ExpectedExceptionType "UnauthorizedAccessException" -ExpectedSubstage "cleanup_validate_parent_empty"
Assert-CleanupFailureForSelfTest -Name "parent_enumeration_failed" -Stage "cleanup_validate_parent_empty" -Exception (New-SimulatedExceptionForSelfTest -TypeName "IOException" -InnerException $null -Message $null) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "IOException" -ExpectedSubstage "cleanup_validate_parent_empty"
Assert-CleanupFailureForSelfTest -Name "parent_wrapped_safe" -Stage "cleanup_validate_parent_empty" -Exception (New-SimulatedExceptionForSelfTest -TypeName "RuntimeException" -InnerException ([System.Exception]::new("VC_SAFE_REASON::cleanup_parent_not_empty")) -Message $null) -ExpectedReason "cleanup_parent_not_empty" -ExpectedExceptionType $null -ExpectedSubstage "cleanup_validate_parent_empty"
Assert-CleanupFailureForSelfTest -Name "parent_safe_suffix_rejected" -Stage "cleanup_validate_parent_empty" -Exception ([System.Exception]::new("VC_SAFE_REASON::cleanup_parent_not_empty_extra")) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "UnknownException" -ExpectedSubstage "cleanup_validate_parent_empty"
Assert-CleanupFailureForSelfTest -Name "property_not_found" -Stage "cleanup_exact_state" -Exception (New-SimulatedExceptionForSelfTest -TypeName "PropertyNotFoundException" -InnerException $null -Message $null) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "PropertyNotFoundException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "runtime_property" -Stage "cleanup_exact_state" -Exception (New-SimulatedExceptionForSelfTest -TypeName "RuntimeException" -InnerException (New-SimulatedExceptionForSelfTest -TypeName "PropertyNotFoundException" -InnerException $null -Message $null) -Message $null) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "PropertyNotFoundException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "unknown_type" -Stage "cleanup_exact_state" -Exception (New-SimulatedExceptionForSelfTest -TypeName "NotAllowedException" -InnerException $null -Message $null) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "UnknownException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "method_inner_access" -Stage "cleanup_exact_state" -Exception (New-SimulatedExceptionForSelfTest -TypeName "MethodInvocationException" -InnerException (New-SimulatedExceptionForSelfTest -TypeName "UnauthorizedAccessException" -InnerException $null -Message $null) -Message $null) -ExpectedReason "cleanup_enumeration_denied" -ExpectedExceptionType "UnauthorizedAccessException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "runtime_method_access" -Stage "cleanup_exact_state" -Exception (New-SimulatedExceptionForSelfTest -TypeName "RuntimeException" -InnerException (New-SimulatedExceptionForSelfTest -TypeName "MethodInvocationException" -InnerException (New-SimulatedExceptionForSelfTest -TypeName "UnauthorizedAccessException" -InnerException $null -Message $null) -Message $null) -Message $null) -ExpectedReason "cleanup_enumeration_denied" -ExpectedExceptionType "UnauthorizedAccessException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "parent_inner_io" -Stage "cleanup_exact_state" -Exception (New-SimulatedExceptionForSelfTest -TypeName "ParentContainsErrorRecordException" -InnerException (New-SimulatedExceptionForSelfTest -TypeName "IOException" -InnerException $null -Message $null) -Message $null) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "IOException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "cmdlet_inner_security" -Stage "cleanup_exact_state" -Exception (New-SimulatedExceptionForSelfTest -TypeName "CmdletInvocationException" -InnerException (New-SimulatedExceptionForSelfTest -TypeName "SecurityException" -InnerException $null -Message $null) -Message $null) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "SecurityException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "item_not_found" -Stage "cleanup_exact_state" -Exception (New-SimulatedExceptionForSelfTest -TypeName "ItemNotFoundException" -InnerException $null -Message $null) -ExpectedReason "cleanup_paths_invalid" -ExpectedExceptionType "ItemNotFoundException" -ExpectedSubstage "cleanup_exact_state"
$longInner = New-SimulatedExceptionForSelfTest -TypeName "UnauthorizedAccessException" -InnerException $null -Message $null
for ($i = 0; $i -lt 9; $i += 1) { $longInner = New-SimulatedExceptionForSelfTest -TypeName "RuntimeException" -InnerException $longInner -Message $null }
Assert-CleanupFailureForSelfTest -Name "long_chain_truncated" -Stage "cleanup_exact_state" -Exception $longInner -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "RuntimeException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "safe_valid" -Stage "cleanup_exact_state" -Exception ([System.Exception]::new("VC_SAFE_REASON::cleanup_instance_not_empty")) -ExpectedReason "cleanup_instance_not_empty" -ExpectedExceptionType $null -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "safe_invalid" -Stage "cleanup_exact_state" -Exception ([System.Exception]::new("VC_SAFE_REASON::not_allowed_secret")) -ExpectedReason "cleanup_enumeration_failed" -ExpectedExceptionType "UnknownException" -ExpectedSubstage "cleanup_exact_state"
Assert-CleanupFailureForSelfTest -Name "unknown_stage" -Stage "cleanup_unknown" -Exception ([pscustomobject]@{ SimulatedTypeName = "IOException" }) -ExpectedReason "cleanup_preflight_unknown" -ExpectedExceptionType "IOException" -ExpectedSubstage "cleanup_preflight_unknown"

. ([scriptblock]::Create($createAuthorizationTestFunctionText))
. ([scriptblock]::Create($cleanupAuthorizationTestFunctionText))
. ([scriptblock]::Create($cleanupFailedAuthorizationTestFunctionText))
$expectedCreateTokenForSelfTest = [regex]::Match($text, '\$script:ExpectedCreateApprovalToken\s*=\s*"([^"]+)"').Groups[1].Value
$expectedCleanupTokenForSelfTest = [regex]::Match($text, '\$script:ExpectedCleanupApprovalToken\s*=\s*"([^"]+)"').Groups[1].Value
$expectedCleanupFailedTokenForSelfTest = [regex]::Match($text, '\$script:ExpectedCleanupFailedCreateApprovalToken\s*=\s*"([^"]+)"').Groups[1].Value
if ([string]::IsNullOrWhiteSpace($expectedCreateTokenForSelfTest) -or [string]::IsNullOrWhiteSpace($expectedCleanupTokenForSelfTest) -or [string]::IsNullOrWhiteSpace($expectedCleanupFailedTokenForSelfTest)) {
  Fail -Code "authorization_expected_token_parse_failed"
}
if ([string]::Equals($expectedCreateTokenForSelfTest, $expectedCleanupTokenForSelfTest, [System.StringComparison]::Ordinal) -or
    [string]::Equals($expectedCreateTokenForSelfTest, $expectedCleanupFailedTokenForSelfTest, [System.StringComparison]::Ordinal) -or
    [string]::Equals($expectedCleanupTokenForSelfTest, $expectedCleanupFailedTokenForSelfTest, [System.StringComparison]::Ordinal)) {
  Fail -Code "authorization_expected_tokens_equal"
}
function Assert-AuthorizationResult {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][object]$Result,
    [Parameter(Mandatory = $true)][bool]$ExpectedAuthorized,
    [Parameter(Mandatory = $true)][string]$ExpectedCode
  )
  if ([bool]$Result.Authorized -ne $ExpectedAuthorized) { Fail -Code ("authorization_case_failed_" + $Name) }
  if ($ExpectedAuthorized) {
    if ($null -ne $Result.SafeErrorCode) { Fail -Code ("authorization_case_code_unexpected_" + $Name) }
  } elseif ($Result.SafeErrorCode -ne $ExpectedCode) {
    Fail -Code ("authorization_case_code_failed_" + $Name)
  }
}
$createInputSnapshot = "provided-create-input"
$cleanupInputSnapshot = "provided-cleanup-input"
Assert-AuthorizationResult -Name "create_switch_false_token_correct" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$false -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "create_switch_true_token_empty" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken "" -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "create_switch_true_token_wrong" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken "wrong-create-token" -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "create_switch_true_token_exact" -ExpectedAuthorized $true -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "create_valid_cleanup_switch_present" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "create_valid_cleanup_token_present" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest)
Assert-AuthorizationResult -Name "cleanup_switch_false_token_correct" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_switch_true_token_empty" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken "" -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_switch_true_token_wrong" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken "wrong-cleanup-token" -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_switch_true_token_exact" -ExpectedAuthorized $true -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_valid_create_switch_present" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$true -ProvidedCreateApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_valid_create_token_present" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest)
Assert-AuthorizationResult -Name "create_token_does_not_authorize_cleanup" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $expectedCreateTokenForSelfTest -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_token_does_not_authorize_create" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken $expectedCleanupTokenForSelfTest -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "create_both_tokens_block" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest)
Assert-AuthorizationResult -Name "cleanup_both_tokens_block" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest)
Assert-AuthorizationResult -Name "create_both_switches_block" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_both_switches_block" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$true -ProvidedCreateApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_switch_false_token_correct" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$false -ProvidedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_switch_true_token_empty" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken "" -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_switch_true_token_wrong" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken "wrong-cleanup-failed-token" -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_switch_true_token_exact" -ExpectedAuthorized $true -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_create_switch_present" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$true -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_cleanup_switch_present" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "create_token_does_not_authorize_cleanup_failed" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken $expectedCreateTokenForSelfTest -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_token_does_not_authorize_cleanup_failed" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken $expectedCleanupTokenForSelfTest -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_token_does_not_authorize_create" -ExpectedAuthorized $false -ExpectedCode "create_not_authorized" -Result (Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_token_does_not_authorize_cleanup" -ExpectedAuthorized $false -ExpectedCode "cleanup_not_authorized" -Result (Test-CleanupAuthorization -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $expectedCleanupFailedTokenForSelfTest -ExpectedCleanupApprovalToken $expectedCleanupTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_two_switches_block" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$true -ProvidedCreateApprovalToken $null -ConfirmCleanupPartialCreate:$true -ProvidedCleanupApprovalToken $null)
Assert-AuthorizationResult -Name "cleanup_failed_two_tokens_block" -ExpectedAuthorized $false -ExpectedCode "cleanup_failed_not_authorized" -Result (Test-CleanupFailedCreateAuthorization -ConfirmCleanupFailedCreate:$true -ProvidedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ExpectedCleanupFailedCreateApprovalToken $expectedCleanupFailedTokenForSelfTest -ConfirmCreate:$false -ProvidedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $expectedCleanupTokenForSelfTest)
[void](Test-CreateAuthorization -ConfirmCreate:$true -ProvidedCreateApprovalToken $createInputSnapshot -ExpectedCreateApprovalToken $expectedCreateTokenForSelfTest -ConfirmCleanupPartialCreate:$false -ProvidedCleanupApprovalToken $cleanupInputSnapshot)
if ($createInputSnapshot -ne "provided-create-input" -or $cleanupInputSnapshot -ne "provided-cleanup-input") {
  Fail -Code "authorization_input_parameter_mutated"
}

function Test-IsolatedRootAclContractForSelfTest {
  param(
    [Parameter(Mandatory = $true)][bool]$OwnerCurrent,
    [Parameter(Mandatory = $true)][bool]$Protected,
    [Parameter(Mandatory = $true)][bool]$ReadOk,
    [Parameter(Mandatory = $true)][bool]$EnumerateOk,
    [AllowEmptyCollection()][object[]]$Rules
  )
  if (-not $ReadOk) { return "cleanup_failed_acl_read_failed" }
  if (-not $OwnerCurrent) { return "cleanup_failed_acl_owner_invalid" }
  if (-not $EnumerateOk) { return "cleanup_failed_acl_enumeration_failed" }
  $requiredRights = [int64][System.Security.AccessControl.FileSystemRights]::FullControl
  $combinedAllowRights = [int64]0
  $currentAllowFound = $false
  foreach ($rule in @($Rules)) {
    if ($null -eq $rule) { return "cleanup_failed_acl_enumeration_failed" }
    if (-not [bool]$rule.Translatable) { return "cleanup_failed_acl_identity_invalid" }
    if ([string]$rule.Type -eq "Deny") { return "cleanup_failed_acl_deny_rule" }
    if ([string]$rule.Type -ne "Allow") { return "cleanup_failed_acl_enumeration_failed" }
    if (-not $Protected -and -not [bool]$rule.IsInherited) { return "cleanup_failed_acl_unexpected_explicit_rule" }
    if ($Protected -and [bool]$rule.IsInherited) { return "cleanup_failed_internal_acl_invalid" }
    if ([bool]$rule.CurrentSid) {
      $currentAllowFound = $true
      $combinedAllowRights = $combinedAllowRights -bor [int64]$rule.Rights
    }
  }
  if (-not $currentAllowFound -or (($combinedAllowRights -band $requiredRights) -ne $requiredRights)) { return "cleanup_failed_acl_fullcontrol_missing" }
  return "OK"
}
function New-AclRuleForSelfTest {
  param(
    [Parameter(Mandatory = $true)][bool]$IsInherited,
    [Parameter(Mandatory = $true)][string]$Type,
    [Parameter(Mandatory = $true)][bool]$CurrentSid,
    [Parameter(Mandatory = $true)][bool]$Translatable,
    [Parameter(Mandatory = $true)][System.Security.AccessControl.FileSystemRights]$Rights
  )
  return [pscustomobject]@{
    IsInherited = $IsInherited
    Type = $Type
    CurrentSid = $CurrentSid
    Translatable = $Translatable
    Rights = [int64]$Rights
  }
}
$fullRuleInherited = New-AclRuleForSelfTest -IsInherited:$true -Type "Allow" -CurrentSid:$true -Translatable:$true -Rights ([System.Security.AccessControl.FileSystemRights]::FullControl)
$fullRuleExplicit = New-AclRuleForSelfTest -IsInherited:$false -Type "Allow" -CurrentSid:$true -Translatable:$true -Rights ([System.Security.AccessControl.FileSystemRights]::FullControl)
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$false -ReadOk:$true -EnumerateOk:$true -Rules @($fullRuleInherited)) -ne "OK") { Fail -Code "cleanup_failed_isolated_acl_safe_inherited_rejected" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$false -Protected:$false -ReadOk:$true -EnumerateOk:$true -Rules @($fullRuleInherited)) -ne "cleanup_failed_acl_owner_invalid") { Fail -Code "cleanup_failed_isolated_acl_owner_not_blocked" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$false -ReadOk:$true -EnumerateOk:$true -Rules @((New-AclRuleForSelfTest -IsInherited:$true -Type "Allow" -CurrentSid:$true -Translatable:$true -Rights ([System.Security.AccessControl.FileSystemRights]::Read)))) -ne "cleanup_failed_acl_fullcontrol_missing") { Fail -Code "cleanup_failed_isolated_acl_fullcontrol_not_blocked" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$false -ReadOk:$true -EnumerateOk:$true -Rules @((New-AclRuleForSelfTest -IsInherited:$true -Type "Deny" -CurrentSid:$true -Translatable:$true -Rights ([System.Security.AccessControl.FileSystemRights]::FullControl)))) -ne "cleanup_failed_acl_deny_rule") { Fail -Code "cleanup_failed_isolated_acl_deny_not_blocked" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$false -ReadOk:$true -EnumerateOk:$true -Rules @($fullRuleExplicit)) -ne "cleanup_failed_acl_unexpected_explicit_rule") { Fail -Code "cleanup_failed_isolated_acl_explicit_not_blocked" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$false -ReadOk:$true -EnumerateOk:$true -Rules @((New-AclRuleForSelfTest -IsInherited:$true -Type "Allow" -CurrentSid:$true -Translatable:$false -Rights ([System.Security.AccessControl.FileSystemRights]::FullControl)))) -ne "cleanup_failed_acl_identity_invalid") { Fail -Code "cleanup_failed_isolated_acl_identity_not_blocked" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$false -ReadOk:$false -EnumerateOk:$true -Rules @($fullRuleInherited)) -ne "cleanup_failed_acl_read_failed") { Fail -Code "cleanup_failed_isolated_acl_read_not_blocked" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$false -ReadOk:$true -EnumerateOk:$false -Rules @($fullRuleInherited)) -ne "cleanup_failed_acl_enumeration_failed") { Fail -Code "cleanup_failed_isolated_acl_enumeration_not_blocked" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$true -ReadOk:$true -EnumerateOk:$true -Rules @($fullRuleExplicit)) -ne "OK") { Fail -Code "cleanup_failed_isolated_acl_protected_future_rejected" }
if ((Test-IsolatedRootAclContractForSelfTest -OwnerCurrent:$true -Protected:$true -ReadOk:$true -EnumerateOk:$true -Rules @($fullRuleInherited)) -ne "cleanup_failed_internal_acl_invalid") { Fail -Code "cleanup_failed_internal_inherited_not_blocked" }
function Get-PlanRuntimeBooleanSignalForSelfTest {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$Name
  )
  [string[]]$matches = @($Lines | Where-Object { $_.StartsWith(($Name + "="), [System.StringComparison]::Ordinal) })
  if ($matches.Count -eq 0) {
    return [pscustomobject]@{ Ok = $false; Reason = "plan_runtime_state_signal_missing"; Value = $null }
  }
  if ($matches.Count -ne 1) {
    return [pscustomobject]@{ Ok = $false; Reason = "plan_runtime_state_signal_duplicate"; Value = $null }
  }
  $line = [string]$matches[0]
  $expectedPrefix = $Name + "="
  if (-not $line.StartsWith($expectedPrefix, [System.StringComparison]::Ordinal)) {
    return [pscustomobject]@{ Ok = $false; Reason = "plan_runtime_state_value_invalid"; Value = $null }
  }
  $value = $line.Substring($expectedPrefix.Length)
  if (-not ([string]::Equals($value, "true", [System.StringComparison]::Ordinal) -or [string]::Equals($value, "false", [System.StringComparison]::Ordinal))) {
    return [pscustomobject]@{ Ok = $false; Reason = "plan_runtime_state_value_invalid"; Value = $null }
  }
  return [pscustomobject]@{ Ok = $true; Reason = "none"; Value = $value }
}

function Get-PlanRuntimeStringSignalForSelfTest {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$Name
  )
  [string[]]$matches = @($Lines | Where-Object { $_.StartsWith(($Name + "="), [System.StringComparison]::Ordinal) })
  if ($matches.Count -eq 0) {
    return [pscustomobject]@{ Ok = $false; Reason = "plan_runtime_state_signal_missing"; Value = $null }
  }
  if ($matches.Count -ne 1) {
    return [pscustomobject]@{ Ok = $false; Reason = "plan_runtime_state_signal_duplicate"; Value = $null }
  }
  $line = [string]$matches[0]
  $expectedPrefix = $Name + "="
  if (-not $line.StartsWith($expectedPrefix, [System.StringComparison]::Ordinal)) {
    return [pscustomobject]@{ Ok = $false; Reason = "plan_runtime_state_value_invalid"; Value = $null }
  }
  return [pscustomobject]@{ Ok = $true; Reason = "none"; Value = $line.Substring($expectedPrefix.Length) }
}

function Test-PlanRuntimeStateContractForSelfTest {
  param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Lines)
  $signalNames = @(
    "partial_instance_cleanup_required",
    "create_retry_blocked_until_cleanup",
    "cleanup_partial_create_required",
    "cleanup_partial_create_exact_state_valid",
    "cleanup_partial_create_manifest_valid",
    "cleanup_failed_create_required",
    "cleanup_failed_create_exact_state_valid",
    "cleanup_failed_create_manifest_valid",
    "ready_for_create"
  )
  $values = @{}
  foreach ($name in $signalNames) {
    $signal = Get-PlanRuntimeBooleanSignalForSelfTest -Lines $Lines -Name $name
    if (-not $signal.Ok) { return $signal.Reason }
    $values[$name] = $signal.Value
  }
  $modeSignal = Get-PlanRuntimeStringSignalForSelfTest -Lines $Lines -Name "cleanup_failed_create_mode"
  if (-not $modeSignal.Ok) { return $modeSignal.Reason }
  $modeValue = [string]$modeSignal.Value
  $isPartial = (
    [string]::Equals($values["partial_instance_cleanup_required"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["create_retry_blocked_until_cleanup"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_required"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_exact_state_valid"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_manifest_valid"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_required"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_exact_state_valid"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_manifest_valid"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($modeValue, "", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["ready_for_create"], "false", [System.StringComparison]::Ordinal)
  )
  if ($isPartial) { return "OK" }
  $isFailedPgCtlStart = (
    [string]::Equals($values["partial_instance_cleanup_required"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["create_retry_blocked_until_cleanup"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_required"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_exact_state_valid"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_manifest_valid"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_required"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_exact_state_valid"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_manifest_valid"], "true", [System.StringComparison]::Ordinal) -and
    [string]::Equals($modeValue, "PG_CTL_START_INITIALIZED_RESIDUAL", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["ready_for_create"], "false", [System.StringComparison]::Ordinal)
  )
  if ($isFailedPgCtlStart) { return "OK" }
  $isClean = (
    [string]::Equals($values["partial_instance_cleanup_required"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["create_retry_blocked_until_cleanup"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_required"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_exact_state_valid"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_partial_create_manifest_valid"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_required"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_exact_state_valid"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["cleanup_failed_create_manifest_valid"], "false", [System.StringComparison]::Ordinal) -and
    [string]::Equals($modeValue, "", [System.StringComparison]::Ordinal) -and
    [string]::Equals($values["ready_for_create"], "true", [System.StringComparison]::Ordinal)
  )
  if ($isClean) { return "OK" }
  return "plan_runtime_state_combination_invalid"
}

function Assert-PlanRuntimeStateContractForSelfTest {
  param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Lines)
  $result = Test-PlanRuntimeStateContractForSelfTest -Lines $Lines
  if ($result -ne "OK") { Fail -Code $result }
}

function Assert-PlanRuntimeContractCaseForSelfTest {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$ExpectedResult
  )
  $actual = Test-PlanRuntimeStateContractForSelfTest -Lines $Lines
  if (-not [string]::Equals($actual, $ExpectedResult, [System.StringComparison]::Ordinal)) {
    Fail -Code ("plan_runtime_contract_case_" + $Name)
  }
}

$planRuntimePartial = @(
  "partial_instance_cleanup_required=true",
  "create_retry_blocked_until_cleanup=true",
  "cleanup_partial_create_required=true",
  "cleanup_partial_create_exact_state_valid=true",
  "cleanup_partial_create_manifest_valid=true",
  "cleanup_failed_create_required=false",
  "cleanup_failed_create_exact_state_valid=false",
  "cleanup_failed_create_mode=",
  "cleanup_failed_create_manifest_valid=false",
  "ready_for_create=false"
)
$planRuntimeFailedPgCtlStart = @(
  "partial_instance_cleanup_required=true",
  "create_retry_blocked_until_cleanup=true",
  "cleanup_partial_create_required=false",
  "cleanup_partial_create_exact_state_valid=false",
  "cleanup_partial_create_manifest_valid=false",
  "cleanup_failed_create_required=true",
  "cleanup_failed_create_exact_state_valid=true",
  "cleanup_failed_create_mode=PG_CTL_START_INITIALIZED_RESIDUAL",
  "cleanup_failed_create_manifest_valid=true",
  "ready_for_create=false"
)
$planRuntimeClean = @(
  "partial_instance_cleanup_required=false",
  "create_retry_blocked_until_cleanup=false",
  "cleanup_partial_create_required=false",
  "cleanup_partial_create_exact_state_valid=false",
  "cleanup_partial_create_manifest_valid=false",
  "cleanup_failed_create_required=false",
  "cleanup_failed_create_exact_state_valid=false",
  "cleanup_failed_create_mode=",
  "cleanup_failed_create_manifest_valid=false",
  "ready_for_create=true"
)
Assert-PlanRuntimeContractCaseForSelfTest -Name "partial_accept" -Lines $planRuntimePartial -ExpectedResult "OK"
Assert-PlanRuntimeContractCaseForSelfTest -Name "failed_pg_ctl_start_accept" -Lines $planRuntimeFailedPgCtlStart -ExpectedResult "OK"
Assert-PlanRuntimeContractCaseForSelfTest -Name "clean_accept" -Lines $planRuntimeClean -ExpectedResult "OK"
Assert-PlanRuntimeContractCaseForSelfTest -Name "missing_cleanup_required" -Lines @($planRuntimePartial | Where-Object { $_ -notlike "cleanup_partial_create_required=*" }) -ExpectedResult "plan_runtime_state_signal_missing"
Assert-PlanRuntimeContractCaseForSelfTest -Name "missing_exact_state" -Lines @($planRuntimePartial | Where-Object { $_ -notlike "cleanup_partial_create_exact_state_valid=*" }) -ExpectedResult "plan_runtime_state_signal_missing"
Assert-PlanRuntimeContractCaseForSelfTest -Name "missing_failed_mode" -Lines @($planRuntimeFailedPgCtlStart | Where-Object { $_ -notlike "cleanup_failed_create_mode=*" }) -ExpectedResult "plan_runtime_state_signal_missing"
Assert-PlanRuntimeContractCaseForSelfTest -Name "duplicate_cleanup_required" -Lines @($planRuntimePartial + "cleanup_partial_create_required=true") -ExpectedResult "plan_runtime_state_signal_duplicate"
Assert-PlanRuntimeContractCaseForSelfTest -Name "duplicate_exact_state" -Lines @($planRuntimePartial + "cleanup_partial_create_exact_state_valid=true") -ExpectedResult "plan_runtime_state_signal_duplicate"
Assert-PlanRuntimeContractCaseForSelfTest -Name "duplicate_failed_mode" -Lines @($planRuntimeFailedPgCtlStart + "cleanup_failed_create_mode=PG_CTL_START_INITIALIZED_RESIDUAL") -ExpectedResult "plan_runtime_state_signal_duplicate"
Assert-PlanRuntimeContractCaseForSelfTest -Name "uppercase" -Lines @($planRuntimePartial | ForEach-Object { if ($_ -like "partial_instance_cleanup_required=*") { "partial_instance_cleanup_required=TRUE" } else { $_ } }) -ExpectedResult "plan_runtime_state_value_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "one" -Lines @($planRuntimePartial | ForEach-Object { if ($_ -like "partial_instance_cleanup_required=*") { "partial_instance_cleanup_required=1" } else { $_ } }) -ExpectedResult "plan_runtime_state_value_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "yes" -Lines @($planRuntimePartial | ForEach-Object { if ($_ -like "partial_instance_cleanup_required=*") { "partial_instance_cleanup_required=yes" } else { $_ } }) -ExpectedResult "plan_runtime_state_value_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "empty" -Lines @($planRuntimePartial | ForEach-Object { if ($_ -like "partial_instance_cleanup_required=*") { "partial_instance_cleanup_required=" } else { $_ } }) -ExpectedResult "plan_runtime_state_value_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "mixed_true_false" -Lines @($planRuntimePartial | ForEach-Object { if ($_ -like "create_retry_blocked_until_cleanup=*") { "create_retry_blocked_until_cleanup=false" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "partial_ready_true" -Lines @($planRuntimePartial | ForEach-Object { if ($_ -like "ready_for_create=*") { "ready_for_create=true" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "failed_pg_ctl_wrong_mode" -Lines @($planRuntimeFailedPgCtlStart | ForEach-Object { if ($_ -like "cleanup_failed_create_mode=*") { "cleanup_failed_create_mode=EARLY_FAILED_CREATE" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "failed_pg_ctl_ready_true" -Lines @($planRuntimeFailedPgCtlStart | ForEach-Object { if ($_ -like "ready_for_create=*") { "ready_for_create=true" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "clean_ready_false" -Lines @($planRuntimeClean | ForEach-Object { if ($_ -like "ready_for_create=*") { "ready_for_create=false" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "cleanup_required_true_in_clean" -Lines @($planRuntimeClean | ForEach-Object { if ($_ -like "cleanup_partial_create_required=*") { "cleanup_partial_create_required=true" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "exact_state_true_in_clean" -Lines @($planRuntimeClean | ForEach-Object { if ($_ -like "cleanup_partial_create_exact_state_valid=*") { "cleanup_partial_create_exact_state_valid=true" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "cleanup_required_false_in_partial" -Lines @($planRuntimePartial | ForEach-Object { if ($_ -like "cleanup_partial_create_required=*") { "cleanup_partial_create_required=false" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "exact_state_false_in_partial" -Lines @($planRuntimePartial | ForEach-Object { if ($_ -like "cleanup_partial_create_exact_state_valid=*") { "cleanup_partial_create_exact_state_valid=false" } else { $_ } }) -ExpectedResult "plan_runtime_state_combination_invalid"
Assert-PlanRuntimeContractCaseForSelfTest -Name "zero_lines" -Lines @() -ExpectedResult "plan_runtime_state_signal_missing"
Assert-PlanRuntimeContractCaseForSelfTest -Name "one_line" -Lines @("partial_instance_cleanup_required=true") -ExpectedResult "plan_runtime_state_signal_missing"
Assert-PlanRuntimeContractCaseForSelfTest -Name "noise_allowed" -Lines @(@("noise=ignored") + $planRuntimeClean + @("production_connection_used=false")) -ExpectedResult "OK"
$planOutput = Invoke-Tool -Arguments @("-Action","Plan")
$planCurrentPartialDataRootNotEmpty = $false
if ($LASTEXITCODE -ne 0 -or $planOutput -notcontains "ISOLATED_BASELINE_TEST_PLAN_OK") {
  if ($planOutput -contains "ISOLATED_BASELINE_TEST_INVALID" -and
      $planOutput -contains "stage=plan" -and
      $planOutput -contains "reason=data_root_not_empty" -and
      $planOutput -contains "production_connection_used=false" -and
      $planOutput -contains "sql_executed=false") {
    $planCurrentPartialDataRootNotEmpty = $true
  } else {
    Fail -Code "plan_action_failed"
  }
}
if (-not $planCurrentPartialDataRootNotEmpty) {
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
    "marker_state_concordance_required=true",
    "created_utc_stable=true",
    "state_write_substep_reasons=true",
    "state_initial_write_fail_closed=true",
    "state_failed_write_secondary_reason_preserved=true",
    "state_primary_reason_preserved=true",
    "state_temp_residual_detection=true",
    "state_readback_schema_validation=true",
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
    "authorization_parameter_scope=EXPLICIT",
    "authorization_token_name_collision=false",
    "create_expected_token_variable=EXPECTED_CREATE_APPROVAL_TOKEN",
    "cleanup_expected_token_variable=EXPECTED_CLEANUP_APPROVAL_TOKEN",
    "create_input_token_preserved=true",
    "cleanup_input_token_preserved=true",
    "cleanup_positive_authorization_selftest=true",
    "create_positive_authorization_selftest=true",
    "cleanup_safe_instrumentation=true",
    "cleanup_substage_model=CLOSED",
    "cleanup_reason_model=CLOSED",
    "cleanup_exception_type_model=ALLOWLIST",
    "cleanup_generic_failure_removed=true",
    "cleanup_delete_stage_guard=true",
    "cleanup_safe_reason_filter=true",
    "cleanup_directory_entries_contract=WRAPPED_STRING_ARRAY",
    "cleanup_directory_entries_zero_shape=STRING_ARRAY_0",
    "cleanup_directory_entries_one_shape=STRING_ARRAY_1",
    "cleanup_directory_entries_many_shape=STRING_ARRAY_N",
    "cleanup_pipeline_unrolling_fixed=true",
    "cleanup_strictmode_single_entry_fixed=true",
    "cleanup_propertynotfound_classified=true",
    "cleanup_wrapper_unwrap_depth=8",
    "cleanup_exact_state_shape_selftest=true",
    "cleanup_directory_entries_all_callers_wrapped=true",
    "cleanup_delete_root_uses_entries_property=true",
    "cleanup_parent_empty_symbolic_selftest=true",
    "cleanup_container_direct_count_rejected=true",
    "cleanup_container_direct_index_rejected=true",
    "cleanup_contract_validator_complete=true",
    "cleanup_parent_validation_stage=CLEANUP_VALIDATE_PARENT_EMPTY",
    "cleanup_parent_not_empty_reason_preserved=true",
    "cleanup_delete_root_stage_is_delete_only=true",
    "cleanup_parent_nonempty_blocks_second_delete=true",
    "cleanup_second_delete_reachable_only_when_parent_empty=true",
    "cleanup_parent_stage_reason_validator_complete=true",
    "cleanup_real_execution_tested=false",
    "cleanup_failed_create_action_present=true",
    "cleanup_failed_create_authorized=false",
    "cleanup_failed_create_execution_blocked=true",
    "cleanup_failed_create_required=true",
    "cleanup_failed_create_exact_state_valid=true",
    "cleanup_failed_create_mode=PG_CTL_START_INITIALIZED_RESIDUAL",
    "cleanup_failed_create_manifest_valid=true",
    "cleanup_failed_create_exact_state_required=true",
    "cleanup_failed_create_pg_ctl_start_mode_supported=true",
    "cleanup_failed_create_pg_ctl_start_manifest_supported=true",
    "cleanup_failed_create_recursive_delete_allowed=false",
    "cleanup_failed_create_acl_modification_allowed=false",
    "cleanup_failed_create_package_directory_in_scope=false",
    "cleanup_failed_create_marker_state_validation=true",
    "cleanup_failed_create_activity_revalidation=true",
    "cleanup_failed_create_expected_delete_file_count=2",
    "cleanup_failed_create_expected_delete_directory_count=6",
    "cleanup_failed_create_state_length_exact_hardcode=false",
    "cleanup_failed_create_state_size_bounded=true",
    "cleanup_failed_create_state_get_created_utc_failure_supported=true",
    "cleanup_partial_create_state_replace_residual_supported=true",
    "cleanup_partial_create_nonempty_instance_supported=true",
    "cleanup_partial_create_bottom_up_delete=true",
    "cleanup_partial_create_recursive_delete_used=false",
    "cleanup_partial_create_recovery_deterministic=true",
    "cleanup_partial_create_real_filesystem_self_test=true",
    "state_replace_strategy_windows_compatible=true",
    "state_replace_temp_acl_hardened=true",
    "state_replace_real_filesystem_self_test=true",
    "state_replace_failure_classification=true",
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
Assert-PlanRuntimeStateContractForSelfTest -Lines ([string[]]$planOutput)
if (-not (($planOutput | Where-Object { $_ -like "dependency_names=*" }) -match "auth.users") -or
    -not (($planOutput | Where-Object { $_ -like "dependency_names=*" }) -match "storage.objects") -or
    -not (($planOutput | Where-Object { $_ -like "dependency_names=*" }) -match "extensions.gen_random_uuid")) {
  Fail -Code "dependency_names_missing"
}
if (-not (($planOutput | Where-Object { $_ -like "local_compat_preflight_dependency_names=*" }) -match "extensions.gen_random_uuid")) {
  Fail -Code "compat_dependency_names_missing"
}

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

function Set-StateReplaceSelfTestAcl {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][ValidateSet("Directory","File")][string]$TargetType
  )
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = if ($TargetType -eq "Directory") {
    [System.Security.AccessControl.DirectorySecurity]::new()
  } else {
    [System.Security.AccessControl.FileSecurity]::new()
  }
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = if ($TargetType -eq "Directory") { [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit" } else { [System.Security.AccessControl.InheritanceFlags]"None" }
  $propagation = [System.Security.AccessControl.PropagationFlags]"None"
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, "FullControl", $inherit, $propagation, "Allow")
  $acl.AddAccessRule($rule)
  if ($TargetType -eq "Directory") {
    [System.IO.Directory]::SetAccessControl($PathValue, $acl)
  } else {
    [System.IO.File]::SetAccessControl($PathValue, $acl)
  }
}

function Assert-StateReplaceSelfTestAcl {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][ValidateSet("Directory","File")][string]$TargetType
  )
  $acl = Get-Acl -LiteralPath $PathValue
  if ($acl.AreAccessRulesProtected -ne $true) { Fail -Code "state_replace_selftest_acl_not_protected" }
  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne 1) { Fail -Code "state_replace_selftest_acl_rule_count" }
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $rule = $rules[0]
  if ($rule.IsInherited -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { Fail -Code "state_replace_selftest_acl_rule_type" }
  if (-not [string]::Equals($rule.IdentityReference.Value, $sid, [System.StringComparison]::OrdinalIgnoreCase)) { Fail -Code "state_replace_selftest_acl_sid" }
  if ((([int64]$rule.FileSystemRights) -band ([int64][System.Security.AccessControl.FileSystemRights]::FullControl)) -ne ([int64][System.Security.AccessControl.FileSystemRights]::FullControl)) { Fail -Code "state_replace_selftest_acl_rights" }
  $expectedInheritance = if ($TargetType -eq "Directory") { [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit" } else { [System.Security.AccessControl.InheritanceFlags]"None" }
  if ([int]$rule.InheritanceFlags -ne [int]$expectedInheritance) { Fail -Code "state_replace_selftest_acl_inheritance" }
  if ([int]$rule.PropagationFlags -ne [int][System.Security.AccessControl.PropagationFlags]"None") { Fail -Code "state_replace_selftest_acl_propagation" }
}

function New-StateReplaceSelfTestJson {
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
    admin_role = "vc_isolated_admin"
    instance_name = "pg17-port55432"
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
  return (($payload | ConvertTo-Json -Depth 4).TrimEnd("`r","`n") + "`n")
}

function Invoke-StateReplaceSelfTestReplacement {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$StatePath,
    [Parameter(Mandatory = $true)][string]$TempPath,
    [Parameter(Mandatory = $true)][string]$ExpectedCreatedUtc,
    [Parameter(Mandatory = $true)][string]$ExpectedUpdatedUtc
  )
  if (-not [string]::Equals((Split-Path -Parent ([System.IO.Path]::GetFullPath($TempPath))).TrimEnd('\'), ([System.IO.Path]::GetFullPath($StateRoot)).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) { Fail -Code "state_replace_selftest_temp_outside" }
  if ([System.IO.Path]::GetFileName($TempPath) -notmatch '^cluster-state\.[0-9a-f]{32}\.tmp$') { Fail -Code "state_replace_selftest_temp_name" }
  $backup = Join-Path $StateRoot ("cluster-state." + [Guid]::NewGuid().ToString("N") + ".bak")
  if ([System.IO.Path]::GetFileName($backup) -notmatch '^cluster-state\.[0-9a-f]{32}\.bak$') { Fail -Code "state_replace_selftest_backup_name" }
  Set-StateReplaceSelfTestAcl -PathValue $TempPath -TargetType File
  Assert-StateReplaceSelfTestAcl -PathValue $TempPath -TargetType File
  [System.IO.File]::Replace($TempPath, $StatePath, $backup, $true)
  if (Test-Path -LiteralPath $TempPath -PathType Leaf) { Fail -Code "state_replace_selftest_temp_residual" }
  Set-StateReplaceSelfTestAcl -PathValue $StatePath -TargetType File
  Assert-StateReplaceSelfTestAcl -PathValue $StatePath -TargetType File
  $content = [System.IO.File]::ReadAllText($StatePath) | ConvertFrom-Json
  if ([string]$content.created_utc -ne $ExpectedCreatedUtc -or [string]$content.updated_utc -ne $ExpectedUpdatedUtc) { Fail -Code "state_replace_selftest_content" }
  if (Test-Path -LiteralPath $backup -PathType Leaf) {
    Set-StateReplaceSelfTestAcl -PathValue $backup -TargetType File
    [System.IO.File]::Delete($backup)
  }
  if (Test-Path -LiteralPath $backup -PathType Leaf) { Fail -Code "state_replace_selftest_backup_residual" }
}

function Invoke-StateReplaceRealFilesystemSelfTest {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $root = Join-Path $tempRoot ("vc-state-replace-selftest-" + [Guid]::NewGuid().ToString("N"))
  $created = "2026-01-01T00:00:00.0000000+00:00"
  $updated1 = "2026-01-01T00:00:01.0000000+00:00"
  $updated2 = "2026-01-01T00:00:02.0000000+00:00"
  $clusterId = [Guid]::NewGuid().ToString()
  $state = Join-Path $root "cluster-state.json"
  $tmp1 = Join-Path $root ("cluster-state." + [Guid]::NewGuid().ToString("N") + ".tmp")
  $tmp2 = Join-Path $root ("cluster-state." + [Guid]::NewGuid().ToString("N") + ".tmp")
  try {
    [System.IO.Directory]::CreateDirectory($root) | Out-Null
    if (-not ([System.IO.Path]::GetFullPath($root).StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase))) { Fail -Code "state_replace_selftest_root_outside_temp" }
    if ([System.IO.Path]::GetFileName($root) -notmatch '^vc-state-replace-selftest-[0-9a-f]{32}$') { Fail -Code "state_replace_selftest_root_prefix" }
    $rootItem = Get-Item -LiteralPath $root -Force
    if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { Fail -Code "state_replace_selftest_root_reparse" }
    Set-StateReplaceSelfTestAcl -PathValue $root -TargetType Directory
    Assert-StateReplaceSelfTestAcl -PathValue $root -TargetType Directory
    [System.IO.File]::WriteAllText($state, (New-StateReplaceSelfTestJson -ClusterId $clusterId -State "initializing" -Stage "initdb" -CreatedUtc $created -UpdatedUtc $created -InitdbCompleted:$false), [System.Text.UTF8Encoding]::new($false))
    Set-StateReplaceSelfTestAcl -PathValue $state -TargetType File
    Assert-StateReplaceSelfTestAcl -PathValue $state -TargetType File
    [System.IO.File]::WriteAllText($tmp1, (New-StateReplaceSelfTestJson -ClusterId $clusterId -State "initialized" -Stage "initialized" -CreatedUtc $created -UpdatedUtc $updated1 -InitdbCompleted:$true), [System.Text.UTF8Encoding]::new($false))
    Invoke-StateReplaceSelfTestReplacement -StateRoot $root -StatePath $state -TempPath $tmp1 -ExpectedCreatedUtc $created -ExpectedUpdatedUtc $updated1
    [System.IO.File]::WriteAllText($tmp2, (New-StateReplaceSelfTestJson -ClusterId $clusterId -State "configuring" -Stage "postgresql_conf" -CreatedUtc $created -UpdatedUtc $updated2 -InitdbCompleted:$true), [System.Text.UTF8Encoding]::new($false))
    Invoke-StateReplaceSelfTestReplacement -StateRoot $root -StatePath $state -TempPath $tmp2 -ExpectedCreatedUtc $created -ExpectedUpdatedUtc $updated2
    $remaining = @([System.IO.Directory]::GetFileSystemEntries($root))
    if ($remaining.Count -ne 1 -or -not [string]::Equals([System.IO.Path]::GetFullPath($remaining[0]).TrimEnd('\'), [System.IO.Path]::GetFullPath($state).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) { Fail -Code "state_replace_selftest_residual_entries" }
  } finally {
    if (Test-Path -LiteralPath $root -PathType Container) {
      $entries = @([System.IO.Directory]::GetFileSystemEntries($root))
      foreach ($entry in $entries) {
        $entryFull = [System.IO.Path]::GetFullPath($entry)
        if (-not $entryFull.StartsWith(([System.IO.Path]::GetFullPath($root) + [System.IO.Path]::DirectorySeparatorChar), [System.StringComparison]::OrdinalIgnoreCase)) { Fail -Code "state_replace_selftest_cleanup_outside" }
        $item = Get-Item -LiteralPath $entryFull -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or ($item.Attributes -band [System.IO.FileAttributes]::Directory) -ne 0) { Fail -Code "state_replace_selftest_cleanup_shape" }
        if ([System.IO.Path]::GetFileName($entryFull) -notmatch '^cluster-state(\.[0-9a-f]{32}\.(tmp|bak)|\.json)$') { Fail -Code "state_replace_selftest_cleanup_name" }
        [System.IO.File]::Delete($entryFull)
      }
      [System.IO.Directory]::Delete($root, $false)
    }
  }
  if (Test-Path -LiteralPath $root) { Fail -Code "state_replace_selftest_root_residual" }
  Write-Output "STATE_REPLACE_REAL_FILESYSTEM_SELF_TEST_OK"
}

function Write-BSec23LTextFile {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$Text
  )
  [System.IO.File]::WriteAllText($PathValue, $Text, [System.Text.UTF8Encoding]::new($false))
}

function ConvertTo-BSec23LSingleQuotedLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Stop-BSec23LControlledProcess {
  param(
    [Parameter(Mandatory = $true)][string]$PidFile,
    [Parameter(Mandatory = $true)][string]$Token
  )
  if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) {
    $markerWait = [System.Diagnostics.Stopwatch]::StartNew()
    while ($markerWait.Elapsed.TotalSeconds -lt 5 -and -not (Test-Path -LiteralPath $PidFile -PathType Leaf)) {
      Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) { return }
  }
  $content = [System.IO.File]::ReadAllText($PidFile)
  $lines = @($content -split "\r?\n")
  if ($lines.Count -lt 2 -or -not [string]::Equals($lines[1], $Token, [System.StringComparison]::Ordinal)) {
    Fail -Code "bsec23l_process_token_mismatch"
  }
  $pidValue = 0
  if (-not [int]::TryParse($lines[0], [ref]$pidValue)) { Fail -Code "bsec23l_process_pid_invalid" }
  $process = $null
  try {
    $process = [System.Diagnostics.Process]::GetProcessById($pidValue)
    if (-not $process.HasExited) {
      $process.Kill()
      [void]$process.WaitForExit(5000)
    }
  } catch [System.ArgumentException] {
  } finally {
    if ($null -ne $process) { $process.Dispose() }
  }
}

function Read-BSec23LFileTail {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
    return [pscustomobject]@{ Ok = $false; SafeErrorCode = "persistent_process_output_missing"; Tail = "" }
  }
  $stream = $null
  $reader = $null
  try {
    $stream = [System.IO.FileStream]::new($PathValue, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.UTF8Encoding]::new($false), $true)
    $textValue = $reader.ReadToEnd()
    if ($textValue.Length -gt 4096) {
      $textValue = $textValue.Substring($textValue.Length - 4096)
    }
    return [pscustomobject]@{ Ok = $true; SafeErrorCode = "none"; Tail = $textValue }
  } catch {
    return [pscustomobject]@{ Ok = $false; SafeErrorCode = "persistent_process_output_read_failed"; Tail = "" }
  } finally {
    if ($null -ne $reader) { $reader.Dispose() }
    elseif ($null -ne $stream) { $stream.Dispose() }
  }
}

function Invoke-BSec23LLegacyPipeRunner {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][int]$TimeoutMilliseconds
  )
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FilePath
  $psi.Arguments = (($Arguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join " ")
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
    if (-not $process.WaitForExit($TimeoutMilliseconds)) {
      try { $process.Kill() } catch { }
      return [pscustomobject]@{ Success = $false; SafeErrorCode = "process_timeout"; OutputDrainCompleted = $false }
    }
    $stdoutDone = $stdoutTask.Wait(500)
    $stderrDone = $stderrTask.Wait(500)
    if (-not $stdoutDone -or -not $stderrDone) {
      return [pscustomobject]@{ Success = $false; SafeErrorCode = "process_output_drain_failed"; OutputDrainCompleted = $false }
    }
    return [pscustomobject]@{ Success = ($process.ExitCode -eq 0); SafeErrorCode = $(if ($process.ExitCode -eq 0) { "none" } else { "process_failed" }); OutputDrainCompleted = $true }
  } finally {
    if ($null -ne $stdoutTask -and $stdoutTask.IsCompleted) { try { $stdoutTask.Dispose() } catch { } }
    if ($null -ne $stderrTask -and $stderrTask.IsCompleted) { try { $stderrTask.Dispose() } catch { } }
    try { $process.Dispose() } catch { }
  }
}

function Invoke-BSec23LFileRedirectRunner {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [Parameter(Mandatory = $true)][int]$TimeoutMilliseconds
  )
  $runId = [Guid]::NewGuid().ToString("N")
  $stdoutPath = Join-Path $OutputDirectory ("bsec23l." + $runId + ".stdout.log")
  $stderrPath = Join-Path $OutputDirectory ("bsec23l." + $runId + ".stderr.log")
  if (-not ("BSec23LNativeRedirectRunner" -as [type])) {
    $sourceLines = @(
      'using System;',
      'using System.IO;',
      'using System.Runtime.InteropServices;',
      'public static class BSec23LNativeRedirectRunner {',
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct STARTUPINFO { public UInt32 cb; public IntPtr r; public IntPtr d; public IntPtr t; public UInt32 x; public UInt32 y; public UInt32 xs; public UInt32 ys; public UInt32 xc; public UInt32 yc; public UInt32 f; public UInt32 flags; public UInt16 sw; public UInt16 cb2; public IntPtr r2; public IntPtr stdin; public IntPtr stdout; public IntPtr stderr; }',
      '  [StructLayout(LayoutKind.Sequential)] public struct PROCESS_INFORMATION { public IntPtr hp; public IntPtr ht; public UInt32 pid; public UInt32 tid; }',
      '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool CreateProcessW(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, UInt32 flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetStdHandle(Int32 n);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetCurrentProcess();',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool DuplicateHandle(IntPtr sp, IntPtr sh, IntPtr tp, ref IntPtr th, UInt32 access, bool inherit, UInt32 opts);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern UInt32 WaitForSingleObject(IntPtr h, UInt32 ms);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool TerminateProcess(IntPtr h, UInt32 exitCode);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetExitCodeProcess(IntPtr h, out UInt32 exitCode);',
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);',
      '  private static string Quote(string value) { if (value == null) value = String.Empty; if (value.Length == 0) return "\"\""; bool needs = false; foreach(char c in value) { if (Char.IsWhiteSpace(c) || c == ''"'') { needs = true; break; } } if (!needs) return value; System.Text.StringBuilder b = new System.Text.StringBuilder(); b.Append(''"''); foreach(char c in value) { if (c == ''"'') { b.Append(''\\''); b.Append(''"''); } else { b.Append(c); } } b.Append(''"''); return b.ToString(); }',
      '  public static int[] Run(string file, string[] args, string cwd, string stdoutPath, string stderrPath, int timeoutMs) { string cmd = Quote(file); foreach(string a in args) { cmd += " " + Quote(a); } using(FileStream so = new FileStream(stdoutPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite)) using(FileStream se = new FileStream(stderrPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite)) { IntPtr cur = GetCurrentProcess(); IntPtr hi = IntPtr.Zero; IntPtr ho = IntPtr.Zero; IntPtr he = IntPtr.Zero; DuplicateHandle(cur, GetStdHandle(-10), cur, ref hi, 0, true, 2); if(!DuplicateHandle(cur, so.SafeFileHandle.DangerousGetHandle(), cur, ref ho, 0, true, 2)) return new int[]{-1,0,0,0}; if(!DuplicateHandle(cur, se.SafeFileHandle.DangerousGetHandle(), cur, ref he, 0, true, 2)) return new int[]{-1,0,0,0}; STARTUPINFO si = new STARTUPINFO(); si.cb = (UInt32)Marshal.SizeOf(typeof(STARTUPINFO)); si.flags = 0x100; si.stdin = hi; si.stdout = ho; si.stderr = he; PROCESS_INFORMATION pi; bool ok = CreateProcessW(file, cmd, IntPtr.Zero, IntPtr.Zero, true, 0, IntPtr.Zero, cwd, ref si, out pi); if(hi != IntPtr.Zero) CloseHandle(hi); if(ho != IntPtr.Zero) CloseHandle(ho); if(he != IntPtr.Zero) CloseHandle(he); if(!ok) return new int[]{-1,0,0,0}; if(pi.ht != IntPtr.Zero) CloseHandle(pi.ht); UInt32 wait = WaitForSingleObject(pi.hp, (UInt32)timeoutMs); if(wait == 258) { TerminateProcess(pi.hp, 1); CloseHandle(pi.hp); return new int[]{-1,1,1,1}; } UInt32 ec; if(!GetExitCodeProcess(pi.hp, out ec)) { CloseHandle(pi.hp); return new int[]{-1,0,0,1}; } CloseHandle(pi.hp); return new int[]{unchecked((int)ec),0,0,1}; } }',
      '}'
    )
    Add-Type -TypeDefinition ($sourceLines -join "`r`n")
  }
  $native = [BSec23LNativeRedirectRunner]::Run($FilePath, [string[]]$Arguments, $WorkingDirectory, $stdoutPath, $stderrPath, $TimeoutMilliseconds)
  $stdout = Read-BSec23LFileTail -PathValue $stdoutPath
  $stderr = Read-BSec23LFileTail -PathValue $stderrPath
  $exitCode = [int]$native[0]
  $timedOut = ([int]$native[1] -eq 1)
  $success = ([int]$native[3] -eq 1 -and -not $timedOut -and $exitCode -eq 0)
  if (-not $stdout.Ok -and -not $success) { return [pscustomobject]@{ Success = $false; SafeErrorCode = $stdout.SafeErrorCode; OutputDrainCompleted = $true; StdOutTail = ""; StdErrTail = "" } }
  if (-not $stderr.Ok -and -not $success) { return [pscustomobject]@{ Success = $false; SafeErrorCode = $stderr.SafeErrorCode; OutputDrainCompleted = $true; StdOutTail = $(if ($stdout.Ok) { $stdout.Tail } else { "" }); StdErrTail = "" } }
  $safe = if ($success) { "none" } elseif ($timedOut) { "process_timeout" } else { "pg_ctl_start_failed" }
  return [pscustomobject]@{ Success = $success; SafeErrorCode = $safe; OutputDrainCompleted = $true; StdOutTail = $(if ($stdout.Ok) { $stdout.Tail } else { "" }); StdErrTail = $(if ($stderr.Ok) { $stderr.Tail } else { "" }) }
}

function Invoke-BSec23LPersistentProcessSelfTest {
  Set-StrictMode -Version Latest
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $root = Join-Path $tempRoot ("vc-bsec23l-selftest-" + [Guid]::NewGuid().ToString("N"))
  $token = [Guid]::NewGuid().ToString("N")
  $pidFile = Join-Path $root "child.pid"
  $childScript = Join-Path $root "child.ps1"
  $parentScript = Join-Path $root "parent.ps1"
  $parentExe = Join-Path $root "parent.exe"
  $quickScript = Join-Path $root "quick.ps1"
  $failScript = Join-Path $root "fail.ps1"
  $timeoutScript = Join-Path $root "timeout.ps1"
  $largeScript = Join-Path $root "large.ps1"
  $powershell = (Get-Command powershell.exe -CommandType Application).Source
  try {
    [System.IO.Directory]::CreateDirectory($root) | Out-Null
    if (-not ([System.IO.Path]::GetFullPath($root).StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase))) { Fail -Code "bsec23l_temp_root_outside" }
    $childLines = @(
      'param([Parameter(Mandatory = $true)][string]$PidFile,[Parameter(Mandatory = $true)][string]$Token,[int]$SleepSeconds = 30)',
      '[System.IO.File]::WriteAllText($PidFile, ("{0}`n{1}" -f $PID, $Token), [System.Text.UTF8Encoding]::new($false))',
      'Write-Output "child-ready"',
      'Start-Sleep -Seconds $SleepSeconds'
    ) -join "`r`n"
    Write-BSec23LTextFile -PathValue $childScript -Text $childLines
    $parentSource = @(
      'using System;'
      'using System.Runtime.InteropServices;'
      'public static class BSec23LParent {'
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct STARTUPINFO {'
      '    public UInt32 cb; public IntPtr lpReserved; public IntPtr lpDesktop; public IntPtr lpTitle;'
      '    public UInt32 dwX; public UInt32 dwY; public UInt32 dwXSize; public UInt32 dwYSize;'
      '    public UInt32 dwXCountChars; public UInt32 dwYCountChars; public UInt32 dwFillAttribute;'
      '    public UInt32 dwFlags; public UInt16 wShowWindow; public UInt16 cbReserved2;'
      '    public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;'
      '  }'
      '  [StructLayout(LayoutKind.Sequential)] public struct PROCESS_INFORMATION {'
      '    public IntPtr hProcess; public IntPtr hThread; public UInt32 dwProcessId; public UInt32 dwThreadId;'
      '  }'
      '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool CreateProcessW(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, UInt32 flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);'
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetStdHandle(Int32 n);'
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetCurrentProcess();'
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool DuplicateHandle(IntPtr sp, IntPtr sh, IntPtr tp, ref IntPtr th, UInt32 access, bool inherit, UInt32 opts);'
      '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);'
      '  public static int Main(string[] args) {'
      '    string app = args[0];'
      '    string child = args[1];'
      '    string pidFile = args[2];'
      '    string token = args[3];'
      '    string cmd = "\"" + app + "\" -NoProfile -ExecutionPolicy Bypass -File \"" + child + "\" -PidFile \"" + pidFile + "\" -Token \"" + token + "\" -SleepSeconds 30";'
      '    STARTUPINFO si = new STARTUPINFO();'
      '    si.cb = (UInt32)Marshal.SizeOf(typeof(STARTUPINFO));'
      '    si.dwFlags = 0x00000100;'
      '    IntPtr current = GetCurrentProcess();'
      '    IntPtr hIn = IntPtr.Zero; IntPtr hOut = IntPtr.Zero; IntPtr hErr = IntPtr.Zero;'
      '    if (!DuplicateHandle(current, GetStdHandle(-10), current, ref hIn, 0, true, 2)) { return 10; }'
      '    if (!DuplicateHandle(current, GetStdHandle(-11), current, ref hOut, 0, true, 2)) { return 11; }'
      '    if (!DuplicateHandle(current, GetStdHandle(-12), current, ref hErr, 0, true, 2)) { return 12; }'
      '    si.hStdInput = hIn; si.hStdOutput = hOut; si.hStdError = hErr;'
      '    PROCESS_INFORMATION pi;'
      '    bool ok = CreateProcessW(app, cmd, IntPtr.Zero, IntPtr.Zero, true, 0, IntPtr.Zero, null, ref si, out pi);'
      '    if (pi.hThread != IntPtr.Zero) { CloseHandle(pi.hThread); }'
      '    if (pi.hProcess != IntPtr.Zero) { CloseHandle(pi.hProcess); }'
      '    if (hIn != IntPtr.Zero) { CloseHandle(hIn); }'
      '    if (hOut != IntPtr.Zero) { CloseHandle(hOut); }'
      '    if (hErr != IntPtr.Zero) { CloseHandle(hErr); }'
      '    if (!ok) { return 20; }'
      '    Console.WriteLine("parent-exiting");'
      '    return 0;'
      '  }'
      '}'
    ) -join "`r`n"
    Add-Type -TypeDefinition $parentSource -OutputAssembly $parentExe -OutputType ConsoleApplication
    $legacy = Invoke-BSec23LLegacyPipeRunner -FilePath $parentExe -Arguments @($powershell, $childScript, $pidFile, $token) -WorkingDirectory $root -TimeoutMilliseconds 5000
    if ($legacy.SafeErrorCode -ne "process_output_drain_failed" -or $legacy.OutputDrainCompleted) { Fail -Code "bsec23l_legacy_pipe_reproduction_failed" }
    Stop-BSec23LControlledProcess -PidFile $pidFile -Token $token
    if (Test-Path -LiteralPath $pidFile -PathType Leaf) { [System.IO.File]::Delete($pidFile) }
    $redirect = Invoke-BSec23LFileRedirectRunner -FilePath $parentExe -Arguments @($powershell, $childScript, $pidFile, $token) -WorkingDirectory $root -OutputDirectory $root -TimeoutMilliseconds 5000
    if ($redirect.SafeErrorCode -ne "none" -or -not $redirect.OutputDrainCompleted) { Fail -Code "bsec23l_file_redirect_child_handle_failed" }
    Stop-BSec23LControlledProcess -PidFile $pidFile -Token $token
    Write-BSec23LTextFile -PathValue $quickScript -Text 'Write-Output "quick-ok"; exit 0'
    $quick = Invoke-BSec23LFileRedirectRunner -FilePath $powershell -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $quickScript) -WorkingDirectory $root -OutputDirectory $root -TimeoutMilliseconds 5000
    if ($quick.SafeErrorCode -ne "none" -or $quick.StdOutTail -notmatch "quick-ok") { Fail -Code "bsec23l_pgctl_simulated_zero_failed" }
    Write-BSec23LTextFile -PathValue $failScript -Text 'Write-Error "simulated failure"; exit 7'
    $failed = Invoke-BSec23LFileRedirectRunner -FilePath $powershell -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $failScript) -WorkingDirectory $root -OutputDirectory $root -TimeoutMilliseconds 5000
    if ($failed.SafeErrorCode -ne "pg_ctl_start_failed") { Fail -Code "bsec23l_pgctl_simulated_nonzero_failed" }
    Write-BSec23LTextFile -PathValue $timeoutScript -Text ('[System.IO.File]::WriteAllText(' + (ConvertTo-BSec23LSingleQuotedLiteral -Value $pidFile) + ', ("{0}`n' + $token + '" -f $PID), [System.Text.UTF8Encoding]::new($false)); Start-Sleep -Seconds 20')
    $timed = Invoke-BSec23LFileRedirectRunner -FilePath $powershell -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $timeoutScript) -WorkingDirectory $root -OutputDirectory $root -TimeoutMilliseconds 500
    if (@("process_timeout","process_output_drain_failed") -notcontains $timed.SafeErrorCode) { Fail -Code "bsec23l_pgctl_simulated_timeout_failed" }
    Stop-BSec23LControlledProcess -PidFile $pidFile -Token $token
    $missingTail = Read-BSec23LFileTail -PathValue (Join-Path $root "missing-output.log")
    if ($missingTail.SafeErrorCode -ne "persistent_process_output_missing") { Fail -Code "bsec23l_missing_output_not_detected" }
    $lockedPath = Join-Path $root "locked-output.log"
    Write-BSec23LTextFile -PathValue $lockedPath -Text "locked"
    $lockedStream = [System.IO.FileStream]::new($lockedPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    try {
      $lockedTail = Read-BSec23LFileTail -PathValue $lockedPath
    } finally {
      $lockedStream.Dispose()
    }
    if ($lockedTail.SafeErrorCode -ne "persistent_process_output_read_failed") { Fail -Code "bsec23l_locked_output_not_detected" }
    Write-BSec23LTextFile -PathValue $largeScript -Text ('$x = "A" * 6000; Write-Output $x; Write-Output "TAIL_OK"; exit 0')
    $large = Invoke-BSec23LFileRedirectRunner -FilePath $powershell -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $largeScript) -WorkingDirectory $root -OutputDirectory $root -TimeoutMilliseconds 5000
    if ($large.SafeErrorCode -ne "none" -or $large.StdOutTail.Length -gt 4096 -or $large.StdOutTail -notmatch "TAIL_OK") { Fail -Code "bsec23l_large_tail_failed" }
  } finally {
    Stop-BSec23LControlledProcess -PidFile $pidFile -Token $token
    if (Test-Path -LiteralPath $root -PathType Container) {
      $entries = @([System.IO.Directory]::GetFileSystemEntries($root, "*", [System.IO.SearchOption]::AllDirectories)) | Sort-Object Length -Descending
      foreach ($entry in $entries) {
        $entryFull = [System.IO.Path]::GetFullPath($entry)
        if (-not $entryFull.StartsWith(([System.IO.Path]::GetFullPath($root) + [System.IO.Path]::DirectorySeparatorChar), [System.StringComparison]::OrdinalIgnoreCase)) { Fail -Code "bsec23l_cleanup_outside_root" }
        $item = Get-Item -LiteralPath $entryFull -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
          [System.IO.Directory]::Delete($entryFull, $false)
        } else {
          [System.IO.File]::Delete($entryFull)
        }
      }
      [System.IO.Directory]::Delete($root, $false)
    }
  }
  if (Test-Path -LiteralPath $root) { Fail -Code "bsec23l_temp_root_residual" }
  Write-Output "PG_CTL_PERSISTENT_CHILD_HANDLE_SELF_TEST_OK"
  Write-Output "INCOMPLETE_OUTPUT_TASK_DISPOSE_SELF_TEST_OK"
  Write-Output "PG_CTL_START_PROCESS_STRATEGY_SELF_TEST_OK"
}

Invoke-BSec23LPersistentProcessSelfTest
$cleanupPartialFilesystemSelfTestOutput = Invoke-Tool -Arguments @("-SelfTest")
if ($LASTEXITCODE -ne 0 -or $cleanupPartialFilesystemSelfTestOutput -notcontains "CLEANUP_PARTIAL_FILE_ADDED_AFTER_MANIFEST_SELF_TEST_OK") {
  Fail -Code "cleanup_partial_file_added_after_manifest_selftest_runtime_failed"
}
if ($LASTEXITCODE -ne 0 -or $cleanupPartialFilesystemSelfTestOutput -notcontains "CLEANUP_PARTIAL_REAL_FILESYSTEM_SELF_TEST_OK") {
  Fail -Code "cleanup_partial_real_filesystem_selftest_runtime_failed"
}
if ($LASTEXITCODE -ne 0 -or $cleanupPartialFilesystemSelfTestOutput -notcontains "CLEANUP_FAILED_PG_CTL_START_RESIDUAL_SELF_TEST_OK") {
  Fail -Code "cleanup_failed_pg_ctl_start_residual_selftest_runtime_failed"
}
if ($LASTEXITCODE -ne 0 -or $cleanupPartialFilesystemSelfTestOutput -notcontains "CLEANUP_FAILED_PG_CTL_START_MUTATION_SELF_TEST_OK") {
  Fail -Code "cleanup_failed_pg_ctl_start_mutation_selftest_runtime_failed"
}
if ($LASTEXITCODE -ne 0 -or $cleanupPartialFilesystemSelfTestOutput -notcontains "CLEANUP_FAILED_PG_CTL_START_PLAN_SELF_TEST_OK") {
  Fail -Code "cleanup_failed_pg_ctl_start_plan_selftest_runtime_failed"
}
Write-Output "CLEANUP_FAILED_PG_CTL_START_RESIDUAL_SELF_TEST_OK"
Write-Output "CLEANUP_FAILED_PG_CTL_START_MUTATION_SELF_TEST_OK"
Write-Output "CLEANUP_FAILED_PG_CTL_START_PLAN_SELF_TEST_OK"
Write-Output "CLEANUP_PARTIAL_FILE_ADDED_AFTER_MANIFEST_SELF_TEST_OK"
Write-Output "CLEANUP_PARTIAL_REAL_FILESYSTEM_SELF_TEST_OK"
Invoke-StateReplaceRealFilesystemSelfTest
Write-Output "CLEAN_PLAN_RUNTIME_VALIDATION_SELF_TEST_OK"
Write-Output "SELF_TEST_OK"
