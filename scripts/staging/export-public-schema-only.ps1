[CmdletBinding()]
param(
  [switch]$SelfTest,
  [string]$HostName,
  [ValidateRange(1, 65535)]
  [int]$Port = 5432,
  [string]$Database,
  [string]$UserName,
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$currentStage = "initialization"

function Set-Stage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Stage
  )

  $script:currentStage = $Stage
}

function Throw-SafeError {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Code
  )

  throw "VC_SAFE_REASON::$Code"
}

function Get-SafeReason {
  param(
    [Parameter(Mandatory = $true)]
    [object]$ErrorRecord
  )

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

function Get-OutsideDollarQuoteSegments {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Line,
    [AllowNull()]
    [AllowEmptyString()]
    [string]$CurrentTag
  )

  if ($Line.TrimStart().StartsWith("--", [System.StringComparison]::Ordinal)) {
    return [pscustomobject]@{
      Segments = @()
      Tag = $CurrentTag
    }
  }

  $segments = New-Object System.Collections.Generic.List[string]
  $tag = $CurrentTag
  if ([string]::IsNullOrEmpty($tag)) {
    $tag = $null
  }
  $position = 0
  $matches = [regex]::Matches($Line, "\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$")

  foreach ($match in $matches) {
    if ($null -eq $tag) {
      if ($match.Index -gt $position) {
        [void]$segments.Add($Line.Substring($position, $match.Index - $position))
      }
      $tag = $match.Value
      $position = $match.Index + $match.Length
      continue
    }

    if ($match.Value -eq $tag) {
      $tag = $null
      $position = $match.Index + $match.Length
    }
  }

  if ($null -eq $tag -and $position -lt $Line.Length) {
    [void]$segments.Add($Line.Substring($position))
  }

  return [pscustomobject]@{
    Segments = @($segments.ToArray())
    Tag = $tag
  }
}

function Assert-SegmentParserResult {
  param(
    [Parameter(Mandatory = $true)]
    [AllowNull()]
    [object]$Result
  )

  if ($null -eq $Result) {
    Throw-SafeError -Code "sql_segment_parser_contract_invalid"
  }

  $resultObjects = @($Result)
  if ($resultObjects.Count -ne 1) {
    Throw-SafeError -Code "sql_segment_parser_contract_invalid"
  }

  $singleResult = $resultObjects[0]
  if ($singleResult -isnot [pscustomobject]) {
    Throw-SafeError -Code "sql_segment_parser_contract_invalid"
  }

  if ($null -eq $singleResult.PSObject.Properties["Segments"] -or
      $null -eq $singleResult.PSObject.Properties["Tag"]) {
    Throw-SafeError -Code "sql_segment_parser_contract_invalid"
  }

  if ($null -ne $singleResult.Tag -and $singleResult.Tag -isnot [string]) {
    Throw-SafeError -Code "sql_segment_parser_contract_invalid"
  }

  if ($null -eq $singleResult.Segments -or
      $singleResult.Segments -isnot [System.Collections.IEnumerable] -or
      $singleResult.Segments -is [string]) {
    Throw-SafeError -Code "sql_segment_parser_contract_invalid"
  }

  return $singleResult
}

