[CmdletBinding()]
param(
  [switch]$SelfTest,
  [string]$SourceSqlPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$currentStage = "initialization"
$script:ExpectedTableCount = 50
$script:ExpectedFunctionOrProcedureCount = 82
$script:ExpectedIndexCount = 108
$script:ExpectedTriggerCount = 16
$script:ExpectedPolicyCount = 13
$script:ExpectedEnableRlsCount = 20
$script:ExpectedGrantCount = 259
$script:ExpectedRevokeCount = 53

function Set-Stage {
  param([Parameter(Mandatory = $true)][string]$Stage)
  $script:currentStage = $Stage
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

function Get-NormalizedFullPath {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Test-IsPathInsideDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$ChildPath,
    [Parameter(Mandatory = $true)][string]$ParentPath
  )

  $childFull = Get-NormalizedFullPath -PathValue $ChildPath
  $parentFull = Get-NormalizedFullPath -PathValue $ParentPath
  if (-not $parentFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $parentFull += [System.IO.Path]::DirectorySeparatorChar
  }

  return $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-HasUtf8Bom {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)
  return $Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF
}

function Test-AsciiPrefix {
  param(
    [Parameter(Mandatory = $true)][byte[]]$Bytes,
    [Parameter(Mandatory = $true)][int]$Start,
    [Parameter(Mandatory = $true)][int]$Length,
    [Parameter(Mandatory = $true)][byte[]]$Prefix
  )

  if ($Length -lt $Prefix.Length) {
    return $false
  }

  for ($i = 0; $i -lt $Prefix.Length; $i += 1) {
    if ($Bytes[$Start + $i] -ne $Prefix[$i]) {
      return $false
    }
  }

  return $true
}

function Get-LineEndingProfile {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  $crlf = 0
  $lf = 0
  $crOnly = 0
  $position = 0
  while ($position -lt $Bytes.Length) {
    if ($Bytes[$position] -eq 13) {
      if ($position + 1 -lt $Bytes.Length -and $Bytes[$position + 1] -eq 10) {
        $crlf += 1
        $lf += 1
        $position += 2
      } else {
        $crOnly += 1
        $position += 1
      }
    } elseif ($Bytes[$position] -eq 10) {
      $lf += 1
      $position += 1
    } else {
      $position += 1
    }
  }

  return [pscustomobject]@{
    CrLf = $crlf
    Lf = $lf
    CrOnly = $crOnly
    EndsWithNewline = $Bytes.Length -gt 0 -and ($Bytes[-1] -eq 10 -or $Bytes[-1] -eq 13)
  }
}

function Get-ExpectedCandidateFromSource {
  param([Parameter(Mandatory = $true)][string]$SourcePath)

  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    Throw-SafeError -Code "source_sql_missing"
  }

  $sourceBytes = [System.IO.File]::ReadAllBytes($SourcePath)
  $sourceHasBom = Test-HasUtf8Bom -Bytes $sourceBytes
  $restrictPrefix = [System.Text.Encoding]::ASCII.GetBytes("\restrict")
  $unrestrictPrefix = [System.Text.Encoding]::ASCII.GetBytes("\unrestrict")
  $removeRanges = New-Object System.Collections.Generic.List[object]

  $restrictCount = 0
  $unrestrictCount = 0
  $removedBytes = 0
  $position = 0
  $firstLine = $true

  while ($position -lt $sourceBytes.Length) {
    $lineStart = $position
    while ($position -lt $sourceBytes.Length -and $sourceBytes[$position] -ne 10 -and $sourceBytes[$position] -ne 13) {
      $position += 1
    }

    $contentLength = $position - $lineStart
    $terminatorLength = 0
    if ($position -lt $sourceBytes.Length) {
      if ($sourceBytes[$position] -eq 13 -and $position + 1 -lt $sourceBytes.Length -and $sourceBytes[$position + 1] -eq 10) {
        $terminatorLength = 2
        $position += 2
      } else {
        $terminatorLength = 1
        $position += 1
      }
    }

    $lineTotalLength = $contentLength + $terminatorLength
    $checkStart = $lineStart
    $checkLength = $contentLength
    $removeStart = $lineStart
    $removeLength = $lineTotalLength
    if ($firstLine -and $sourceHasBom) {
      $checkStart += 3
      $checkLength -= 3
      $removeStart += 3
      $removeLength -= 3
    }

    $isRestrict = $checkLength -ge $restrictPrefix.Length
    if ($isRestrict) {
      for ($i = 0; $i -lt $restrictPrefix.Length; $i += 1) {
        if ($sourceBytes[$checkStart + $i] -ne $restrictPrefix[$i]) {
          $isRestrict = $false
          break
        }
      }
    }

    $isUnrestrict = $checkLength -ge $unrestrictPrefix.Length
    if ($isUnrestrict) {
      for ($i = 0; $i -lt $unrestrictPrefix.Length; $i += 1) {
        if ($sourceBytes[$checkStart + $i] -ne $unrestrictPrefix[$i]) {
          $isUnrestrict = $false
          break
        }
      }
    }

    if ($isRestrict) {
      $restrictCount += 1
      $removedBytes += $removeLength
      [void]$removeRanges.Add([pscustomobject]@{ Start = $removeStart; Length = $removeLength })
    } elseif ($isUnrestrict) {
      $unrestrictCount += 1
      $removedBytes += $removeLength
      [void]$removeRanges.Add([pscustomobject]@{ Start = $removeStart; Length = $removeLength })
    }

    $firstLine = $false
  }

  if ($restrictCount -ne 1) { Throw-SafeError -Code "source_restrict_count_invalid" }
  if ($unrestrictCount -ne 1) { Throw-SafeError -Code "source_unrestrict_count_invalid" }

  $expectedSize = $sourceBytes.Length - $removedBytes
  $expectedBytes = New-Object byte[] $expectedSize
  $destination = 0
  $sourcePosition = 0
  foreach ($range in @($removeRanges | Sort-Object Start)) {
    $copyLength = $range.Start - $sourcePosition
    if ($copyLength -gt 0) {
      [System.Array]::Copy($sourceBytes, $sourcePosition, $expectedBytes, $destination, $copyLength)
      $destination += $copyLength
    }
    $sourcePosition = $range.Start + $range.Length
  }
  $tailLength = $sourceBytes.Length - $sourcePosition
  if ($tailLength -gt 0) {
    [System.Array]::Copy($sourceBytes, $sourcePosition, $expectedBytes, $destination, $tailLength)
  }
  return [pscustomobject]@{
    SourceBytes = $sourceBytes
    ExpectedBytes = $expectedBytes
    SourceHasBom = $sourceHasBom
    RestrictCount = $restrictCount
    UnrestrictCount = $unrestrictCount
    RemovedBytes = $removedBytes
    ExpectedSize = $expectedSize
    ExpectedLineEndings = Get-LineEndingProfile -Bytes $expectedBytes
  }
}

