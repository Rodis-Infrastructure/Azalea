## moderation-bot
This file serves as documentation for the Roblox Discord's moderation bot.

## Configuration
For a full example of the configuration, you can view the [`example.toml`](config/guilds/example.toml) file in the repository

### Custom Emojis
The `emojis` section enables you to customize the emojis used for the bot's responses. The fields listed below are the emojis that can currently be configured for different types of responses.

```toml
[emojis]
success = "<emoji-name:emoji-id>"
error = "👌"
```

### Ephemeral Responses
The `ephemeralResponses` section controls the behavior of the bot's interaction responses. If enabled, all interaction responses used outside excluded categories/channels will have an ephemeral response, even if an `InteractionResponseType` is specified.

```toml
[ephemeralResponses]
enabled = true
excludedCategories = []
excludedChannels = []
```

### Role and Group Configuration
The `roles` and `groups` sections allow you to configure which roles have access to specific message components and modals.

#### Role Configuration

```toml
[[roles]]
id = "role-id"
staff = false
selections = []
buttons = []
modals = []
```

#### Role Group Configuration

```toml
[[groups]]
staff = false
roles = []
selectMenus = []
buttons = []
modals = []
```

### Logging Configuration
The `logging` section controls all the logging events. Below is a list of supported logging events (excluded category/channel configuration does not apply to moderation infraction logging):

* `interactionUsage` - Triggered when an interaction is used, whether it is a command, button, modal, or select menu.
* `memberKick` - Triggered when a member is kicked from the guild.

```toml
[logging]
enabled = true
excludedCategories = []
excludedChannels = []

[logging.loggingEvent]
enabled = true
channelId = "channel-id"
excludedCategories = []
excludedChannels = []
```
