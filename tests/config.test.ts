import { describe, test } from "bun:test";
import { readYamlFile } from "@/utils";
import { globalConfigSchema, rawGuildConfigSchema } from "@managers/config/schema";
import { fromZodError } from "zod-validation-error";

import fs from "fs";

// Skip config validation on GitHub Actions
describe.skipIf(process.env.GITHUB_ACTIONS === "true")("config validation", () => {
	test("global config", () => {
		if (!fs.existsSync("azalea.cfg.yml")) {
			throw new Error("azalea.cfg.yml not found in root directory");
		}

		const data = readYamlFile("azalea.cfg.yml");
		const res = globalConfigSchema.safeParse(data);

		if (!res.success) {
			const error = fromZodError(res.error);
			throw new Error(error.toString());
		}
	});

	test("guild config", () => {
		if (!fs.existsSync("configs")) {
			throw new Error("configs directory not found in root directory");
		}

		const filenames = fs.readdirSync("configs");

		for (const filename of filenames) {
			const data = readYamlFile(`configs/${filename}`);
			const res = rawGuildConfigSchema.safeParse(data);

			if (!res.success) {
				const error = fromZodError(res.error);
				throw new Error(error.toString());
			}
		}
	});
});