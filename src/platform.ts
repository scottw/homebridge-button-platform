import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { body, header, query, oneOf, validationResult } from 'express-validator';
import { Server } from 'http';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ButtonPlatformAccessory } from './platformAccessory';

interface ButtonConfig extends PlatformConfig {
  port?: number;
  buttons?: string[];
}

export class ButtonPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly accessoryHandlers = new Map<string, ButtonPlatformAccessory>();

  private readonly app = express();
  private server?: Server;
  private readonly port: number;
  private readonly buttons: string[];

  constructor(
    public readonly log: Logger,
    public readonly config: ButtonConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.port = config.port || 3001;
    this.buttons = config.buttons || [];

    if (this.buttons.length === 0) {
      this.log.warn('Configuration issue: no buttons configured.');
    }

    this.log.debug('Finished initializing platform:', PLATFORM_NAME);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
      this.setupExpressServer();
      this.startServer();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    for (const buttonName of this.buttons) {
      const uuid = this.api.hap.uuid.generate(buttonName);
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        existingAccessory.context.device = { name: buttonName };
        this.api.updatePlatformAccessories([existingAccessory]);
        const handler = new ButtonPlatformAccessory(this, existingAccessory);
        this.accessoryHandlers.set(uuid, handler);
      } else {
        this.log.info('Adding new accessory:', buttonName);
        const accessory = new this.api.platformAccessory(buttonName, uuid);
        accessory.context.device = { name: buttonName };
        const handler = new ButtonPlatformAccessory(this, accessory);
        this.accessoryHandlers.set(uuid, handler);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Remove accessories that are no longer configured
    const configuredUUIDs = this.buttons.map(name => this.api.hap.uuid.generate(name));
    const accessoriesToRemove = this.accessories.filter(accessory => !configuredUUIDs.includes(accessory.UUID));

    for (const accessory of accessoriesToRemove) {
      this.log.info('Removing accessory:', accessory.displayName);
      this.accessoryHandlers.delete(accessory.UUID);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private setupExpressServer() {
    this.app.use(helmet({ crossOriginResourcePolicy: false }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: false }));

    // Setup routes for each button
    for (const buttonName of this.buttons) {
      this.setupRoute(buttonName);
    }

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).send('Button not found.');
      this.log.warn('Received event for unconfigured Button path: %s', req.originalUrl);
    });

    // Error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      res.status(500).send('Server error.');
      this.log.error(err.stack || String(err));
    });
  }

  private setupRoute(buttonName: string) {
    const uri = this.generateButtonUri(buttonName);
    this.log.info('The Event URI for %s is: %s', buttonName, uri);

    const validEvents = ['click', 'double-click', 'hold', 'single-press', 'double-press', 'long-press'];

    this.app.all(
      uri,
      oneOf([
        query('event').isIn(validEvents),
        body('event').isIn(validEvents),
        header('event').isIn(validEvents),
      ]),
      header('button-battery-level').optional().isInt({ min: 0, max: 100 }),
      (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(422).json({ errors: errors.array() });
        }

        const event = (req.query?.event ?? req.body?.event ?? req.headers?.event) as string;
        const batteryLevel = req.headers['button-battery-level'] as string | undefined;

        const uuid = this.api.hap.uuid.generate(buttonName);
        const accessory = this.accessories.find(acc => acc.UUID === uuid);

        if (!accessory) {
          this.log.error('Accessory not found for button: %s', buttonName);
          return res.status(404).send('Button not found.');
        }

        const buttonAccessory = this.accessoryHandlers.get(uuid);
        if (!buttonAccessory) {
          this.log.error('Button accessory handler not found for: %s', buttonName);
          return res.status(500).send('Server error.');
        }

        // Trigger the appropriate event
        this.log.info('Triggering %s event for button: %s', event, buttonName);
        buttonAccessory.triggerEvent(event, batteryLevel ? Number(batteryLevel) : undefined);

        res.status(200).send('OK');
      },
    );
  }

  private generateButtonUri(buttonName: string): string {
    return '/button-' + buttonName.toLowerCase().replace(/[^a-z0-9]/giu, '-');
  }

  private startServer() {
    this.server = this.app.listen(this.port, () => {
      this.log.info('Listening on port %s for inbound button push event notifications', this.port);
    });

    this.server.on('error', (error: Error) => {
      this.log.error('HTTP server error:', error);
    });
  }
}
