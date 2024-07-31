import { chromium, Browser, Page, BrowserContext } from "playwright";
import { parse, type HTMLElement } from "node-html-parser";
import fs from "fs";
import { setTimeout } from "timers/promises";

import { Logging } from "homebridge";

import type { TuxedoConfig } from "./config";

// static web portal constants
const PORTAL_CONSTANTS = {
    LOGIN_URL: "authenticated/index.html?url=zwavedevicelist.html",
    PROTECTED_URL: "zwavedevicelist.html",
};
const COOKIE_FILE_PATH = "static/cookies.json";

// relate light types to their respective button container classes
const LIGHT_TYPE_BUTTON_CONTAINER_CLASSES = {
    binary: "onoffBtnContainer",
    dimmer: "onoffDimmerBtnContainer",
};
// button anchor prefix that will source node ID
const IDENTIFYING_ANCHOR_PREFIX = "deviceOff";
const UNACCEPTABLE_ANCHOR_TEXT = ["Open"];

// on light icon
const LIGHT_ON_ICON_CLASS = "cell_switch_bulb_on";
const LIGHT_OFF_ICON_CLASS = "cell_switch_bulb_off";

// light types
export type LightType = keyof typeof LIGHT_TYPE_BUTTON_CONTAINER_CLASSES;

type Light = {
    name: string;
    nodeId: number;
    type: LightType;
};

export class TuxedoScraper {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private context: BrowserContext | null = null;

    private readonly loginUrl: string;
    private readonly protectedUrl: string;
    private readonly cookieFilePath: string = COOKIE_FILE_PATH;

    constructor(
        private readonly config: TuxedoConfig,
        private readonly log?: Logging,
    ) {
        this.loginUrl = this.getFullPath(PORTAL_CONSTANTS.LOGIN_URL);
        this.protectedUrl = this.getFullPath(PORTAL_CONSTANTS.PROTECTED_URL);
    }

    getFullPath(path: string) {
        let fullPath = `https://${this.config.tuxedo_ip}`;
        if (this.config.tuxedo_port) {
            fullPath += `:${this.config.tuxedo_port}`;
        }

        fullPath += `/${path}`;

        return fullPath;
    }

    async init() {
        this.browser = await chromium.launch({ headless: true });
        this.context = await this.browser.newContext({
            ignoreHTTPSErrors: true,
        });

        if (fs.existsSync(this.cookieFilePath)) {
            const cookies = JSON.parse(
                fs.readFileSync(this.cookieFilePath, "utf-8"),
            );
            await this.context.addCookies(cookies);
        }

        this.page = await this.context.newPage();
        await this.ensureLoggedIn();
        this.startSessionChecker();
    }

    private async ensureLoggedIn() {
        if (!this.page) {
            return;
        }

        await this.gotoDeviceList();
        if (this.page.url() !== this.protectedUrl) {
            await this.gotoLogin();

            await this.page.fill("#j_username", this.config.scraper_username);
            await this.page.fill("#j_password", this.config.scraper_password);
            await this.page.click("#login_confirm");

            await this.page.waitForURL(this.protectedUrl);

            if (this.context) {
                const cookies = await this.context.cookies();
                fs.writeFileSync(this.cookieFilePath, JSON.stringify(cookies));
            }
        } else {
            if (this.log) {
                this.log.debug("Already logged in.");
            }
        }
    }