function Get-SensitiveIndicatorCount {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SqlPath
  )

  Set-Stage -Stage "scan_sql_sensitive"
  try {
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

    $insideBlockComment = $false
    foreach ($line in [System.IO.File]::ReadLines($SqlPath)) {
      if (-not $insideBlockComment -and $line.TrimStart().StartsWith("--", [System.StringComparison]::Ordinal)) {
        continue
      }

      $scanText = New-Object System.Text.StringBuilder
      $position = 0
      while ($position -lt $line.Length) {
        if ($insideBlockComment) {
          $blockEnd = $line.IndexOf("*/", $position, [System.StringComparison]::Ordinal)
          if ($blockEnd -lt 0) {
            $position = $line.Length
          } else {
            $insideBlockComment = $false
            $position = $blockEnd + 2
          }
          continue
        }

        $blockStart = $line.IndexOf("/*", $position, [System.StringComparison]::Ordinal)
        if ($blockStart -lt 0) {
          [void]$scanText.Append($line.Substring($position))
          $position = $line.Length
        } else {
          if ($blockStart -gt $position) {
            [void]$scanText.Append($line.Substring($position, $blockStart - $position))
          }
          $insideBlockComment = $true
          $position = $blockStart + 2
        }
      }

      foreach ($pattern in $patterns) {
        $count += [regex]::Matches($scanText.ToString(), $pattern).Count
      }
    }

    return $count
  } catch {
    $safeReason = Get-SafeReason -ErrorRecord $_
    if ($safeReason -ne "unexpected_failure") {
      Throw-SafeError -Code $safeReason
    }
    Throw-SafeError -Code "sql_sensitive_scan_failed"
  }
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

  Set-Stage -Stage "scan_sql_structure"
  try {
    $dollarTag = $null
    foreach ($line in [System.IO.File]::ReadLines($SqlPath)) {
      $split = Assert-SegmentParserResult -Result (Get-OutsideDollarQuoteSegments -Line $line -CurrentTag $dollarTag)

      foreach ($segment in $split.Segments) {
        if ($segment -match "^\s*COPY\s+.+\s+FROM\s+stdin;\s*$" -or
            $segment -match "^\s*INSERT\s+INTO\s+") {
          $summary.HasDataLoadLine = $true
        }

        if ($segment -match "^\s*\\\.\s*$") {
          $summary.HasDataLoadLine = $true
        }

        if ($segment -match "^\s*CREATE\s+DATABASE\b" -or
            $segment -match "^\s*DROP\s+DATABASE\b" -or
            $segment -match "^\s*DROP\s+SCHEMA\b" -or
            $segment -match "^\s*DROP\s+TABLE\b" -or
            $segment -match "^\s*TRUNCATE\b") {
          $summary.HasDangerousDdl = $true
        }

        if ($segment -match "^\s*CREATE\s+(UNLOGGED\s+)?TABLE\s+(ONLY\s+)?public\.") {
          $summary.HasCreateTable = $true
          $summary.CreateTableCount += 1
        }

        if ($segment -match "^\s*CREATE\s+SCHEMA\s+public\b" -or
            $segment -match "^\s*ALTER\s+SCHEMA\s+public\b" -or
            $segment -match "^\s*CREATE\s+(UNLOGGED\s+)?TABLE\s+(ONLY\s+)?public\." -or
            $segment -match "^\s*CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+public\." -or
            $segment -match "^\s*CREATE\s+SEQUENCE\s+public\." -or
            $segment -match "^\s*ALTER\s+TABLE\s+(ONLY\s+)?public\.") {
          $summary.HasPublicDefinition = $true
        }

        if ($segment -match "^\s*CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\b") {
          $summary.CreateFunctionOrProcedureCount += 1
        }
        if ($segment -match "^\s*CREATE\s+(UNIQUE\s+)?INDEX\b") {
          $summary.CreateIndexCount += 1
        }
        if ($segment -match "^\s*CREATE\s+TRIGGER\b") {
          $summary.CreateTriggerCount += 1
        }
        if ($segment -match "^\s*CREATE\s+POLICY\b") {
          $summary.CreatePolicyCount += 1
        }
        if ($segment -match "^\s*ALTER\s+TABLE\b.+\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b") {
          $summary.EnableRlsCount += 1
        }
        if ($segment -match "^\s*GRANT\b") {
          $summary.GrantCount += 1
        }
        if ($segment -match "^\s*REVOKE\b") {
          $summary.RevokeCount += 1
        }
      }

      $dollarTag = $split.Tag
    }

    $summary.SuspiciousIndicatorCount = Get-SensitiveIndicatorCount -SqlPath $SqlPath
    return [pscustomobject]$summary
  } catch {
    $safeReason = Get-SafeReason -ErrorRecord $_
    if ($safeReason -ne "unexpected_failure") {
      Throw-SafeError -Code $safeReason
    }
    Throw-SafeError -Code "sql_structure_scan_failed"
  }
}

