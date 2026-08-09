param(
    [switch]$Think,          # show the full latest thinking block
    [string]$Name,           # filter to agents whose filename matches this substring
    [int]$Thresh = 12        # minutes since last write; recent = active (high enough for long xhigh calls)
)

$now = Get-Date
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Write-Host "`n  AGENT DASHBOARD  $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
Write-Host ("  " + "-"*70) -ForegroundColor DarkGray

$all = Get-ChildItem ".claude\agent-runs\*.md" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending
if ($Name) { $all = $all | Where-Object { $_.Name -like "*$Name*" } }
if (-not $all) { Write-Host "  (no agent runs found)" -ForegroundColor Yellow; return }

function Get-LatestThought($f) {
    # returns the full text of the most recent "### [N] thinking" block
    $c = Get-Content $f.FullName -Encoding UTF8
    $idx = ($c | Select-String -Pattern '^###\s+\[\d+\]\s+thinking' | Select-Object -Last 1).LineNumber
    if (-not $idx) { return $null }
    $start = $idx        # line after the header (1-based LineNumber == 0-based next index)
    $lines = @()
    for ($j = $start; $j -lt $c.Count; $j++) {
        # stop at the next block header (### [N] ... or _[N] calling ...)
        if ($c[$j] -match '^###\s+\[\d+\]' -or $c[$j] -match '^_\[\d+\] calling') { break }
        $lines += $c[$j]
    }
    $step = ($c[$idx-1] -replace '^###\s+\[(\d+)\].*','$1')
    return [pscustomobject]@{ Step = $step; Text = ($lines -join "`n").Trim() }
}

function Get-AgentState($f) {
    $tail = Get-Content $f.FullName -Encoding UTF8 -Tail 50 -ErrorAction SilentlyContinue
    $nonEmpty = $tail | Where-Object { $_.Trim() -ne "" }
    $age = [int]($now - $f.LastWriteTime).TotalMinutes

    $footer = $nonEmpty | Where-Object { $_ -match 'tok sent\s*/\s*.*tok returned' } | Select-Object -Last 1
    $lastLine = $nonEmpty | Select-Object -Last 1
    $isDone = ($footer -and $lastLine -match 'tok sent\s*/\s*.*tok returned')

    # Waiting on model: the final content line is an unanswered "calling ..." request
    $waitingModel = $null
    if ($lastLine -match '^_\[(\d+)\] calling\s+(\S+)\s+\(attempt\s+(\d+)/(\d+),\s*(\d+)\s*msgs,\s*~?([\d,]+)\s*bytes') {
        $waitingModel = [pscustomobject]@{
            Step=$Matches[1]; Model=$Matches[2]; Attempt=$Matches[3]; Max=$Matches[4]
            Msgs=$Matches[5]; Bytes=$Matches[6]
        }
    }

    $action = "(no recorded action)"
    $kind   = "idle"
    for ($i = $tail.Count - 1; $i -ge 0; $i--) {
        $line = $tail[$i]
        if ($line -match '^_\[(\d+)\] calling\s+(\S+)') {
            $action = "waiting on $($Matches[2])  (step $($Matches[1]))"
            $kind = "thinking"; break
        }
        elseif ($line -match '^###\s+\[(\d+)\]\s+thinking') {
            $thought = ""
            for ($j = $i + 1; $j -lt $tail.Count; $j++) {
                if ($tail[$j].Trim() -ne "") { $thought = $tail[$j].Trim(); break }
            }
            if ($thought.Length -gt 60) { $thought = $thought.Substring(0,57) + "..." }
            $action = "thinking (step $($Matches[1])): $thought"
            $kind = "thinking"; break
        }
        elseif ($line -match '^###\s+\[(\d+)\]\s+([a-z_]+)\(') {
            $tool = $Matches[2]; $step = $Matches[1]
            $path = ""
            if ($line -match '"path"\s*:\s*"([^"]+)"')    { $path = $Matches[1] }
            elseif ($line -match '"pattern"\s*:\s*"([^"]+)"') { $path = "/$($Matches[1])/" }
            elseif ($line -match '"command"\s*:\s*"([^"]+)"') { $path = $Matches[1] }
            if ($path.Length -gt 45) { $path = "..." + $path.Substring($path.Length-42) }
            $action = "$tool  $path  (step $step)"
            $kind = "acting"; break
        }
    }

    # --- Tool-call stats over the WHOLE file ---
    $full = Get-Content $f.FullName -Encoding UTF8
    $toolHeaders = @($full | Select-String -Pattern '^###\s+\[\d+\]\s+([a-z_]+)\(')
    $toolCount = $toolHeaders.Count
    $toolTally = $toolHeaders | ForEach-Object { $_.Matches[0].Groups[1].Value } |
        Group-Object | Sort-Object Count -Descending
    $toolSummary = ($toolTally | ForEach-Object { "$($_.Name):$($_.Count)" }) -join "  "

    # last tool call + its target argument
    $lastTool = "-"
    $lastToolLine = $toolHeaders | Select-Object -Last 1
    if ($lastToolLine) {
        $l = $lastToolLine.Line
        $tn = $lastToolLine.Matches[0].Groups[1].Value
        $arg = ""
        if     ($l -match '"path"\s*:\s*"([^"]+)"')    { $arg = $Matches[1] }
        elseif ($l -match '"file"\s*:\s*"([^"]+)"')    { $arg = $Matches[1] }
        elseif ($l -match '"command"\s*:\s*"([^"]+)"') { $arg = $Matches[1] }
        elseif ($l -match '"pattern"\s*:\s*"([^"]+)"') { $arg = "/$($Matches[1])/" }
        if ($arg.Length -gt 46) { $arg = "..." + $arg.Substring($arg.Length-43) }
        $stepNo = ($l -replace '^###\s+\[(\d+)\].*','$1')
        $lastTool = "$tn  $arg  (step $stepNo)"
    }

    # An explicit "finish" tool call is the agent's own completion signal,
    # even if the harness never wrote the token footer.
    $finished = ($lastToolLine -and $lastToolLine.Matches[0].Groups[1].Value -eq 'finish')

    if ($isDone -or $finished) {
        $status = "DONE "; $color = "DarkGray"
        if ($footer -match ':\s*(.+)\]$') { $action = $Matches[1] }
        elseif ($finished) { $action = "finished (step $stepNo)" }
        $isDone = $true
    }
    elseif ($waitingModel) {
        # Genuinely waiting on a model reply. attempt>1 means it is retrying (suspect).
        $w = $waitingModel
        $action = "waiting on $($w.Model)  attempt $($w.Attempt)/$($w.Max), $($w.Msgs) msgs, $($w.Bytes)B  (step $($w.Step))"
        if ([int]$w.Attempt -ge 2) { $status = "RETRY"; $color = "Magenta" }
        elseif ($age -le $Thresh)  { $status = "WAIT "; $color = "Cyan" }
        else                       { $status = "WAIT?"; $color = "Yellow" }  # long single call: probably fine, watch it
    }
    elseif ($age -le $Thresh) {
        if ($kind -eq "thinking") { $status = "THINK"; $color = "Cyan" }
        else                      { $status = "ACT  "; $color = "Green" }
    }
    else {
        $status = "STALE"; $color = "DarkYellow"
    }

    [pscustomobject]@{
        File = $f; Age = $age; Status = $status; Color = $color
        Action = $action; IsDone = $isDone
        ToolCount = $toolCount; ToolSummary = $toolSummary; LastTool = $lastTool
    }
}

