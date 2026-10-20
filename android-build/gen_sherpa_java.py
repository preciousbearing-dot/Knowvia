"""Turns the Kotlin config classes of sherpa-onnx (pinned release v1.13.8) into plain Java, so the on-device voice needs no Kotlin plugin.
The prebuilt native library reads these classes by field name, so names and types must match the release exactly."""
import re, sys
src = open(sys.argv[1]).read()
out = sys.argv[2]
TY = {'String': 'String', 'Float': 'float', 'Int': 'int', 'Boolean': 'boolean'}
names = []
for m in re.finditer(r'data class (\w+)\((.*?)\n\)', src, re.S):
    name, body = m.group(1), m.group(2)
    if name == 'GenerationConfig':
        continue
    fields = []
    for line in body.split('\n'):
        line = re.sub(r'//.*$', '', line).strip().rstrip(',')
        fm = re.match(r'var (\w+): (\w+) = (.+)$', line)
        if not fm:
            continue
        fn, ft, dv = fm.groups()
        if ft in TY:
            fields.append('    public %s %s = %s;' % (TY[ft], fn, dv))
        else:
            fields.append('    public %s %s = new %s();' % (ft, fn, ft))
    java = 'package com.k2fsa.sherpa.onnx;\n\npublic class %s {\n%s\n}\n' % (name, '\n'.join(fields))
    open('%s/%s.java' % (out, name), 'w').write(java)
    names.append(name)
print('generated', ', '.join(names))