function Assert-ValidSchemaOnlyDump {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SqlPath,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  try {
    Set-Stage -Stage "validate_sql_file_exists"
    if (-not (Test-Path -LiteralPath $SqlPath -PathType Leaf)) {
      Throw-SafeError -Code "sql_file_missing"
    }

    Set-Stage -Stage "validate_sql_file_size"
    $item = Get-Item -LiteralPath $SqlPath
    if ($item.Length -le 0) {
      Throw-SafeError -Code "sql_file_empty"
    }

    Set-Stage -Stage "validate_sql_extension"
    if ([System.IO.Path]::GetExtension($SqlPath) -ne ".sql") {
      Throw-SafeError -Code "sql_extension_invalid"
    }

    Set-Stage -Stage "validate_sql_location"
    if (Test-IsPathInsideDirectory -ChildPath $SqlPath -ParentPath $RepoRoot) {
      Throw-SafeError -Code "sql_inside_repository"
    }

    $summary = Get-DumpPatternSummary -SqlPath $SqlPath

    Set-Stage -Stage "evaluate_sql_rules"
    if ($summary.HasDataLoadLine) {
      Throw-SafeError -Code "sql_data_load_detected"
    }
    if ($summary.HasDangerousDdl) {
      Throw-SafeError -Code "sql_dangerous_ddl_detected"
    }
    if (-not $summary.HasPublicDefinition) {
      Throw-SafeError -Code "sql_public_definition_missing"
    }
    if (-not $summary.HasCreateTable) {
      Throw-SafeError -Code "sql_create_table_missing"
    }

    return $summary
  } catch {
    $safeReason = Get-SafeReason -ErrorRecord $_
    if ($safeReason -ne "unexpected_failure") {
      Throw-SafeError -Code $safeReason
    }
    Throw-SafeError -Code "sql_validation_internal_failed"
  }
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
    Throw-SafeError -Code "manifest_missing"
  }

  $item = Get-Item -LiteralPath $ManifestPath
  if ($item.Length -le 0) {
    Throw-SafeError -Code "manifest_empty"
  }

  $lines = Get-Content -LiteralPath $ManifestPath
  if (@($lines | Where-Object { $_ -eq "DATA_ROWS_EXPORTED=false" }).Count -ne 1) {
    Throw-SafeError -Code "manifest_data_marker_invalid"
  }
  if (@($lines | Where-Object { $_ -eq "MANUAL_SECRET_REVIEW_REQUIRED=true" }).Count -ne 1) {
    Throw-SafeError -Code "manifest_review_marker_invalid"
  }
  if (@($lines | Where-Object { $_ -eq "SAFE_TO_COMMIT=false" }).Count -ne 1) {
    Throw-SafeError -Code "manifest_commit_marker_invalid"
  }
  if (@($lines | Where-Object { $_ -eq "sha256=$ExpectedSha256" }).Count -ne 1) {
    Throw-SafeError -Code "manifest_hash_invalid"
  }
  if (@($lines | Where-Object { $_ -match "(?i)PGPASSWORD|password\s*=|postgresql://|postgres://" }).Count -ne 0) {
    Throw-SafeError -Code "manifest_sensitive_material_detected"
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

function Write-TestSqlFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string[]]$Lines
  )

  Set-Content -LiteralPath $Path -Value $Lines -Encoding UTF8
}

function Invoke-ExpectSqlPass {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  Assert-ValidSchemaOnlyDump -SqlPath $Path -RepoRoot $RepoRoot | Out-Null
}

function Invoke-ExpectSqlFailure {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedReason
  )

  try {
    Assert-ValidSchemaOnlyDump -SqlPath $Path -RepoRoot $RepoRoot | Out-Null
    throw "Expected validation failure did not occur."
  } catch {
    $reason = Get-SafeReason -ErrorRecord $_
    if ($reason -ne $ExpectedReason) {
      throw "Unexpected self-test validation reason."
    }
  }
}

function Invoke-ExpectManifestPass {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha256
  )

  Assert-ValidManifest -ManifestPath $Path -ExpectedSha256 $ExpectedSha256
}

