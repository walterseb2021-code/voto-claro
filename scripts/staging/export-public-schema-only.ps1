[CmdletBinding()]
param(
  [string]$HostName,
  [ValidateRange(1, 65535)]
  [int]$Port = 5432,
  [string]$Database,
  [string]$UserName,
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-RequiredText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt,
    [Parameter(Mandatory = $true)]
    [string]$FieldName
  )

  $value = Read-Host -Prompt $Prompt
  if ($null -eq $value) {
    $value = ""
  }

  $trimmed = $value.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    throw "Required value missing: $FieldName"
  }

  return $trimmed
}

function Assert-NoControlCharacters {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,
    [Parameter(Mandatory = $true)]
    [string]$FieldName
  )

  if ($Value.Contains("`r") -or $Value.Contains("`n") -or $Value.Contains([char]0)) {
    throw "Invalid value: $FieldName contains disallowed control characters."
  }
}

function Normalize-HostName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $hostValue = $Value.Trim()
  if ([string]::IsNullOrWhiteSpace($hostValue)) {
    throw "Host is required."
  }
  if ($hostValue.Length -gt 253) {
    throw "Host is too long."
  }

  Assert-NoControlCharacters -Value $hostValue -FieldName "host"

  if ($hostValue -match "\s") {
    throw "Host must not contain spaces."
  }
  if ($hostValue.StartsWith("-", [System.StringComparison]::Ordinal)) {
    throw "Host must not start with a dash."
  }
  if ($hostValue -match "^(?i:postgres(?:ql)?://)") {
    throw "Connection strings are not accepted."
  }
  if ($hostValue.IndexOfAny([char[]]@("@", "/", "\", "?", "#", "&")) -ge 0) {
    throw "Host contains disallowed characters."
  }

  return $hostValue
}

function Normalize-IdentifierValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,
    [Parameter(Mandatory = $true)]
    [string]$FieldName
  )

  $identifier = $Value.Trim()
  if ([string]::IsNullOrWhiteSpace($identifier)) {
    throw "$FieldName is required."
  }
  if ($identifier.Length -gt 63) {
    throw "$FieldName is too long."
  }

  Assert-NoControlCharacters -Value $identifier -FieldName $FieldName

  if ($identifier.StartsWith("-", [System.StringComparison]::Ordinal)) {
    throw "$FieldName must not start with a dash."
  }
  if ($identifier -notmatch "^[A-Za-z0-9_.-]+$") {
    throw "$FieldName contains disallowed characters."
  }

  return $identifier
}

function Get-NormalizedFullPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathValue
  )

  Assert-NoControlCharacters -Value $PathValue -FieldName "path"
  $expanded = [Environment]::ExpandEnvironmentVariables($PathValue)
  $fullPath = [System.IO.Path]::GetFullPath($expanded)
  return $fullPath
}

function Test-IsAbsolutePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathValue
  )

  return [System.IO.Path]::IsPathRooted($PathValue) -and -not [string]::IsNullOrWhiteSpace([System.IO.Path]::GetPathRoot($PathValue))
}

function Test-IsPathInsideDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ChildPath,
    [Parameter(Mandatory = $true)]
    [string]$ParentPath
  )

  $childFull = Get-NormalizedFullPath -PathValue $ChildPath
  $parentFull = Get-NormalizedFullPath -PathValue $ParentPath

  if (-not $parentFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $parentFull = $parentFull + [System.IO.Path]::DirectorySeparatorChar
  }

  return $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-FinalOutputPath {
  param(
    [string]$RequestedOutputPath
  )

  if ([string]::IsNullOrWhiteSpace($RequestedOutputPath)) {
    $desktop = [Environment]::GetFolderPath("Desktop")
    if ([string]::IsNullOrWhiteSpace($desktop)) {
      $desktop = $HOME
    }

    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss'Z'")
    return (Join-Path $desktop "voto-claro-schema-review\public-schema-only-$stamp.sql")
  }

  if (-not (Test-IsAbsolutePath -PathValue $RequestedOutputPath)) {
    throw "Output path must be absolute."
  }

  return $RequestedOutputPath
}