    private startSessionChecker() {
        setInterval(async () => {
            if (this.log) {
                this.log.debug("Checking session...");
            }

            if (!this.page) {
                return;
            }

            await this.gotoDeviceList();
            if (this.page.url() !== this.protectedUrl) {
                await this.ensureLoggedIn();
            } else {
                if (this.log) {
                    this.log.debug("Session is still active.");
                }
            }
        }, 3 * 60 * 1000); // Check every 3 minutes
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    private async goto(fullPath: string) {
        if (!this.page) {
            return;
        }

        if (this.page.url() === fullPath) {
            return;
        }

        await this.page.goto(fullPath);
    }

    private async gotoDeviceList(type: "load" | "load_fully" = "load") {
        await this.goto(this.protectedUrl);

        if (type === "load_fully") {
            await this.waitForDeviceListUploadTextToDisappear();
        }
    }

    private async gotoLogin() {
        await this.goto(this.loginUrl);
    }

    private async getDeviceListRoot(): Promise<HTMLElement | null> {
        if (!this.page) {
            return null;
        }

        await this.gotoDeviceList("load_fully");

        const html = await this.page.content();

        return parse(html);
    }

    async getLightList(): Promise<Light[]> {
        const root = await this.getDeviceListRoot();

        if (!root) {
            return [];
        }

        const lights: Light[] = [];

        Object.entries(LIGHT_TYPE_BUTTON_CONTAINER_CLASSES).forEach(
            ([type, container_class]) => {
                const containers = root.querySelectorAll(`.${container_class}`);

                for (const container of containers) {
                    const itemContainer =
                        container.parentNode.parentNode.parentNode;

                    const nameElement =
                        itemContainer.querySelector(".deviceNameText");
                    const identifyingAnchor = itemContainer.querySelector(
                        `[id^="${IDENTIFYING_ANCHOR_PREFIX}"]`,
                    );

                    // catch cases where identifyingAnchor is not a light
                    if (
                        identifyingAnchor &&
                        UNACCEPTABLE_ANCHOR_TEXT.includes(
                            identifyingAnchor.textContent,
                        )
                    ) {
                        continue;
                    }

                    if (!nameElement || !identifyingAnchor) {
                        if (this.log) {
                            this.log.error(
                                "Could not find name or identifying anchor.",
                            );
                        }
                        continue;
                    }

                    const name = nameElement.textContent;
                    const nodeId = parseInt(
                        identifyingAnchor.id.replace(
                            IDENTIFYING_ANCHOR_PREFIX,
                            "",
                        ),
                    );

                    if (this.log) {
                        this.log.info(
                            `Found light: ${name} with node ID ${nodeId}`,
                        );
                    }

                    lights.push({ name, nodeId, type: type as LightType });
                }
            },
        );

        return lights;
    }

    async getLightState(
        nodeId: number,
    ): Promise<{ state: "on" | "off"; percentage?: number } | null> {
        const root = await this.getDeviceListRoot();

        if (!root) {
            return null;
        }

        const light = root.querySelector(
            `#${IDENTIFYING_ANCHOR_PREFIX}${nodeId}`,
        )?.parentNode.parentNode.parentNode.parentNode;

        if (!light) {
            return null;
        }

        const dimmerPercentageElement =
            light.querySelector(".dimmerPercentage");
        const dimmerPercentageString =
            dimmerPercentageElement?.getAttribute("value");

        if (dimmerPercentageString) {
            const percentage = parseInt(dimmerPercentageString);

            if (percentage === 0) {
                return { state: "off", percentage };
            }

            return { state: "on", percentage };
        }

        const lightOnIcon = light.querySelector(`.${LIGHT_ON_ICON_CLASS}`);

        if (lightOnIcon) {
            return { state: "on" };
        }

        const lightOffIcon = light.querySelector(`.${LIGHT_OFF_ICON_CLASS}`);

        if (lightOffIcon) {
            return { state: "off" };
        }

        throw new Error("Could not determine light state.");
    }

    async setLightState(nodeId: number, state: "on" | "off", type: LightType) {
        if (type === "dimmer") {
            if (state === "on") {
                return this.setLightPercentage(nodeId, 100);
            } else {
                return this.setLightPercentage(nodeId, 0);
            }
        }

        const encryptionKeys = await this.getEncryptionKeys();

        if (!encryptionKeys) {
            return;
        }

        const { sessionId, tokenKey } = encryptionKeys;

        await this.sendCommand({
            cmd: "109",
            Type: "109",
            pID: nodeId.toString(),
            uCode: state === "on" ? "255" : "0",
            sessionid: sessionId,
            filters: "0",
            index: "0",
            tarTemp: "0",
            tokenkey: tokenKey,
            sid: Math.random().toString(),
        });
    }

    async setLightPercentage(nodeId: number, percentage: number) {
        const encryptionKeys = await this.getEncryptionKeys();

        if (!encryptionKeys) {
            return;
        }

        const { sessionId, tokenKey } = encryptionKeys;

        await this.sendCommand({
            cmd: "111",
            Type: "111",
            pID: nodeId.toString(),
            uCode: "1",
            sessionid: sessionId,
            filters: percentage.toString(),
            index: "0",
            tarTemp: "0",
            tokenkey: tokenKey,
            sid: Math.random().toString(),
        });
    }

    private async sendCommand(attributes: Record<string, string>) {
        const url = this.getFullPath(
            `handlerequest.html?${new URLSearchParams(attributes)}`,
        );

        await this.fetchRoot(url);

        await this.refreshData();
    }

    private async waitForDeviceListUploadTextToDisappear() {
        if (!this.page) {
            return;
        }

        await this.page.waitForFunction(() => {
            const element = document.querySelector("#infoDiv");
            return element && getComputedStyle(element).display === "none";
        });
    }

    private async getEncryptionKeys(): Promise<{
        sessionId: string;
        tokenKey: string;
    } | null> {
        const root = await this.getDeviceListRoot();

        if (!root) {
            return null;
        }

        const sessionId = root
            .querySelector("#hidSession")
            ?.getAttribute("value");

        const eventHandlerRoot = await this.fetchRoot(
            this.getFullPath("eventhandler.html"),
        );
        const tokenKey = eventHandlerRoot
            .querySelector("#hiddenKey")
            ?.getAttribute("value");

        if (!sessionId || !tokenKey) {
            return null;
        }

        return {
            sessionId,
            tokenKey,
        };
    }

    private async fetchRoot(
        fullPath: string,
        options: RequestInit = {},
    ): Promise<HTMLElement> {
        await this.ensureLoggedIn();

        if (!this.page) {
            throw new Error("Page not initialized.");
        }

        const response = await this.page.evaluate(
            async ([fullPath, options]) => {
                return await fetch(
                    fullPath as string,
                    options as RequestInit,
                ).then((r) => (r.ok ? r.text() : Promise.reject(r)));
            },
            [fullPath, options],
        );

        return parse(response);
    }

    private async refreshData() {
        await this.gotoDeviceList();
        await setTimeout(3 * 1000);
        await this.page?.reload();
    }
}
