$upstreamGeoMapPath = 'C:\Users\lepko\.gemini\antigravity-ide\brain\3a4492b5-b89d-4013-9c37-0a1568ae493d\scratch\upstream-geo-map.ts'
$localGeoPath = 'c:\Users\lepko\Documents\GitHub\C4Dashboard\src\config\geo.ts'

$upstreamCode = [System.IO.File]::ReadAllText($upstreamGeoMapPath)
$localCode = [System.IO.File]::ReadAllText($localGeoPath)

# Regex to match UNDERSEA_CABLES array block
$regex = '(?ms)export const UNDERSEA_CABLES: UnderseaCable\[\] = \[.*?\n\];'

$match = [regex]::Match($upstreamCode, $regex)
if (-not $match.Success) {
    Write-Error "Could not find UNDERSEA_CABLES in upstream geo-map.ts"
    exit 1
}

$newCablesCode = $match.Value

$localMatch = [regex]::Match($localCode, $regex)
if (-not $localMatch.Success) {
    Write-Error "Could not find UNDERSEA_CABLES in local geo.ts"
    exit 1
}

$updatedLocalCode = $localCode -replace $regex, $newCablesCode

[System.IO.File]::WriteAllText($localGeoPath, $updatedLocalCode)
Write-Output "Successfully replaced UNDERSEA_CABLES"
