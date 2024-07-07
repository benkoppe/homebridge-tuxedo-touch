import {
    API,
    DynamicPlatformPlugin,
    Logging,
    PlatformAccessory,
    PlatformConfig,
    Service,
    Characteristic,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings.js";

import { TuxedoSecuritySystemAccessory } from "./securitySystemAccessory.js";
import { TuxedoGarageDoorAccessory } from "./garageDoorAccessory.js";

import { AccessoryType } from "./accessoryTypes.js";
import { tuxedoFetch, type TuxedoConfig } from "./tuxedo/api.js";

/**
 * Define device type, to be converted into accessory instances
 */

// type for devices that will only have one instance max
type UniqueDevice = {
    displayName: string;
    type: AccessoryType;
};

// type for devices that can have multiple instances
type RepeatableDevice = UniqueDevice & {
    nodeID: number;
};

type Device = UniqueDevice | RepeatableDevice;

/**
 * HomebridgePlatform
 * This class is the main constructor for the plugin.
 * Here, we parse the user config and discover/register accessories with Homebridge.
 */
export class TuxedoHomebridgePlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service;
    public readonly Characteristic: typeof Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];

    constructor(
        public readonly log: Logging,
        public readonly config: PlatformConfig & TuxedoConfig,
        public readonly api: API,
    ) {
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.log.debug("Finished initializing platform:", this.config.name);

        // Homebridge 1.8.0 introduced a `log.success` method that can be used to log success messages
        // For users that are on a version prior to 1.8.0, we need a 'polyfill' for this method
        if (!log.success) {
            log.success = log.info;
        }

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on("didFinishLaunching", () => {
            log.debug("Executed didFinishLaunching callback");
            // run the method to discover / register your devices as accessories
            this.discoverDevices();
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to set up event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info("Loading accessory from cache:", accessory.displayName);

        // add the restored accessory to the accessories cache, so we can track if it has already been registered
        this.accessories.push(accessory);
    }

    /**
     * Discover and register accessories from Tuxedo.
     *
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    async discoverDevices() {
        // Device discovery always includes the alarm panel. Add it first.
        const devices: Device[] = [
            {
                displayName: "Alarm Panel",
                type: AccessoryType.AlarmPanel,
            },
        ];

        // add other devices from the API (like garage door)
        devices.push(...(await this.loadDevices()));

        // loop over the discovered devices and register each one if it has not already been registered
        for (const device of devices) {
            // generate a unique id for the accessory this should be generated from
            // something globally unique, but constant, for example, the device serial
            // number or MAC address
            let deviceID = device.type.toString();
            if ("nodeID" in device) {
                deviceID += `-${device.nodeID}`;
            }

            const uuid = this.api.hap.uuid.generate(deviceID);

            // see if an accessory with the same uuid has already been registered and restored from
            // the cached devices we stored in the `configureAccessory` method above
            const existingAccessory = this.accessories.find(
                (accessory) => accessory.UUID === uuid,
            );

            if (existingAccessory) {
                // the accessory already exists
                this.log.info(
                    "Restoring existing accessory from cache:",
                    existingAccessory.displayName,
                );

                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
                // existingAccessory.context.device = device;
                // this.api.updatePlatformAccessories([existingAccessory]);

                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                switch (device.type) {
                    case AccessoryType.AlarmPanel:
                        new TuxedoSecuritySystemAccessory(
                            this,
                            existingAccessory,
                        );
                        break;
                    case AccessoryType.GarageDoor:
                        if ("nodeID" in device) {
                            // Add type guard to check if 'nodeID' property exists
                            new TuxedoGarageDoorAccessory(
                                this,
                                existingAccessory,
                                device.nodeID,
                            );
                        }
                        break;
                }

                // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
                // remove platform accessories when no longer present
                // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
            } else {
                // the accessory does not yet exist, so we need to create it
                this.log.info("Adding new accessory:", device.displayName);

                // create a new accessory
                const accessory = new this.api.platformAccessory(
                    device.displayName,
                    uuid,
                );

                // store a copy of the device object in the `accessory.context`
                // the `context` property can be used to store any data about the accessory you may need
                accessory.context.device = device;

                // create the accessory handler for the newly create accessory
                // this is imported from `platformAccessory.ts`
                switch (device.type) {
                    case AccessoryType.AlarmPanel:
                        new TuxedoSecuritySystemAccessory(this, accessory);
                        break;
                    case AccessoryType.GarageDoor:
                        if ("nodeID" in device) {
                            // Add type guard to check if 'nodeID' property exists
                            new TuxedoGarageDoorAccessory(
                                this,
                                accessory,
                                device.nodeID,
                            );
                        }
                        break;
                }

                // link the accessory to your platform
                this.api.registerPlatformAccessories(
                    PLUGIN_NAME,
                    PLATFORM_NAME,
                    [accessory],
                );
            }
        }
    }

    /**
     * Loads devices from the GetDeviceList Tuxedo route
     *
     * Currently only loads garage doors.
     */
    async loadDevices() {
        const deviceList = await tuxedoFetch(this.config, "GetDeviceList", {
            category: "All",
            operation: "set",
        });

        this.log.debug("Tuxedo device list:", deviceList);

        const zWaveDevices = deviceList["Zwave"];
        const loadedDevices: Device[] = [];

        try {
            const garageDoors = zWaveDevices["GarageDoor"];
            if (garageDoors.length > 0) {
                for (const garageDoor of garageDoors) {
                    const nodeID = garageDoor["NodeID"];

                    const device: RepeatableDevice = {
                        displayName: garageDoor["Name"],
                        type: AccessoryType.GarageDoor,
                        nodeID: parseInt(nodeID),
                    };

                    loadedDevices.push(device);
                }
            }
            this.log.info("Loaded devices:", loadedDevices);
        } catch (error) {
            this.log.error("Error loading devices:", error);
        }

        return loadedDevices;
    }
}
