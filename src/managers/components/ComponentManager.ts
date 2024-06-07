import { InteractionReplyData } from "@utils/types";
import { Collection } from "discord.js";
import { pluralize } from "@/utils";

import Component, { ComponentInteraction, CustomID } from "./Component";
import Logger, { AnsiColor } from "@utils/logger";
import Sentry from "@sentry/node";
import path from "path";
import fs from "fs";

// Utility class for handling component interactions.
export default class ComponentManager {
    // Cached components mapped by their custom IDs.
    private static readonly _cache = new Collection<CustomID, Component>;

    // Caches all components from the components directory.
    static async cache(): Promise<void> {
        const dirpath = path.resolve("src/components");

        if (!fs.existsSync(dirpath)) {
            Logger.info("Skipping component caching: components directory not found");
            return;
        }

        Logger.info("Caching components...");

        const filenames = fs.readdirSync(dirpath);
        let componentCount = 0;

        try {
            for (const filename of filenames) {
                const filepath = path.resolve(dirpath, filename);

                // Import and initiate the component
                const componentModule = await import(filepath);
                const componentClass = componentModule.default;
                const component = new componentClass();

                // Ensure the component is an instance of the Component class
                if (!(component instanceof Component)) {
                    continue;
                }

                // Cache the component
                ComponentManager._cache.set(component.customId, component);
                const parsedCustomId = ComponentManager.parseCustomId(component.customId);

                Logger.log("GLOBAL", `Cached component "${parsedCustomId}"`, {
                    color: AnsiColor.Purple
                });

                componentCount++;
            }
        } catch (error) {
            Sentry.captureException(error);
        }

        Logger.info(`Cached ${componentCount} ${pluralize(componentCount, "component")}`);
    }

    private static _getComponent(customId: string): Component | undefined {
        return ComponentManager._cache.find(component => {
            if (typeof component.customId === "string") {
                return component.customId === customId;
            }

            if ("matches" in component.customId) {
                return customId.match(component.customId.matches);
            }

            if ("startsWith" in component.customId) {
                return customId.startsWith(component.customId.startsWith);
            }

            if ("endsWith" in component.customId) {
                return customId.endsWith(component.customId.endsWith);
            }

            return customId.includes(component.customId.includes);
        });
    }

    /**
     * Parses a string/object custom ID to a string.
     *
     * @param customId - The custom ID to parse.
     * @returns The parsed custom ID as a string.
     */
    static parseCustomId(customId: CustomID): string {
        if (typeof customId === "string") {
            return customId;
        }

        switch (true) {
            case "matches" in customId:
                return `matches(${customId.matches.toString()})`;
            case "startsWith" in customId:
                return `startsWith(${customId.startsWith})`;
            case "endsWith" in customId:
                return `endsWith(${customId.endsWith})`;
            case "includes" in customId:
                return `includes(${customId.includes})`;
            default:
                return "unknown";
        }
    }

    static handle(interaction: ComponentInteraction): Promise<InteractionReplyData> | InteractionReplyData {
        // Retrieve the component's instance from cache by its custom ID
        const component = ComponentManager._getComponent(interaction.customId);

        if (!component) {
            const parsedCustomId = ComponentManager.parseCustomId(interaction.customId);
            throw new Error(`Component "${parsedCustomId}" not found`);
        }

        return component.execute(interaction);
    }
}