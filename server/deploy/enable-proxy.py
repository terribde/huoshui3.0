import pathlib
import re
import shutil
import subprocess
import sys

release = pathlib.Path(sys.argv[1]).resolve()
if release.parent != pathlib.Path('/opt/swjtu-cache/releases'):
    raise RuntimeError('Unexpected release path')
site = pathlib.Path('/www/server/panel/vhost/nginx/html_temp.com.conf')
include = pathlib.Path('/www/server/nginx/conf/swjtu-cache-api.inc')
original = site.read_text(encoding='utf-8')
directive = '    include /www/server/nginx/conf/swjtu-cache-api.inc;'
shutil.copy2(str(release / 'deploy/nginx-cache.conf'), str(include))
if directive not in original:
    changed, count = re.subn(r'(?m)^(\s*root\s+[^;]+;\s*\n)', lambda m: m.group(1) + directive + '\n', original, count=1)
    if count != 1:
        raise RuntimeError('Could not locate target site root directive')
    site.write_text(changed, encoding='utf-8')
result = subprocess.run(['nginx', '-t'])
if result.returncode:
    site.write_text(original, encoding='utf-8')
    raise RuntimeError('Nginx validation failed; original site configuration restored')
subprocess.run(['nginx', '-s', 'reload'], check=True)
print('API proxy enabled for temp.com only. Frontend files unchanged.')
