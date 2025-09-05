# SSL Certificate Generation Script for Dual Network Deployment
# Windows Server 2019 - Barcode Management System
# Generates self-signed certificates for both networks

param(
    [string]$CertPath = "C:\nginx\ssl",
    [string]$CertPassword = "BarcodeSSL2024!",
    [switch]$Force = $false
)

Write-Host "🔐 SSL Certificate Generation for Dual Network Deployment" -ForegroundColor Green
Write-Host "Certificate Path: $CertPath" -ForegroundColor Cyan
Write-Host "Network 1: 192.168.0.106" -ForegroundColor Yellow
Write-Host "Network 2: 192.168.0.249" -ForegroundColor Yellow

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "❌ This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Create SSL directory
if (-not (Test-Path $CertPath)) {
    Write-Host "📁 Creating SSL directory: $CertPath" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $CertPath -Force | Out-Null
}

# Function to generate self-signed certificate
function Generate-SelfSignedCert {
    param(
        [string]$Subject,
        [string]$DnsName,
        [string]$IpAddress,
        [string]$OutputPath,
        [string]$Password
    )
    
    Write-Host "🔐 Generating certificate for: $Subject" -ForegroundColor Yellow
    
    # Create certificate with both DNS name and IP address
    $cert = New-SelfSignedCertificate `
        -Subject $Subject `
        -DnsName $DnsName, $IpAddress, "localhost" `
        -CertStoreLocation "Cert:\LocalMachine\My" `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(2) `
        -KeyUsage DigitalSignature, KeyEncipherment `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1,1.3.6.1.5.5.7.3.2")
    
    # Export certificate to PFX file
    $pfxPath = "$OutputPath.pfx"
    $certPassword = ConvertTo-SecureString -String $Password -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $certPassword | Out-Null
    
    # Export certificate to CRT file
    $crtPath = "$OutputPath.crt"
    Export-Certificate -Cert $cert -FilePath $crtPath -Type CERT | Out-Null
    
    # Export private key to KEY file
    $keyPath = "$OutputPath.key"
    $keyBytes = $cert.PrivateKey.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
    [System.IO.File]::WriteAllBytes($keyPath, $keyBytes)
    
    Write-Host "✅ Certificate generated: $crtPath" -ForegroundColor Green
    Write-Host "✅ Private key generated: $keyPath" -ForegroundColor Green
    Write-Host "✅ PFX file generated: $pfxPath" -ForegroundColor Green
    
    return $cert
}

# Function to create certificate authority
function Create-CertificateAuthority {
    param(
        [string]$CaPath,
        [string]$Password
    )
    
    Write-Host "🏛️ Creating Certificate Authority..." -ForegroundColor Yellow
    
    $caCert = New-SelfSignedCertificate `
        -Subject "CN=Barcode Management CA, O=Barcode Management System, C=US" `
        -DnsName "Barcode Management CA" `
        -CertStoreLocation "Cert:\LocalMachine\My" `
        -KeyAlgorithm RSA `
        -KeyLength 4096 `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(10) `
        -KeyUsage CertSign, CRLSign, DigitalSignature `
        -IsCA $true
    
    # Export CA certificate
    $caPassword = ConvertTo-SecureString -String $Password -Force -AsPlainText
    Export-PfxCertificate -Cert $caCert -FilePath "$CaPath\ca.pfx" -Password $caPassword | Out-Null
    Export-Certificate -Cert $caCert -FilePath "$CaPath\ca.crt" -Type CERT | Out-Null
    
    Write-Host "✅ Certificate Authority created: $CaPath\ca.crt" -ForegroundColor Green
    
    return $caCert
}

