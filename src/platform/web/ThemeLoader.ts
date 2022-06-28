/*
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type {ILogItem} from "../../logging/types";
import type {Platform} from "./Platform.js";
import {ThemeBuilder} from "./ThemeBuilder";

type NormalVariant = {
    id: string;
    cssLocation: string;
    variables?: any;
};

type DefaultVariant = {
    dark: NormalVariant & {
        variantName: string;
    };
    light: NormalVariant & {
        variantName: string;
    };
    default: NormalVariant & {
        variantName: string;
    };
}

export type ThemeInformation = NormalVariant | DefaultVariant; 

export enum ColorSchemePreference {
    Dark,
    Light
};

export class ThemeLoader {
    private _platform: Platform;
    private _themeMapping: Record<string, ThemeInformation>;
    private _themeBuilder: ThemeBuilder;

    constructor(platform: Platform) {
        this._platform = platform;
    }

    async init(manifestLocations: string[], log?: ILogItem): Promise<void> {
        const idToManifest = new Map();
        await this._platform.logger.wrapOrRun(log, "ThemeLoader.init", async (log) => {
            this._themeMapping = {};
            const results = await Promise.all(
                manifestLocations.map( location => this._platform.request(location, { method: "GET", format: "json", cache: true, }).response())
            );
            results.forEach(({ body }, i) => idToManifest.set(body.id, { manifest: body, location: manifestLocations[i] }));
            this._themeBuilder = new ThemeBuilder(idToManifest, this.preferredColorScheme);
            results.forEach(({ body }, i) => {
                if (body.extends) {
                    this._themeBuilder.populateDerivedTheme(body);
                }
                else {
                    this._populateThemeMap(body, manifestLocations[i], log);
                }
            });
            Object.assign(this._themeMapping, this._themeBuilder.themeMapping);
            console.log("derived theme mapping", this._themeBuilder.themeMapping);
        });
    }

    private _populateThemeMap(manifest, manifestLocation: string, log: ILogItem) {
        log.wrap("populateThemeMap", (l) => {
            /*
            After build has finished, the source section of each theme manifest
            contains `built-assets` which is a mapping from the theme-id to
            cssLocation of theme
            */
            const builtAssets: Record<string, string> = manifest.source?.["built-assets"];
            const themeName = manifest.name;
            let defaultDarkVariant: any = {}, defaultLightVariant: any = {};
            for (let [themeId, cssLocation] of Object.entries(builtAssets)) {
                /**
                 * This cssLocation is relative to the location of the manifest file.
                 * So we first need to resolve it relative to the root of this hydrogen instance.
                 */
                cssLocation = new URL(cssLocation, new URL(manifestLocation, window.location.origin)).href;
                const variant = themeId.match(/.+-(.+)/)?.[1];
                const { name: variantName, default: isDefault, dark } = manifest.values.variants[variant!];
                const themeDisplayName = `${themeName} ${variantName}`;
                if (isDefault) {
                    /**
                     * This is a default variant!
                     * We'll add these to the themeMapping (separately) keyed with just the
                     * theme-name (i.e "Element" instead of "Element Dark").
                     * We need to be able to distinguish them from other variants!
                     * 
                     * This allows us to render radio-buttons with "dark" and
                     * "light" options.
                    */
                    const defaultVariant = dark ? defaultDarkVariant : defaultLightVariant;
                    defaultVariant.variantName = variantName;
                    defaultVariant.id = themeId
                    defaultVariant.cssLocation = cssLocation;
                    continue;
                }
                // Non-default variants are keyed in themeMapping with "theme_name variant_name"
                // eg: "Element Dark"
                this._themeMapping[themeDisplayName] = {
                    cssLocation,
                    id: themeId
                };
            }
            if (defaultDarkVariant.id && defaultLightVariant.id) {
                /**
                 * As mentioned above, if there's both a default dark and a default light variant,
                 * add them to themeMapping separately.
                 */
                const defaultVariant = this.preferredColorScheme === ColorSchemePreference.Dark ? defaultDarkVariant : defaultLightVariant;
                this._themeMapping[themeName] = { dark: defaultDarkVariant, light: defaultLightVariant, default: defaultVariant };
            }
            else {
                /**
                 * If only one default variant is found (i.e only dark default or light default but not both),
                 * treat it like any other variant.
                 */
                const variant = defaultDarkVariant.id ? defaultDarkVariant : defaultLightVariant;
                this._themeMapping[`${themeName} ${variant.variantName}`] = { id: variant.id, cssLocation: variant.cssLocation };
            }
            //Add the default-theme as an additional option to the mapping
            const defaultThemeId = this.getDefaultTheme();
            if (defaultThemeId) {
                const themeDetails = this._findThemeDetailsFromId(defaultThemeId);
                if (themeDetails) {
                    this._themeMapping["Default"] = { id: "default", cssLocation: themeDetails.cssLocation };
                }
            }
            l.log({ l: "Default Theme", theme: defaultThemeId});
            l.log({ l: "Preferred colorscheme", scheme: this.preferredColorScheme === ColorSchemePreference.Dark ? "dark" : "light" });
            l.log({ l: "Result", themeMapping: this._themeMapping });
         });
    }

    setTheme(themeName: string, themeVariant?: "light" | "dark" | "default", log?: ILogItem) {
        this._platform.logger.wrapOrRun(log, { l: "change theme", name: themeName, variant: themeVariant }, () => {
            let cssLocation: string, variables: Record<string, string>;
            let themeDetails = this._themeMapping[themeName];
            if ("id" in themeDetails) {
                cssLocation = themeDetails.cssLocation;
                variables = themeDetails.variables;
            }
            else {
                if (!themeVariant) {
                    throw new Error("themeVariant is undefined!");
                }
                cssLocation = themeDetails[themeVariant].cssLocation;
                variables = themeDetails[themeVariant].variables;
            }
            this._platform.replaceStylesheet(cssLocation);
            if (variables) {
                this._themeBuilder.injectCSSVariables(variables);
            }
            this._platform.settingsStorage.setString("theme-name", themeName);
            if (themeVariant) {
                this._platform.settingsStorage.setString("theme-variant", themeVariant);
            }
            else {
                this._platform.settingsStorage.remove("theme-variant");
            }
        });
    }

    /** Maps theme display name to theme information */
    get themeMapping(): Record<string, ThemeInformation> {
        return this._themeMapping;
    }

    async getActiveTheme(): Promise<{themeName: string, themeVariant?: string}> {
        let themeName = await this._platform.settingsStorage.getString("theme-name");
        let themeVariant = await this._platform.settingsStorage.getString("theme-variant");
        if (!themeName || !this._themeMapping[themeName]) {
            themeName = "Default" in this._themeMapping ? "Default" : Object.keys(this._themeMapping)[0];
            if (!this._themeMapping[themeName][themeVariant]) {
                themeVariant = "default" in this._themeMapping[themeName] ? "default" : undefined;
            }
        }
        return { themeName, themeVariant };
    }

    getDefaultTheme(): string | undefined {
        switch (this.preferredColorScheme) {
            case ColorSchemePreference.Dark:
                return this._platform.config["defaultTheme"]?.dark;
            case ColorSchemePreference.Light:
                return this._platform.config["defaultTheme"]?.light;
        }
    }

    private _findThemeDetailsFromId(themeId: string): {themeName: string, cssLocation: string, variant?: string} | undefined {
        for (const [themeName, themeData] of Object.entries(this._themeMapping)) {
            if ("id" in themeData && themeData.id === themeId) {
                return { themeName, cssLocation: themeData.cssLocation };
            }
            else if ("light" in themeData && themeData.light?.id === themeId) {
                return { themeName, cssLocation: themeData.light.cssLocation, variant: "light" };
            }
            else if ("dark" in themeData && themeData.dark?.id === themeId) {
                return { themeName, cssLocation: themeData.dark.cssLocation, variant: "dark" };
            }
        }
    }

    get preferredColorScheme(): ColorSchemePreference | undefined {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            return ColorSchemePreference.Dark;
        }
        else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
            return ColorSchemePreference.Light;
        }
    }
}
