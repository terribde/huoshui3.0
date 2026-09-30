[CmdletBinding()]
param(
    [ValidateSet('DryRun', 'Apply', 'Verify')]
    [string]$Mode = 'DryRun',
    [string]$CsvPath,
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'schule2026-2027-1/import-output'
$generatorPath = Join-Path $PSScriptRoot 'import-timetable.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '需要 Node.js 22 或更新版本。'
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    throw '需要 PostgreSQL 客户端 psql。也可先运行 node scripts/import-timetable.mjs，再在 Supabase SQL Editor 中执行生成的 SQL。'
}
foreach ($requiredName in @('PGHOST', 'PGDATABASE', 'PGUSER')) {
    if (-not [Environment]::GetEnvironmentVariable($requiredName)) {
        throw "请先设置连接参数 $requiredName。连接信息从 Supabase Connect 面板获取。"
    }
}

$generatorArguments = @($generatorPath, '--out', $outputDirectory)
if ($CsvPath) { $generatorArguments += @('--csv', $CsvPath) }
if ($ConfigPath) { $generatorArguments += @('--config', $ConfigPath) }
if ($Mode -ne 'Verify') {
    & node @generatorArguments
    if ($LASTEXITCODE -ne 0) { throw 'CSV 校验或生成失败，未连接数据库。' }
}
$sqlName = switch ($Mode) {
    'DryRun' { '00-dry-run.sql' }
    'Apply' { '01-import.sql' }
    'Verify' { '02-verify.sql' }
}
$sqlPath = Join-Path $outputDirectory $sqlName
if (-not (Test-Path -LiteralPath $sqlPath)) { throw "找不到 SQL：$sqlPath" }
Write-Host "执行模式：$Mode；SQL：$sqlName"
# Connection credentials remain in libpq environment / password prompt, not arguments.
& psql --no-psqlrc --set=ON_ERROR_STOP=1 --file $sqlPath
if ($LASTEXITCODE -ne 0) { throw '数据库执行失败。事务未正常提交，请检查上方错误；勿忽略错误继续导入。' }
if ($Mode -eq 'DryRun') { Write-Host '预演结束，全部数据库变更已回滚。' }
elseif ($Mode -eq 'Apply') { Write-Host '导入事务已提交。请继续运行 -Mode Verify。' }