function Resolve-OutputTargets {
  param(
    [string]$RequestedOutputPath,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $finalSqlPath = Get-NormalizedFullPath -PathValue (Resolve-FinalOutputPath -RequestedOutputPath $RequestedOutputPath)
  if ([System.IO.Path]::GetExtension($finalSqlPath) -ne ".sql") {
    throw "Output path must end in .sql."
  }
  if (Test-IsPathInsideDirectory -ChildPath $finalSqlPath -ParentPath $RepoRoot) {
    throw "Output path must be outside the repository."
  }

  $outputDirectory = [System.IO.Path]::GetDirectoryName($finalSqlPath)
  if ([string]::IsNullOrWhiteSpace($outputDirectory)) {
    throw "Output directory could not be resolved."
  }

  $manifestPath = [System.IO.Path]::ChangeExtension($finalSqlPath, ".manifest.txt")
  if (Test-Path -LiteralPath $finalSqlPath -PathType Leaf) {
    throw "Final SQL already exists. Choose a new output path."
  }
  if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    throw "Final manifest already exists. Choose a new output path."
  }

  return [pscustomobject]@{
    SqlPath = $finalSqlPath
    ManifestPath = $manifestPath
    Directory = $outputDirectory
  }
}

function Update-DollarQuoteState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Line,
    [Parameter(Mandatory = $true)]
    [AllowNull()]
    [string]$CurrentTag
  )

  if ($Line.TrimStart().StartsWith("--", [System.StringComparison]::Ordinal)) {
    return $CurrentTag
  }

  $tag = $CurrentTag
  $matches = [regex]::Matches($Line, "\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$")

  foreach ($match in $matches) {
    $value = $match.Value
    if ($null -eq $tag) {
      $tag = $value
      continue
    }

    if ($value -eq $tag) {
      $tag = $null
    }
  }

  return $tag
}

function Get-SensitiveIndicatorCount {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SqlPath
  )

  $count = 0
  $patterns = @(
    "(?i)postgresql://",
    "(?i)postgres://",
    "(?i)password\s*=",
    "(?i)\bbearer\s+\S+",
    "\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    "\bsk-[A-Za-z0-9_-]{10,}",
    "\bSUPABASE_SERVICE_ROLE_KEY\b",
    "\bSERVICE_ROLE_KEY\b",
    "\bPRIVATE_KEY\b"
  )

  foreach ($line in [System.IO.File]::ReadLines($SqlPath)) {
    if ($line.TrimStart().StartsWith("--", [System.StringComparison]::Ordinal)) {
      continue
    }

    foreach ($pattern in $patterns) {
      $count += [regex]::Matches($line, $pattern).Count
    }
  }

  return $count
}

function Get-DumpPatternSummary {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SqlPath
  )

  $summary = [ordered]@{
    HasDataLoadLine = $false
    HasDangerousDdl = $false
    HasCreateTable = $false
    HasPublicDefinition = $false
    CreateTableCount = 0
    CreateFunctionOrProcedureCount = 0
    CreateIndexCount = 0
    CreateTriggerCount = 0
    CreatePolicyCount = 0
    EnableRlsCount = 0
    GrantCount = 0
    RevokeCount = 0
    SuspiciousIndicatorCount = 0
  }

  $dollarTag = $null
  foreach ($line in [System.IO.File]::ReadLines($SqlPath)) {
    $lineHasDollarQuote = [regex]::IsMatch($line, "\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$")
    $insideFunctionBody = $null -ne $dollarTag

    if (-not $insideFunctionBody -and -not $lineHasDollarQuote) {
      if ($line -match "^\s*COPY\s+.+\s+FROM\s+stdin;\s*$" -or
          $line -match "^\s*INSERT\s+INTO\s+" -or
          $line -match "^\s*\\\.\s*$") {
        $summary.HasDataLoadLine = $true
      }

      if ($line -match "^\s*CREATE\s+DATABASE\b" -or
          $line -match "^\s*DROP\s+DATABASE\b" -or
          $line -match "^\s*DROP\s+SCHEMA\b" -or
          $line -match "^\s*DROP\s+TABLE\b" -or
          $line -match "^\s*TRUNCATE\b") {
        $summary.HasDangerousDdl = $true
      }

      if ($line -match "^\s*CREATE\s+TABLE\b") {
        $summary.HasCreateTable = $true
        $summary.CreateTableCount += 1
      }

      if ($line -match "\bpublic\.|SCHEMA\s+public\b") {
        $summary.HasPublicDefinition = $true
      }

      if ($line -match "^\s*CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\b") {
        $summary.CreateFunctionOrProcedureCount += 1
      }
      if ($line -match "^\s*CREATE\s+(UNIQUE\s+)?INDEX\b") {
        $summary.CreateIndexCount += 1
      }
      if ($line -match "^\s*CREATE\s+TRIGGER\b") {
        $summary.CreateTriggerCount += 1
      }
      if ($line -match "^\s*CREATE\s+POLICY\b") {
        $summary.CreatePolicyCount += 1
      }
      if ($line -match "^\s*ALTER\s+TABLE\b.+\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b") {
        $summary.EnableRlsCount += 1
      }
      if ($line -match "^\s*GRANT\b") {
        $summary.GrantCount += 1
      }
      if ($line -match "^\s*REVOKE\b") {
        $summary.RevokeCount += 1
      }
    }

    $dollarTag = Update-DollarQuoteState -Line $line -CurrentTag $dollarTag
  }

  $summary.SuspiciousIndicatorCount = Get-SensitiveIndicatorCount -SqlPath $SqlPath
  return [pscustomobject]$summary
}

