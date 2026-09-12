$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Java\jdk-25"
$sdk = "D:\Android\Sdk\build-tools\36.0.0"
$platform = "D:\Android\Sdk\platforms\android-37.0\android.jar"
$appDir = "d:\ProjectS\Y-T.Downloader\android-app"
$buildDir = "$appDir\build"
$releaseDir = "$appDir\release"
$javac = "C:\Program Files\Java\jdk-25\bin\javac.exe"
$keytool = "C:\Program Files\Eclipse Adoptium\jre-17.0.8.101-hotspot\bin\keytool.exe"

# 1. Clean Directories
Remove-Item -Recurse -Force "$buildDir\gen", "$buildDir\obj", "$buildDir\bin", "$buildDir\compiled_res.zip" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$buildDir\gen", "$buildDir\obj", "$buildDir\bin", $releaseDir | Out-Null

# 2. AAPT2 Compile
Write-Output "==> [1/7] Compiling Resources with AAPT2..."
& "$sdk\aapt2.exe" compile --dir "$appDir\src\main\res" -o "$buildDir\compiled_res.zip"

# 3. AAPT2 Link (without -A to avoid Windows backslash bug)
Write-Output "==> [2/7] Linking Resources with AAPT2..."
& "$sdk\aapt2.exe" link -I "$platform" --manifest "$appDir\src\main\AndroidManifest.xml" --min-sdk-version 24 --target-sdk-version 35 --java "$buildDir\gen" -o "$buildDir\bin\unaligned.apk" "$buildDir\compiled_res.zip" --auto-add-overlay

# 4. Compile Java
Write-Output "==> [3/7] Compiling Java Source Files..."
$javaFiles = Get-ChildItem -Path "$appDir\src\main\java", "$buildDir\gen" -Recurse -Filter "*.java" | Select-Object -ExpandProperty FullName
& "$javac" -source 17 -target 17 -classpath "$platform" -d "$buildDir\obj" $javaFiles

# 5. D8 Dexing
Write-Output "==> [4/7] Generating classes.dex with D8..."
$classFiles = Get-ChildItem -Path "$buildDir\obj" -Recurse -Filter "*.class" | Select-Object -ExpandProperty FullName
& "$sdk\d8.bat" --min-api 24 --lib "$platform" --output "$buildDir\bin" $classFiles

# 6. Inject classes.dex and assets with normalized forward slashes
Write-Output "==> [5/7] Injecting classes.dex and Assets with normalized paths..."
python -c @"
import zipfile, os

apk_path = r'$buildDir\bin\unaligned.apk'
assets_dir = r'$appDir\src\main\assets'
dex_path = r'$buildDir\bin\classes.dex'

with zipfile.ZipFile(apk_path, 'a', compression=zipfile.ZIP_DEFLATED) as z:
    z.write(dex_path, 'classes.dex')
    for root, dirs, files in os.walk(assets_dir):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, assets_dir).replace('\\', '/')
            arcname = f'assets/{rel_path}'
            z.write(full_path, arcname)
"@

# 7. Zipalign
Write-Output "==> [6/7] Aligning APK with zipalign..."
& "$sdk\zipalign.exe" -v -p 4 "$buildDir\bin\unaligned.apk" "$buildDir\bin\aligned.apk"

# 8. Sign with apksigner
Write-Output "==> [7/7] Signing APK with apksigner..."
$keystore = "$buildDir\debug.keystore"
if (-not (Test-Path $keystore)) {
    & "$keytool" -genkeypair -v -keystore $keystore -alias androiddebugkey -keypass android -storepass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
}

$finalApk = "$releaseDir\Nova-Downloader.apk"
& "$sdk\apksigner.bat" sign --ks $keystore --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android --out $finalApk "$buildDir\bin\aligned.apk"

# Verify
& "$sdk\apksigner.bat" verify --verbose $finalApk

# Copy to root
Copy-Item $finalApk -Destination "d:\ProjectS\Y-T.Downloader\Nova-Downloader.apk" -Force

Write-Output "`n========================================================"
Write-Output " SUCCESS: Standalone Android APK Ready!"
Get-Item "d:\ProjectS\Y-T.Downloader\Nova-Downloader.apk" | Select-Object Name, FullName, Length
Write-Output "========================================================"
