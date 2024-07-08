import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { TuxedoHomebridgePlatform } from "./platform";

import { tuxedoFetch } from "./tuxedo/api.js";
import {
    getTuxedoSecurityType,
    TuxedoSecurityType,
} from "./tuxedo/securityTypes.js";

/**
 * Security System Accessory
 */
export class TuxedoSecuritySystemAccessory {
    private service: Service;

    // temp target state to handle state changes
    private tempTargetState: CharacteristicValue | undefined = undefined;

    constructor(
        private readonly platform: TuxedoHomebridgePlatform,
        private readonly accessory: PlatformAccessory,
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

        // get the security system service if it exists, otherwise create a new one
        this.service =
            this.accessory.getService(this.platform.Service.SecuritySystem) ||
            this.accessory.addService(this.platform.Service.SecuritySystem);

        // set the service name
        this.service.setCharacteristic(
            this.platform.Characteristic.Name,
            accessory.context.device.displayName,
        );

        // register handlers for the Security System State Characteristic
        this.service
            .getCharacteristic(
                this.platform.Characteristic.SecuritySystemCurrentState,
            )
            .onGet(this.handleSecuritySystemCurrentStateGet.bind(this));

        // register handlers for the Security System Target State Characteristic
        this.service
            .getCharacteristic(
                this.platform.Characteristic.SecuritySystemTargetState,
            )
            .onSet(this.handleSecuritySystemTargetStateSet.bind(this))
            .onGet(this.handleSecuritySystemTargetStateGet.bind(this));
    }

    async handleSecuritySystemTargetStateGet() {
        this.platform.log.debug("Get Security System Target State");

        if (this.tempTargetState !== undefined) {
            this.platform.log.debug(
                "Returning temporary target state: " + this.tempTargetState,
            );

            return this.tempTargetState;
        }

        const securityState = await this.getSecurityState();

        switch (securityState) {
            case TuxedoSecurityType.ArmedStay:
            case TuxedoSecurityType.ArmedStayFault:
            case TuxedoSecurityType.ArmedStayAlarm:
                return this.platform.Characteristic.SecuritySystemTargetState
                    .STAY_ARM;
            case TuxedoSecurityType.ArmedAway:
            case TuxedoSecurityType.ArmedAwayFault:
            case TuxedoSecurityType.ArmedAwayAlarm:
            case TuxedoSecurityType.EntryDelayActive:
                return this.platform.Characteristic.SecuritySystemTargetState
                    .AWAY_ARM;
            case TuxedoSecurityType.ArmedNight:
            case TuxedoSecurityType.ArmedNightFault:
            case TuxedoSecurityType.ArmedInstant:
            case TuxedoSecurityType.ArmedInstantFault:
            case TuxedoSecurityType.ArmedNightAlarm:
                return this.platform.Characteristic.SecuritySystemTargetState
                    .NIGHT_ARM;
            case TuxedoSecurityType.ReadyFault:
            case TuxedoSecurityType.ReadyToArm:
            case TuxedoSecurityType.NotReady:
            case TuxedoSecurityType.NotReadyFault:
            case TuxedoSecurityType.NotReadyAlarm:
                return this.platform.Characteristic.SecuritySystemTargetState
                    .DISARM;
            default:
                throw new Error("Unknown security state: " + securityState);
        }
    }

    async handleSecuritySystemCurrentStateGet() {
        this.platform.log.debug("Get Security System Current State");

        const securityState = await this.getSecurityState();

        switch (securityState) {
            case TuxedoSecurityType.ArmedStay:
            case TuxedoSecurityType.ArmedStayFault:
                return this.platform.Characteristic.SecuritySystemCurrentState
                    .STAY_ARM;
            case TuxedoSecurityType.ArmedAway:
            case TuxedoSecurityType.ArmedAwayFault:
                return this.platform.Characteristic.SecuritySystemCurrentState
                    .AWAY_ARM;
            case TuxedoSecurityType.ArmedNight:
            case TuxedoSecurityType.ArmedNightFault:
            case TuxedoSecurityType.ArmedInstant:
            case TuxedoSecurityType.ArmedInstantFault:
                return this.platform.Characteristic.SecuritySystemCurrentState
                    .NIGHT_ARM;
            case TuxedoSecurityType.ReadyFault:
            case TuxedoSecurityType.ReadyToArm:
            case TuxedoSecurityType.NotReady:
            case TuxedoSecurityType.NotReadyFault:
                return this.platform.Characteristic.SecuritySystemCurrentState
                    .DISARMED;
            case TuxedoSecurityType.EntryDelayActive:
            case TuxedoSecurityType.NotReadyAlarm:
            case TuxedoSecurityType.ArmedStayAlarm:
            case TuxedoSecurityType.ArmedNightAlarm:
            case TuxedoSecurityType.ArmedAwayAlarm:
                return this.platform.Characteristic.SecuritySystemCurrentState
                    .ALARM_TRIGGERED;
            default:
                throw new Error("Unknown security state: " + securityState);
        }
    }

    async handleSecuritySystemTargetStateSet(value: CharacteristicValue) {
        this.platform.log.debug("Set Security System State: " + value);

        this.tempTargetState = value;

        try {
            switch (value) {
                case this.platform.Characteristic.SecuritySystemTargetState
                    .STAY_ARM:
                    await this.setArmedState("stay");
                    break;
                case this.platform.Characteristic.SecuritySystemTargetState
                    .AWAY_ARM:
                    await this.setArmedState("away");
                    break;
                case this.platform.Characteristic.SecuritySystemTargetState
                    .NIGHT_ARM:
                    await this.setArmedState("night");
                    break;
                case this.platform.Characteristic.SecuritySystemTargetState
                    .DISARM:
                    await this.setDisarmedState();
                    break;
            }
        } catch (error) {
            this.platform.log.error(
                "Error setting security system state: " + error,
            );
        }

        this.tempTargetState = undefined;
    }

    // Tuxedo API calls

    async setArmedState(targetState: "away" | "stay" | "night") {
        const arming = targetState.toUpperCase();
        const partition = 1;

        return await tuxedoFetch(
            this.platform.config,
            "AdvancedSecurity/ArmWithCode",
            {
                arming,
                pID: partition.toString(),
                ucode: this.platform.config.tuxedo_code,
                operation: "set",
            },
        );
    }

    async setDisarmedState() {
        const partition = 1;

        return await tuxedoFetch(
            this.platform.config,
            "AdvancedSecurity/DisarmWithCode",
            {
                pID: partition.toString(),
                ucode: this.platform.config.tuxedo_code,
                operation: "set",
            },
        );
    }

    async getSecurityState(): Promise<TuxedoSecurityType> {
        this.platform.log.debug("Get Tuxedo Security State");

        const securityState = await tuxedoFetch(
            this.platform.config,
            "GetSecurityStatus",
            {
                operation: "get",
            },
        );

        const securityStatus = securityState["Status"];
        const securityType = getTuxedoSecurityType(securityStatus);

        this.platform.log.debug(
            "Security System Tuxedo Status: " + securityStatus,
        );

        this.platform.log.debug(
            "Security System Tuxedo State: " + securityType,
        );

        if (securityType === undefined) {
            throw new Error("Unknown security type: " + securityStatus);
        }

        return securityType;
    }
}
