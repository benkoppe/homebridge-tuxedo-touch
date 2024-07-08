import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { TuxedoHomebridgePlatform } from "./platform";

import { tuxedoFetch } from "./tuxedo/api.js";

enum DoorState {
    OPEN = 0,
    CLOSED = 1,
}

/**
 * Garage Door Accessory
 */
export class TuxedoGarageDoorAccessory {
    private service: Service;

    // device node id
    private nodeID: number;
    // temp target state to handle door state changes
    private tempTargetState: CharacteristicValue | undefined = undefined;

    constructor(
        private readonly platform: TuxedoHomebridgePlatform,
        private readonly accessory: PlatformAccessory,
        nodeID: number,
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
                "Tuxedo Touch",
            );

        // get the garage door service if it exists, otherwise create a new one
        this.service =
            this.accessory.getService(this.platform.Service.GarageDoorOpener) ||
            this.accessory.addService(this.platform.Service.GarageDoorOpener);

        // set the service name
        this.service.setCharacteristic(
            this.platform.Characteristic.Name,
            accessory.context.device.displayName,
        );

        // set the node ID
        this.nodeID = nodeID;

        // register handlers for the Garage Door Obstruction Detected Characteristic
        this.service
            .getCharacteristic(this.platform.Characteristic.ObstructionDetected)
            .onGet(this.handleGarageDoorObstructionDetectedGet.bind(this));

        // register handlers for the Garage Door Current State Characteristic
        this.service
            .getCharacteristic(this.platform.Characteristic.CurrentDoorState)
            .onGet(this.handleGarageDoorCurrentStateGet.bind(this));

        // register handlers for the Garage Door Target State Characteristic
        this.service
            .getCharacteristic(this.platform.Characteristic.TargetDoorState)
            .onSet(this.handleGarageDoorTargetStateSet.bind(this))
            .onGet(this.handleGarageDoorTargetStateGet.bind(this));
    }

    // tuxedo doesn't support obstruction detection, so always return false
    async handleGarageDoorObstructionDetectedGet() {
        return false;
    }

    async handleGarageDoorCurrentStateGet() {
        const doorState = await this.getDoorState();

        this.platform.log.debug("Current door state: " + doorState);

        switch (doorState) {
            case DoorState.OPEN:
                return this.platform.Characteristic.CurrentDoorState.OPEN;
            case DoorState.CLOSED:
                return this.platform.Characteristic.CurrentDoorState.CLOSED;
            default:
                throw new Error("Unexpected door state: " + doorState);
        }
    }

    async handleGarageDoorTargetStateGet() {
        if (this.tempTargetState !== undefined) {
            return this.tempTargetState;
        }

        const doorState = await this.getDoorState();

        switch (doorState) {
            case DoorState.OPEN:
                return this.platform.Characteristic.TargetDoorState.OPEN;
            case DoorState.CLOSED:
                return this.platform.Characteristic.TargetDoorState.CLOSED;
            default:
                throw new Error("Unexpected door state: " + doorState);
        }
    }

    async handleGarageDoorTargetStateSet(value: CharacteristicValue) {
        this.tempTargetState = value;

        if (value === this.platform.Characteristic.TargetDoorState.OPEN) {
            await this.setDoorState(DoorState.OPEN);
        } else if (
            value === this.platform.Characteristic.TargetDoorState.CLOSED
        ) {
            await this.setDoorState(DoorState.CLOSED);
        } else {
            this.platform.log.error("Unexpected door state: " + value);
        }

        this.tempTargetState = undefined;
    }

    async getDoorState(): Promise<DoorState> {
        this.platform.log.debug("Querying door state...");

        const response = await tuxedoFetch(
            this.platform.config,
            "GetGarageDoorStatus",
            {
                nodeID: this.nodeID.toString(),
                operation: "set",
            },
        );

        const doorState = response["Result"]["Status"];

        this.platform.log.debug("Door state: " + doorState);

        if (doorState === "Close") {
            return DoorState.CLOSED;
        } else if (doorState === "Open") {
            return DoorState.OPEN;
        } else {
            throw new Error("Unexpected door state: " + doorState);
        }
    }

    async setDoorState(targetState: DoorState) {
        this.platform.log.debug("Setting door state: " + targetState);

        const action = targetState === DoorState.CLOSED ? "Close" : "Open";

        await tuxedoFetch(this.platform.config, "SetGarageDoorStatus", {
            nodeID: this.nodeID.toString(),
            cntrl: action,
            operation: "set",
        });

        this.platform.log.debug("Door state set: " + targetState);
    }
}