function Assert-ValidSchemaOnlyDump {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SqlPath,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  if (-not (Test-Path -LiteralPath $SqlPath -PathType Leaf)) {
    throw "Validation failed: SQL file was not created."
  }

  $item = Get-Item -LiteralPath $SqlPath
  if ($item.Length -le 0) {
    throw "Validation failed: SQL file is empty."
  }

  if ([System.IO.Path]::GetExtension($SqlPath) -ne ".sql") {
    throw "Validation failed: final SQL extension must be .sql."
  }

  if (Test-IsPathInsideDirectory -ChildPath $SqlPath -ParentPath $RepoRoot) {
    throw "Validation failed: output path is inside the repository."
  }

  $summary = Get-DumpPatternSummary -SqlPath $SqlPath

  if ($summary.HasDataLoadLine) {
    throw "Validation failed: data-loading dump line detected."
  }
  if ($summary.HasDangerousDdl) {
    throw "Validation failed: destructive database or table statement detected."
  }
  if (-not $summary.HasCreateTable) {
    throw "Validation failed: CREATE TABLE was not found."
  }
  if (-not $summary.HasPublicDefinition) {
    throw "Validation failed: no public schema definition was found."
  }

  return $summary
}

function New-ManifestFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$SqlPath,
    [Parameter(Mandatory = $true)]
    [string]$Sha256,
    [Parameter(Mandatory = $true)]
    [long]$SizeBytes,
    [Parameter(Mandatory = $true)]
    [string]$PgDumpVersion,
    [Parameter(Mandatory = $true)]
    [string]$HostNameValue,
    [Parameter(Mandatory = $true)]
    [int]$PortValue,
    [Parameter(Mandatory = $true)]
    [string]$DatabaseValue,
    [Parameter(Mandatory = $true)]
    [string]$UserNameValue,
    [Parameter(Mandatory = $true)]
    [object]$Summary
  )

  $manifest = @(
    "generated_utc=$(([DateTime]::UtcNow).ToString("o"))"
    "sql_file=$([System.IO.Path]::GetFileName($SqlPath))"
    "sha256=$Sha256"
    "size_bytes=$SizeBytes"
    "pg_dump_version=$PgDumpVersion"
    "host=$HostNameValue"
    "port=$PortValue"
    "database=$DatabaseValue"
    "user=$UserNameValue"
    "create_table_count=$($Summary.CreateTableCount)"
    "create_function_or_procedure_count=$($Summary.CreateFunctionOrProcedureCount)"
    "create_index_count=$($Summary.CreateIndexCount)"
    "create_trigger_count=$($Summary.CreateTriggerCount)"
    "create_policy_count=$($Summary.CreatePolicyCount)"
    "alter_table_enable_row_level_security_count=$($Summary.EnableRlsCount)"
    "grant_count=$($Summary.GrantCount)"
    "revoke_count=$($Summary.RevokeCount)"
    "suspicious_indicator_count=$($Summary.SuspiciousIndicatorCount)"
    "DATA_ROWS_EXPORTED=false"
    "MANUAL_SECRET_REVIEW_REQUIRED=true"
    "SAFE_TO_COMMIT=false"
  )

  Set-Content -LiteralPath $ManifestPath -Value $manifest -Encoding UTF8
}

