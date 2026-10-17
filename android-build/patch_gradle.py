"""Patches the generated Capacitor Android project:
 - version numbers and a fixed test signing key (so each new APK installs over the old one and keeps progress)
 - the on-device engine: NDK/CMake build of llama.cpp for arm64, native libraries extracted to disk
 - target SDK kept at 34 so the screen layout stays as it was (no forced edge-to-edge)."""
import re, sys
root, vcode, vname = sys.argv[1], sys.argv[2], sys.argv[3]

def sub1(pattern, repl, s, what):
    s2, n = re.subn(pattern, repl, s, count=1, flags=re.S)
    if not n:
        sys.exit('Could not patch: ' + what)
    return s2

# ---- app/build.gradle
g = root + '/app/build.gradle'
s = open(g).read()
s = sub1(r'versionCode\s+\d+', 'versionCode %d' % int(vcode), s, 'versionCode')
s = sub1(r'versionName\s+"[^"]*"', 'versionName "%s"' % vname, s, 'versionName')
native_default = '''defaultConfig {
        ndk { abiFilters 'arm64-v8a' }
        externalNativeBuild {
            cmake {
                arguments "-DKV_LLAMA_DIR=" + System.getenv('KV_LLAMA_DIR'),
                          "-DCMAKE_BUILD_TYPE=Release",
                          "-DBUILD_SHARED_LIBS=ON",
                          "-DGGML_NATIVE=OFF",
                          "-DGGML_BACKEND_DL=ON",
                          "-DGGML_CPU_ALL_VARIANTS=ON",
                          "-DGGML_LLAMAFILE=OFF",
                          "-DGGML_OPENMP=OFF",
                          "-DGGML_CPU_KLEIDIAI=OFF",
                          "-DLLAMA_BUILD_COMMON=OFF",
                          "-DLLAMA_BUILD_TOOLS=OFF",
                          "-DLLAMA_BUILD_EXAMPLES=OFF",
                          "-DLLAMA_BUILD_TESTS=OFF",
                          "-DLLAMA_BUILD_SERVER=OFF",
                          "-DLLAMA_OPENSSL=OFF",
                          "-DLLAMA_CURL=OFF"
            }
        }'''
s = sub1(r'defaultConfig\s*\{', native_default, s, 'defaultConfig')
signing = '''signingConfigs {
        debug {
            storeFile file('knowvia-test.jks')
            storePassword 'knowvia'
            keyAlias 'knowvia'
            keyPassword 'knowvia'
        }
    }
    ndkVersion "28.2.13676358"
    externalNativeBuild {
        cmake {
            path "src/main/cpp/CMakeLists.txt"
            version "3.22.1"
        }
    }
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
    buildTypes {'''
s = sub1(r'buildTypes\s*\{', signing, s, 'buildTypes')
open(g, 'w').write(s)

# ---- variables.gradle: keep target SDK 34
v = root + '/variables.gradle'
t = open(v).read()
t = sub1(r'targetSdkVersion\s*=\s*\d+', 'targetSdkVersion = 34', t, 'targetSdkVersion')
open(v, 'w').write(t)

# ---- manifest: libraries must be unpacked (the engine loads its CPU variants by path); network state for download resume
m = root + '/app/src/main/AndroidManifest.xml'
x = open(m).read()
if 'extractNativeLibs' not in x:
    x = sub1(r'<application', '<application android:extractNativeLibs="true"', x, 'application tag')
if 'ACCESS_NETWORK_STATE' not in x:
    x = sub1(r'<uses-permission', '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n    <uses-permission', x, 'uses-permission')
open(m, 'w').write(x)
print('patched android project in', root)
