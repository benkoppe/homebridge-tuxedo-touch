import {
    unsafeFetch,
    signString,
    encryptData,
    decryptData,
} from "./helpers.js";

// type definition for constants defined in config.schema.json
export type TuxedoConfig = {
    tuxedo_ip: string;
    tuxedo_port?: number;
    tuxedo_private_key: string;
    tuxedo_code: string;
    device_mac: string;
};

// static api constants
const API_REV = "API_REV01";

// static api methods
export async function tuxedoFetch(
    config: TuxedoConfig,
    apiPath: string,
    params: Record<string, string>,
) {
    const { keyEnc, ivEnc } = splitPrivateKey(config);

    const searchParams = new URLSearchParams(params);
    const encryptedSearchParams = encryptData(
        searchParams.toString(),
        keyEnc,
        ivEnc,
    );

    const fullPath = getFullApiPath(config, apiPath);
    const header = `MACID:${config.device_mac},Path:${API_REV}/${apiPath}`;
    const authToken = signString(header, keyEnc);

    const body = createBodyString({
        param: encryptedSearchParams,
        len: encryptedSearchParams.length,
        tstamp: Math.random(),
    });

    const response = await unsafeFetch(fullPath, {
        method: "POST",
        headers: {
            identity: ivEnc,
            authToken,
            PRAGMA: "no-cache",
            CACHE_CONTROL: "no-cache",
            "content-type": "application/x-www-form-urlencoded",
        },
        body,
    });

    const json = await response.json();

    return JSON.parse(decryptData(json["Result"], keyEnc, ivEnc));
}

function splitPrivateKey(config: TuxedoConfig) {
    const privateKey = config.tuxedo_private_key;

    const keyEnc = privateKey.slice(0, 64);
    const ivEnc = privateKey.slice(64);

    return { keyEnc, ivEnc };
}

function getFullApiPath(config: TuxedoConfig, path: string) {
    let fullPath = `https://${config.tuxedo_ip}`;
    if (config.tuxedo_port) {
        fullPath += `:${config.tuxedo_port}`;
    }
    fullPath += `/system_http_api/${API_REV}/${path}`;

    return fullPath;
}

function createBodyString(body: Record<string, string | number>) {
    const bodyStringItems = Object.entries(body).map(([key, value]) => {
        return `${key}=${value}`;
    });
    return bodyStringItems.join("&");
}
