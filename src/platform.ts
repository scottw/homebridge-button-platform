import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ButtonPlatformAccessory, EVENT_NAMES, isButtonEvent } from './platformAccessory';

const DEFAULT_PORT = 3001;
const MAX_BODY_BYTES = 100 * 1024;
const BATTERY_HEADER = 'button-battery-level';

type Body = Record<string, unknown>;

export function buttonPath(name: string): string {
  return '/button-' + name.toLowerCase().replace(/[^a-z0-9]/gu, '-');
}

export class ButtonPlatform implements DynamicPlatformPlugin {
  private readonly cachedAccessories = new Map<string, PlatformAccessory>();
  private readonly routes = new Map<string, ButtonPlatformAccessory>();
  private server?: Server;
  private warnedBatteryDeprecation = false;

  constructor(
    public readonly log: Logger,
    private readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    api.on('didFinishLaunching', () => {
      this.syncAccessories();
      this.startServer();
    });
    api.on('shutdown', () => this.server?.close());
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private syncAccessories() {
    const buttons = [...new Set<string>(this.config.buttons ?? [])];
    if (buttons.length === 0) {
      this.log.warn('Configuration issue: no buttons configured.');
    }

    for (const name of buttons) {
      const uuid = this.api.hap.uuid.generate(name);
      let accessory = this.cachedAccessories.get(uuid);

      if (accessory) {
        this.log.info('Restoring existing accessory from cache:', name);
        this.cachedAccessories.delete(uuid);
      } else {
        this.log.info('Adding new accessory:', name);
        accessory = new this.api.platformAccessory(name, uuid);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      const button = new ButtonPlatformAccessory(this, accessory, name);
      const path = buttonPath(name);
      if (this.routes.has(path)) {
        this.log.warn('Button %s has the same Event URI as another button (%s) and cannot be triggered.', name, path);
        continue;
      }
      this.routes.set(path, button);
      this.log.info('The Event URI for %s is: %s', name, path);
    }

    for (const accessory of this.cachedAccessories.values()) {
      this.log.info('Removing accessory:', accessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    this.cachedAccessories.clear();
  }

  private startServer() {
    const port = this.config.port || DEFAULT_PORT;

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err: Error) => {
        this.log.error(err.stack || String(err));
        send(res, 500, 'Server error.');
      });
    });

    this.server.on('error', (error: Error) => {
      this.log.error('HTTP server error:', error);
    });

    this.server.listen(port, () => {
      this.log.info('Listening on port %s for inbound button push event notifications', port);
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const button = this.routes.get(url.pathname.toLowerCase().replace(/\/$/u, ''));

    if (!button) {
      send(res, 404, 'Button not found.');
      this.log.warn('Received event for unconfigured Button path: %s', req.url);
      this.log.warn('  from: %s (%s %s)', req.socket.remoteAddress, req.method, req.headers['user-agent']);
      return;
    }

    const body = await readBody(req);
    const event = [url.searchParams.get('event'), body.event, req.headers.event].find(isButtonEvent);
    if (!event) {
      return sendInvalid(res, 'event', `must be one of: ${EVENT_NAMES.join(', ')}`);
    }

    const batteryHeader = req.headers[BATTERY_HEADER];
    let batteryLevel: number | undefined;
    if (batteryHeader !== undefined) {
      batteryLevel = Number(batteryHeader);
      if (!/^[-+]?\d+$/u.test(String(batteryHeader)) || batteryLevel < 0 || batteryLevel > 100) {
        return sendInvalid(res, BATTERY_HEADER, 'must be an integer from 0 to 100');
      }
      this.warnBatteryDeprecation();
    }

    this.log.info('Triggering %s event for button: %s', event, button.name);
    button.trigger(event, batteryLevel);
    send(res, 200, 'OK');
  }

  private warnBatteryDeprecation() {
    if (this.warnedBatteryDeprecation) {
      return;
    }
    this.warnedBatteryDeprecation = true;
    this.log.warn(
      'The %s header (sent by Flic hubs) is deprecated and will be removed after 2026-12-31. ' +
        'Flic 2 buttons on a Flic Hub LR can be added to HomeKit directly: https://flic.io/homekit',
      BATTERY_HEADER,
    );
  }
}

async function readBody(req: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }
  if (size === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();

  if (type === 'application/json') {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Body) : {};
  }
  if (type === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return {};
}

function send(res: ServerResponse, status: number, text: string) {
  if (res.headersSent) {
    return;
  }
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}

function sendInvalid(res: ServerResponse, field: string, msg: string) {
  res.writeHead(422, { 'Content-Type': 'application/json' }).end(JSON.stringify({ errors: [{ path: field, msg }] }));
}