function Assert-BytePreservingEquivalence {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$CandidatePath
  )

  $expectedInfo = Get-ExpectedCandidateFromSource -SourcePath $SourcePath
  $candidateBytes = [System.IO.File]::ReadAllBytes($CandidatePath)
  $candidateHasBom = Test-HasUtf8Bom -Bytes $candidateBytes
  if ($candidateHasBom -ne $expectedInfo.SourceHasBom) {
    Throw-SafeError -Code "candidate_bom_mismatch"
  }

  $candidateLineEndings = Get-LineEndingProfile -Bytes $candidateBytes
  if ($candidateLineEndings.CrLf -ne $expectedInfo.ExpectedLineEndings.CrLf -or
      $candidateLineEndings.Lf -ne $expectedInfo.ExpectedLineEndings.Lf -or
      $candidateLineEndings.CrOnly -ne $expectedInfo.ExpectedLineEndings.CrOnly -or
      $candidateLineEndings.EndsWithNewline -ne $expectedInfo.ExpectedLineEndings.EndsWithNewline) {
    Throw-SafeError -Code "candidate_line_endings_changed"
  }

  if ($candidateBytes.Length -ne $expectedInfo.ExpectedSize) {
    Throw-SafeError -Code "candidate_size_mismatch"
  }

  for ($i = 0; $i -lt $candidateBytes.Length; $i += 1) {
    if ($candidateBytes[$i] -ne $expectedInfo.ExpectedBytes[$i]) {
      Throw-SafeError -Code "candidate_byte_equivalence_failed"
    }
  }

  return [pscustomobject]@{
    ByteEquivalent = $true
    SourceHasBom = $expectedInfo.SourceHasBom
    CandidateHasBom = $candidateHasBom
    RemovedRestrictLines = $expectedInfo.RestrictCount
    RemovedUnrestrictLines = $expectedInfo.UnrestrictCount
    UnauthorizedByteDifferences = 0
    ExpectedCandidateSizeBytes = $expectedInfo.ExpectedSize
    ActualCandidateSizeBytes = $candidateBytes.Length
  }
}

function Read-ManifestMap {
  param([Parameter(Mandatory = $true)][string]$ManifestPath)

  $map = @{}
  foreach ($line in Get-Content -LiteralPath $ManifestPath) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    $separator = $line.IndexOf("=")
    if ($separator -le 0) {
      Throw-SafeError -Code "manifest_format_invalid"
    }
    $key = $line.Substring(0, $separator)
    $value = $line.Substring($separator + 1)
    if ($map.ContainsKey($key)) {
      Throw-SafeError -Code "manifest_duplicate_key"
    }
    $map[$key] = $value
  }
  return $map
}

function Get-OutsideSqlSegments {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line,
    [AllowNull()][AllowEmptyString()][string]$DollarTag,
    [bool]$BlockComment
  )

  $segments = New-Object System.Collections.Generic.List[string]
  $builder = New-Object System.Text.StringBuilder
  $position = 0

  while ($position -lt $Line.Length) {
    if ($BlockComment) {
      $blockEnd = $Line.IndexOf("*/", $position, [System.StringComparison]::Ordinal)
      if ($blockEnd -lt 0) {
        $position = $Line.Length
      } else {
        $BlockComment = $false
        $position = $blockEnd + 2
      }
      continue
    }

    if (-not [string]::IsNullOrEmpty($DollarTag)) {
      $tagEnd = $Line.IndexOf($DollarTag, $position, [System.StringComparison]::Ordinal)
      if ($tagEnd -lt 0) {
        $position = $Line.Length
      } else {
        $tagLength = $DollarTag.Length
        $DollarTag = $null
        $position = $tagEnd + $tagLength
      }
      continue
    }

    if ($position + 1 -lt $Line.Length -and $Line.Substring($position, 2) -eq "--") {
      break
    }

    if ($position + 1 -lt $Line.Length -and $Line.Substring($position, 2) -eq "/*") {
      $BlockComment = $true
      $position += 2
      continue
    }

    $remaining = $Line.Substring($position)
    $tagMatch = [regex]::Match($remaining, "^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$")
    if ($tagMatch.Success) {
      if ($builder.Length -gt 0) {
        [void]$segments.Add($builder.ToString())
        [void]$builder.Clear()
      }
      $DollarTag = $tagMatch.Value
      $position += $tagMatch.Length
      continue
    }

    [void]$builder.Append($Line[$position])
    $position += 1
  }

  if ($builder.Length -gt 0) {
    [void]$segments.Add($builder.ToString())
  }

  return [pscustomobject]@{
    Segments = @($segments.ToArray())
    DollarTag = $DollarTag
    BlockComment = $BlockComment
  }
}

function Get-CommentStrippedLine {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line,
    [bool]$BlockComment
  )

  $builder = New-Object System.Text.StringBuilder
  $position = 0

  while ($position -lt $Line.Length) {
    if ($BlockComment) {
      $blockEnd = $Line.IndexOf("*/", $position, [System.StringComparison]::Ordinal)
      if ($blockEnd -lt 0) {
        $position = $Line.Length
      } else {
        $BlockComment = $false
        $position = $blockEnd + 2
      }
      continue
    }

    if ($position + 1 -lt $Line.Length -and $Line.Substring($position, 2) -eq "--") {
      break
    }

    if ($position + 1 -lt $Line.Length -and $Line.Substring($position, 2) -eq "/*") {
      $BlockComment = $true
      $position += 2
      continue
    }

    [void]$builder.Append($Line[$position])
    $position += 1
  }

  return [pscustomobject]@{
    Text = $builder.ToString()
    BlockComment = $BlockComment
  }
}

function New-EmptyAnalysis {
  return [ordered]@{
    restrict = 0
    unrestrict = 0
    other_meta = 0
    copy_from_stdin = 0
    insert_into = 0
    copy_terminator = 0
    create_database = 0
    drop_database = 0
    drop_schema = 0
    drop_table = 0
    truncate = 0
    postgresql_uri = 0
    postgres_uri = 0
    password_assignment = 0
    bearer_token = 0
    jwt_like = 0
    openai_key_like = 0
    supabase_service_role_key_name = 0
    service_role_key_name = 0
    private_key_name = 0
    tables = 0
    functions_or_procedures = 0
    indexes = 0
    triggers = 0
    policies = 0
    enable_rls = 0
    grants = 0
    revokes = 0
    public_definition = $false
    create_table_public = $false
    dollar_quotes_balanced = $false
    nul_bytes = 0
    ends_with_newline = $false
    data_markers = 0
    production_safe_header = 0
  }
}

