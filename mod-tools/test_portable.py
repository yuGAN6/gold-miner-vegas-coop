"""Exercise the public installer against isolated copies, never the live game."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--package',required=True,type=Path)
    p.add_argument('--original',required=True,type=Path);p.add_argument('--live-pack',type=Path)
    a=p.parse_args();package=a.package.resolve();manifest=json.loads((package/'manifest.json').read_text())
    root=Path(__file__).resolve().parent.parent/'mod-work'/('installer-test-'+str(time.time_ns()))
    root.mkdir(parents=True);checks=[];live_sha=sha(a.live_pack) if a.live_pack else None
    def fixture(name):
        game=root/name;(game/'resources/vegas').mkdir(parents=True)
        shutil.copy2(a.original,game/'resources/vegas/vegas.pack');return game
    def run(mode,game,pkg=package,ok=True,discover=False):
        cmd=['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(pkg/'Manage-Mod.ps1'),'-Mode',mode,'-NonInteractive']
        if not discover:cmd+=['-GameDirectory',str(game)]
        r=subprocess.run(cmd,cwd=game,capture_output=True,timeout=120)
        if (r.returncode==0)!=ok:raise AssertionError(r.stdout.decode(errors='replace')+r.stderr.decode(errors='replace'))
    game=fixture('游戏副本 with spaces');archive=game/'resources/vegas/vegas.pack'
    backup=game/'resources/vegas/vegas.pack.goldminer-vegas-coop-original'
    run('Install',game);assert sha(archive)==manifest['target']['sha256'] and sha(backup)==manifest['source']['sha256']
    checks.append('installation without game EXE or Steam metadata produces the exact tested pack and backup')
    run('Install',game);assert sha(archive)==manifest['target']['sha256']
    checks.append('repeated install is idempotent')
    run('Uninstall',game);run('Uninstall',game);assert sha(archive)==manifest['source']['sha256']
    checks.append('uninstall and repeated uninstall restore the exact original')
    run('Install',game,discover=True);assert sha(archive)==manifest['target']['sha256']
    checks.append('automatic current-directory discovery supports spaces and Unicode')
    held=backup.with_suffix('.held');backup.rename(held)
    run('Uninstall',game,ok=False);assert sha(archive)==manifest['target']['sha256'];held.rename(backup)
    checks.append('missing backup refuses uninstall without modifying the pack')
    wrong=fixture('wrong-version');wrong_pack=wrong/'resources/vegas/vegas.pack';wrong_pack.write_bytes(b'wrong version');before=sha(wrong_pack)
    run('Install',wrong,ok=False);assert sha(wrong_pack)==before
    checks.append('mismatched resource content is refused independently of Steam versions')
    assert not any(k in manifest for k in ('steamAppId','steamBuildId','gameVersion'))
    metadata=fixture('unrelated-game-metadata')
    (metadata/'appmanifest_4815320.acf').write_text('unrelated app/build metadata',encoding='utf8')
    (metadata/'resources/package.json').write_text('{"version":"999.999"}',encoding='utf8')
    run('Install',metadata)
    assert sha(metadata/'resources/vegas/vegas.pack')==manifest['target']['sha256']
    checks.append('unrelated app/build and game-version metadata does not restrict installation')
    damaged=root/'damaged-package';shutil.copytree(package,damaged);(damaged/'payload.gz').write_bytes(b'damaged')
    clean=fixture('damaged-payload');run('Install',clean,pkg=damaged,ok=False)
    assert sha(clean/'resources/vegas/vegas.pack')==manifest['source']['sha256']
    checks.append('corrupt payload leaves the original pack unchanged')
    bad_target=root/'bad-target';shutil.copytree(package,bad_target);bad=dict(manifest);bad['target']=dict(manifest['target']);bad['target']['sha256']='0'*64
    (bad_target/'manifest.json').write_text(json.dumps(bad),encoding='utf8')
    failed=fixture('failed-validation');run('Install',failed,pkg=bad_target,ok=False)
    assert sha(failed/'resources/vegas/vegas.pack')==manifest['source']['sha256']
    assert not list((failed/'resources').rglob('*.tmp'))
    checks.append('failed final validation cleans staging files and preserves the original')
    if a.live_pack:assert sha(a.live_pack)==live_sha
    checks.append('live installed game remains unchanged throughout installer tests')
    report={'passed':len(checks),'checks':checks}
    (root.parent/'installer-test-results.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report,indent=2))

if __name__=='__main__':main()
