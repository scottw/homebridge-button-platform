# Homebridge Plugin Maintenance

## Testing locally

Runs a throwaway Homebridge on this machine using `src/test/hbConfig/config.json`:

```sh
npm run dev
curl 'http://localhost:3001/button-test-button?event=click'
```

## Installing on the Pi without publishing

```sh
npm pack                 # runs lint + build first
scp -p *.tgz homebridge: && rm *.tgz
```

On the Homebridge Pi (substitute the tarball name):

```sh
sudo mv homebridge-button-platform-22-X.Y.Z.tgz /var/lib/homebridge/
cd /var/lib/homebridge
sudo hb-service add homebridge-button-platform-22-X.Y.Z.tgz
sudo hb-service restart
sudo hb-service logs
```

To go back to the published version: `sudo hb-service add homebridge-button-platform-22`.

## Publishing

Commit `CHANGELOG.md` first (`npm version` needs a clean tree):

```sh
npm version minor        # or patch/major: bumps, commits, tags
npm whoami || npm login  # logins expire
npm publish              # add --otp=<code> if prompted
git push --follow-tags
```

`E404 Not Found - PUT` from `npm publish` means the login expired: run
`npm login` and publish again (don't rerun `npm version`).
