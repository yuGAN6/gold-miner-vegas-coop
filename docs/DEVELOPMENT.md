# Development

The release installer needs only built-in Windows PowerShell. Building the mod requires your own matching game installation, Python 3, Node.js, Java, FFDec (tested with 26.5.0) and Microsoft Edge for the headless browser tests. None of the game files or tool binaries is bundled here.

## Prepare and build

Run from the repository root. Substitute your own paths; keep Java and FFDec available for subsequent build commands.

```powershell
$env:VEGAS_JAVA = 'C:\Tools\java\bin\java.exe'
$env:FFDEC_JAR = 'C:\Tools\ffdec\ffdec.jar'
python mod-tools/prepare_development.py --game-directory 'D:\SteamLibrary\steamapps\common\Gold Miner Together' --java $env:VEGAS_JAVA --ffdec-jar $env:FFDEC_JAR
python mod-tools/build_vegas.py
python mod-tools/prepare_test.py
node mod-tools/test_vegas.cjs
$env:VEGAS_TEST_MODE = '2'
node mod-tools/test_vegas.cjs
Remove-Item Env:\VEGAS_TEST_MODE
```

Preparation verifies the original pack and extracts the user's files into ignored `mod-work/`. It can use a verified backup made by the development or portable installer. The builder imports changed scripts, enables the ExternalInterface bridge, repairs known legacy identifier casing, brings native partner definitions before their campaign use, and mirrors the full mining-scene display span. The test movie has additional debug callbacks; it must never be packaged as the production movie.

`vegas-coop.as` implements player ownership, launch/recall, bombs and modifiers. `vegas-panel.js` supplies the panel and physical input bridge. The same mining-scene allowlist serves native modes 1 and 2; native mode 3 retains its own behavior.

## Repack and export

Use the verified original pack, not a modded pack, as the source. The repacker loads the original decoder from the user's extracted installation; this repository does not contain it or its keys.

```powershell
$vegasOriginal = 'D:\SteamLibrary\steamapps\common\Gold Miner Together\resources\vegas\vegas.pack.pre-campaign-coop'
node mod-tools/pack_vegas.cjs $vegasOriginal mod-work/vegas-coop.pack
python mod-tools/export_portable.py --source $vegasOriginal --target mod-work/vegas-coop.pack --pack-module mod-work/app/vegas-pack.js --output dist
python mod-tools/test_portable.py --package dist/GoldMiner-Vegas-Coop-v0.2.1 --original $vegasOriginal
```

The exporter compares encrypted entry ranges, copying all unchanged ciphertext from the original and carrying only the changed movie and pack header/table. It independently reconstructs and compares every byte before emitting the delta. The portable installer verifies source, payload, generated output and backup hashes; replacement happens only after successful validation.

## Before publishing

Keep game assets, extracted launchers, decoders, keys, saves, generated packs and test profiles out of Git. The release contains only the delta, manifest, installer and user instructions. Review `git ls-files`, then audit both tracked files and decompressed release data:

```powershell
node mod-tools/audit_publication.cjs mod-work/app/vegas-pack.js dist/GoldMiner-Vegas-Coop-v0.2.1/payload.gz
```

Do not copy the ignored `mod-work/` directory into a release. Update the version, compatibility fingerprint and English/Chinese documentation together for a new release. Automated scene entry and behavior tests do not replace a full campaign playthrough or testing on another physical computer.
