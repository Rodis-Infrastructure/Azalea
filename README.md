## Azalea Moderation Bot

This file serves as documentation for the Roblox Discord's moderation bot.

## Configuration

For a full example of the configuration, you can view the [`example.yaml`](config/guilds/example.yaml) file in the
repository

### Message Deletion on Ban

The `deleteMessageSecondsOnBan` field determines the period of time (in second) over which the banned user's messages
will be deleted. If set to `0`, the bot will not delete any messages.

```yaml
deleteMessageSecondsOnBan: 0
```

### Allowed Proof Channels

Require all message links in infraction evidence to be from specific channels. If set to an empty array, all channels
will be allowed.

```yaml
allowedProofChannelIds:
  - "channel-id"
```

### Auto Reactions

The `autoReactions` section allows you to configure which reactions the bot will add to every message sent in a
specified channel.

```yaml
autoReactions:
  - channelId: "channel-id"
    reactions:
      - "emoji"
```

### Channel Configuration

The `channels` section allows you to configure which channels the bot will perform certain actions in.

```yaml
channels:
  banRequestQueue: "channel-id"
  muteRequestQueue: "channel-id"
  mediaConversion: "channel-id"
  confirmations: "channel-id"
```

### Custom Commands

The `commands` section allows you to configure custom commands that can be used by the bot.

```yaml
commands:
  - name: "command-name"
    value: "command-value" # Cannot have whitespace
    embed:
      title: "embed-title"
      description: "embed-description"
      color: 0x000000 # Optional
```

For more information on what embed attributes can be passed,
see [Discord documentation](https://discord.com/developers/docs/resources/channel#embed-object).

### Request Notices

A reminder/notice will be sent in the specified channel whenever there is a certain number of unhandled requests over
specified period of time.

```yaml
banRequestNotices: # or muteRequestNotices
  enabled: true
  channelId: "channel-id"
  threshold: 25
  interval: 3_600_000 # 1 hour
```

### Custom Emojis

The `emojis` section enables you to customize the emojis used for the bot's responses. The fields listed below are the
emojis that can currently be configured for different types of responses.

```yaml
emojis:
  success: "👌"
  error: "<:emoji-name:emoji-id>"
  quickMute30: "<:emoji-name:emoji-id>"
  quickMute60: "<:emoji-name:emoji-id>"
  purgeMessages: "<:emoji-name:emoji-id>"
  approveRequest: "<:emoji-name:emoji-id>"
  denyRequest: "<:emoji-name:emoji-id>"
```

### Ephemeral Responses

The `ephemeralResponses` section controls the behavior of the bot's interaction responses. If enabled, all interaction
responses used outside excluded categories/channels will have an ephemeral response, even if
an `InteractionResponseType` is specified.

```yaml
ephemeralResponses:
  enabled: true
  excludedCategories: []
  excludedChannels: []
```

### User Flags

When the configuration is set, the `/info` command now includes the names of the flags associated with the user in its
response.

```yaml
userFlags:
  - name: "flag-name"
    roleIds:
      - "role-id"
```

### Role and Group Configuration

The `roles` and `groups` sections allow you to configure which roles have access to specific message components and
modals.

- `guildStaff` - Prevents the user from being given an infraction.
- `manageInfractions` - Allows the user to modify or delete any infraction.
- `viewModerationActivity` - Allows the user to view the number of infractions a staff member has given out.
- `manageBanRequests` - Allows the user to approve or deny ban requests.
- `manageMuteRequests` - Allows the user to approve or deny mute requests.
- `autoMuteBanRequests` - Automatically mutes the user a ban requested was submitted for

#### Role Configuration

```yaml
roles:
  - id: "role-id"
    guildStaff: false
    manageInfractions: false
    viewModerationActivity: false
    manageBanRequests: false
    manageMuteRequests: false
    autoMuteBanRequests: false
    selections: []
    buttons: []
    modals: []
    reactions: []
```

#### Role Group Configuration

```yaml
groups:
  - guildStaff: false
    manageInfractions: false
    viewModerationActivity: false
    manageBanRequests: false
    manageMuteRequests: false
    autoMuteBanRequests: false
    roleIds: []
    selectMenus: []
    buttons: []
    modals: []
    reactions: []
```

### Logging Configuration

The `logging` section controls all the logging events. Below is a list of supported logging events (excluded
category/channel configuration does not apply to moderation infraction logging):

* `interactionUsage` - Triggered when an interaction is used, whether it is a command, button, modal, or select menu.
* `infractions` - Triggered when a user is given an infraction.
* `messages` - Triggered when a message is updated, deleted, or deleted in bulk.
* `media` - The bot's storage for attachments.
* `voice` - Triggered when a user joins, leaves, or moves voice channels.
* `threads` - Triggered when a thread is created, updated, or deleted.

```yaml
logging:
  enabled: true
  excludedCategories: []
  excludedChannels: []

  loggingEvent:
    enabled: true
    channelId: "channel-id"
    excludedCategories: []
    excludedChannels: []
```