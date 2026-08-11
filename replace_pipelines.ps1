$upstreamPipelinesPath = 'C:\Users\lepko\.gemini\antigravity-ide\brain\3a4492b5-b89d-4013-9c37-0a1568ae493d\scratch\upstream-pipelines-data.ts'
$localPipelinesPath = 'c:\Users\lepko\Documents\GitHub\C4Dashboard\src\config\pipelines.ts'

$upstreamCode = [System.IO.File]::ReadAllText($upstreamPipelinesPath)
$localCode = [System.IO.File]::ReadAllText($localPipelinesPath)

# Regex to match PIPELINES array block
$upstreamRegex = '(?ms)export const PIPELINES: PipelineRecord\[\] = \[.*?\n\];'
$localRegex = '(?ms)export const PIPELINES: Pipeline\[\] = \[.*?\n\];'

$match = [regex]::Match($upstreamCode, $upstreamRegex)
if (-not $match.Success) {
    Write-Error "Could not find PIPELINES in upstream pipelines-data.ts"
    exit 1
}

$newPipelinesCode = $match.Value
$newPipelinesCode = $newPipelinesCode -replace "PipelineRecord", "Pipeline"

$localMatch = [regex]::Match($localCode, $localRegex)
if (-not $localMatch.Success) {
    Write-Error "Could not find PIPELINES in local pipelines.ts"
    exit 1
}

$updatedLocalCode = $localCode -replace $localRegex, $newPipelinesCode

[System.IO.File]::WriteAllText($localPipelinesPath, $updatedLocalCode)
Write-Output "Successfully replaced PIPELINES"