function Get-SqlAnalysis {
  param([Parameter(Mandatory = $true)][string]$SqlPath)

  $analysis = New-EmptyAnalysis
  $sensitiveBlockComment = $false
  $raw = [System.IO.File]::ReadAllText($SqlPath)
  $surfaceBuilder = New-Object System.Text.StringBuilder
  $dollarTag = $null
  foreach ($surfaceLine in [System.IO.File]::ReadLines($SqlPath)) {
    $remaining = $surfaceLine
    while ($remaining.Length -gt 0) {
      if (-not [string]::IsNullOrEmpty($dollarTag)) {
        $tagEnd = $remaining.IndexOf($dollarTag, [System.StringComparison]::Ordinal)
        if ($tagEnd -lt 0) {
          $remaining = ""
        } else {
          $remaining = $remaining.Substring($tagEnd + $dollarTag.Length)
          $dollarTag = $null
        }
        continue
      }

      $tagMatch = [regex]::Match($remaining, "\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$")
      if (-not $tagMatch.Success) {
        [void]$surfaceBuilder.AppendLine($remaining)
        $remaining = ""
      } else {
        if ($tagMatch.Index -gt 0) {
          [void]$surfaceBuilder.Append($remaining.Substring(0, $tagMatch.Index))
        }
        $dollarTag = $tagMatch.Value
        $remaining = $remaining.Substring($tagMatch.Index + $tagMatch.Length)
      }
    }
    if (-not [string]::IsNullOrEmpty($dollarTag)) {
      [void]$surfaceBuilder.AppendLine()
    }
  }
  $analysis.dollar_quotes_balanced = [string]::IsNullOrEmpty($dollarTag)

  $surface = $surfaceBuilder.ToString()
  $surface = [regex]::Replace($surface, "(?s)/\*.*?\*/", "")
  $surface = [regex]::Replace($surface, "(?m)--.*$", "")

  $analysis.restrict = [regex]::Matches($surface, "(?m)^\s*\\restrict\b").Count
  $analysis.unrestrict = [regex]::Matches($surface, "(?m)^\s*\\unrestrict\b").Count
  $analysis.copy_terminator = [regex]::Matches($surface, "(?m)^\s*\\\.\s*$").Count
  $analysis.other_meta = [regex]::Matches($surface, "(?m)^\s*\\(?!restrict\b|unrestrict\b|\.\s*$)").Count

  $analysis.copy_from_stdin = [regex]::Matches($surface, "(?im)^\s*COPY\s+.+\s+FROM\s+stdin;\s*$").Count
  $analysis.insert_into = [regex]::Matches($surface, "(?im)^\s*INSERT\s+INTO\s+").Count
  $analysis.create_database = [regex]::Matches($surface, "(?im)^\s*CREATE\s+DATABASE\b").Count
  $analysis.drop_database = [regex]::Matches($surface, "(?im)^\s*DROP\s+DATABASE\b").Count
  $analysis.drop_schema = [regex]::Matches($surface, "(?im)^\s*DROP\s+SCHEMA\b").Count
  $analysis.drop_table = [regex]::Matches($surface, "(?im)^\s*DROP\s+TABLE\b").Count
  $analysis.truncate = [regex]::Matches($surface, "(?im)^\s*TRUNCATE\b").Count

  $analysis.tables = [regex]::Matches($surface, "(?im)^\s*CREATE\s+(UNLOGGED\s+)?TABLE\s+(ONLY\s+)?public\.").Count
  $analysis.functions_or_procedures = [regex]::Matches($surface, "(?im)^\s*CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+public\.").Count
  $analysis.indexes = [regex]::Matches($surface, "(?im)^\s*CREATE\s+(UNIQUE\s+)?INDEX\b").Count
  $analysis.triggers = [regex]::Matches($surface, "(?im)^\s*CREATE\s+TRIGGER\b").Count
  $analysis.policies = [regex]::Matches($surface, "(?im)^\s*CREATE\s+POLICY\b").Count
  $analysis.enable_rls = [regex]::Matches($surface, "(?im)^\s*ALTER\s+TABLE\b.+\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b").Count
  $analysis.grants = [regex]::Matches($surface, "(?im)^\s*GRANT\b").Count
  $analysis.revokes = [regex]::Matches($surface, "(?im)^\s*REVOKE\b").Count
  $analysis.public_definition = $analysis.tables -gt 0 -or
    $analysis.functions_or_procedures -gt 0 -or
    [regex]::IsMatch($surface, "(?im)^\s*CREATE\s+SCHEMA\s+public\b|^\s*ALTER\s+SCHEMA\s+public\b|^\s*CREATE\s+SEQUENCE\s+public\.|^\s*ALTER\s+TABLE\s+(ONLY\s+)?public\.")
  $analysis.create_table_public = $analysis.tables -gt 0

  foreach ($line in [System.IO.File]::ReadLines($SqlPath)) {
    $clean = Get-CommentStrippedLine -Line $line -BlockComment $sensitiveBlockComment
    $sensitiveBlockComment = $clean.BlockComment
    $text = $clean.Text
    $analysis.postgresql_uri += [regex]::Matches($text, "(?i)postgresql://").Count
    $analysis.postgres_uri += [regex]::Matches($text, "(?i)postgres://").Count
    $analysis.password_assignment += [regex]::Matches($text, "(?i)password\s*=").Count
    $analysis.bearer_token += [regex]::Matches($text, "(?i)\bbearer\s+\S+").Count
    $analysis.jwt_like += [regex]::Matches($text, "\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}").Count
    $analysis.openai_key_like += [regex]::Matches($text, "\bsk-[A-Za-z0-9_-]{10,}").Count
    $analysis.supabase_service_role_key_name += [regex]::Matches($text, "\bSUPABASE_SERVICE_ROLE_KEY\b").Count
    $analysis.service_role_key_name += [regex]::Matches($text, "\bSERVICE_ROLE_KEY\b").Count
    $analysis.private_key_name += [regex]::Matches($text, "\bPRIVATE_KEY\b").Count
    $analysis.data_markers += [regex]::Matches($text, "DATA_ROWS_EXPORTED|COPY\s+.+\s+FROM\s+stdin").Count
    $analysis.production_safe_header += [regex]::Matches($text, "(?i)safe\s+to\s+apply\s+production|safe_to_apply_production=true").Count
  }

  $bytes = [System.IO.File]::ReadAllBytes($SqlPath)
  foreach ($byte in $bytes) {
    if ($byte -eq 0) { $analysis.nul_bytes += 1 }
  }
  $analysis.ends_with_newline = $bytes.Length -gt 0 -and ($bytes[-1] -eq 10 -or $bytes[-1] -eq 13)

  return [pscustomobject]$analysis
}

function Assert-Zero {
  param(
    [Parameter(Mandatory = $true)][int]$Value,
    [Parameter(Mandatory = $true)][string]$Code
  )
  if ($Value -ne 0) { Throw-SafeError -Code $Code }
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

function Assert-ManifestNumericValue {
  param(
    [Parameter(Mandatory = $true)][hashtable]$Manifest,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][int64]$Expected,
    [Parameter(Mandatory = $true)][string]$Code
  )

  if (-not $Manifest.ContainsKey($Key)) {
    Throw-SafeError -Code $Code
  }

  $parsed = 0L
  if (-not [int64]::TryParse($Manifest[$Key], [ref]$parsed) -or $parsed -ne $Expected) {
    Throw-SafeError -Code $Code
  }
}

