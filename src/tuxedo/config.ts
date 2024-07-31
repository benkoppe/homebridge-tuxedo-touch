// type definition for constants defined in config.schema.json
export type TuxedoConfig = {
    tuxedo_ip: string;
    tuxedo_port?: number;
    tuxedo_private_key: string;
    tuxedo_code: string;
    device_mac: string;

    // scraper-specific config
    scraper_username: string;
    scraper_password: string;
};