function Assert-ValidManifest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha256
  )

  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "Validation failed: manifest was not created."
  }

  $item = Get-Item -LiteralPath $ManifestPath
  if ($item.Length -le 0) {
    throw "Validation failed: manifest is empty."
  }

  $lines = Get-Content -LiteralPath $ManifestPath
  if (@($lines | Where-Object { $_ -eq "DATA_ROWS_EXPORTED=false" }).Count -ne 1) {
    throw "Validation failed: manifest DATA_ROWS_EXPORTED marker is invalid."
  }
  if (@($lines | Where-Object { $_ -eq "MANUAL_SECRET_REVIEW_REQUIRED=true" }).Count -ne 1) {
    throw "Validation failed: manifest manual review marker is invalid."
  }
  if (@($lines | Where-Object { $_ -eq "SAFE_TO_COMMIT=false" }).Count -ne 1) {
    throw "Validation failed: manifest safe-to-commit marker is invalid."
  }
  if (@($lines | Where-Object { $_ -eq "sha256=$ExpectedSha256" }).Count -ne 1) {
    throw "Validation failed: manifest SHA-256 is invalid."
  }
  if (@($lines | Where-Object { $_ -match "(?i)PGPASSWORD|password\s*=|postgresql://|postgres://" }).Count -ne 0) {
    throw "Validation failed: manifest contains sensitive connection material."
  }
}

function Get-RequiredApplication {
  $command = Get-Command "pg_dump" -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "pg_dump was not found locally. Install PostgreSQL client tools before running this script."
  }
  if ($command.CommandType -ne [System.Management.Automation.CommandTypes]::Application) {
    throw "pg_dump is not an executable application."
  }
  if ([string]::IsNullOrWhiteSpace($command.Source)) {
    throw "pg_dump executable path could not be resolved."
  }
  if (-not (Test-Path -LiteralPath $command.Source -PathType Leaf)) {
    throw "pg_dump executable file was not found."
  }

  return $command
}

$tempSqlPath = $null
$tempManifestPath = $null
$finalSqlPath = $null
$finalManifestPath = $null
$finalSqlCreatedThisRun = $false
$finalManifestCreatedThisRun = $false
$completedSuccessfully = $false
$plainPassword = $null
$passwordBstr = [IntPtr]::Zero
$securePassword = $null
$previousPgPassword = $null
$previousPgSslMode = $null
$previousPgConnectTimeout = $null
$hadPreviousPgPassword = $false
$hadPreviousPgSslMode = $false
$hadPreviousPgConnectTimeout = $false

