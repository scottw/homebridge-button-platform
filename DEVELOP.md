# Homebridge Plugin Maintenance

## Testing locally

Runs a throwaway Homebridge on this machine using `src/test/hbConfig/config.json`:

```sh
npm run dev
curl 'http://localhost:3001/button-test-button?event=click'
```

## Installing on the Pi without publishing

```sh
npm run lint && npm run build
TGZ=$(npm pack)
scp -p "$TGZ" homebridge:
```

On the Homebridge Pi (substitute the tarball name):

```sh
sudo mv homebridge-button-platform-22-X.Y.Z.tgz /var/lib/homebridge/
sudo hb-service add homebridge-button-platform-22-X.Y.Z.tgz
sudo hb-service restart
sudo hb-service logs
```

To go back to the published version: `sudo hb-service add homebridge-button-platform-22`.

## Publishing

Update and commit `CHANGELOG.md` (`npm version` needs a clean tree), then:

```sh
npm version minor   # or patch/major; updates package.json + lock, commits, tags
npm whoami || npm login
npm pack --dry-run
npm publish         # prepublishOnly runs lint and build
git push --follow-tags
```

Homebridge will then offer the upgrade.