function Invoke-ExpectManifestFailure {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha256,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedReason
  )

  try {
    Assert-ValidManifest -ManifestPath $Path -ExpectedSha256 $ExpectedSha256
    throw "Expected manifest validation failure did not occur."
  } catch {
    $reason = Get-SafeReason -ErrorRecord $_
    if ($reason -ne $ExpectedReason) {
      throw "Unexpected self-test manifest reason."
    }
  }
}

function Invoke-ExpectSensitiveIndicatorCount {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [int]$ExpectedCount
  )

  $actualCount = Get-SensitiveIndicatorCount -SqlPath $Path
  if ($actualCount -ne $ExpectedCount) {
    throw "Unexpected self-test sensitive indicator count."
  }
}

function Invoke-ExpectSegmentParserContract {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Line,
    [AllowNull()]
    [AllowEmptyString()]
    [string]$CurrentTag,
    [AllowNull()]
    [string]$ExpectedTag
  )

  $parserOutput = @(Get-OutsideDollarQuoteSegments -Line $Line -CurrentTag $CurrentTag)
  if ($parserOutput.Count -ne 1) {
    throw "Unexpected self-test parser output count."
  }

  $result = Assert-SegmentParserResult -Result $parserOutput[0]
  if ($result -is [int]) {
    throw "Unexpected self-test parser numeric output."
  }

  $actualTag = $result.Tag
  $normalizedExpectedTag = $ExpectedTag
  if ([string]::IsNullOrEmpty($actualTag)) {
    $actualTag = $null
  }
  if ([string]::IsNullOrEmpty($normalizedExpectedTag)) {
    $normalizedExpectedTag = $null
  }

  if ($actualTag -ne $normalizedExpectedTag) {
    throw "Unexpected self-test parser tag."
  }
}

