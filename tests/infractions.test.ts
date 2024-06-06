import { describe, expect, test } from "bun:test";
import { InfractionUtil } from "@utils/infractions";

describe("infraction utils", () => {
    test(InfractionUtil.formatReason.name, () => {
        // Test data
        const cleanReason = "This is a test reason";
        const formattedReason = "This `is` a test ```reason```";

        // Expected test results
        const expected = `(\`${cleanReason}\`)`;

        // Tests
        expect(InfractionUtil.formatReason(formattedReason)).toBe(expected);
        expect(InfractionUtil.formatReason(cleanReason)).toBe(expected);
    });

    test(InfractionUtil.formatReasonPreview.name, () => {
        const LINK = "https://example.com";
        const PURGE_LOG = `(Purge log: ${LINK})`;

        // Test data
        const cleanReason = "This is a test reason";
        const reason = `${cleanReason} ${LINK} ${PURGE_LOG}`;

        // Tests
        expect(InfractionUtil.formatReasonPreview(reason)).toBe(cleanReason);
    });
});