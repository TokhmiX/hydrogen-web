const path = require("path");
const mergeOptions = require('merge-options');
const themeBuilder = require("./scripts/build-plugins/rollup-plugin-build-themes");
const {commonOptions, compiledVariables} = require("./vite.common-config.js");

// These paths will be saved without their hash so they havea  consisent path to
// reference
const pathsToExport = [
    "main.js",
    "download-sandbox.html",
    "theme-element-light.css",
    "theme-element-dark.css",
];

export default mergeOptions(commonOptions, {
    root: "src/",
    base: "./",
    build: {
        outDir: "../target/asset-build/",
        rollupOptions: {
            output: {
              assetFileNames: (chunkInfo) => {
                  // Get rid of the hash so we can consistently reference these
                  // files in our `package.json` `exports`
                  if(pathsToExport.includes(path.basename(chunkInfo.name))) {
                    return "assets/[name].[ext]";
                  }

                return "assets/[name]-[hash][extname]";
              }
            }
        }
    },
    plugins: [
        themeBuilder({
            themeConfig: {
                themes: { element: "./src/platform/web/ui/css/themes/element" },
                default: "element",
            },
            compiledVariables,
        }),
    ],
});
