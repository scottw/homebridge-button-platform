import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ButtonPlatform } from './platform';

export class ButtonPlatformAccessory {
  private switchService: Service;
  private batteryService: Service;

  private batteryLevel = 100;

  constructor(
    private readonly platform: ButtonPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Homebridge')
      .setCharacteristic(this.platform.Characteristic.Model, 'Virtual Button')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID);

    // Setup Stateless Programmable Switch service
    this.switchService = this.accessory.getService(this.platform.Service.StatelessProgrammableSwitch) ||
      this.accessory.addService(this.platform.Service.StatelessProgrammableSwitch);

    this.switchService.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name + ' Switch',
    );

    // Setup Battery service (always created, updated when battery info received)
    this.batteryService = this.accessory.getService(this.platform.Service.Battery) ||
      this.accessory.addService(this.platform.Service.Battery);

    this.batteryService.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name + ' Battery',
    );

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(this.handleBatteryLevelGet.bind(this));

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.handleStatusLowBatteryGet.bind(this));

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.ChargingState)
      .onGet(() => this.platform.Characteristic.ChargingState.NOT_CHARGEABLE);

    this.platform.log.debug('Finished initializing accessory:', accessory.displayName);
  }

  triggerEvent(eventType: string, batteryLevel?: number) {
    // Update battery if provided
    if (batteryLevel !== undefined) {
      this.updateBattery(batteryLevel);
    }

    // Map event type to HomeKit constant
    const C = this.platform.Characteristic.ProgrammableSwitchEvent;
    let event: CharacteristicValue;

    switch (eventType) {
      case 'click':
      case 'single-press':
        event = C.SINGLE_PRESS;
        break;
      case 'double-click':
      case 'double-press':
        event = C.DOUBLE_PRESS;
        break;
      case 'hold':
      case 'long-press':
        event = C.LONG_PRESS;
        break;
      default:
        this.platform.log.error('Unknown event type: %s', eventType);
        return;
    }

    this.platform.log.debug('Button %s triggered: %s', this.accessory.displayName, eventType);

    // Trigger the event
    this.switchService
      .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .sendEventNotification(event);
  }

  private updateBattery(level: number) {
    const batteryLevel = Math.max(0, Math.min(100, Math.trunc(level)));
    this.batteryLevel = batteryLevel;

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .updateValue(batteryLevel);

    const isLowBattery = batteryLevel < 15;
    this.batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .updateValue(
        isLowBattery
          ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );

    this.platform.log.debug('Battery level for %s: %d%%', this.accessory.displayName, batteryLevel);
  }

  async handleBatteryLevelGet(): Promise<CharacteristicValue> {
    return this.batteryLevel;
  }

  async handleStatusLowBatteryGet(): Promise<CharacteristicValue> {
    const isLowBattery = this.batteryLevel < 15;
    return isLowBattery
      ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }
}
