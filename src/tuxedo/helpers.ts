import crypto from "crypto";
import { Agent } from "undici";

/**
 * Static helper functions for Tuxedo API calls
 */

/** Fetch helper function */

// custom dispatcher for unsafe fetch
const defaultDispatcher = new Agent({
    connect: {
        rejectUnauthorized: false,
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    },
});

// unsafe fetch function that doesn't check for SSL certificates
// this is REQUIRED for Tuxedo API calls (unsafe certificates)
export async function unsafeFetch(
    url: string | URL | Request,
    options: RequestInit = {},
): Promise<Response> {
    const modifiedOptions = {
        ...options,
        dispatcher: defaultDispatcher,
    };

    return fetch(url, modifiedOptions);
}

/** Security helper functions */

// sign a hmac-sha1 string
export function signString(value: string, secretKey: string) {
    const hmac = crypto.createHmac("sha1", secretKey);
    hmac.update(value);
    return hmac.digest("hex");
}

// data encryption helper
export function encryptData(
    data: string,
    keyString: string,
    ivString: string,
): string {
    const key = Buffer.from(keyString, "hex");
    const iv = Buffer.from(ivString, "hex");
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");

    return encodeURIComponent(encrypted);
}

// data decryption helper
export function decryptData(
    data: string,
    keyString: string,
    ivString: string,
): string {
    const key = Buffer.from(keyString, "hex");
    const iv = Buffer.from(ivString, "hex");

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

    let decrypted = decipher.update(decodeURIComponent(data), "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}
