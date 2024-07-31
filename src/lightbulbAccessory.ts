import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { TuxedoHomebridgePlatform } from "./platform";
import type { LightType } from "./tuxedo/scraper";

/**
 * Lightbulb Accessory
 *
 * Uses a headless browser to scrape the web api for the Tuxedo Touch
 */

export class TuxedoLightbulbAccessory {
    private service: Service;

    constructor(
        private readonly platform: TuxedoHomebridgePlatform,
        private readonly accessory: PlatformAccessory,
        private readonly nodeId: number,
        private readonly lightType: LightType,
    ) {
        // set accessory information
        this.accessory
            .getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(
                this.platform.Characteristic.Manufacturer,
                "Honeywell",
            )
            .setCharacteristic(
                this.platform.Characteristic.Model,
                "Z-Wave Lightbulb",
            );

        // get the lightbulb service if it exists, otherwise create a new one
        this.service =
            this.accessory.getService(this.platform.Service.Lightbulb) ||
            this.accessory.addService(this.platform.Service.Lightbulb);

        // set the service name
        this.service.setCharacteristic(
            this.platform.Characteristic.Name,
            accessory.context.device.displayName,
        );

        // register handlers for the On Characteristic
        this.service
            .getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.handleLightbulbOnGet.bind(this))
            .onSet(this.handleLightbulbOnSet.bind(this));

        // if type is dimmer, register handlers for the Brightness Characteristic
        if (lightType === "dimmer") {
            this.service
                .getCharacteristic(this.platform.Characteristic.Brightness)
                .onGet(this.handleLightbulbBrightnessGet.bind(this))
                .onSet(this.handleLightbulbBrightnessSet.bind(this));
        }
    }

    async handleLightbulbOnGet(): Promise<boolean> {
        const state = await this.platform.tuxedoScraper.getLightState(
            this.nodeId,
        );

        if (!state) {
            throw new Error("Could not get light state");
        }

        if (state.state === "on") {
            return true;
        }

        return false;
    }

    async handleLightbulbOnSet(value: CharacteristicValue) {
        const command = value ? "on" : "off";

        await this.platform.tuxedoScraper.setLightState(
            this.nodeId,
            command,
            this.lightType,
        );
    }

    async handleLightbulbBrightnessGet(): Promise<number> {
        if (this.lightType !== "dimmer") {
            throw new Error("Brightness is not supported for this lightbulb");
        }

        const state = await this.platform.tuxedoScraper.getLightState(
            this.nodeId,
        );

        if (!state || state.percentage === undefined) {
            throw new Error("Could not get light state");
        }

        return state.percentage;
    }

    async handleLightbulbBrightnessSet(value: CharacteristicValue) {
        if (this.lightType !== "dimmer") {
            throw new Error("Brightness is not supported for this lightbulb");
        }

        await this.platform.tuxedoScraper.setLightPercentage(
            this.nodeId,
            value as number,
        );
    }
}