function Assert-BaselineCandidate {
  param(
    [Parameter(Mandatory = $true)][string]$CandidatePath,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$ReadmePath,
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$BaselineDir,
    [string]$SourceSqlPath
  )

  Set-Stage -Stage "validate_location"
  if (-not (Test-Path -LiteralPath $CandidatePath -PathType Leaf)) { Throw-SafeError -Code "candidate_missing" }
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { Throw-SafeError -Code "manifest_missing" }
  if (-not (Test-Path -LiteralPath $ReadmePath -PathType Leaf)) { Throw-SafeError -Code "readme_missing" }
  if (Test-IsPathInsideDirectory -ChildPath $CandidatePath -ParentPath (Join-Path $RepoRoot "supabase\migrations")) {
    Throw-SafeError -Code "candidate_inside_active_migrations"
  }
  if (-not (Test-IsPathInsideDirectory -ChildPath $CandidatePath -ParentPath $BaselineDir)) {
    Throw-SafeError -Code "candidate_location_invalid"
  }
  $migrationCopies = @(Get-ChildItem -LiteralPath (Join-Path $RepoRoot "supabase\migrations") -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*candidate.sql" })
  if ($migrationCopies.Count -ne 0) { Throw-SafeError -Code "candidate_copy_inside_migrations" }

  Set-Stage -Stage "validate_integrity"
  $item = Get-Item -LiteralPath $CandidatePath
  if ($item.Length -le 0) { Throw-SafeError -Code "candidate_empty" }
  if ([System.IO.Path]::GetExtension($CandidatePath) -ne ".sql") { Throw-SafeError -Code "candidate_extension_invalid" }
  $manifest = Read-ManifestMap -ManifestPath $ManifestPath
  if (-not $manifest.ContainsKey("candidate_sha256") -or -not $manifest.ContainsKey("source_sha256")) {
    Throw-SafeError -Code "manifest_hash_missing"
  }
  $candidateHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $CandidatePath).Hash
  if (-not [string]::Equals($candidateHash, $manifest["candidate_sha256"], [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "candidate_hash_mismatch"
  }
  if ([string]::Equals($candidateHash, $manifest["source_sha256"], [System.StringComparison]::OrdinalIgnoreCase)) {
    Throw-SafeError -Code "source_candidate_hash_unexpected_match"
  }
  $manifestText = Get-Content -LiteralPath $ManifestPath -Raw
  if ($manifestText -match "[A-Za-z]:\\" -or
      $manifestText -match "(?i)PGPASSWORD|password\s*=|postgresql://|postgres://|\bbearer\s+\S+|PRIVATE_KEY|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY") {
    Throw-SafeError -Code "manifest_sensitive_material_detected"
  }

  Set-Stage -Stage "analyze_sql"
  $analysis = Get-SqlAnalysis -SqlPath $CandidatePath

  Set-Stage -Stage "validate_meta_commands"
  Assert-Zero -Value $analysis.restrict -Code "restrict_meta_command_detected"
  Assert-Zero -Value $analysis.unrestrict -Code "unrestrict_meta_command_detected"
  Assert-Zero -Value $analysis.other_meta -Code "other_psql_meta_command_detected"

  Set-Stage -Stage "validate_data_and_ddl"
  Assert-Zero -Value $analysis.copy_from_stdin -Code "copy_from_stdin_detected"
  Assert-Zero -Value $analysis.insert_into -Code "insert_into_detected"
  Assert-Zero -Value $analysis.copy_terminator -Code "copy_terminator_detected"
  Assert-Zero -Value $analysis.create_database -Code "create_database_detected"
  Assert-Zero -Value $analysis.drop_database -Code "drop_database_detected"
  Assert-Zero -Value $analysis.drop_schema -Code "drop_schema_detected"
  Assert-Zero -Value $analysis.drop_table -Code "drop_table_detected"
  Assert-Zero -Value $analysis.truncate -Code "truncate_detected"

  Set-Stage -Stage "validate_sensitive_indicators"
  Assert-Zero -Value $analysis.postgresql_uri -Code "postgresql_uri_detected"
  Assert-Zero -Value $analysis.postgres_uri -Code "postgres_uri_detected"
  Assert-Zero -Value $analysis.password_assignment -Code "password_assignment_detected"
  Assert-Zero -Value $analysis.bearer_token -Code "bearer_token_detected"
  Assert-Zero -Value $analysis.jwt_like -Code "jwt_like_detected"
  Assert-Zero -Value $analysis.openai_key_like -Code "openai_key_like_detected"
  Assert-Zero -Value $analysis.supabase_service_role_key_name -Code "supabase_service_role_key_name_detected"
  Assert-Zero -Value $analysis.service_role_key_name -Code "service_role_key_name_detected"
  Assert-Zero -Value $analysis.private_key_name -Code "private_key_name_detected"

  Set-Stage -Stage "validate_counts"
  if ($analysis.tables -ne $script:ExpectedTableCount) { Throw-SafeError -Code "table_count_invalid" }
  if ($analysis.functions_or_procedures -ne $script:ExpectedFunctionOrProcedureCount) { Throw-SafeError -Code "function_count_invalid" }
  if ($analysis.indexes -ne $script:ExpectedIndexCount) { Throw-SafeError -Code "index_count_invalid" }
  if ($analysis.triggers -ne $script:ExpectedTriggerCount) { Throw-SafeError -Code "trigger_count_invalid" }
  if ($analysis.policies -ne $script:ExpectedPolicyCount) { Throw-SafeError -Code "policy_count_invalid" }
  if ($analysis.enable_rls -ne $script:ExpectedEnableRlsCount) { Throw-SafeError -Code "enable_rls_count_invalid" }
  if ($analysis.grants -ne $script:ExpectedGrantCount) { Throw-SafeError -Code "grant_count_invalid" }
  if ($analysis.revokes -ne $script:ExpectedRevokeCount) { Throw-SafeError -Code "revoke_count_invalid" }

  Set-Stage -Stage "validate_structure"
  if (-not $analysis.public_definition) { Throw-SafeError -Code "public_definition_missing" }
  if (-not $analysis.create_table_public) { Throw-SafeError -Code "create_table_public_missing" }
  if (-not $analysis.dollar_quotes_balanced) { Throw-SafeError -Code "dollar_quotes_unbalanced" }
  Assert-Zero -Value $analysis.nul_bytes -Code "nul_bytes_detected"
  if (-not $analysis.ends_with_newline) { Throw-SafeError -Code "final_newline_missing" }
  Assert-Zero -Value $analysis.data_markers -Code "sql_data_marker_detected"
  Assert-Zero -Value $analysis.production_safe_header -Code "production_safe_header_detected"

  Set-Stage -Stage "validate_manifest"
  Assert-ManifestValue -Manifest $manifest -Key "active_migration" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "safe_to_apply_production" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "safe_to_apply_staging" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "requires_isolated_restore_test" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "migration_lineage_decision_required" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "manual_review_required" -Expected "true"
  Assert-ManifestValue -Manifest $manifest -Key "data_rows_exported" -Expected "false"
  Assert-ManifestValue -Manifest $manifest -Key "byte_preserving_transformation" -Expected "true" -Code "manifest_byte_preserving_marker_invalid"
  Assert-ManifestValue -Manifest $manifest -Key "transformation" -Expected "byte_preserving_remove_psql_restrict_unrestrict_only" -Code "manifest_byte_preserving_marker_invalid"
  Assert-ManifestValue -Manifest $manifest -Key "line_endings_preserved" -Expected "true" -Code "manifest_line_endings_marker_invalid"
  Assert-ManifestValue -Manifest $manifest -Key "removed_restrict_lines" -Expected "1" -Code "manifest_removed_line_counts_invalid"
  Assert-ManifestValue -Manifest $manifest -Key "removed_unrestrict_lines" -Expected "1" -Code "manifest_removed_line_counts_invalid"
  Assert-ManifestValue -Manifest $manifest -Key "unauthorized_byte_differences" -Expected "0" -Code "manifest_byte_preserving_marker_invalid"
  Assert-ManifestNumericValue -Manifest $manifest -Key "candidate_size_bytes" -Expected $item.Length -Code "manifest_size_fields_invalid"
  Assert-ManifestNumericValue -Manifest $manifest -Key "actual_candidate_size_bytes" -Expected $item.Length -Code "manifest_size_fields_invalid"
  $candidateHasBomActual = Test-HasUtf8Bom -Bytes ([System.IO.File]::ReadAllBytes($CandidatePath))
  Assert-ManifestValue -Manifest $manifest -Key "candidate_utf8_bom" -Expected ([string]$candidateHasBomActual).ToLowerInvariant() -Code "manifest_byte_preserving_marker_invalid"

  $byteEquivalence = $null
  if (-not [string]::IsNullOrWhiteSpace($SourceSqlPath)) {
    Set-Stage -Stage "validate_byte_preserving_equivalence"
    $byteEquivalence = Assert-BytePreservingEquivalence -SourcePath $SourceSqlPath -CandidatePath $CandidatePath
    Assert-ManifestValue -Manifest $manifest -Key "source_utf8_bom" -Expected ([string]$byteEquivalence.SourceHasBom).ToLowerInvariant() -Code "manifest_byte_preserving_marker_invalid"
    Assert-ManifestValue -Manifest $manifest -Key "candidate_utf8_bom" -Expected ([string]$byteEquivalence.CandidateHasBom).ToLowerInvariant() -Code "manifest_byte_preserving_marker_invalid"
    Assert-ManifestNumericValue -Manifest $manifest -Key "expected_candidate_size_bytes" -Expected $byteEquivalence.ExpectedCandidateSizeBytes -Code "manifest_size_fields_invalid"
    Assert-ManifestNumericValue -Manifest $manifest -Key "actual_candidate_size_bytes" -Expected $byteEquivalence.ActualCandidateSizeBytes -Code "manifest_size_fields_invalid"
  } else {
    Assert-ManifestValue -Manifest $manifest -Key "source_utf8_bom" -Expected $manifest["candidate_utf8_bom"] -Code "manifest_byte_preserving_marker_invalid"
    Assert-ManifestNumericValue -Manifest $manifest -Key "expected_candidate_size_bytes" -Expected $item.Length -Code "manifest_size_fields_invalid"
  }

  return [pscustomobject]@{
    Manifest = $manifest
    Analysis = $analysis
    ByteEquivalence = $byteEquivalence
  }
}

function New-ValidFixtureSql {
  $lines = New-Object System.Collections.Generic.List[string]
  for ($i = 1; $i -le $script:ExpectedTableCount; $i += 1) {
    [void]$lines.Add("CREATE TABLE public.fixture_table_$i (id integer);")
  }
  for ($i = 1; $i -le $script:ExpectedFunctionOrProcedureCount; $i += 1) {
    [void]$lines.Add("CREATE FUNCTION public.fixture_function_$i() RETURNS void")
    [void]$lines.Add("LANGUAGE plpgsql")
    [void]$lines.Add("AS `$function`$")
    [void]$lines.Add("BEGIN")
    if ($i -eq 1) {
      [void]$lines.Add("  INSERT INTO public.fixture_table_1 VALUES (1);")
    } else {
      [void]$lines.Add("  NULL;")
    }
    [void]$lines.Add("END;")
    [void]$lines.Add("`$function`$;")
  }
  for ($i = 1; $i -le $script:ExpectedIndexCount; $i += 1) {
    [void]$lines.Add("CREATE INDEX fixture_index_$i ON public.fixture_table_1 (id);")
  }
  for ($i = 1; $i -le $script:ExpectedTriggerCount; $i += 1) {
    [void]$lines.Add("CREATE TRIGGER fixture_trigger_$i BEFORE INSERT ON public.fixture_table_1 FOR EACH ROW EXECUTE FUNCTION public.fixture_function_1();")
  }
  for ($i = 1; $i -le $script:ExpectedPolicyCount; $i += 1) {
    [void]$lines.Add("CREATE POLICY fixture_policy_$i ON public.fixture_table_1 FOR SELECT USING (true);")
  }
  for ($i = 1; $i -le $script:ExpectedEnableRlsCount; $i += 1) {
    [void]$lines.Add("ALTER TABLE public.fixture_table_$i ENABLE ROW LEVEL SECURITY;")
  }
  for ($i = 1; $i -le $script:ExpectedGrantCount; $i += 1) {
    [void]$lines.Add("GRANT SELECT ON TABLE public.fixture_table_1 TO authenticated;")
  }
  for ($i = 1; $i -le $script:ExpectedRevokeCount; $i += 1) {
    [void]$lines.Add("REVOKE ALL ON TABLE public.fixture_table_1 FROM PUBLIC;")
  }
  return @($lines.ToArray())
}

function New-TestManifest {
  param(
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$CandidatePath,
    [string]$SafeProduction = "false",
    [string]$SourcePath
  )

  $candidateHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $CandidatePath).Hash
  $sourceHash = ("0" * 64)
  $candidateBytes = [System.IO.File]::ReadAllBytes($CandidatePath)
  $candidateHasBom = Test-HasUtf8Bom -Bytes $candidateBytes
  $sourceHasBom = $candidateHasBom
  $size = (Get-Item -LiteralPath $CandidatePath).Length
  $expectedSize = $size
  $actualSize = $size
  $removedRestrictLines = 1
  $removedUnrestrictLines = 1
  if (-not [string]::IsNullOrWhiteSpace($SourcePath)) {
    $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $SourcePath).Hash
    $expectedInfo = Get-ExpectedCandidateFromSource -SourcePath $SourcePath
    $sourceHasBom = $expectedInfo.SourceHasBom
    $expectedSize = $expectedInfo.ExpectedSize
    $removedRestrictLines = $expectedInfo.RestrictCount
    $removedUnrestrictLines = $expectedInfo.UnrestrictCount
  }
  $manifest = @(
    "artifact_type=staging_baseline_candidate"
    "source_type=validated_schema_only_dump"
    "source_hash_match=true"
    "byte_preserving_transformation=true"
    "line_endings_preserved=true"
    "source_utf8_bom=$(([string]$sourceHasBom).ToLowerInvariant())"
    "candidate_utf8_bom=$(([string]$candidateHasBom).ToLowerInvariant())"
    "transformation=byte_preserving_remove_psql_restrict_unrestrict_only"
    "source_restrict_count=1"
    "source_unrestrict_count=1"
    "candidate_restrict_count=0"
    "candidate_unrestrict_count=0"
    "other_psql_meta_commands=0"
    "removed_restrict_lines=$removedRestrictLines"
    "removed_unrestrict_lines=$removedUnrestrictLines"
    "unauthorized_byte_differences=0"
    "expected_candidate_size_bytes=$expectedSize"
    "actual_candidate_size_bytes=$actualSize"
    "data_rows_exported=false"
    "manual_review_required=true"
    "active_migration=false"
    "safe_to_apply_production=$SafeProduction"
    "safe_to_apply_staging=false"
    "requires_isolated_restore_test=true"
    "migration_lineage_decision_required=true"
    "source_sha256=$sourceHash"
    "candidate_sha256=$candidateHash"
    "candidate_size_bytes=$size"
    "generated_utc=2026-01-01T00:00:00.0000000Z"
    "create_table_count=$script:ExpectedTableCount"
    "create_function_or_procedure_count=$script:ExpectedFunctionOrProcedureCount"
    "create_index_count=$script:ExpectedIndexCount"
    "create_trigger_count=$script:ExpectedTriggerCount"
    "create_policy_count=$script:ExpectedPolicyCount"
    "enable_rls_count=$script:ExpectedEnableRlsCount"
    "grant_count=$script:ExpectedGrantCount"
    "revoke_count=$script:ExpectedRevokeCount"
    "suspicious_indicator_count=0"
  )
  Set-Content -LiteralPath $ManifestPath -Value $manifest -Encoding UTF8
}