$states = $all | ForEach-Object { Get-AgentState $_ }
# Active = recently written OR waiting/retrying on a model call (not done)
$activeStatuses = 'WAIT ','WAIT?','RETRY','THINK','ACT  '
$live = @($states | Where-Object { -not $_.IsDone -and ($_.Age -le $Thresh -or $activeStatuses -contains $_.Status) })
$idle = @($states | Where-Object { $_ -notin $live })

function Show-State($s) {
    $sizeKB = [math]::Round($s.File.Length / 1024)
    $label  = $s.File.BaseName -replace '^[\d]+-', ''
    if ($label.Length -gt 44) { $label = $label.Substring(0,44) }
    Write-Host ("  [{0}] {1,4}m {2,4}KB  {3}" -f $s.Status, $s.Age, $sizeKB, $label) -ForegroundColor $s.Color
    Write-Host ("            -> {0}" -f $s.Action) -ForegroundColor DarkGray
    Write-Host ("            tools: {0} total   last: {1}" -f $s.ToolCount, $s.LastTool) -ForegroundColor DarkGray
    if ($s.ToolSummary) {
        Write-Host ("               {0}" -f $s.ToolSummary) -ForegroundColor DarkGray
    }

    if ($Think) {
        $t = Get-LatestThought $s.File
        if ($t) {
            Write-Host ("            .. latest thought (step $($t.Step)):") -ForegroundColor DarkCyan
            foreach ($ln in ($t.Text -split "`n")) {
                Write-Host ("               $ln") -ForegroundColor Gray
            }
            Write-Host ""
        }
    }
}

if ($live.Count -gt 0) {
    Write-Host "`n  ACTIVE ($($live.Count))  -- written within ${Thresh}m" -ForegroundColor Green
    $live | Sort-Object Age | ForEach-Object { Show-State $_ }
} else {
    Write-Host "`n  No active agents (none written within ${Thresh}m)" -ForegroundColor Yellow
}

if (-not $Name) {
    Write-Host "`n  RECENT INACTIVE ($($idle.Count) total, last 5)" -ForegroundColor DarkCyan
    $idle | Sort-Object Age | Select-Object -First 5 | ForEach-Object { Show-State $_ }
} else {
    # when filtering by name, show all matches regardless of activity
    if ($idle.Count -gt 0) {
        Write-Host "`n  MATCHING INACTIVE ($($idle.Count))" -ForegroundColor DarkCyan
        $idle | Sort-Object Age | ForEach-Object { Show-State $_ }
    }
}

Write-Host ""