try {
  $repoRoot = Get-NormalizedFullPath -PathValue (Join-Path $PSScriptRoot "..\..")

  if ($null -eq $HostName) {
    $HostName = ""
  }
  if ([string]::IsNullOrWhiteSpace($HostName.Trim())) {
    $HostName = Read-RequiredText -Prompt "PostgreSQL host" -FieldName "host"
  }
  $HostName = Normalize-HostName -Value $HostName

  if ($null -eq $Database) {
    $Database = ""
  }
  if ([string]::IsNullOrWhiteSpace($Database.Trim())) {
    $Database = Read-RequiredText -Prompt "Database name" -FieldName "database"
  }
  $Database = Normalize-IdentifierValue -Value $Database -FieldName "database"

  if ($null -eq $UserName) {
    $UserName = ""
  }
  if ([string]::IsNullOrWhiteSpace($UserName.Trim())) {
    $UserName = Read-RequiredText -Prompt "Database user" -FieldName "user"
  }
  $UserName = Normalize-IdentifierValue -Value $UserName -FieldName "user"

  $targets = Resolve-OutputTargets -RequestedOutputPath $OutputPath -RepoRoot $repoRoot
  $finalSqlPath = $targets.SqlPath
  $finalManifestPath = $targets.ManifestPath
  $outputDirectory = $targets.Directory

  $pgDumpCommand = Get-RequiredApplication
  $pgDumpVersion = (Get-Item -LiteralPath $pgDumpCommand.Source).VersionInfo.ProductVersion
  if ([string]::IsNullOrWhiteSpace($pgDumpVersion)) {
    $pgDumpVersion = "unknown"
  }

  Write-Output "Planned export:"
  Write-Output "SOLO ESQUEMA"
  Write-Output "SIN FILAS"
  Write-Output "NO APLICA CAMBIOS"
  Write-Output "Host: $HostName"
  Write-Output "Port: $Port"
  Write-Output "Database: $Database"
  Write-Output "User: $UserName"
  Write-Output "Final SQL path: $finalSqlPath"
  Write-Output "Manifest path: $finalManifestPath"
  Write-Output "pg_dump version: $pgDumpVersion"

  $confirmation = Read-Host -Prompt "Type SCHEMA-ONLY-VOTO-CLARO to continue"
  if ($confirmation -ne "SCHEMA-ONLY-VOTO-CLARO") {
    throw "Confirmation did not match."
  }

  $securePassword = Read-Host -AsSecureString -Prompt "Database password"
  if ($null -eq $securePassword -or $securePassword.Length -eq 0) {
    throw "Password was not provided."
  }

  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  $tempSqlPath = Join-Path $outputDirectory (".tmp-" + [Guid]::NewGuid().ToString("N") + ".sql")
  $tempManifestPath = Join-Path $outputDirectory (".tmp-" + [Guid]::NewGuid().ToString("N") + ".manifest.txt")

  $hadPreviousPgPassword = [System.Environment]::GetEnvironmentVariable("PGPASSWORD", "Process") -ne $null
  $hadPreviousPgSslMode = [System.Environment]::GetEnvironmentVariable("PGSSLMODE", "Process") -ne $null
  $hadPreviousPgConnectTimeout = [System.Environment]::GetEnvironmentVariable("PGCONNECT_TIMEOUT", "Process") -ne $null
  if ($hadPreviousPgPassword) {
    $previousPgPassword = [System.Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
  }
  if ($hadPreviousPgSslMode) {
    $previousPgSslMode = [System.Environment]::GetEnvironmentVariable("PGSSLMODE", "Process")
  }
  if ($hadPreviousPgConnectTimeout) {
    $previousPgConnectTimeout = [System.Environment]::GetEnvironmentVariable("PGCONNECT_TIMEOUT", "Process")
  }

  $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
  [System.Environment]::SetEnvironmentVariable("PGPASSWORD", $plainPassword, "Process")
  [System.Environment]::SetEnvironmentVariable("PGSSLMODE", "require", "Process")
  [System.Environment]::SetEnvironmentVariable("PGCONNECT_TIMEOUT", "15", "Process")

  $pgDumpArguments = @(
    "--host", $HostName,
    "--port", "$Port",
    "--username", $UserName,
    "--dbname", $Database,
    "--schema-only",
    "--format=plain",
    "--no-owner",
    "--schema=public",
    "--no-password",
    "--no-comments",
    "--lock-wait-timeout=10000",
    "--file", $tempSqlPath
  )

  Write-Output "Starting schema-only export to temporary file."
  & $pgDumpCommand.Source @pgDumpArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Export command failed."
  }

  Write-Output "Validating temporary SQL file."
  $summary = Assert-ValidSchemaOnlyDump -SqlPath $tempSqlPath -RepoRoot $repoRoot
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $tempSqlPath
  $tempItem = Get-Item -LiteralPath $tempSqlPath

  New-ManifestFile `
    -ManifestPath $tempManifestPath `
    -SqlPath $finalSqlPath `
    -Sha256 $hash.Hash `
    -SizeBytes $tempItem.Length `
    -PgDumpVersion $pgDumpVersion `
    -HostNameValue $HostName `
    -PortValue $Port `
    -DatabaseValue $Database `
    -UserNameValue $UserName `
    -Summary $summary

  Assert-ValidManifest -ManifestPath $tempManifestPath -ExpectedSha256 $hash.Hash

  Move-Item -LiteralPath $tempSqlPath -Destination $finalSqlPath
  $tempSqlPath = $null
  $finalSqlCreatedThisRun = $true

  Move-Item -LiteralPath $tempManifestPath -Destination $finalManifestPath
  $tempManifestPath = $null
  $finalManifestCreatedThisRun = $true

  if (-not (Test-Path -LiteralPath $finalSqlPath -PathType Leaf)) {
    throw "Final SQL was not accepted."
  }
  if (-not (Test-Path -LiteralPath $finalManifestPath -PathType Leaf)) {
    throw "Final manifest was not accepted."
  }

  $completedSuccessfully = $true

  Write-Output "Validation passed."
  Write-Output "SQL path: $finalSqlPath"
  Write-Output "Manifest path: $finalManifestPath"
  Write-Output "SHA-256: $($hash.Hash)"
  Write-Output "CREATE TABLE count: $($summary.CreateTableCount)"
  Write-Output "CREATE FUNCTION or PROCEDURE count: $($summary.CreateFunctionOrProcedureCount)"
  Write-Output "CREATE INDEX count: $($summary.CreateIndexCount)"
  Write-Output "CREATE TRIGGER count: $($summary.CreateTriggerCount)"
  Write-Output "CREATE POLICY count: $($summary.CreatePolicyCount)"
  Write-Output "ALTER TABLE ENABLE ROW LEVEL SECURITY count: $($summary.EnableRlsCount)"
  Write-Output "GRANT count: $($summary.GrantCount)"
  Write-Output "REVOKE count: $($summary.RevokeCount)"
  Write-Output "Suspicious indicator count: $($summary.SuspiciousIndicatorCount)"
  if ($summary.SuspiciousIndicatorCount -gt 0) {
    Write-Output "Sensitive indicators were detected and require manual review before copying or committing."
  }
  Write-Output "Schema export completed, but manual secret review is required before copying or committing the file."
  Write-Output "DATA_ROWS_EXPORTED=false"
  Write-Output "MANUAL_SECRET_REVIEW_REQUIRED=true"
  Write-Output "SAFE_TO_COMMIT=false"
} catch {
  Write-Output "Schema-only export failed. No SQL file was accepted."
  exit 1
} finally {
  [System.Environment]::SetEnvironmentVariable("PGPASSWORD", $null, "Process")
  if ($hadPreviousPgPassword) {
    [System.Environment]::SetEnvironmentVariable("PGPASSWORD", $previousPgPassword, "Process")
  }

  [System.Environment]::SetEnvironmentVariable("PGSSLMODE", $null, "Process")
  if ($hadPreviousPgSslMode) {
    [System.Environment]::SetEnvironmentVariable("PGSSLMODE", $previousPgSslMode, "Process")
  }

  [System.Environment]::SetEnvironmentVariable("PGCONNECT_TIMEOUT", $null, "Process")
  if ($hadPreviousPgConnectTimeout) {
    [System.Environment]::SetEnvironmentVariable("PGCONNECT_TIMEOUT", $previousPgConnectTimeout, "Process")
  }

  $plainPassword = $null
  if ($passwordBstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr)
  }
  if ($null -ne $securePassword) {
    $securePassword.Dispose()
  }

  if (-not $completedSuccessfully) {
    if ($null -ne $tempSqlPath -and (Test-Path -LiteralPath $tempSqlPath -PathType Leaf)) {
      Remove-Item -LiteralPath $tempSqlPath -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $tempManifestPath -and (Test-Path -LiteralPath $tempManifestPath -PathType Leaf)) {
      Remove-Item -LiteralPath $tempManifestPath -Force -ErrorAction SilentlyContinue
    }
    if ($finalManifestCreatedThisRun -and $null -ne $finalManifestPath -and (Test-Path -LiteralPath $finalManifestPath -PathType Leaf)) {
      Remove-Item -LiteralPath $finalManifestPath -Force -ErrorAction SilentlyContinue
    }
    if ($finalSqlCreatedThisRun -and $null -ne $finalSqlPath -and (Test-Path -LiteralPath $finalSqlPath -PathType Leaf)) {
      Remove-Item -LiteralPath $finalSqlPath -Force -ErrorAction SilentlyContinue
    }
  }
}