function Invoke-ExpectFailure {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock
  )

  try {
    & $ScriptBlock | Out-Null
    throw "Expected self-test failure did not occur."
  } catch {
    $reason = Get-SafeReason -ErrorRecord $_
    if ($reason -eq "unexpected_failure") {
      throw "Unexpected self-test failure reason."
    }
  }
}

function New-SourceFixtureBytes {
  param(
    [Parameter(Mandatory = $true)][string]$LineEnding,
    [bool]$UseBom,
    [bool]$IncludeFinalNewline = $true,
    [int]$ExtraRestrictLines = 0,
    [bool]$OmitUnrestrict
  )

  $lines = New-Object System.Collections.Generic.List[string]
  [void]$lines.Add("\restrict synthetic")
  for ($i = 0; $i -lt $ExtraRestrictLines; $i += 1) {
    [void]$lines.Add("\restrict duplicate")
  }
  [void]$lines.AddRange([string[]](New-ValidFixtureSql))
  if (-not $OmitUnrestrict) {
    [void]$lines.Add("\unrestrict synthetic")
  }

  $text = [string]::Join($LineEnding, $lines.ToArray())
  if ($IncludeFinalNewline) {
    $text += $LineEnding
  }

  $payload = [System.Text.Encoding]::UTF8.GetBytes($text)
  if (-not $UseBom) {
    return $payload
  }

  $withBom = New-Object System.Collections.Generic.List[byte]
  $withBom.AddRange([byte[]]@(0xEF, 0xBB, 0xBF))
  $withBom.AddRange($payload)
  return $withBom.ToArray()
}

