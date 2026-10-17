"""Patches the generated Capacitor Android project: version numbers and a fixed test signing key
(so each new APK installs over the old one and keeps the user's progress)."""
import re, sys, json
gradle, vcode, vname = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(gradle).read()
s, n1 = re.subn(r'versionCode\s+\d+', 'versionCode %d' % int(vcode), s, count=1)
s, n2 = re.subn(r'versionName\s+"[^"]*"', 'versionName "%s"' % vname, s, count=1)
sign = '''signingConfigs {
        debug {
            storeFile file('knowvia-test.jks')
            storePassword 'knowvia'
            keyAlias 'knowvia'
            keyPassword 'knowvia'
        }
    }
    buildTypes {'''
s, n3 = re.subn(r'buildTypes\s*\{', sign, s, count=1)
if not (n1 and n2 and n3):
    sys.exit('Could not patch build.gradle: versionCode=%d versionName=%d buildTypes=%d' % (n1, n2, n3))
open(gradle, 'w').write(s)
print('patched', gradle)
