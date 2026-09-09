# Commands

Reference for every slash and context menu command Azalea registers.

Permissions for most moderation commands are controlled per-guild via the [permissions config](configuration.md#permissions). Commands listed without a permission requirement are available to anyone with the underlying Discord permissions (e.g. `Manage Roles` for `/role members`).

## Slash Commands

### Moderation

| Command | Description |
|---|---|
| `/ban` | Ban a user from the server. |
| `/kick` | Kick a member from the server. |
| `/mute` | Mute a member with a duration. |
| `/unmute` | Unmute a member. |
| `/unban` | Unban a user. |
| `/warn` | Warn a user. |
| `/note` | Add a note to a user's infraction history. |
| `/purge all` | Purge messages in a channel. |
| `/purge user` | Purge messages from a specific user. |
| `/lockdown start` | Lock down the server. |
| `/lockdown end` | End a server lockdown. |
| `/censor nickname` | Censor a member's nickname. |

### Infractions

| Command | Description |
|---|---|
| `/infraction search` | Search a user's infractions (filterable). |
| `/infraction info` | View infraction details by ID. |
| `/infraction duration` | Update an infraction's duration. |
| `/infraction reason` | Update an infraction's reason. |
| `/infraction archive` | Archive an infraction. |
| `/infraction restore` | Restore an archived infraction. |
| `/infraction active` | View a user's active mute or ban. |
| `/infraction copy-history` | Transfer infractions between users. |
| `/moderation activity` | View moderation stats for a user, filterable by month and year. |

### Highlights

| Command | Description |
|---|---|
| `/highlight pattern add` | Add a highlight pattern. |
| `/highlight pattern remove` | Remove a highlight pattern. |
| `/highlight pattern clear` | Clear all highlight patterns. |
| `/highlight channel add` | Add a channel to highlight scoping. |
| `/highlight channel remove` | Remove a channel from highlight scoping. |
| `/highlight channel clear` | Clear all highlight channel scoping. |
| `/highlight list` | List your highlights. |
| `/highlight erase` | Erase a user's highlights (admin). |

### Reminders

| Command | Description |
|---|---|
| `/reminders add` | Create a reminder. |
| `/reminders list` | List your reminders. |
| `/reminders remove` | Delete a reminder. |
| `/reminders clear` | Clear all your reminders. |

### Information

| Command | Description |
|---|---|
| `/search` | Find a user by display name. |
| `/user info` | Get information about a user. |
| `/role members` | List members with specified roles. |
| `/rule` | Display a configured server rule. |
| `/faq` | Send a configured quick response. |
| `/config guild` | View the guild configuration. |
| `/config global` | View the global configuration. |
| `/list-permissions` | List bot permissions in a channel. |
| `/process info` | Bot diagnostics (uptime, ping, memory). |

### Utilities

| Command | Description |
|---|---|
| `/scan url` | Scan a URL with VirusTotal (requires `VIRUSTOTAL_API_KEY`). |

## Context Menu Commands

| Menu Item | Type | Description |
|---|---|---|
| Purge messages | User | Purge messages from a user. |
| User info | User | View user info. |
| Search infractions | User | Search a user's infractions. |
| Censor nickname | User | Censor a user's nickname. |
| Report user | User | Report a user (modal). |
| Quick mute (30m) | Message | Quick mute author for 30 minutes. |
| Quick mute (1h) | Message | Quick mute author for 1 hour. |
| Report message | Message | Report a message. |
| Store media | Message | Store message attachments to logs. |
