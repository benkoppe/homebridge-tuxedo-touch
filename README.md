<p align="center">

<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

<span align="center">

# Homebridge Tuxedo Touch Plugin

</span>

This is a Homebridge plugin for the Honeywell Tuxedo Touch LAN webpage. Currently a major work in progress, and not really ready for the public -- only developed for personal testing & use.

Only supports these components:

-   Alarm Panel
-   Z-Wave Garage Door
-   Z-Wave Lightbulb (\*\*\*)

Leaving this open for anyone else with this very specific need. Please see the details in the section below before using.

# DETAILS: How it works (and some setup! todo: improve this)

When the Tuxedo Touch is connected to home internet, a mini API is hosted on the same port. This is _mostly_ (\*\*\*) how these components work. Access the API "documentation" on your desktop browser, follow the authentication steps to enroll your computer/server's MAC address, and enter everything (including the private key) in the homebridge config.

Now, your components will work through this API through your Node server. Homekit data isn't always accurate - as far as I know, this is a limitation of Tuxedo's API.

## \*\*\* - IMPORTANT CAVEAT: What about the lights?

I don't know how many Tuxedo Touches there are in the world, but mine won't list any of my Z-Wave lights in the web API. They appear fine in the GUI interface, but the API can't query for them or control them given the Node ID. As a result, the light bulbs instead work by scraping the web interface with a headless Firefox playwright browser and a regular user login. These must also be included in the plugin config. Light states are set using the same GET command requests as the web interface.

Currently, this is very crudely written - the config _must_ be provided, even if you don't have any lights; it isn't good at being locked out; the page is parsed using hard-coded HTML ids and classes, which is only okay because it hasn't been updated in ten years; and there's nothing I can seem to do about overloading the Tuxedo connection and needing to reboot the panel (like everything Tuxedo, no one is talking about this online, so who knows if this is my fault). But it works for my needs!

If the Tuxedo Touch community is willing to come out of the woodwork to build this into what it could be, please show yourselves :)

_Mostly a copy of the Homebridge default plugin README:_

### Setup Development Environment

To develop this Homebridge plugin you must have Node.js 18 or later installed. This plugin uses [TypeScript](https://www.typescriptlang.org/). Set up an environment with these tools, as well as the Vs Code extension [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).

### Install Development Dependencies

Inside your terminal, navigate to the project folder and run this command to install the development dependencies:

```shell
npm install
```

### Build Plugin

TypeScript needs to be compiled into JavaScript before it can run. The following command will compile the contents of the [`src`](./src) directory and put the resulting code into the `dist` folder.

```shell
npm run build
```

### Link To Homebridge

Run this command so your global installation of Homebridge can discover the plugin in your development environment:

```shell
npm link
```

You can now start Homebridge, use the `-D` flag, so you can see debug log messages in your plugin:

```shell
homebridge -D
```

### Watch For Changes and Build Automatically

If you want to have your code compile automatically as you make changes, and restart Homebridge automatically between changes, you first need to add this plugin as a platform in `~/.homebridge/config.json`:

```
{
...
    "platforms": [
        {
            "name": "Config",
            "port": 8581,
            "platform": "config"
        },
        {
            "name": "<PLUGIN_NAME>",
            //... any other options, as listed in config.schema.json ...
            "platform": "<PLATFORM_NAME>"
        }
    ]
}
```

and then you can run:

```shell
npm run watch
```

This will launch an instance of Homebridge in debug mode which will restart every time you make a change to the source code. It will load the config stored in the default location under `~/.homebridge`. You may need to stop other running instances of Homebridge while using this command to prevent conflicts. You can adjust the Homebridge startup command in the [`nodemon.json`](./nodemon.json) file.

### Publish Package

-- Package not yet published. --

When you are ready to publish your plugin to [npm](https://www.npmjs.com/), make sure you have removed the `private` attribute from the [`package.json`](./package.json) file then run:

```shell
npm publish
```

If you are publishing a scoped plugin, i.e. `@username/homebridge-xxx` you will need to add `--access=public` to command the first time you publish.

#### Publishing Beta Versions

Publish _beta_ versions of this plugin for other users to test before releasing it to everyone.

```shell
# create a new pre-release version (eg. 2.1.0-beta.1)
npm version prepatch --preid beta

# publish to @beta
npm publish --tag=beta
```

Users can then install the _beta_ version by appending `@beta` to the install command, for example:

```shell
sudo npm install -g homebridge-example-plugin@beta
```

### Best Practices

Consider creating your plugin with the [Homebridge Verified](https://github.com/homebridge/verified) criteria in mind. This will help you to create a plugin that is easy to use and works well with Homebridge.
You can then submit your plugin to the Homebridge Verified list for review.
The most up-to-date criteria can be found [here](https://github.com/homebridge/verified#requirements).
For reference, the current criteria are:

-   The plugin must successfully install.
-   The plugin must implement the [Homebridge Plugin Settings GUI](https://github.com/oznu/homebridge-config-ui-x/wiki/Developers:-Plugin-Settings-GUI).
-   The plugin must not start unless it is configured.
-   The plugin must not execute post-install scripts that modify the users' system in any way.
-   The plugin must not contain any analytics or calls that enable you to track the user.
-   The plugin must not throw unhandled exceptions, the plugin must catch and log its own errors.
-   The plugin must be published to npm and the source code available on GitHub.
    -   A GitHub release - with patch notes - should be created for every new version of your plugin.
-   The plugin must run on all [supported LTS versions of Node.js](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js), at the time of writing this is Node.js v16 and v18.
-   The plugin must not require the user to run Homebridge in a TTY or with non-standard startup parameters, even for initial configuration.
-   If the plugin needs to write files to disk (cache, keys, etc.), it must store them inside the Homebridge storage directory.
