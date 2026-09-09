[CmdletBinding()]
param(
  [string]$Root = 'C:\RKH\ExecutionAssurance'
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Root)
if ($resolvedRoot -match '^[A-Za-z]:\\?$') { throw 'The pilot root must be a dedicated directory, not a drive root.' }

foreach ($name in @('', 'runs', 'inbox', 'quarantine')) {
  $target = if ($name) { Join-Path $resolvedRoot $name } else { $resolvedRoot }
  New-Item -ItemType Directory -Force -Path $target | Out-Null
}

# This folder is created solely for the single-user pilot. Production ACLs must
# be set by RKH IT for the dedicated n8n service and backup accounts.
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl = Get-Acl -LiteralPath $resolvedRoot
$acl.SetAccessRuleProtection($true, $false)
foreach ($identity in @($currentUser, 'BUILTIN\Administrators', 'NT AUTHORITY\SYSTEM')) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.SetAccessRule($rule)
}
Set-Acl -LiteralPath $resolvedRoot -AclObject $acl

Write-Output "Initialized protected local pilot storage at $resolvedRoot"
