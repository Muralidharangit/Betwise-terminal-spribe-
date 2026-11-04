# Fix apt PHP PPA warning (run once if setup-linux.sh fails on apt update)

```bash
sudo apt-get update --allow-releaseinfo-change
```

Then install Tauri dependencies manually:

```bash
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf libssl-dev
```

Verify:

```bash
pkg-config --exists webkit2gtk-4.1 && echo "Ready for Tauri"
```
