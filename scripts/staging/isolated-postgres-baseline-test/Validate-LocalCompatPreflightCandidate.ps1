[CmdletBinding()]
param(
  [switch]$SelfTest,
  [string]$CandidatePath,
  [string]$ManifestPath,
  [string]$PostgresRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:Stage = "initialization"
$script:SelfTestMode = $false

function Set-Stage {
  param([Parameter(Mandatory = $true)][string]$Value)
  $script:Stage = $Value
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

function Read-ManifestMap {
  param([Parameter(Mandatory = $true)][string]$Path)
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -le 0) { Throw-SafeError -Code "manifest_format_invalid" }
    $key = $line.Substring(0, $separator)
    $value = $line.Substring($separator + 1)
    if ($map.ContainsKey($key)) { Throw-SafeError -Code "manifest_duplicate_key" }
    $map[$key] = $value
  }
  return $map
}

function Assert-ManifestValue {
  param(
    [Parameter(Mandatory = $true)][hashtable]$Manifest,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Expected,
    [string]$Code = "manifest_marker_invalid"
  )
  if (-not $Manifest.ContainsKey($Key) -or $Manifest[$Key] -ne $Expected) {
    Throw-SafeError -Code $Code
  }
}

function Assert-NoMatch {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Code
  )
  if ($Text -match $Pattern) { Throw-SafeError -Code $Code }
}

function Assert-ApprovedLocation {
  param([Parameter(Mandatory = $true)][string]$Path)
  $full = [System.IO.Path]::GetFullPath($Path)
  if ($full -match "\\supabase\\migrations\\") {
    Throw-SafeError -Code "candidate_inside_migrations"
  }
  if ($script:SelfTestMode) {
    return
  }
  $expectedDir = [System.IO.Path]::GetFullPath($PSScriptRoot)
  $parent = [System.IO.Path]::GetFullPath((Split-Path -Parent $full))
  if (-not [string]::Equals($parent.TrimEnd("\"), $expectedDir.TrimEnd("\"), [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "candidate_location_invalid"
  }
}

function Get-DefaultPostgresRoot {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    Throw-SafeError -Code "postgres_package_incomplete"
  }
  return Join-Path $env:LOCALAPPDATA "VotoClaro\PostgreSQL\17.10-complete"
}

function Assert-PostgresPackage {
  param([Parameter(Mandatory = $true)][string]$Root)
  $full = [System.IO.Path]::GetFullPath($Root)
  $postgresBki = Join-Path $full "share\postgres.bki"
  $pgcryptoControl = Join-Path $full "share\extension\pgcrypto.control"
  $pgcryptoLibrary = Join-Path $full "lib\pgcrypto.dll"
  if (-not (Test-Path -LiteralPath $postgresBki -PathType Leaf)) {
    Throw-SafeError -Code "postgres_bki_missing"
  }
  if (-not (Test-Path -LiteralPath $pgcryptoControl -PathType Leaf)) {
    Throw-SafeError -Code "pgcrypto_control_missing"
  }
  if (-not (Test-Path -LiteralPath $pgcryptoLibrary -PathType Leaf)) {
    Throw-SafeError -Code "pgcrypto_library_missing"
  }
  return [pscustomobject]@{
    Complete = $true
    PgcryptoControlPresent = $true
    PgcryptoLibraryPresent = $true
    PostgresBkiPresent = $true
  }
}

function Assert-Bytes {
  param([Parameter(Mandatory = $true)][string]$Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -eq 0) { Throw-SafeError -Code "candidate_empty" }
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Throw-SafeError -Code "utf8_bom_detected"
  }
  for ($i = 0; $i -lt $bytes.Length; $i += 1) {
    if ($bytes[$i] -eq 13) { Throw-SafeError -Code "crlf_or_cr_detected" }
  }
  if ($bytes[-1] -ne 10) { Throw-SafeError -Code "final_newline_invalid" }
  if ($bytes.Length -gt 1 -and $bytes[$bytes.Length - 2] -eq 10) {
    Throw-SafeError -Code "final_newline_invalid"
  }
  return $bytes
}