function Write-Bytes {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][byte[]]$Bytes
  )
  [System.IO.File]::WriteAllBytes($Path, $Bytes)
}

function Write-CandidateFromSource {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$CandidatePath
  )
  $expected = Get-ExpectedCandidateFromSource -SourcePath $SourcePath
  Write-Bytes -Path $CandidatePath -Bytes $expected.ExpectedBytes
}

function Invoke-SelfTest {
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-baseline-selftest-" + [Guid]::NewGuid().ToString("N"))
  $savedCounts = @{
    Tables = $script:ExpectedTableCount
    Functions = $script:ExpectedFunctionOrProcedureCount
    Indexes = $script:ExpectedIndexCount
    Triggers = $script:ExpectedTriggerCount
    Policies = $script:ExpectedPolicyCount
    EnableRls = $script:ExpectedEnableRlsCount
    Grants = $script:ExpectedGrantCount
    Revokes = $script:ExpectedRevokeCount
  }
  try {
    $script:ExpectedTableCount = 5
    $script:ExpectedFunctionOrProcedureCount = 5
    $script:ExpectedIndexCount = 5
    $script:ExpectedTriggerCount = 3
    $script:ExpectedPolicyCount = 3
    $script:ExpectedEnableRlsCount = 4
    $script:ExpectedGrantCount = 5
    $script:ExpectedRevokeCount = 3

    $repoRoot = $tempRoot
    $baselineDir = Join-Path $repoRoot "scripts\staging\baseline-candidate"
    $migrationsDir = Join-Path $repoRoot "supabase\migrations"
    New-Item -ItemType Directory -Force -Path $baselineDir | Out-Null
    New-Item -ItemType Directory -Force -Path $migrationsDir | Out-Null
    $readme = Join-Path $baselineDir "README.txt"
    Set-Content -LiteralPath $readme -Value "SelfTest quarantine README" -Encoding UTF8

    foreach ($case in @(
        @{ Name = "lf-no-bom"; Ending = "`n"; Bom = $false },
        @{ Name = "crlf-no-bom"; Ending = "`r`n"; Bom = $false },
        @{ Name = "lf-bom"; Ending = "`n"; Bom = $true },
        @{ Name = "crlf-bom"; Ending = "`r`n"; Bom = $true }
      )) {
      $sourcePath = Join-Path $baselineDir ("source-" + $case.Name + ".sql")
      $candidatePath = Join-Path $baselineDir ("candidate-" + $case.Name + ".sql")
      $manifestPath = Join-Path $baselineDir ("manifest-" + $case.Name + ".txt")
      Write-Bytes -Path $sourcePath -Bytes (New-SourceFixtureBytes -LineEnding $case.Ending -UseBom $case.Bom)
      Write-CandidateFromSource -SourcePath $sourcePath -CandidatePath $candidatePath
      New-TestManifest -ManifestPath $manifestPath -CandidatePath $candidatePath -SourcePath $sourcePath
      Assert-BaselineCandidate -CandidatePath $candidatePath -ManifestPath $manifestPath -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $sourcePath | Out-Null
    }

    $finalNewlineSource = Join-Path $baselineDir "source-final-newline.sql"
    $finalNewlineCandidate = Join-Path $baselineDir "candidate-final-newline.sql"
    $finalNewlineManifest = Join-Path $baselineDir "manifest-final-newline.txt"
    Write-Bytes -Path $finalNewlineSource -Bytes (New-SourceFixtureBytes -LineEnding "`n" -UseBom $false -IncludeFinalNewline $true)
    Write-CandidateFromSource -SourcePath $finalNewlineSource -CandidatePath $finalNewlineCandidate
    New-TestManifest -ManifestPath $finalNewlineManifest -CandidatePath $finalNewlineCandidate -SourcePath $finalNewlineSource
    Assert-BaselineCandidate -CandidatePath $finalNewlineCandidate -ManifestPath $finalNewlineManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $finalNewlineSource | Out-Null

    $lineEndingSource = Join-Path $baselineDir "source-line-ending.sql"
    $lineEndingCandidate = Join-Path $baselineDir "candidate-line-ending.sql"
    $lineEndingManifest = Join-Path $baselineDir "manifest-line-ending.txt"
    Write-Bytes -Path $lineEndingSource -Bytes (New-SourceFixtureBytes -LineEnding "`n" -UseBom $false)
    $lineEndingInfo = Get-ExpectedCandidateFromSource -SourcePath $lineEndingSource
    $lineEndingText = [System.Text.Encoding]::UTF8.GetString($lineEndingInfo.ExpectedBytes).Replace("`n", "`r`n")
    Write-Bytes -Path $lineEndingCandidate -Bytes ([System.Text.Encoding]::UTF8.GetBytes($lineEndingText))
    New-TestManifest -ManifestPath $lineEndingManifest -CandidatePath $lineEndingCandidate -SourcePath $lineEndingSource
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $lineEndingCandidate -ManifestPath $lineEndingManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $lineEndingSource }

    $bomAddedSource = Join-Path $baselineDir "source-bom-added.sql"
    $bomAddedCandidate = Join-Path $baselineDir "candidate-bom-added.sql"
    $bomAddedManifest = Join-Path $baselineDir "manifest-bom-added.txt"
    Write-Bytes -Path $bomAddedSource -Bytes (New-SourceFixtureBytes -LineEnding "`n" -UseBom $false)
    $bomAddedInfo = Get-ExpectedCandidateFromSource -SourcePath $bomAddedSource
    $bomAddedBytes = New-Object System.Collections.Generic.List[byte]
    $bomAddedBytes.AddRange([byte[]]@(0xEF, 0xBB, 0xBF))
    $bomAddedBytes.AddRange([byte[]]$bomAddedInfo.ExpectedBytes)
    Write-Bytes -Path $bomAddedCandidate -Bytes $bomAddedBytes.ToArray()
    New-TestManifest -ManifestPath $bomAddedManifest -CandidatePath $bomAddedCandidate -SourcePath $bomAddedSource
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $bomAddedCandidate -ManifestPath $bomAddedManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $bomAddedSource }

    $alteredSource = Join-Path $baselineDir "source-altered-byte.sql"
    $alteredCandidate = Join-Path $baselineDir "candidate-altered-byte.sql"
    $alteredManifest = Join-Path $baselineDir "manifest-altered-byte.txt"
    Write-Bytes -Path $alteredSource -Bytes (New-SourceFixtureBytes -LineEnding "`n" -UseBom $false)
    Write-CandidateFromSource -SourcePath $alteredSource -CandidatePath $alteredCandidate
    $alteredBytes = [System.IO.File]::ReadAllBytes($alteredCandidate)
    for ($i = 0; $i -lt $alteredBytes.Length; $i += 1) {
      if ($alteredBytes[$i] -eq 97) {
        $alteredBytes[$i] = 65
        break
      }
    }
    Write-Bytes -Path $alteredCandidate -Bytes $alteredBytes
    New-TestManifest -ManifestPath $alteredManifest -CandidatePath $alteredCandidate -SourcePath $alteredSource
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $alteredCandidate -ManifestPath $alteredManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $alteredSource }

    $sizeSource = Join-Path $baselineDir "source-size.sql"
    $sizeCandidate = Join-Path $baselineDir "candidate-size.sql"
    $sizeManifest = Join-Path $baselineDir "manifest-size.txt"
    Write-Bytes -Path $sizeSource -Bytes (New-SourceFixtureBytes -LineEnding "`n" -UseBom $false)
    Write-CandidateFromSource -SourcePath $sizeSource -CandidatePath $sizeCandidate
    New-TestManifest -ManifestPath $sizeManifest -CandidatePath $sizeCandidate -SourcePath $sizeSource
    (Get-Content -LiteralPath $sizeManifest) -replace "^actual_candidate_size_bytes=.*$", "actual_candidate_size_bytes=1" |
      Set-Content -LiteralPath $sizeManifest -Encoding UTF8
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $sizeCandidate -ManifestPath $sizeManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $sizeSource }

    $extraRestrictSource = Join-Path $baselineDir "source-extra-restrict.sql"
    $extraRestrictCandidate = Join-Path $baselineDir "candidate-extra-restrict.sql"
    $extraRestrictManifest = Join-Path $baselineDir "manifest-extra-restrict.txt"
    Write-Bytes -Path $extraRestrictSource -Bytes (New-SourceFixtureBytes -LineEnding "`n" -UseBom $false -ExtraRestrictLines 1)
    Write-Bytes -Path $extraRestrictCandidate -Bytes ([System.Text.Encoding]::UTF8.GetBytes(([string]::Join("`n", (New-ValidFixtureSql)) + "`n")))
    New-TestManifest -ManifestPath $extraRestrictManifest -CandidatePath $extraRestrictCandidate
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $extraRestrictCandidate -ManifestPath $extraRestrictManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $extraRestrictSource }

    $missingUnrestrictSource = Join-Path $baselineDir "source-missing-unrestrict.sql"
    $missingUnrestrictCandidate = Join-Path $baselineDir "candidate-missing-unrestrict.sql"
    $missingUnrestrictManifest = Join-Path $baselineDir "manifest-missing-unrestrict.txt"
    Write-Bytes -Path $missingUnrestrictSource -Bytes (New-SourceFixtureBytes -LineEnding "`n" -UseBom $false -OmitUnrestrict $true)
    Write-Bytes -Path $missingUnrestrictCandidate -Bytes ([System.Text.Encoding]::UTF8.GetBytes(([string]::Join("`n", (New-ValidFixtureSql)) + "`n")))
    New-TestManifest -ManifestPath $missingUnrestrictManifest -CandidatePath $missingUnrestrictCandidate
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $missingUnrestrictCandidate -ManifestPath $missingUnrestrictManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $missingUnrestrictSource }

    $validSql = Join-Path $baselineDir "public-schema-baseline.candidate.sql"
    Set-Content -LiteralPath $validSql -Value (New-ValidFixtureSql) -Encoding UTF8
    $validManifest = Join-Path $baselineDir "public-schema-baseline.candidate.manifest.txt"
    New-TestManifest -ManifestPath $validManifest -CandidatePath $validSql
    Assert-BaselineCandidate -CandidatePath $validSql -ManifestPath $validManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir | Out-Null

    $copySql = Join-Path $baselineDir "copy.candidate.sql"
    Set-Content -LiteralPath $copySql -Value ((New-ValidFixtureSql) + @("COPY public.fixture_table_1 (id) FROM stdin;")) -Encoding UTF8
    $copyManifest = Join-Path $baselineDir "copy.manifest.txt"
    New-TestManifest -ManifestPath $copyManifest -CandidatePath $copySql
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $copySql -ManifestPath $copyManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }

    $insertSql = Join-Path $baselineDir "insert.candidate.sql"
    Set-Content -LiteralPath $insertSql -Value ((New-ValidFixtureSql) + @("INSERT INTO public.fixture_table_1 VALUES (1);")) -Encoding UTF8
    $insertManifest = Join-Path $baselineDir "insert.manifest.txt"
    New-TestManifest -ManifestPath $insertManifest -CandidatePath $insertSql
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $insertSql -ManifestPath $insertManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }

    $dropSql = Join-Path $baselineDir "drop.candidate.sql"
    Set-Content -LiteralPath $dropSql -Value ((New-ValidFixtureSql) + @("DROP TABLE public.fixture_table_1;")) -Encoding UTF8
    $dropManifest = Join-Path $baselineDir "drop.manifest.txt"
    New-TestManifest -ManifestPath $dropManifest -CandidatePath $dropSql
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $dropSql -ManifestPath $dropManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }

    $secretSql = Join-Path $baselineDir "secret.candidate.sql"
    $secretLines = New-ValidFixtureSql
    $secretLines[54] = "  PERFORM 'SUPABASE_SERVICE_ROLE_KEY';"
    Set-Content -LiteralPath $secretSql -Value $secretLines -Encoding UTF8
    $secretManifest = Join-Path $baselineDir "secret.manifest.txt"
    New-TestManifest -ManifestPath $secretManifest -CandidatePath $secretSql
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $secretSql -ManifestPath $secretManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }

    $commentSql = Join-Path $baselineDir "comment.candidate.sql"
    Set-Content -LiteralPath $commentSql -Value (@("-- SUPABASE_SERVICE_ROLE_KEY") + (New-ValidFixtureSql)) -Encoding UTF8
    $commentManifest = Join-Path $baselineDir "comment.manifest.txt"
    New-TestManifest -ManifestPath $commentManifest -CandidatePath $commentSql
    Assert-BaselineCandidate -CandidatePath $commentSql -ManifestPath $commentManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir | Out-Null

    $metaSql = Join-Path $baselineDir "meta.candidate.sql"
    Set-Content -LiteralPath $metaSql -Value (@("\connect synthetic") + (New-ValidFixtureSql)) -Encoding UTF8
    $metaManifest = Join-Path $baselineDir "meta.manifest.txt"
    New-TestManifest -ManifestPath $metaManifest -CandidatePath $metaSql
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $metaSql -ManifestPath $metaManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }

    $restrictSql = Join-Path $baselineDir "restrict.candidate.sql"
    Set-Content -LiteralPath $restrictSql -Value (@("\restrict synthetic") + (New-ValidFixtureSql) + @("\unrestrict synthetic")) -Encoding UTF8
    $restrictManifest = Join-Path $baselineDir "restrict.manifest.txt"
    New-TestManifest -ManifestPath $restrictManifest -CandidatePath $restrictSql
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $restrictSql -ManifestPath $restrictManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }

    $badHashManifest = Join-Path $baselineDir "bad-hash.manifest.txt"
    New-TestManifest -ManifestPath $badHashManifest -CandidatePath $validSql
    (Get-Content -LiteralPath $badHashManifest) -replace "^candidate_sha256=.*$", ("candidate_sha256=" + ("1" * 64)) |
      Set-Content -LiteralPath $badHashManifest -Encoding UTF8
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $validSql -ManifestPath $badHashManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }

    $unsafeManifest = Join-Path $baselineDir "unsafe.manifest.txt"
    New-TestManifest -ManifestPath $unsafeManifest -CandidatePath $validSql -SafeProduction "true"
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $validSql -ManifestPath $unsafeManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }

    $migrationCandidate = Join-Path $migrationsDir "bad-baseline.candidate.sql"
    Set-Content -LiteralPath $migrationCandidate -Value (New-ValidFixtureSql) -Encoding UTF8
    $migrationManifest = Join-Path $baselineDir "migration-location.manifest.txt"
    New-TestManifest -ManifestPath $migrationManifest -CandidatePath $migrationCandidate
    Invoke-ExpectFailure { Assert-BaselineCandidate -CandidatePath $migrationCandidate -ManifestPath $migrationManifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir }
  } finally {
    $script:ExpectedTableCount = $savedCounts.Tables
    $script:ExpectedFunctionOrProcedureCount = $savedCounts.Functions
    $script:ExpectedIndexCount = $savedCounts.Indexes
    $script:ExpectedTriggerCount = $savedCounts.Triggers
    $script:ExpectedPolicyCount = $savedCounts.Policies
    $script:ExpectedEnableRlsCount = $savedCounts.EnableRls
    $script:ExpectedGrantCount = $savedCounts.Grants
    $script:ExpectedRevokeCount = $savedCounts.Revokes
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  if ($SelfTest) {
    Set-Stage -Stage "self_test"
    Invoke-SelfTest
    Set-Stage -Stage "completed"
    Write-Output "SELF_TEST_OK"
    exit 0
  }

  $repoRoot = Get-NormalizedFullPath -PathValue (Join-Path $PSScriptRoot "..\..")
  $baselineDir = Join-Path $PSScriptRoot "baseline-candidate"
  $candidate = Join-Path $baselineDir "public-schema-baseline.candidate.sql"
  $manifest = Join-Path $baselineDir "public-schema-baseline.candidate.manifest.txt"
  $readme = Join-Path $baselineDir "README.txt"

  $result = Assert-BaselineCandidate -CandidatePath $candidate -ManifestPath $manifest -ReadmePath $readme -RepoRoot $repoRoot -BaselineDir $baselineDir -SourceSqlPath $SourceSqlPath
  $manifestMap = $result.Manifest

  Set-Stage -Stage "completed"
  Write-Output "BASELINE_CANDIDATE_VALID"
  if ($null -ne $result.ByteEquivalence) {
    Write-Output "byte_equivalent_after_authorized_removal=true"
    Write-Output "line_endings_preserved=true"
    Write-Output "unauthorized_byte_differences=0"
  }
  Write-Output "active_migration=$($manifestMap["active_migration"])"
  Write-Output "safe_to_apply_production=$($manifestMap["safe_to_apply_production"])"
  Write-Output "safe_to_apply_staging=$($manifestMap["safe_to_apply_staging"])"
  Write-Output "requires_isolated_restore_test=$($manifestMap["requires_isolated_restore_test"])"
  Write-Output "migration_lineage_decision_required=$($manifestMap["migration_lineage_decision_required"])"
  exit 0
} catch {
  $reason = Get-SafeReason -ErrorRecord $_
  Write-Output "BASELINE_CANDIDATE_INVALID"
  Write-Output "stage=$currentStage"
  Write-Output "reason=$reason"
  exit 1
}
