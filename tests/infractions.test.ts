import { InfractionAction, InfractionSource, InfractionUtil } from "@utils/infractions";
import { Colors } from "discord.js";
import { describe, expect, test } from "bun:test";

describe(InfractionUtil.formatReason.name, () => {
	test("strips embedded inline code and code blocks", () => {
		const original = "This `is` a test ```reason```";
		expect(InfractionUtil.formatReason(original)).toBe("(`This is a test reason`)");
	});

	test("wraps a clean reason without modification", () => {
		expect(InfractionUtil.formatReason("This is a test reason")).toBe("(`This is a test reason`)");
	});
});

describe(InfractionUtil.formatReasonPreview.name, () => {
	test("removes a trailing purge log link", () => {
		const link = "https://example.com";
		const reason = `This is a test reason ${link} (Purge log: ${link})`;
		expect(InfractionUtil.formatReasonPreview(reason)).toBe("This is a test reason");
	});
});

describe(InfractionUtil.formatAction.name, () => {
	test("combines source flag and action name", () => {
		expect(InfractionUtil.formatAction(InfractionAction.Ban, InfractionSource.Quick))
			.toBe("Quick Ban");
		expect(InfractionUtil.formatAction(InfractionAction.Mute, InfractionSource.Automatic))
			.toBe("Automatic Mute");
		expect(InfractionUtil.formatAction(InfractionAction.Note, InfractionSource.Native))
			.toBe("Native Note");
	});

	test("omits the flag when source is unknown to the enum", () => {
		// Cast covers the runtime case where a freshly-stored infraction has flag = 0
		expect(InfractionUtil.formatAction(InfractionAction.Mute, 0 as InfractionSource)).toBe("Mute");
	});
});

describe(InfractionUtil.mapActionToEmbedColor.name, () => {
	test.each([
		[InfractionAction.Ban, Colors.Blue],
		[InfractionAction.Unban, Colors.Green],
		[InfractionAction.Kick, Colors.Red],
		[InfractionAction.Mute, Colors.Orange],
		[InfractionAction.Unmute, Colors.Green],
		[InfractionAction.Warn, Colors.Yellow],
		[InfractionAction.Note, Colors.Purple]
	])("maps action %s to its expected colour", (action, color) => {
		expect(InfractionUtil.mapActionToEmbedColor(action)).toBe(color);
	});

	test("falls back to NotQuiteBlack for unknown actions", () => {
		expect(InfractionUtil.mapActionToEmbedColor(999 as InfractionAction))
			.toBe(Colors.NotQuiteBlack);
	});
});
