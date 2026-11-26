# Vegas Co-op v0.2.2

Installer and compatibility-documentation update. The modified Flash movie is unchanged from v0.2.1.

- Removed Steam app/build and game-version metadata from the release manifest.
- Removed fixed-App-ID Steam directory discovery and the game executable filename requirement.
- Installation now locates the selected folder by `resources/vegas/vegas.pack` alone.
- Retained source-pack SHA-256, payload, output and backup verification. The current fixed-offset delta needs the expected source bytes to reconstruct a valid pack. These checks concern resource content, not a Steam edition or displayed game version.
- Updated English/Chinese instructions and added isolated tests with no game executable or Steam metadata, and with unrelated app/build/version metadata.

If v0.2.1 already works, its in-game features are identical. For a fresh installation, close the game, extract this ZIP, run `Install.cmd`, then start the game normally. Uninstall an older/different patch first. No additional development tools are needed. Saves and app.asar are unchanged.

[English instructions](https://github.com/yuGAN6/gold-miner-vegas-coop#readme) · [中文说明](https://github.com/yuGAN6/gold-miner-vegas-coop/blob/main/README.zh-CN.md).
