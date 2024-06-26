export const logOptions = {
    type: "pretty" as "json" | "pretty" | "hidden",
    name: "Crawler",
    hideLogPositionForProduction: true,
    prettyLogTemplate: "{{name}} {{logLevelName}} ",
    prettyLogStyles: {
        logLevelName: {
            SILLY: ["white"],
            TRACE: ["whiteBright"],
            DEBUG: ["green"],
            INFO: ["blue"],
            WARN: ["yellow"],
            ERROR: ["red"],
            FATAL: ["redBright"],
        },
        name: ["green"],
        dateIsoStr: "white",
        filePathWithLine: "white",
        nameWithDelimiterPrefix: ["white"],
        nameWithDelimiterSuffix: ["white"],
        errorName: ["bgRedBright", "whiteBright"],
        fileName: ["yellow"],
    },
    minLevel: 0,
};
