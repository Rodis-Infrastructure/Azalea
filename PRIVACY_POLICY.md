# Privacy Policy

Effective date: June 11th, 2026

## Overview

Azalea is a Discord moderation and utility bot used in the unofficial Roblox Discord server: https://discord.gg/robloxunofficial. It processes Discord data only to provide bot features inside that server.

## Data we process

Because all features are enabled, Azalea may process:

- Discord user IDs, guild IDs, channel IDs, message IDs, role IDs, and timestamps.
- Message content, attachments, stickers, references, and reaction data.
- Member data such as usernames, join dates, role membership, timeout state, and audit-log related moderation data.
- Server configuration data stored for guild-specific features.
- Moderation data such as infractions, warnings, notes, reports, mute/ban requests, highlights, reminders, and temporary role/message records.
- Error and diagnostic data sent to Sentry when enabled.

## How we use data

Azalea uses this data to:

- log moderation and message activity;
- enforce moderation rules and automations;
- process commands, interactions, reports, highlights, reminders, and role requests;
- manage temporary roles, mutes, bans, and scheduled messages;
- display user and server information requested by authorized staff;
- troubleshoot crashes and failures.

## Message content

Azalea reads message content when needed for features such as logging, highlights, media-channel enforcement, request parsing, auto-reactions, auto-threads, and message reports. It may also store message content in the database for moderation history and report review.

## Server member data

Azalea reads and stores member-related data when needed for join/leave logs, moderation actions, role checks, temporary role handling, mute reapplication, and user info features. It may also use audit log data to attribute moderator actions.

## Storage and retention

Azalea stores operational data in the configured SQLite database. Retention depends on the feature:

- messages are kept for 28 days;
- reports and user/moderation records are kept until resolved, archived, or removed by the cleanup jobs;
- temporary roles and temporary messages are removed when they expire;
- reminders are kept until they are completed or deleted.

## Third-party services

Azalea may send data to:

- **Discord** — to operate as a bot and receive/send events and API requests.
- **Sentry** — for error reporting and diagnostics.
- **VirusTotal** — for the URL scanning feature.
- **RoVer** — for the Roblox account lookup feature.

## Sharing

We do not sell personal data. Data is only shared with the services above when required to run the bot or when a user invokes a feature that depends on them.

## Security

We use access controls, disk encryption, and operational safeguards appropriate for a Discord bot.

## Children

Azalea is not intended for children under the age required by Discord’s terms.

## Changes

We may update this policy when the bot’s features or data handling change.

## Contact

For privacy questions or deletion requests, contact any member of server staff or the bot maintainer, @archasion (ID: 556206370429599755).
