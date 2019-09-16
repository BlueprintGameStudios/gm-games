/* eslint-env node */

const browserStack = require("../../.browserstack.json");
const build = require("./tools/buildFuncs");

const customLaunchers = [
    {
        base: "BrowserStack",
        browser: "firefox",
        browser_version: "61.0", // Works back to 47 currently (52 is an LTS and the last release on XP)
        os: "Windows",
        os_version: "10",
    },
    {
        base: "BrowserStack",
        browser: "chrome",
        browser_version: "68.0", // Works back to 49 currently (last release on XP and some old Mac versions)
        os: "Windows",
        os_version: "10",
    },
    {
        base: "BrowserStack",
        browser: "safari",
        browser_version: "11.1", // Works back to 10 currently
        os: "OS X",
        os_version: "High Sierra",
    },
].reduce((acc, browser, i) => {
    acc[i] = browser;
    return acc;
}, {});

const sport = build.getSport();

const files = [
    "src/deion/test/mocha.js",
    `src/${sport}/worker/index.js`, // For overrides
    "src/deion/test/smoke.js",
];

module.exports = function(config) {
    config.set({
        frameworks: ["mocha", "browserify", "source-map-support"],

        files,

        preprocessors: {
            "src/**/*.js": ["browserify"],
        },

        autoWatch: false,

        singleRun: true,

        browserify: {
            debug: true,
            transform: [
                "babelify",
                ["envify", { SPORT: sport }],
                [
                    "aliasify",
                    {
                        aliases: {
                            "league-schema.json": `./public/football/files/league-schema.json`,
                        },
                    },
                ],
            ],
        },

        browserNoActivityTimeout: 5 * 60 * 1000, // 5 minutes
        browserDisconnectTimeout: 5 * 60 * 1000, // 5 minutes

        browserStack,

        customLaunchers,

        browsers: Object.keys(customLaunchers),
    });
};