function Assert-PreflightCandidate {
  param(
    [Parameter(Mandatory = $true)][string]$SqlPath,
    [Parameter(Mandatory = $true)][string]$MetadataPath,
    [Parameter(Mandatory = $true)][string]$PackageRoot
  )

  Set-Stage -Value "validate_location"
  Assert-ApprovedLocation -Path $SqlPath
  Assert-ApprovedLocation -Path $MetadataPath
  if (-not (Test-Path -LiteralPath $SqlPath -PathType Leaf)) { Throw-SafeError -Code "candidate_missing" }
  if (-not (Test-Path -LiteralPath $MetadataPath -PathType Leaf)) { Throw-SafeError -Code "manifest_missing" }
  [void](Assert-PostgresPackage -Root $PackageRoot)

  Set-Stage -Value "validate_bytes"
  $bytes = Assert-Bytes -Path $SqlPath
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)

  Set-Stage -Value "validate_manifest"
  $manifest = Read-ManifestMap -Path $MetadataPath
  Assert-ManifestValue -Manifest $manifest -Key "artifact_type" -Expected "local_postgres_compat_preflight_candidate"
  Assert-ManifestValue -Manifest $manifest -Key "local_only" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "active_migration" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "safe_to_apply_production" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "safe_to_apply_staging" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "safe_to_apply_remote" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "requires_isolated_cluster" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "requires_human_review" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "ready_for_execution" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "ready_for_apply" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "contains_data" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "contains_login_roles" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "contains_passwords" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "contains_superuser_roles" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "contains_bypassrls_roles" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "contains_dynamic_sql" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "contains_security_definer" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "auth_stub_created" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "storage_stub_created" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "extensions_schema_created" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "pgcrypto_control_present" -Expected "true" -Code "pgcrypto_control_missing"
  Assert-ManifestValue -Manifest $manifest -Key "extension_strategy" -Expected "INSTALL_EXTENSION_LOCAL" -Code "extension_strategy_invalid"
  Assert-ManifestValue -Manifest $manifest -Key "role_count" -Expected "4"
  Assert-ManifestValue -Manifest $manifest -Key "schema_count" -Expected "3"
  Assert-ManifestValue -Manifest $manifest -Key "stub_table_count" -Expected "2"
  Assert-ManifestValue -Manifest $manifest -Key "extension_count" -Expected "1" -Code "extension_count_invalid"
  Assert-ManifestValue -Manifest $manifest -Key "grant_count" -Expected "0"
  Assert-ManifestValue -Manifest $manifest -Key "dependency_names" -Expected "anon,authenticated,postgres,service_role,auth,extensions,storage,auth.users,storage.objects,extensions.gen_random_uuid"
  Assert-ManifestValue -Manifest $manifest -Key "unresolved_dependency_count" -Expected "0"
  Assert-ManifestValue -Manifest $manifest -Key "compatibility_strategy_complete" -Expected "true" -Code "compatibility_strategy_marker_invalid"
  if (-not $manifest.ContainsKey("candidate_sha256") -or -not $manifest.ContainsKey("candidate_size_bytes")) {
    Throw-SafeError -Code "manifest_hash_missing"
  }
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $SqlPath).Hash
  if (-not [string]::Equals($hash, $manifest["candidate_sha256"], [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "candidate_hash_mismatch"
  }
  $size = (Get-Item -LiteralPath $SqlPath).Length
  if ([string]$size -ne $manifest["candidate_size_bytes"]) {
    Throw-SafeError -Code "candidate_size_mismatch"
  }

  Set-Stage -Value "validate_sql_surface"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*INSERT\b" -Code "insert_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*COPY\b" -Code "copy_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*DROP\b" -Code "drop_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*TRUNCATE\b" -Code "truncate_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*CREATE\s+DATABASE\b" -Code "create_database_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*ALTER\s+SYSTEM\b" -Code "alter_system_detected"
  Assert-NoMatch -Text $text -Pattern "(?i)SECURITY\s+DEFINER" -Code "security_definer_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*(CREATE|ALTER)\s+ROLE\b[^\n;]*(?<!NO)LOGIN\b" -Code "login_role_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*(CREATE|ALTER)\s+ROLE\b[^\n;]*(?<!NO)SUPERUSER\b" -Code "superuser_role_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*(CREATE|ALTER)\s+ROLE\b[^\n;]*(?<!NO)BYPASSRLS\b" -Code "bypassrls_role_detected"
  Assert-NoMatch -Text $text -Pattern "(?i)\bPASSWORD\b" -Code "password_detected"
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*\\[A-Za-z]" -Code "psql_metacommand_detected"
  Assert-NoMatch -Text $text -Pattern "(?i)postgresql://|postgres://|\bbearer\s+\S+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{10,}" -Code "secret_or_uri_detected"
  Assert-NoMatch -Text $text -Pattern "(?i)\bEXECUTE\s+['""]|\bEXECUTE\s+format\s*\(" -Code "dynamic_sql_detected"
  $extensionMatches = @([regex]::Matches($text, "(?im)^\s*CREATE\s+EXTENSION\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+WITH\s+SCHEMA\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;"))
  if ($extensionMatches.Count -ne 1) { Throw-SafeError -Code "extension_count_invalid" }
  if ($extensionMatches[0].Groups[1].Value -ne "pgcrypto" -or $extensionMatches[0].Groups[2].Value -ne "extensions") {
    Throw-SafeError -Code "extension_statement_invalid"
  }
  if ($text -match "(?im)^\s*CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\b") {
    Throw-SafeError -Code "extension_statement_invalid"
  }
  if ($text -match "(?im)^\s*CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(extensions\.)?gen_random_uuid\b") {
    Throw-SafeError -Code "extension_statement_invalid"
  }
  Assert-NoMatch -Text $text -Pattern "(?im)^\s*GRANT\b" -Code "grant_detected"

  Set-Stage -Value "validate_approved_objects"
  $schemas = @([regex]::Matches($text, "(?im)^\s*CREATE\s+SCHEMA\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;") | ForEach-Object { $_.Groups[1].Value })
  if (($schemas | Sort-Object) -join "," -ne "auth,extensions,storage") {
    Throw-SafeError -Code "schema_not_approved"
  }
  $roles = @([regex]::Matches($text, "(?ims)^\s*CREATE\s+ROLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+?);") | ForEach-Object {
      [pscustomobject]@{ Name = $_.Groups[1].Value; Body = $_.Groups[2].Value }
    })
  if (($roles | ForEach-Object { $_.Name } | Sort-Object) -join "," -ne "anon,authenticated,postgres,service_role") {
    Throw-SafeError -Code "role_not_approved"
  }
  foreach ($role in $roles) {
    if ($role.Body -notmatch "(?i)\bNOLOGIN\b") { Throw-SafeError -Code "role_not_nologin" }
    if ($role.Body -match "(?i)(?<!NO)SUPERUSER|(?<!NO)CREATEDB|(?<!NO)CREATEROLE|(?<!NO)REPLICATION|(?<!NO)BYPASSRLS") {
      Throw-SafeError -Code "role_privilege_invalid"
    }
  }
  if ($text -notmatch "(?ims)CREATE\s+TABLE\s+auth\.users\s*\(\s*id\s+uuid\s+PRIMARY\s+KEY\s*\)\s*;") {
    Throw-SafeError -Code "auth_stub_invalid"
  }
  if ($text -notmatch "(?ims)CREATE\s+TABLE\s+storage\.objects\s*\(\s*\)\s*;") {
    Throw-SafeError -Code "storage_stub_invalid"
  }
  Assert-NoMatch -Text $text -Pattern "(?i)\bDEFAULT\s+'|DEFAULT\s+\d|DEFAULT\s+true|DEFAULT\s+false" -Code "synthetic_default_detected"

  return $manifest
}

function New-TestManifest {
  param(
    [Parameter(Mandatory = $true)][string]$SqlPath,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [hashtable]$Overrides = @{}
  )
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $SqlPath).Hash
  $size = (Get-Item -LiteralPath $SqlPath).Length
  $fields = [ordered]@{
    artifact_type = "local_postgres_compat_preflight_candidate"
    local_only = "true"
    active_migration = "false"
    safe_to_apply_production = "false"
    safe_to_apply_staging = "false"
    safe_to_apply_remote = "false"
    requires_isolated_cluster = "true"
    requires_human_review = "true"
    ready_for_execution = "false"
    contains_data = "false"
    contains_login_roles = "false"
    contains_passwords = "false"
    contains_superuser_roles = "false"
    contains_bypassrls_roles = "false"
    contains_dynamic_sql = "false"
    contains_security_definer = "false"
    auth_stub_created = "true"
    storage_stub_created = "true"
    extensions_schema_created = "true"
    pgcrypto_control_present = "true"
    extension_strategy = "INSTALL_EXTENSION_LOCAL"
    role_count = "4"
    schema_count = "3"
    stub_table_count = "2"
    extension_count = "1"
    grant_count = "0"
    candidate_sha256 = $hash
    candidate_size_bytes = ([string]$size)
    generated_utc = "2026-01-01T00:00:00.0000000Z"
    dependency_names = "anon,authenticated,postgres,service_role,auth,extensions,storage,auth.users,storage.objects,extensions.gen_random_uuid"
    unresolved_dependency_count = "0"
    compatibility_strategy_complete = "true"
    ready_for_apply = "false"
  }
  foreach ($key in $Overrides.Keys) {
    $fields[$key] = $Overrides[$key]
  }
  $lines = @()
  foreach ($key in $fields.Keys) {
    $lines += "$key=$($fields[$key])"
  }
  [System.IO.File]::WriteAllText($ManifestPath, ($lines -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
}

function Write-Utf8NoBomLf {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Text
  )
  $normalized = ($Text -replace "`r`n", "`n" -replace "`r", "`n").TrimEnd("`n") + "`n"
  [System.IO.File]::WriteAllText($Path, $normalized, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-ExpectFailure {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Block,
    [Parameter(Mandatory = $true)][string]$Code
  )
  try {
    & $Block | Out-Null
    Set-Stage -Value ("self_test_not_rejected_" + $Code)
    Throw-SafeError -Code "self_test_case_not_rejected"
  } catch {
    if ($_.Exception.Message -match "^VC_SAFE_REASON::self_test_case_not_rejected$") { throw }
  }
}

function Invoke-SelfTest {
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-local-compat-selftest-" + [Guid]::NewGuid().ToString("N"))
  try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    $validSql = @"
-- LOCAL COMPATIBILITY PREFLIGHT CANDIDATE
-- LOCAL ONLY: not a migration, not production, not remote staging.

CREATE SCHEMA auth;

CREATE SCHEMA storage;

CREATE SCHEMA extensions;

CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

-- LOCAL COMPATIBILITY ROLE: referenced by baseline privileges only.
CREATE ROLE anon
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- LOCAL COMPATIBILITY ROLE: referenced by baseline privileges only.
CREATE ROLE authenticated
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- LOCAL COMPATIBILITY ROLE: referenced by baseline privileges only.
CREATE ROLE postgres
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- LOCAL COMPATIBILITY ROLE: referenced by baseline privileges only.
CREATE ROLE service_role
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- LOCAL TEST STUB: empty compatibility table for a referenced Auth relation.
CREATE TABLE auth.users (
  id uuid PRIMARY KEY
);

-- LOCAL TEST STUB: empty compatibility table for a referenced Storage relation.
CREATE TABLE storage.objects ();
"@
    $sql = Join-Path $tempRoot "local-compat-preflight.candidate.sql"
    $manifest = Join-Path $tempRoot "local-compat-preflight.candidate.manifest.txt"
    $packageRoot = Join-Path $tempRoot "pg"
    New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "share\extension") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "lib") | Out-Null
    Set-Content -LiteralPath (Join-Path $packageRoot "share\postgres.bki") -Value "" -Encoding ASCII
    Set-Content -LiteralPath (Join-Path $packageRoot "share\extension\pgcrypto.control") -Value "" -Encoding ASCII
    Set-Content -LiteralPath (Join-Path $packageRoot "lib\pgcrypto.dll") -Value "" -Encoding ASCII
    Write-Utf8NoBomLf -Path $sql -Text $validSql
    New-TestManifest -SqlPath $sql -ManifestPath $manifest
    $actualPackageRoot = if ([string]::IsNullOrWhiteSpace($PostgresRoot)) { Get-DefaultPostgresRoot } else { $PostgresRoot }
    Assert-PreflightCandidate -SqlPath (Join-Path $PSScriptRoot "local-compat-preflight.candidate.sql") -MetadataPath (Join-Path $PSScriptRoot "local-compat-preflight.candidate.manifest.txt") -PackageRoot $actualPackageRoot | Out-Null

    $cases = @(
      @{ Name = "login"; Text = $validSql -replace "NOLOGIN", "LOGIN" },
      @{ Name = "superuser"; Text = $validSql -replace "NOSUPERUSER", "SUPERUSER" },
      @{ Name = "bypassrls"; Text = $validSql + "`nALTER ROLE service_role BYPASSRLS;" },
      @{ Name = "password"; Text = $validSql + "`nALTER ROLE anon PASSWORD 'x';" },
      @{ Name = "insert"; Text = $validSql + "`nINSERT INTO auth.users VALUES (null);" },
      @{ Name = "copy"; Text = $validSql + "`nCOPY auth.users FROM stdin;" },
      @{ Name = "drop"; Text = $validSql + "`nDROP TABLE auth.users;" },
      @{ Name = "security"; Text = $validSql + "`nCREATE FUNCTION auth.x() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'select 1';" },
      @{ Name = "dynamic"; Text = $validSql + "`nEXECUTE 'select 1';" },
      @{ Name = "schema"; Text = $validSql + "`nCREATE SCHEMA extra;" },
      @{ Name = "column"; Text = $validSql -replace "id uuid PRIMARY KEY", "id uuid PRIMARY KEY, email text" },
      @{ Name = "pgcrypto_public"; Text = $validSql -replace "CREATE EXTENSION pgcrypto WITH SCHEMA extensions;", "CREATE EXTENSION pgcrypto WITH SCHEMA public;" },
      @{ Name = "other_extension"; Text = $validSql -replace "CREATE EXTENSION pgcrypto WITH SCHEMA extensions;", "CREATE EXTENSION hstore WITH SCHEMA extensions;" },
      @{ Name = "if_not_exists"; Text = $validSql -replace "CREATE EXTENSION pgcrypto", "CREATE EXTENSION IF NOT EXISTS pgcrypto" },
      @{ Name = "two_extensions"; Text = $validSql + "`nCREATE EXTENSION pgcrypto WITH SCHEMA extensions;" },
      @{ Name = "wrapper"; Text = $validSql + "`nCREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';" },
      @{ Name = "meta"; Text = "\connect x`n" + $validSql },
      @{ Name = "secret"; Text = $validSql + "`n-- bearer synthetic-token" }
    )
    foreach ($case in $cases) {
      Set-Stage -Value ("self_test_" + $case.Name)
      $caseSql = Join-Path $tempRoot ($case.Name + ".sql")
      $caseManifest = Join-Path $tempRoot ($case.Name + ".manifest.txt")
      Write-Utf8NoBomLf -Path $caseSql -Text $case.Text
      New-TestManifest -SqlPath $caseSql -ManifestPath $caseManifest
      Invoke-ExpectFailure -Code $case.Name { Assert-PreflightCandidate -SqlPath $caseSql -MetadataPath $caseManifest -PackageRoot $packageRoot }
    }

    $badHashManifest = Join-Path $tempRoot "bad-hash.manifest.txt"
    New-TestManifest -SqlPath $sql -ManifestPath $badHashManifest -Overrides @{ candidate_sha256 = ("0" * 64) }
    Invoke-ExpectFailure -Code "hash" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $badHashManifest -PackageRoot $packageRoot }

    $unsafeManifest = Join-Path $tempRoot "unsafe.manifest.txt"
    New-TestManifest -SqlPath $sql -ManifestPath $unsafeManifest -Overrides @{ safe_to_apply_production = "true" }
    Invoke-ExpectFailure -Code "safe" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $unsafeManifest -PackageRoot $packageRoot }

    $readyManifest = Join-Path $tempRoot "ready.manifest.txt"
    New-TestManifest -SqlPath $sql -ManifestPath $readyManifest -Overrides @{ ready_for_execution = "true" }
    Invoke-ExpectFailure -Code "ready" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $readyManifest -PackageRoot $packageRoot }

    $applyReadyManifest = Join-Path $tempRoot "apply-ready.manifest.txt"
    New-TestManifest -SqlPath $sql -ManifestPath $applyReadyManifest -Overrides @{ ready_for_apply = "true" }
    Invoke-ExpectFailure -Code "apply_ready" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $applyReadyManifest -PackageRoot $packageRoot }

    $unresolvedManifest = Join-Path $tempRoot "unresolved.manifest.txt"
    New-TestManifest -SqlPath $sql -ManifestPath $unresolvedManifest -Overrides @{ unresolved_dependency_count = "1" }
    Invoke-ExpectFailure -Code "unresolved" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $unresolvedManifest -PackageRoot $packageRoot }

    $incompleteManifest = Join-Path $tempRoot "incomplete.manifest.txt"
    New-TestManifest -SqlPath $sql -ManifestPath $incompleteManifest -Overrides @{ compatibility_strategy_complete = "false" }
    Invoke-ExpectFailure -Code "incomplete" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $incompleteManifest -PackageRoot $packageRoot }

    $bomSql = Join-Path $tempRoot "bom.sql"
    [System.IO.File]::WriteAllText($bomSql, $validSql.TrimEnd("`n") + "`n", [System.Text.UTF8Encoding]::new($true))
    $bomManifest = Join-Path $tempRoot "bom.manifest.txt"
    New-TestManifest -SqlPath $bomSql -ManifestPath $bomManifest
    Invoke-ExpectFailure -Code "bom" { Assert-PreflightCandidate -SqlPath $bomSql -MetadataPath $bomManifest -PackageRoot $packageRoot }

    $crlfSql = Join-Path $tempRoot "crlf.sql"
    [System.IO.File]::WriteAllText($crlfSql, (($validSql.TrimEnd("`n") -replace "`n", "`r`n") + "`r`n"), [System.Text.UTF8Encoding]::new($false))
    $crlfManifest = Join-Path $tempRoot "crlf.manifest.txt"
    New-TestManifest -SqlPath $crlfSql -ManifestPath $crlfManifest
    Invoke-ExpectFailure -Code "crlf" { Assert-PreflightCandidate -SqlPath $crlfSql -MetadataPath $crlfManifest -PackageRoot $packageRoot }

    $migrationPath = Join-Path (Join-Path ([System.IO.Path]::GetPathRoot($PSScriptRoot)) "supabase\migrations") "bad.sql"
    Invoke-ExpectFailure -Code "migration" { Assert-PreflightCandidate -SqlPath $migrationPath -MetadataPath $manifest -PackageRoot $packageRoot }

    $missingControlRoot = Join-Path $tempRoot "missing-control"
    New-Item -ItemType Directory -Force -Path (Join-Path $missingControlRoot "share\extension") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $missingControlRoot "lib") | Out-Null
    Set-Content -LiteralPath (Join-Path $missingControlRoot "share\postgres.bki") -Value "" -Encoding ASCII
    Set-Content -LiteralPath (Join-Path $missingControlRoot "lib\pgcrypto.dll") -Value "" -Encoding ASCII
    Invoke-ExpectFailure -Code "missing_control" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $manifest -PackageRoot $missingControlRoot }

    $missingLibRoot = Join-Path $tempRoot "missing-lib"
    New-Item -ItemType Directory -Force -Path (Join-Path $missingLibRoot "share\extension") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $missingLibRoot "lib") | Out-Null
    Set-Content -LiteralPath (Join-Path $missingLibRoot "share\postgres.bki") -Value "" -Encoding ASCII
    Set-Content -LiteralPath (Join-Path $missingLibRoot "share\extension\pgcrypto.control") -Value "" -Encoding ASCII
    Invoke-ExpectFailure -Code "missing_lib" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $manifest -PackageRoot $missingLibRoot }

    $missingBkiRoot = Join-Path $tempRoot "missing-bki"
    New-Item -ItemType Directory -Force -Path (Join-Path $missingBkiRoot "share\extension") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $missingBkiRoot "lib") | Out-Null
    Set-Content -LiteralPath (Join-Path $missingBkiRoot "share\extension\pgcrypto.control") -Value "" -Encoding ASCII
    Set-Content -LiteralPath (Join-Path $missingBkiRoot "lib\pgcrypto.dll") -Value "" -Encoding ASCII
    Invoke-ExpectFailure -Code "missing_bki" { Assert-PreflightCandidate -SqlPath $sql -MetadataPath $manifest -PackageRoot $missingBkiRoot }
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  if ($SelfTest) {
    Set-Stage -Value "self_test"
    $script:SelfTestMode = $true
    Invoke-SelfTest
    Write-Output "SELF_TEST_OK"
    exit 0
  }

  $sql = if ([string]::IsNullOrWhiteSpace($CandidatePath)) {
    Join-Path $PSScriptRoot "local-compat-preflight.candidate.sql"
  } else {
    $CandidatePath
  }
  $manifest = if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    Join-Path $PSScriptRoot "local-compat-preflight.candidate.manifest.txt"
  } else {
    $ManifestPath
  }
  $packageRoot = if ([string]::IsNullOrWhiteSpace($PostgresRoot)) { Get-DefaultPostgresRoot } else { $PostgresRoot }
  $result = Assert-PreflightCandidate -SqlPath $sql -MetadataPath $manifest -PackageRoot $packageRoot
  Write-Output "LOCAL_COMPAT_PREFLIGHT_CANDIDATE_VALID"
  Write-Output "local_only=$($result["local_only"])"
  Write-Output "active_migration=$($result["active_migration"])"
  Write-Output "safe_to_apply_production=$($result["safe_to_apply_production"])"
  Write-Output "safe_to_apply_staging=$($result["safe_to_apply_staging"])"
  Write-Output "safe_to_apply_remote=$($result["safe_to_apply_remote"])"
  Write-Output "ready_for_execution=$($result["ready_for_execution"])"
  Write-Output "ready_for_apply=$($result["ready_for_apply"])"
  Write-Output "unresolved_dependency_count=$($result["unresolved_dependency_count"])"
  exit 0
} catch {
  $reason = Get-SafeReason -ErrorRecord $_
  Write-Output "LOCAL_COMPAT_PREFLIGHT_CANDIDATE_INVALID"
  Write-Output "stage=$script:Stage"
  Write-Output "reason=$reason"
  exit 1
}
