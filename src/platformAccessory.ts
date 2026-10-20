import { PlatformAccessory, Service } from 'homebridge';
import type { ButtonPlatform } from './platform';

const EVENT_TYPES = {
  'click': 'SINGLE_PRESS',
  'single-press': 'SINGLE_PRESS',
  'double-click': 'DOUBLE_PRESS',
  'double-press': 'DOUBLE_PRESS',
  'hold': 'LONG_PRESS',
  'long-press': 'LONG_PRESS',
} as const;

const LOW_BATTERY_LEVEL = 15;

export type ButtonEvent = keyof typeof EVENT_TYPES;
export const EVENT_NAMES = Object.keys(EVENT_TYPES) as ButtonEvent[];

export function isButtonEvent(value: unknown): value is ButtonEvent {
  return typeof value === 'string' && Object.hasOwn(EVENT_TYPES, value);
}

export class ButtonPlatformAccessory {
  private readonly switchService: Service;
  private readonly batteryService: Service;
  private batteryLevel = 100;

  constructor(
    private readonly platform: ButtonPlatform,
    accessory: PlatformAccessory,
    public readonly name: string,
  ) {
    const { Service, Characteristic } = platform.api.hap;

    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Homebridge')
      .setCharacteristic(Characteristic.Model, 'Virtual Button')
      .setCharacteristic(Characteristic.SerialNumber, accessory.UUID);

    this.switchService = accessory.getService(Service.StatelessProgrammableSwitch) ??
      accessory.addService(Service.StatelessProgrammableSwitch);
    this.switchService.setCharacteristic(Characteristic.Name, `${name} Switch`);

    this.batteryService = accessory.getService(Service.Battery) ?? accessory.addService(Service.Battery);
    this.batteryService.setCharacteristic(Characteristic.Name, `${name} Battery`);
    this.batteryService.getCharacteristic(Characteristic.BatteryLevel).onGet(() => this.batteryLevel);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery).onGet(() => this.lowBatteryStatus());
    this.batteryService.getCharacteristic(Characteristic.ChargingState)
      .onGet(() => Characteristic.ChargingState.NOT_CHARGEABLE);
  }

  trigger(event: ButtonEvent, batteryLevel?: number) {
    if (batteryLevel !== undefined) {
      this.updateBattery(batteryLevel);
    }

    const { ProgrammableSwitchEvent } = this.platform.api.hap.Characteristic;
    this.switchService
      .getCharacteristic(ProgrammableSwitchEvent)
      .sendEventNotification(ProgrammableSwitchEvent[EVENT_TYPES[event]]);
  }

  private updateBattery(level: number) {
    const { Characteristic } = this.platform.api.hap;
    this.batteryLevel = Math.max(0, Math.min(100, Math.trunc(level)));
    this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, this.batteryLevel);
    this.batteryService.updateCharacteristic(Characteristic.StatusLowBattery, this.lowBatteryStatus());
    this.platform.log.debug('Battery level for %s: %d%%', this.name, this.batteryLevel);
  }

  private lowBatteryStatus() {
    const { StatusLowBattery } = this.platform.api.hap.Characteristic;
    return this.batteryLevel < LOW_BATTERY_LEVEL
      ? StatusLowBattery.BATTERY_LEVEL_LOW
      : StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }
}
