export enum TuxedoSecurityType {
    // Stay states
    ArmedStay = "Armed Stay",
    ArmedStayFault = "Armed Stay Fault",

    // Away states
    ArmedAway = "Armed Away",
    ArmedAwayFault = "Armed Away Fault",

    // Night states
    ArmedNight = "Armed Night",
    ArmedNightFault = "Armed Night Fault",
    ArmedInstant = "Armed Instant",
    ArmedInstantFault = "Armed Instant Fault",

    // Off states
    ReadyFault = "Ready Fault",
    ReadyToArm = "Ready To Arm",
    NotReady = "Not Ready",
    NotReadyFault = "Not Ready Fault",

    // Triggered states
    EntryDelayActive = "Entry Delay Active",
    NotReadyAlarm = "Not Ready Alarm",
    ArmedStayAlarm = "Armed Stay Alarm",
    ArmedNightAlarm = "Armed Night Alarm",
    ArmedAwayAlarm = "Armed Away Alarm",
}

export function getTuxedoSecurityType(
    value: string,
): TuxedoSecurityType | undefined {
    const type = (Object.values(TuxedoSecurityType) as string[]).includes(value)
        ? (value as TuxedoSecurityType)
        : undefined;

    if (type === undefined && value.includes("Secs Remaining")) {
        return TuxedoSecurityType.EntryDelayActive;
    }

    return type;
}
