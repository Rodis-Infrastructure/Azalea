import fs from "fs";
import YAML from "yaml";
import { Config } from "./config.ts";

export function pluralize(count: number, singular: string, plural?: string): string {
    plural ??= `${singular}s`;
    return count === 1 ? singular : plural;
}

export function readYamlFile<T>(path: string): T {
    const raw = fs.readFileSync(path, "utf-8");
    return YAML.parse(raw);
}