[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(
        'ProcessVendorOnboardingReminders',
        'ProcessVendorExpiries',
        'ProcessPOLineThresholdReminders',
        'RecoverDirectPaymentOperations'
    )]
    [string]$Operation,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$SharePointSiteUrl,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$IntegrationModulePath,

    [Parameter(Mandatory = $false)]
    [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = 'Stop'
$startedAtUtc = [DateTime]::UtcNow
$correlationId = [Guid]::NewGuid().ToString()

try {
    Import-Module -Name $IntegrationModulePath -Force -ErrorAction Stop
    $entryPoint = Get-Command -Name 'Invoke-VmsScheduledDomainOperation' -CommandType Function -ErrorAction Stop
    $request = @{
        Operation = $Operation
        SharePointSiteUrl = $SharePointSiteUrl
        CorrelationId = $correlationId
        StartedAtUtc = $startedAtUtc
    }
    if ($null -ne $Credential) {
        $request['Credential'] = $Credential
    }

    $result = & $entryPoint @request
    [pscustomobject]@{
        Operation = $Operation
        CorrelationId = $correlationId
        StartedAtUtc = $startedAtUtc.ToString('o')
        CompletedAtUtc = [DateTime]::UtcNow.ToString('o')
        Outcome = 'SUCCESS'
        Result = $result
    }
} catch {
    Write-Error -Message ("VMS scheduled operation failed. Operation={0}; CorrelationId={1}; ErrorType={2}" -f $Operation, $correlationId, $_.Exception.GetType().Name)
    exit 1
}
