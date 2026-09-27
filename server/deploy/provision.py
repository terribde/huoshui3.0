"""Provision the API only. Never upload or replace the frontend web root."""
import datetime
import os
import pathlib
import pwd
import secrets
import shlex
import shutil
import subprocess
import sys

release = pathlib.Path(sys.argv[1]).resolve()
if release.parent != pathlib.Path('/opt/swjtu-cache/releases'):
    raise RuntimeError('Unexpected release directory')
stamp = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
backup = pathlib.Path('/www/backup') / ('swjtu-cache-' + stamp)
backup.mkdir(parents=True, exist_ok=False)
config = pathlib.Path('/www/server/redis/redis.conf')
site = pathlib.Path('/www/server/panel/vhost/nginx/html_temp.com.conf')
env_file = pathlib.Path('/etc/swjtu-cache-api.env')
for path in [config, site, env_file, pathlib.Path('/etc/systemd/system/swjtu-cache-api.service')]:
    if path.exists():
        shutil.copy2(str(path), str(backup / path.name))
        (backup / path.name).chmod(0o600)
backup.chmod(0o700)
content = config.read_text()
password = ''
for line in content.splitlines():
    parts = shlex.split(line, comments=True)
    if parts and parts[0] == 'requirepass':
        password = parts[1]
if not password:
    raise RuntimeError('Configure the Redis password before deployment')

app_password = secrets.token_urlsafe(32)
permissions = ['~swjtu:prod:cache:v1:*', '-@all', '+ping', '+info', '+client|setinfo',
               '+client|setname', '+quit', '+select', '+hgetall', '+hget', '+hset',
               '+hdel', '+hexists', '+del', '+expire', '+rename', '+scan', '+eval']
replacement = {'maxmemory': 'maxmemory 256mb', 'maxmemory-policy': 'maxmemory-policy allkeys-lru'}
lines = []
for line in content.splitlines():
    parts = shlex.split(line, comments=True)
    if parts and parts[0] in replacement:
        continue
    if len(parts) > 1 and parts[:2] == ['user', 'swjtu-cache']:
        continue
    lines.append(line)
lines.extend(replacement.values())
lines.append('user swjtu-cache on >' + app_password + ' ' + ' '.join(permissions))
config.write_text('\n'.join(lines) + '\n')
config.chmod(0o640)

cli = '/www/server/redis/src/redis-cli'
redis_env = dict(os.environ, REDISCLI_AUTH=password)
result = subprocess.run([cli, '-x', 'CONFIG', 'SET', 'requirepass'], input=password,
                        env=redis_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        universal_newlines=True)
if result.stdout.strip() != 'OK':
    raise RuntimeError('Could not apply Redis authentication; configuration backup: ' + str(backup))

def redis_command(*arguments):
    encoded = [str(arg).encode() for arg in arguments]
    wire = ('*%d\r\n' % len(encoded)).encode()
    for arg in encoded:
        wire += ('$%d\r\n' % len(arg)).encode() + arg + b'\r\n'
    result = subprocess.run([cli, '--pipe'], input=wire, env=redis_env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode or b'errors: 0' not in result.stdout:
        raise RuntimeError('Redis configuration command failed: ' + arguments[0])

redis_command('CONFIG', 'SET', 'maxmemory', '268435456', 'maxmemory-policy', 'allkeys-lru')
redis_command('ACL', 'SETUSER', 'swjtu-cache', 'reset', 'on', '>' + app_password, *permissions)
try:
    pwd.getpwnam('swjtu-cache')
except KeyError:
    subprocess.run(['useradd', '--system', '--no-create-home', '--home-dir', '/nonexistent',
                    '--shell', '/sbin/nologin', 'swjtu-cache'], check=True)
env_file.write_text('\n'.join([
    'NODE_ENV=production', 'HOST=127.0.0.1', 'PORT=3001',
    'SUPABASE_URL=https://qczsdnmwtagwbofpvwle.supabase.co',
    'SUPABASE_ANON_KEY=sb_publishable_VwOh-u9h81jDepmpYj2EHQ_yprgrT7D',
    'REDIS_HOST=127.0.0.1', 'REDIS_PORT=6379', 'REDIS_USERNAME=swjtu-cache',
    'REDIS_PASSWORD=' + app_password, 'CACHE_PREFIX=swjtu:prod:cache:v1:',
    'CACHE_TTL_SECONDS=604800', 'CACHE_SYNC_SECONDS=3600', '',
]))
env_file.chmod(0o600)
current = pathlib.Path('/opt/swjtu-cache/current')
if current.is_symlink():
    (backup / 'previous-release.txt').write_text(os.readlink(str(current)))
    current.unlink()
elif current.exists():
    raise RuntimeError('Existing current path is not a managed symlink')
current.symlink_to(release, target_is_directory=True)
shutil.copy2(str(release / 'deploy/swjtu-cache-api.service'), '/etc/systemd/system/swjtu-cache-api.service')
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', 'swjtu-cache-api'], check=True)
subprocess.run(['systemctl', 'restart', 'swjtu-cache-api'], check=True)
print('API service configured. Backup: ' + str(backup))
print('Frontend web root was not modified. Enable the Nginx include after API verification.')
