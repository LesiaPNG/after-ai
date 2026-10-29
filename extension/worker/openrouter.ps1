param(
    [Parameter(Mandatory=$true)][ValidateSet('KeyStatus','SetKey','DeleteKey','Models','Submit','Poll','Download')][string]$Action,
    [string]$StorageRoot = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$script:failureCode = 'INVALID_INPUT'
$script:httpStatus = 0

function Reply($value) { [Console]::Out.Write(($value | ConvertTo-Json -Compress -Depth 30)) }
function Fail([string]$code) { $script:failureCode = $code; throw 'Operation failed' }
function Read-Key {
    if (-not [IO.File]::Exists($script:keyPath)) { Fail 'NO_KEY' }
    try {
        $encrypted = [IO.File]::ReadAllBytes($script:keyPath)
        $bytes = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $key = [Text.Encoding]::UTF8.GetString($bytes)
        [Array]::Clear($bytes, 0, $bytes.Length)
        return $key
    } catch { Fail 'KEY_STORAGE' }
}
function Request([string]$method, [string]$endpoint, $payload, [bool]$authenticated = $true) {
    $script:failureCode = 'NETWORK'
    # Endpoint paths are built locally. Never follow returned polling/download URLs with a key.
    $request = [Net.HttpWebRequest]::Create('https://openrouter.ai/api/v1/' + $endpoint)
    $request.Method = $method
    $request.AllowAutoRedirect = $false
    $request.Timeout = 120000
    $request.ReadWriteTimeout = 300000
    $request.UserAgent = 'AIFlow-AE-MVP/0.1'
    $request.Accept = 'application/json'
    if ($authenticated) { $request.Headers['Authorization'] = 'Bearer ' + (Read-Key) }
    if ($null -ne $payload) {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 30 -Compress))
        $request.ContentType = 'application/json'
        $request.ContentLength = $bytes.Length
        $stream = $request.GetRequestStream()
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    }
    try {
        $response = $request.GetResponse()
        $script:httpStatus = [int]$response.StatusCode
        if ($script:httpStatus -lt 200 -or $script:httpStatus -ge 300) { $response.Dispose(); Fail 'API' }
        return $response
    } catch [Net.WebException] {
        if ($null -ne $_.Exception.Response) {
            $script:httpStatus = [int]$_.Exception.Response.StatusCode
            $_.Exception.Response.Dispose()
            Fail 'API'
        }
        Fail 'NETWORK'
    }
}
function Json-Request([string]$method, [string]$endpoint, $payload, [bool]$authenticated = $true) {
    $response = Request $method $endpoint $payload $authenticated
    try {
        $reader = New-Object IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
        try { $text = $reader.ReadToEnd(); if ($text.Length -gt 8388608) { Fail 'API' }; return ($text | ConvertFrom-Json) }
        finally { $reader.Dispose() }
    } finally { $response.Dispose() }
}
function Job-Result($result) {
    if ([string]$result.id -notmatch '^[A-Za-z0-9_-]{1,200}$') { Fail 'API' }
    if ([string]$result.status -notin @('pending','in_progress','completed','failed','cancelled','expired')) { Fail 'API' }
    $cost = $null
    if ($null -ne $result.usage -and $null -ne $result.usage.cost) {
        $number = 0.0
        if ([double]::TryParse([string]$result.usage.cost, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number) -and $number -ge 0 -and -not [double]::IsInfinity($number) -and -not [double]::IsNaN($number)) { $cost = $number }
    }
    # Explicit allowlist. Do not return API bodies, error text, URLs, or headers.
    return @{ ok=$true; id=[string]$result.id; state=[string]$result.status; cost=$cost }
}
try {
    Add-Type -AssemblyName System.Security
    if (-not $StorageRoot) { $StorageRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'AIFlowAE' }
    $script:keyPath = Join-Path $StorageRoot 'openrouter.dpapi'
    $raw = [Console]::In.ReadToEnd()
    if ($raw.Length -gt 20000000) { Fail 'INVALID_INPUT' }
    $inputData = if ($raw.Trim()) { $raw | ConvertFrom-Json } else { @{} }
    $raw = $null
    switch ($Action) {
        'KeyStatus' { Reply @{ok=$true; saved=[IO.File]::Exists($script:keyPath)} }
        'SetKey' {
            $key = [string]$inputData.key
            if ($key -notmatch '^sk-or-[A-Za-z0-9_-]{12,512}$') { Fail 'INVALID_KEY' }
            try {
                [IO.Directory]::CreateDirectory($StorageRoot) | Out-Null
                $bytes = [Text.Encoding]::UTF8.GetBytes($key)
                $encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
                [IO.File]::WriteAllBytes($script:keyPath, $encrypted)
                [Array]::Clear($bytes, 0, $bytes.Length)
                $key = $null; $inputData = $null
            } catch { Fail 'KEY_STORAGE' }
            Reply @{ok=$true; saved=$true}
        }
        'DeleteKey' {
            if ([IO.File]::Exists($script:keyPath)) { [IO.File]::Delete($script:keyPath) }
            Reply @{ok=$true; saved=$false}
        }
        'Models' {
            $response = Json-Request 'GET' 'videos/models' $null $false
            $models = @()
            foreach ($model in $response.data) {
                # Keep only model metadata used by the UI, never the raw response.
                $entry = @{ id=[string]$model.id; name=[string]$model.name; generate_audio=[bool]$model.generate_audio; pricing_skus=@{} }
                foreach ($field in @('supported_durations','supported_resolutions','supported_aspect_ratios','supported_sizes','supported_frame_images')) {
                    $entry[$field] = @($model.$field | Where-Object { $null -ne $_ })
                }
                if ($null -ne $model.pricing_skus) {
                    foreach ($property in $model.pricing_skus.PSObject.Properties) {
                        if ($property.Name -match '^[A-Za-z0-9_.-]{1,100}$' -and [string]$property.Value -match '^\d+(\.\d+)?$') { $entry.pricing_skus[$property.Name] = [string]$property.Value }
                    }
                }
                $models += $entry
            }
            Reply @{ok=$true; models=$models}
        }
        'Submit' {
            $p = $inputData.payload
            if (-not $p.model -or -not $p.prompt -or ([string]$p.prompt).Length -gt 50000) { Fail 'INVALID_INPUT' }
            # Build the request from allowed fields; no callback, URL, trace, or provider passthrough.
            $body = @{model=[string]$p.model; prompt=[string]$p.prompt}
            foreach ($field in @('duration','resolution','aspect_ratio','size','generate_audio','seed')) {
                if ($null -ne $p.$field) { $body[$field] = $p.$field }
            }
            if ($null -ne $p.frame_images -and @($p.frame_images).Count -gt 0) {
                $image = [string]$p.frame_images[0].image_url.url
                if ($image -notmatch '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' -or $image.Length -gt 17000000) { Fail 'INVALID_INPUT' }
                $body.frame_images = @(@{type='image_url'; image_url=@{url=$image}; frame_type='first_frame'})
            }
            Reply (Job-Result (Json-Request 'POST' 'videos' $body))
        }
        'Poll' {
            if ([string]$inputData.jobId -notmatch '^[A-Za-z0-9_-]{1,200}$') { Fail 'INVALID_INPUT' }
            Reply (Job-Result (Json-Request 'GET' ('videos/' + $inputData.jobId) $null))
        }
        'Download' {
            if ([string]$inputData.jobId -notmatch '^[A-Za-z0-9_-]{1,200}$') { Fail 'INVALID_INPUT' }
            $destination = [IO.Path]::GetFullPath([string]$inputData.destination)
            if ([IO.Path]::GetExtension($destination) -ne '.mp4' -or -not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($destination))) { Fail 'INVALID_INPUT' }
            $temporary = $destination + '.partial'
            $response = Request 'GET' ('videos/' + $inputData.jobId + '/content?index=0') $null
            try {
                if ($response.ContentType -notmatch '^(video/|application/octet-stream)') { Fail 'DOWNLOAD' }
                $source = $response.GetResponseStream()
                $output = [IO.File]::Open($temporary, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
                try {
                    $buffer = New-Object byte[] 65536
                    $total = 0L
                    while (($count = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
                        $total += $count
                        if ($total -gt 2147483648) { Fail 'DOWNLOAD' }
                        $output.Write($buffer, 0, $count)
                    }
                    if ($total -lt 24) { Fail 'DOWNLOAD' }
                } finally { $output.Dispose(); $source.Dispose() }
            } finally { $response.Dispose() }
            [IO.File]::Move($temporary, $destination)
            Reply @{ok=$true; downloaded=$true}
        }
    }
} catch {
    # Never serialize exceptions: they can contain credentials, prompts, URLs or HTTP bodies.
    Reply @{ok=$false; code=$script:failureCode; status=$script:httpStatus}
    exit 1
}
