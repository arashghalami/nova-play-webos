param(
    [string]$Name,           # optional: watch only agents whose filename matches this
    [int]$Idle = 12,         # minutes since last write to still consider "active/waiting"
    [int]$Interval = 2       # seconds between refreshes
)

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$spin = '|','/','-','\'
$si = 0
# remember last size per file so we can announce growth (= a reply just landed)
$lastSize = @{}
# remember when we first saw the current tail-signature (for a per-agent wait timer)
$waitSince = @{}

function Get-Snapshot {
    $files = Get-ChildItem ".claude\agent-runs\*.md" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    if ($Name) { $files = $files | Where-Object { $_.Name -like "*$Name*" } }

    $out = @()
    foreach ($f in $files) {
        $age = [int]((Get-Date) - $f.LastWriteTime).TotalMinutes
        $tail = Get-Content $f.FullName -Encoding UTF8 -Tail 30 -ErrorAction SilentlyContinue
        $ne = $tail | Where-Object { $_.Trim() -ne "" }
        $last = $ne | Select-Object -Last 1

        $done = ($last -match 'tok sent\s*/\s*.*tok returned')
        $calling = $null
        if ($last -match '^_\[(\d+)\] calling\s+(\S+)\s+\(attempt\s+(\d+)/(\d+),\s*(\d+)\s*msgs,\s*~?([\d,]+)\s*bytes') {
            $calling = [pscustomobject]@{ Step=$Matches[1]; Model=$Matches[2]; Attempt=$Matches[3]; Max=$Matches[4]; Msgs=$Matches[5]; Bytes=$Matches[6] }
        }

        # keep only agents that are working: not done, and (recent OR mid-call)
        if ($done) { continue }
        if ($age -gt $Idle -and -not $calling) { continue }

        # latest thinking snippet
        $thought = ""
        for ($i = $tail.Count-1; $i -ge 0; $i--) {
            if ($tail[$i] -match '^###\s+\[\d+\]\s+thinking') {
                for ($j=$i+1; $j -lt $tail.Count; $j++) { if ($tail[$j].Trim() -ne "") { $thought = $tail[$j].Trim(); break } }
                break
            }
        }

        $out += [pscustomobject]@{
            File=$f; Age=$age; Size=$f.Length; Done=$done; Calling=$calling
            Last=$last; Thought=$thought
        }
    }
    return $out
}

Write-Host "Watching agents (Ctrl+C to stop). Interval ${Interval}s.`n" -ForegroundColor Cyan

while ($true) {
    $snap = Get-Snapshot
    $procs = @(Get-Process -Name claude -ErrorAction SilentlyContinue)
    $cpuTotal = [int](($procs | Measure-Object -Property CPU -Sum).Sum)

    Clear-Host
    $sp = $spin[$si % 4]; $si++
    Write-Host ("  {0}  AGENT WATCH  {1}   claude procs: {2}  CPU(s): {3}" -f $sp, (Get-Date -Format 'HH:mm:ss'), $procs.Count, $cpuTotal) -ForegroundColor Cyan
    Write-Host ("  " + "-"*72) -ForegroundColor DarkGray

    if (-not $snap -or $snap.Count -eq 0) {
        Write-Host "  No active/waiting agents." -ForegroundColor Yellow
    }

    foreach ($s in $snap) {
        $key = $s.File.FullName
        $label = $s.File.BaseName -replace '^[\d]+-',''
        if ($label.Length -gt 40) { $label = $label.Substring(0,40) }

        # detect growth since last tick
        $grew = $false
        if ($lastSize.ContainsKey($key) -and $s.Size -gt $lastSize[$key]) { $grew = $true }
        $delta = if ($lastSize.ContainsKey($key)) { $s.Size - $lastSize[$key] } else { 0 }
        $lastSize[$key] = $s.Size

        if ($s.Calling) {
            $c = $s.Calling
            # signature so the wait timer resets when the step/attempt changes
            $sig = "$key|$($c.Step)|$($c.Attempt)"
            if (-not $waitSince.ContainsKey($sig)) { $waitSince[$sig] = Get-Date }
            $waited = [int]((Get-Date) - $waitSince[$sig]).TotalSeconds

            $color = if ([int]$c.Attempt -ge 2) { "Magenta" } else { "Cyan" }
            $tag   = if ([int]$c.Attempt -ge 2) { "RETRY" } else { "WAIT " }
            $bar = ("." * ([Math]::Min(30, [int]($waited/2))))   # grows ~1 char / 2s
            Write-Host ("  [{0}] {1}" -f $tag, $label) -ForegroundColor $color
            Write-Host ("        {0} waiting {1}s  {2}" -f $sp, $waited, $bar) -ForegroundColor $color
            Write-Host ("        -> {0}  attempt {1}/{2}, {3} msgs, {4}B  (step {5})" -f $c.Model, $c.Attempt, $c.Max, $c.Msgs, $c.Bytes, $c.Step) -ForegroundColor DarkGray
        }
        else {
            Write-Host ("  [WORK ] {0}   ({1}m since write)" -f $label, $s.Age) -ForegroundColor Green
        }

        if ($grew) {
            Write-Host ("        ++ file grew +{0}B (reply landed)" -f $delta) -ForegroundColor Green
        }
        if ($s.Thought) {
            $t = $s.Thought; if ($t.Length -gt 66) { $t = $t.Substring(0,63) + "..." }
            Write-Host ("        thought: {0}" -f $t) -ForegroundColor Gray
        }
        Write-Host ""
    }

    Start-Sleep -Seconds $Interval
}
