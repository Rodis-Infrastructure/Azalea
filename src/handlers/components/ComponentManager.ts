import { AbstractInstanceType } from "../../utils/types.ts";
import { pluralize } from "../../utils";

import Component from "./Component.ts";
import Logger from "../../utils/logger.ts";
import path from "path";
import fs from "fs";

export class ComponentManager {
    // Class instances of components mapped by their customId
    private static instances = new Map<string, Component>;

    // Create instances of all components and store them in a map
    static async register(): Promise<void> {
        const dirpath = path.resolve(import.meta.dir, "../../components");
        const filenames = fs.readdirSync(dirpath);

        for (const filename of filenames) {
            const filepath = path.resolve(dirpath, filename);

            const componentModule = await import(filepath);
            const componentClass = componentModule.default;
            const component: AbstractInstanceType<typeof Component> = new componentClass();

            this.instances.set(component.customId, component);
        }

        Logger.info(`Registered ${this.instances.size} ${pluralize(this.instances.size, "component")}`);
    }

    static getComponent(customId: string): Component | null {
        return this.instances.get(customId) ?? null;
    }
}