try {
    # Create Certificate Authority
    $caCert = Create-CertificateAuthority -CaPath $CertPath -Password $CertPassword
    
    # Generate certificates for Network 1
    Write-Host "`n🌐 Generating certificates for Network 1 (192.168.0.106)..." -ForegroundColor Cyan
    $network1Cert = Generate-SelfSignedCert `
        -Subject "CN=192.168.0.106, O=Barcode Management System, C=US" `
        -DnsName "192.168.0.106" `
        -IpAddress "192.168.0.106" `
        -OutputPath "$CertPath\network1" `
        -Password $CertPassword
    
    # Generate certificates for Network 2
    Write-Host "`n🌐 Generating certificates for Network 2 (192.168.0.249)..." -ForegroundColor Cyan
    $network2Cert = Generate-SelfSignedCert `
        -Subject "CN=192.168.0.249, O=Barcode Management System, C=US" `
        -DnsName "192.168.0.249" `
        -IpAddress "192.168.0.249" `
        -OutputPath "$CertPath\network2" `
        -Password $CertPassword
    
    # Generate default certificate
    Write-Host "`n🌐 Generating default certificate..." -ForegroundColor Cyan
    $defaultCert = Generate-SelfSignedCert `
        -Subject "CN=localhost, O=Barcode Management System, C=US" `
        -DnsName "localhost" `
        -IpAddress "127.0.0.1" `
        -OutputPath "$CertPath\default" `
        -Password $CertPassword
    
    # Create certificate bundle for nginx
    Write-Host "`n📦 Creating certificate bundles..." -ForegroundColor Yellow
    
    # Network 1 bundle
    $network1Bundle = @"
# Network 1 Certificate Bundle
# Generated on: $(Get-Date)
# Network IP: 192.168.0.106

-----BEGIN CERTIFICATE-----
$([System.Convert]::ToBase64String($network1Cert.RawData, [System.Base64FormattingOptions]::InsertLineBreaks))
-----END CERTIFICATE-----
"@
    Set-Content -Path "$CertPath\network1_bundle.crt" -Value $network1Bundle
    
    # Network 2 bundle
    $network2Bundle = @"
# Network 2 Certificate Bundle
# Generated on: $(Get-Date)
# Network IP: 192.168.0.249

-----BEGIN CERTIFICATE-----
$([System.Convert]::ToBase64String($network2Cert.RawData, [System.Base64FormattingOptions]::InsertLineBreaks))
-----END CERTIFICATE-----
"@
    Set-Content -Path "$CertPath\network2_bundle.crt" -Value $network2Bundle
    
    # Create OpenSSL compatible private keys
    Write-Host "`n🔑 Converting private keys to OpenSSL format..." -ForegroundColor Yellow
    
    # Convert Network 1 private key
    $network1Key = $network1Cert.PrivateKey.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
    $network1KeyPem = @"
-----BEGIN PRIVATE KEY-----
$([System.Convert]::ToBase64String($network1Key, [System.Base64FormattingOptions]::InsertLineBreaks))
-----END PRIVATE KEY-----
"@
    Set-Content -Path "$CertPath\network1.key" -Value $network1KeyPem
    
    # Convert Network 2 private key
    $network2Key = $network2Cert.PrivateKey.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
    $network2KeyPem = @"
-----BEGIN PRIVATE KEY-----
$([System.Convert]::ToBase64String($network2Key, [System.Base64FormattingOptions]::InsertLineBreaks))
-----END PRIVATE KEY-----
"@
    Set-Content -Path "$CertPath\network2.key" -Value $network2KeyPem
    
    # Convert Default private key
    $defaultKey = $defaultCert.PrivateKey.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
    $defaultKeyPem = @"
-----BEGIN PRIVATE KEY-----
$([System.Convert]::ToBase64String($defaultKey, [System.Base64FormattingOptions]::InsertLineBreaks))
-----END PRIVATE KEY-----
"@
    Set-Content -Path "$CertPath\default.key" -Value $defaultKeyPem
    
    # Create certificate information file
    $certInfo = @"
# SSL Certificate Information
# Generated on: $(Get-Date)
# Certificate Path: $CertPath

## Network 1 (192.168.0.106)
Certificate: network1.crt
Private Key: network1.key
PFX File: network1.pfx
Password: $CertPassword

## Network 2 (192.168.0.249)
Certificate: network2.crt
Private Key: network2.key
PFX File: network2.pfx
Password: $CertPassword

## Default (localhost)
Certificate: default.crt
Private Key: default.key
PFX File: default.pfx
Password: $CertPassword

## Certificate Authority
CA Certificate: ca.crt
CA PFX File: ca.pfx
Password: $CertPassword

## Certificate Details
- Algorithm: RSA 2048-bit
- Hash: SHA-256
- Validity: 2 years
- Key Usage: Digital Signature, Key Encipherment
- Extended Key Usage: Server Authentication, Client Authentication

## Installation Notes
1. Certificates are stored in Windows Certificate Store (Local Machine)
2. Nginx configuration expects certificates in: $CertPath
3. For production, replace with certificates from a trusted CA
4. Certificate password is: $CertPassword

## Security Recommendations
- Change the default password in production
- Use certificates from a trusted Certificate Authority
- Implement certificate rotation policies
- Monitor certificate expiration dates
"@
    
    Set-Content -Path "$CertPath\README.txt" -Value $certInfo
    
    # Set proper permissions on certificate files
    Write-Host "`n🔒 Setting certificate file permissions..." -ForegroundColor Yellow
    $acl = Get-Acl $CertPath
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule("IIS_IUSRS", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $CertPath -AclObject $acl
    
    Write-Host "`n✅ SSL Certificate generation completed successfully!" -ForegroundColor Green
    Write-Host "📁 Certificate location: $CertPath" -ForegroundColor Cyan
    Write-Host "🔐 Certificate password: $CertPassword" -ForegroundColor Yellow
    Write-Host "`n📋 Generated files:" -ForegroundColor Cyan
    Write-Host "  - network1.crt / network1.key (Network 1)" -ForegroundColor White
    Write-Host "  - network2.crt / network2.key (Network 2)" -ForegroundColor White
    Write-Host "  - default.crt / default.key (Default)" -ForegroundColor White
    Write-Host "  - ca.crt (Certificate Authority)" -ForegroundColor White
    Write-Host "  - README.txt (Installation guide)" -ForegroundColor White
    
    Write-Host "`n⚠️  Important Security Notes:" -ForegroundColor Yellow
    Write-Host "  - These are self-signed certificates for development/testing" -ForegroundColor White
    Write-Host "  - For production, use certificates from a trusted CA" -ForegroundColor White
    Write-Host "  - Change the default password in production environments" -ForegroundColor White
    Write-Host "  - Monitor certificate expiration dates" -ForegroundColor White
    
} catch {
    Write-Host "❌ Error generating certificates: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