function Invoke-SelfTest {
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-schema-selftest-" + [Guid]::NewGuid().ToString("N"))

  try {
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    $repoRootForTest = Get-NormalizedFullPath -PathValue (Join-Path $PSScriptRoot "..\..")

    Invoke-ExpectSegmentParserContract `
      -Line "CREATE TABLE public.demo (id integer);" `
      -CurrentTag $null `
      -ExpectedTag $null
    Invoke-ExpectSegmentParserContract `
      -Line "CREATE FUNCTION public.demo() RETURNS void AS `$function`$" `
      -CurrentTag $null `
      -ExpectedTag "`$function`$"
    Invoke-ExpectSegmentParserContract `
      -Line "INSERT INTO public.demo VALUES (1);" `
      -CurrentTag "`$function`$" `
      -ExpectedTag "`$function`$"
    Invoke-ExpectSegmentParserContract `
      -Line "`$function`$ LANGUAGE plpgsql;" `
      -CurrentTag "`$function`$" `
      -ExpectedTag $null
    Invoke-ExpectSegmentParserContract `
      -Line "SELECT `$a`$one`$a`$, `$b`$two`$b`$;" `
      -CurrentTag $null `
      -ExpectedTag $null
    Invoke-ExpectSegmentParserContract `
      -Line "-- CREATE TABLE public.demo (id integer);" `
      -CurrentTag $null `
      -ExpectedTag $null
    Invoke-ExpectSegmentParserContract `
      -Line "" `
      -CurrentTag $null `
      -ExpectedTag $null

    $pgDump17Sql = Join-Path $tempRoot "pg-dump-17.sql"
    Write-TestSqlFile -Path $pgDump17Sql -Lines @(
      "\restrict token_sintetico"
      "SET statement_timeout = 0;"
      "SET lock_timeout = 0;"
      "SET client_encoding = 'UTF8';"
      "SET standard_conforming_strings = on;"
      "CREATE TABLE public.demo ("
      "  id integer NOT NULL,"
      "  name text"
      ");"
      "CREATE SEQUENCE public.demo_id_seq"
      "  AS integer"
      "  START WITH 1"
      "  INCREMENT BY 1"
      "  NO MINVALUE"
      "  NO MAXVALUE"
      "  CACHE 1;"
      "ALTER TABLE ONLY public.demo ALTER COLUMN id SET DEFAULT nextval('public.demo_id_seq'::regclass);"
      "CREATE FUNCTION public.demo_fn() RETURNS trigger"
      "LANGUAGE plpgsql"
      "AS `$function`$"
      "BEGIN"
      "  INSERT INTO public.demo VALUES (NEW.id);"
      "  RETURN NEW;"
      "END;"
      "`$function`$;"
      "CREATE INDEX demo_id_idx ON public.demo (id);"
      "CREATE TRIGGER demo_trigger BEFORE INSERT ON public.demo FOR EACH ROW EXECUTE FUNCTION public.demo_fn();"
      "ALTER TABLE public.demo ENABLE ROW LEVEL SECURITY;"
      "CREATE POLICY demo_select ON public.demo FOR SELECT USING (true);"
      "REVOKE ALL ON TABLE public.demo FROM PUBLIC;"
      "GRANT SELECT ON TABLE public.demo TO authenticated;"
      "\unrestrict token_sintetico"
    )
    Invoke-ExpectSqlPass -Path $pgDump17Sql -RepoRoot $repoRootForTest

    $validSql = Join-Path $tempRoot "valid.sql"
    Write-TestSqlFile -Path $validSql -Lines @(
      "CREATE TABLE public.demo ("
      "  id integer"
      ");"
      "CREATE FUNCTION public.demo_fn() RETURNS void AS `$function`$"
      "BEGIN"
      "  INSERT INTO public.demo VALUES (1);"
      "END"
      "`$function`$ LANGUAGE plpgsql;"
    )
    Invoke-ExpectSqlPass -Path $validSql -RepoRoot $repoRootForTest

    $copySql = Join-Path $tempRoot "copy.sql"
    Write-TestSqlFile -Path $copySql -Lines @(
      "CREATE TABLE public.demo (id integer);"
      "COPY public.demo (id) FROM stdin;"
      "1"
      "\."
    )
    Invoke-ExpectSqlFailure -Path $copySql -RepoRoot $repoRootForTest -ExpectedReason "sql_data_load_detected"

    $insertSql = Join-Path $tempRoot "insert.sql"
    Write-TestSqlFile -Path $insertSql -Lines @(
      "CREATE TABLE public.demo (id integer);"
      "INSERT INTO public.demo VALUES (1);"
    )
    Invoke-ExpectSqlFailure -Path $insertSql -RepoRoot $repoRootForTest -ExpectedReason "sql_data_load_detected"

    $dropSql = Join-Path $tempRoot "drop.sql"
    Write-TestSqlFile -Path $dropSql -Lines @(
      "CREATE TABLE public.demo (id integer);"
      "DROP TABLE public.demo;"
    )
    Invoke-ExpectSqlFailure -Path $dropSql -RepoRoot $repoRootForTest -ExpectedReason "sql_dangerous_ddl_detected"

    $secretFunctionSql = Join-Path $tempRoot "secret-function.sql"
    Write-TestSqlFile -Path $secretFunctionSql -Lines @(
      "CREATE TABLE public.demo (id integer);"
      "CREATE FUNCTION public.secret_test() RETURNS void AS `$function`$"
      "BEGIN"
      "  PERFORM 'SUPABASE_SERVICE_ROLE_KEY';"
      "END"
      "`$function`$ LANGUAGE plpgsql;"
    )
    $secretFunctionSummary = Assert-ValidSchemaOnlyDump -SqlPath $secretFunctionSql -RepoRoot $repoRootForTest
    if ($secretFunctionSummary.SuspiciousIndicatorCount -le 0) {
      throw "Unexpected self-test sensitive indicator count."
    }

    $lineCommentSecretSql = Join-Path $tempRoot "line-comment-secret.sql"
    Write-TestSqlFile -Path $lineCommentSecretSql -Lines @(
      "-- SUPABASE_SERVICE_ROLE_KEY"
      "CREATE TABLE public.demo (id integer);"
    )
    Invoke-ExpectSensitiveIndicatorCount -Path $lineCommentSecretSql -ExpectedCount 0

    $blockCommentSecretSql = Join-Path $tempRoot "block-comment-secret.sql"
    Write-TestSqlFile -Path $blockCommentSecretSql -Lines @(
      "/*"
      "SUPABASE_SERVICE_ROLE_KEY"
      "*/"
      "CREATE TABLE public.demo (id integer);"
    )
    Invoke-ExpectSensitiveIndicatorCount -Path $blockCommentSecretSql -ExpectedCount 0

    $serviceRoleSql = Join-Path $tempRoot "service-role.sql"
    Write-TestSqlFile -Path $serviceRoleSql -Lines @(
      "CREATE TABLE public.demo (id integer);"
      "GRANT EXECUTE ON FUNCTION public.demo() TO service_role;"
    )
    Invoke-ExpectSensitiveIndicatorCount -Path $serviceRoleSql -ExpectedCount 0

    $dropFunctionSql = Join-Path $tempRoot "drop-function.sql"
    Write-TestSqlFile -Path $dropFunctionSql -Lines @(
      "CREATE TABLE public.demo (id integer);"
      "CREATE FUNCTION public.demo_drop_fn() RETURNS void AS `$$"
      "BEGIN"
      "  DROP TABLE public.demo;"
      "END"
      "`$$ LANGUAGE plpgsql;"
    )
    Invoke-ExpectSqlPass -Path $dropFunctionSql -RepoRoot $repoRootForTest

    $commentSql = Join-Path $tempRoot "comment.sql"
    Write-TestSqlFile -Path $commentSql -Lines @(
      "-- COPY public.demo (id) FROM stdin;"
      "-- INSERT INTO public.demo VALUES (1);"
      "-- DROP TABLE public.demo;"
      "CREATE TABLE ONLY public.demo (id integer);"
    )
    Invoke-ExpectSqlPass -Path $commentSql -RepoRoot $repoRootForTest

    $noCreateTableSql = Join-Path $tempRoot "no-create-table.sql"
    Write-TestSqlFile -Path $noCreateTableSql -Lines @(
      "CREATE SCHEMA public;"
      "CREATE FUNCTION public.demo_fn() RETURNS void AS `$$"
      "BEGIN"
      "  NULL;"
      "END"
      "`$$ LANGUAGE plpgsql;"
    )
    Invoke-ExpectSqlFailure -Path $noCreateTableSql -RepoRoot $repoRootForTest -ExpectedReason "sql_create_table_missing"

    $noPublicSql = Join-Path $tempRoot "no-public.sql"
    Write-TestSqlFile -Path $noPublicSql -Lines @(
      "CREATE TABLE demo (id integer);"
    )
    Invoke-ExpectSqlFailure -Path $noPublicSql -RepoRoot $repoRootForTest -ExpectedReason "sql_public_definition_missing"

    $manifestSqlHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $validSql).Hash
    $validManifest = Join-Path $tempRoot "valid.manifest.txt"
    $summary = Assert-ValidSchemaOnlyDump -SqlPath $validSql -RepoRoot $repoRootForTest
    $validSqlItem = Get-Item -LiteralPath $validSql
    New-ManifestFile `
      -ManifestPath $validManifest `
      -SqlPath $validSql `
      -Sha256 $manifestSqlHash `
      -SizeBytes $validSqlItem.Length `
      -PgDumpVersion "selftest" `
      -HostNameValue "example-host" `
      -PortValue 5432 `
      -DatabaseValue "example_db" `
      -UserNameValue "example_user" `
      -Summary $summary
    Invoke-ExpectManifestPass -Path $validManifest -ExpectedSha256 $manifestSqlHash

    $missingMarkerManifest = Join-Path $tempRoot "missing-marker.manifest.txt"
    Set-Content -LiteralPath $missingMarkerManifest -Encoding UTF8 -Value @(
      "sha256=$manifestSqlHash"
      "DATA_ROWS_EXPORTED=false"
      "SAFE_TO_COMMIT=false"
    )
    Invoke-ExpectManifestFailure `
      -Path $missingMarkerManifest `
      -ExpectedSha256 $manifestSqlHash `
      -ExpectedReason "manifest_review_marker_invalid"

    $wrongHashManifest = Join-Path $tempRoot "wrong-hash.manifest.txt"
    Set-Content -LiteralPath $wrongHashManifest -Encoding UTF8 -Value @(
      "sha256=invalid"
      "DATA_ROWS_EXPORTED=false"
      "MANUAL_SECRET_REVIEW_REQUIRED=true"
      "SAFE_TO_COMMIT=false"
    )
    Invoke-ExpectManifestFailure `
      -Path $wrongHashManifest `
      -ExpectedSha256 $manifestSqlHash `
      -ExpectedReason "manifest_hash_invalid"
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
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
  if ($SelfTest) {
    Set-Stage -Stage "self_test"
    Invoke-SelfTest
    Set-Stage -Stage "completed"
    $completedSuccessfully = $true
    Write-Output "SELF_TEST_OK"
    exit 0
  }

  Set-Stage -Stage "resolve_inputs"
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

  Set-Stage -Stage "locate_pg_dump"
  $pgDumpCommand = Get-RequiredApplication
  $pgDumpVersion = (Get-Item -LiteralPath $pgDumpCommand.Source).VersionInfo.ProductVersion
  if ([string]::IsNullOrWhiteSpace($pgDumpVersion)) {
    $pgDumpVersion = "unknown"
  }

  Write-Output "Planned export:"
  Write-Output "SOLO ESQUEMA"
  Write-Output "SIN FILAS"
  Write-Output "NO APLICA CAMBIOS"
  Write-Output "Final SQL path: $finalSqlPath"
  Write-Output "Manifest path: $finalManifestPath"
  Write-Output "pg_dump version: $pgDumpVersion"

  Set-Stage -Stage "confirm_operation"
  $confirmation = Read-Host -Prompt "Type SCHEMA-ONLY-VOTO-CLARO to continue"
  if ($confirmation -ne "SCHEMA-ONLY-VOTO-CLARO") {
    throw "Confirmation did not match."
  }

  Set-Stage -Stage "read_password"
  $securePassword = Read-Host -AsSecureString -Prompt "Database password"
  if ($null -eq $securePassword -or $securePassword.Length -eq 0) {
    throw "Password was not provided."
  }

  Set-Stage -Stage "prepare_temp_files"
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  $tempSqlPath = Join-Path $outputDirectory (".tmp-" + [Guid]::NewGuid().ToString("N") + ".sql")
  $tempManifestPath = Join-Path $outputDirectory (".tmp-" + [Guid]::NewGuid().ToString("N") + ".manifest.txt")

  Set-Stage -Stage "configure_environment"
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

  Set-Stage -Stage "run_pg_dump"
  Write-Output "Starting schema-only export to temporary file."
  & $pgDumpCommand.Source @pgDumpArguments
  if ($LASTEXITCODE -ne 0) {
    Throw-SafeError -Code "external_command_failed"
  }

  Write-Output "Validating temporary SQL file."
  Set-Stage -Stage "validate_sql"
  $summary = Assert-ValidSchemaOnlyDump -SqlPath $tempSqlPath -RepoRoot $repoRoot

  Set-Stage -Stage "hash_sql"
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $tempSqlPath
  $tempItem = Get-Item -LiteralPath $tempSqlPath

  Set-Stage -Stage "write_manifest"
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

  Set-Stage -Stage "validate_manifest"
  Assert-ValidManifest -ManifestPath $tempManifestPath -ExpectedSha256 $hash.Hash

  Set-Stage -Stage "move_sql"
  Move-Item -LiteralPath $tempSqlPath -Destination $finalSqlPath
  $tempSqlPath = $null
  $finalSqlCreatedThisRun = $true

  Set-Stage -Stage "move_manifest"
  Move-Item -LiteralPath $tempManifestPath -Destination $finalManifestPath
  $tempManifestPath = $null
  $finalManifestCreatedThisRun = $true

  Set-Stage -Stage "verify_final_files"
  if (-not (Test-Path -LiteralPath $finalSqlPath -PathType Leaf)) {
    Throw-SafeError -Code "final_sql_missing"
  }
  if (-not (Test-Path -LiteralPath $finalManifestPath -PathType Leaf)) {
    Throw-SafeError -Code "final_manifest_missing"
  }

  Set-Stage -Stage "completed"
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
  $safeReason = Get-SafeReason -ErrorRecord $_
  Write-Output "Schema-only export failed."
  Write-Output "stage=$currentStage"
  Write-Output "reason=$safeReason"
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
