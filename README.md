# Button Platform for Homebridge

> This private fork is not meant for public use. Use at your own risk.

A Homebridge platform plugin that creates virtual HomeKit buttons (stateless
programmable switches) triggered by HTTP requests. Anything that can send an
HTTP request works: Shelly devices, an Elgato Stream Deck, `curl`, and so on.

It is a Node 22+ rewrite of [`homebridge-button-platform`](https://github.com/djelibeybi/homebridge-button-platform)
by Avi Miller, which is no longer maintained.

**This plugin requires a HomeKit [home hub](https://support.apple.com/en-us/102557)**
(HomePod, Apple TV or iPad) to run automations triggered by button events.

> **Flic support is deprecated.** The Flic-specific battery reporting
> (`button-battery-level` header) will be removed after 2026-12-31. Flic 2
> buttons on a Flic Hub LR can be added to HomeKit directly; see
> <https://flic.io/homekit>. Plain HTTP requests from a Flic hub will keep
> working like any other HTTP client.

## Install

Install via the Homebridge UI, or manually in your Homebridge directory:

```shell
npm install homebridge-button-platform-22
```

## Configuration

Configure via the Homebridge UI, or add this to the `platforms` block of
`config.json`:

```json
{
  "platform": "button-platform",
  "port": 3001,
  "buttons": ["My Button", "Your Button"]
}
```

Each button gets its own URI: `/button-` followed by the name in lower case with
every character other than `a-z` and `0-9` replaced by `-`. For example,
`My Button` becomes `/button-my-button`. The Homebridge log prints each URI at
startup.

> **Note:** renaming a button is the same as deleting it and adding a new one;
> any HomeKit automations attached to it are lost.

## Sending events

Send a request to `http://<homebridge>:<port>/<uri>` with an `event` value of:

| Event | HomeKit action |
|:------|:---------------|
| `click` or `single-press` | Single press |
| `double-click` or `double-press` | Double press |
| `hold` or `long-press` | Long press |

The `event` value can come from the query string, the request body (JSON or
form-encoded), or an `event` request header. Any HTTP method is accepted.

```shell
curl 'http://homebridge.local:3001/button-my-button?event=click'

curl -X POST -H 'Content-Type: application/json' \
  -d '{"event": "double-click"}' http://homebridge.local:3001/button-my-button

curl -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'event=hold' http://homebridge.local:3001/button-my-button
```

Responses: `200 OK` on success, `404` for an unknown URI, `422` for a missing or
invalid event.

### Stream Deck

Use the "Website" action with a URL such as
`http://homebridge.local:3001/button-my-button?event=click` and enable
`GET request in background` so no browser window opens:

![streamdeck-key](docs/streamdeck-config.png)

### Flic (deprecated)

In the Flic app, add an **Internet Request** action with type **GET** and a URL
such as `http://homebridge.local:3001/button-my-button?event=click`:

![flic-config](docs/flic-config.png)

Flic hubs send a `button-battery-level` header (0 to 100), which updates the
button's HomeKit battery service. Below 15% is reported as low battery. This
is the deprecated part; see the note above.

## Troubleshooting

The Homebridge log records every request to an unknown URI along with the
sender's address, method and user agent.
