import { API } from "homebridge";

import { PLATFORM_NAME } from "./settings.js";
import { TuxedoHomebridgePlatform } from "./platform.js";

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
    // @ts-expect-error - this is a valid call, config needs to extend TuxedoConfig
    api.registerPlatform(PLATFORM_NAME, TuxedoHomebridgePlatform);
};
