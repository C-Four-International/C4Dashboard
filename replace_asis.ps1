$files = @(
    "src\types\index.ts",
    "src\e2e\map-harness.ts",
    "src\e2e\mobile-map-integration-harness.ts",
    "src\config\panels.ts",
    "src\config\variants\happy.ts",
    "src\config\variants\tech.ts",
    "src\config\variants\full.ts",
    "src\config\variants\finance.ts"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $content = $content -replace 'agriculturalStress: boolean;', "agriculturalStressDI: boolean;`r`n  agriculturalStressASI: boolean;`r`n  agriculturalStressVCI: boolean;"
        $content = $content -replace 'agriculturalStress: false,', "agriculturalStressDI: false, agriculturalStressASI: false, agriculturalStressVCI: false,"
        $content = $content -replace 'agriculturalStress: true,', "agriculturalStressDI: true, agriculturalStressASI: true, agriculturalStressVCI: true,"
        Set-Content -Path $file -Value $content -NoNewline
    }
}
