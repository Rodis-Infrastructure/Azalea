# Configuration

Azalea reads two kinds of YAML config:

- **Global config** — `azalea.cfg.yml` in the project root (database/cron settings).
- **Guild config** — `configs/<guild_id>.yml`, one file per Discord guild.

Both are validated against Zod schemas in `src/managers/config/schema.ts`. Time values are in **milliseconds** unless noted otherwise.

## Global Config

```yaml
database:
  messages:
    insert_cron: "0 * * * *"       # Cron for inserting cached messages into the database
    delete_cron: "0 0 * * *"       # Cron for deleting expired messages
    ttl: 2419200000                # Message TTL in milliseconds (default: 28 days)
```

## Guild Config

All properties below are optional unless noted. Mix and match what your guild needs.

### Surface-level Properties

```yaml
default_purge_amount: 100                  # Default purge amount (1-100)
response_ttl: 3000                         # Temporary-response lifetime in ms
notification_channel_id: "<channel_id>"    # Channel for public infraction notifications
media_conversion_channel_id: "<channel_id>"
auto_publish_announcements: ["<channel_id>"]
ban_delete_message_days: 0                 # Days of messages to delete on ban (0-7)
default_mute_duration: 2419200000          # Default mute duration in ms (28 days)
```

### Logging

```yaml
logging:
  default_scoping:
    include_channels: []
    exclude_channels: []
  logs:
    - events: ["<event>"]
      channel_id: "<channel_id>"
      scoping:
        include_channels: []
        exclude_channels: []
```

**Available events:** `message_bulk_delete`, `message_delete`, `message_update`, `message_reaction_add`, `message_publish`, `interaction_create`, `voice_join`, `voice_leave`, `voice_move`, `thread_create`, `thread_delete`, `thread_update`, `member_join`, `member_leave`, `media_store`, `infraction_create`, `infraction_archive`, `infraction_restore`, `infraction_update`, `ban_request_approve`, `ban_request_deny`, `mute_request_approve`, `mute_request_deny`, `message_report_create`, `message_report_resolve`, `user_report_create`, `user_report_update`, `user_report_resolve`.

### Permissions

```yaml
permissions:
  - roles: ["<role_id>"]
    allow:
      - manage_infractions
      - view_infractions
```

**Available permissions:** `manage_infractions`, `transfer_infractions`, `manage_mute_requests`, `manage_ban_requests`, `manage_message_reports`, `manage_user_reports`, `manage_highlights`, `view_infractions`, `view_moderation_activity`, `purge_messages`, `quick_mute`, `report_messages`, `manage_role_requests`, `manage_roles`, `forward_messages`, `manage_guild_config`.

> `manage_guild_config` gates the sibling `azalea-editor` web UI; the bot itself does not consume it.

### Ban & Mute Requests

```yaml
ban_requests:
  channel_id: "<channel_id>"
  review_reminder:                      # Optional
    channel_id: "<channel_id>"
    cron: "0 0 * * *"

mute_requests:
  channel_id: "<channel_id>"
  review_reminder:                      # Optional
    channel_id: "<channel_id>"
    cron: "0 0 * * *"
```

### Message & User Reports

```yaml
message_reports:
  channel_id: "<channel_id>"
  ttl: 604800000                        # Optional, report TTL in ms
  mentioned_roles: ["<role_id>"]        # Optional
  exclude_roles: ["<role_id>"]          # Optional
  review_reminder:                      # Optional
    channel_id: "<channel_id>"
    cron: "0 0 * * *"

user_reports:
  channel_id: "<channel_id>"
  ttl: 604800000
  mentioned_roles: ["<role_id>"]
  exclude_roles: ["<role_id>"]
  review_reminder:
    channel_id: "<channel_id>"
    cron: "0 0 * * *"
```

### Lockdown

```yaml
lockdown:
  channels:
    - id: "<channel_id>"
  default_permission_overwrites:
    - id: "<role_or_user_id>"
      allow: []
      deny: ["SendMessages"]
```

### Auto-Reactions

```yaml
auto_reactions:
  - channel_id: "<channel_id>"
    reactions: ["emoji_1", "emoji_2"]
    exclude_roles: ["<role_id>"]        # Optional
    exclude_patterns: ["regex"]         # Optional
```

### Auto-Threads

```yaml
auto_threads:
  - channel_id: "<channel_id>"
    # $USERNAME = user's username
    # $SURFACE_NAME = user's username and surface name, if any
    # $USER_ID = user's ID
    name: "$SURFACE_NAME's thread"
    role_scoping:
      include_roles: ["<role_id>"]
      exclude_roles: ["<role_id>"]
```

### Media Channels

```yaml
media_channels:
  - channel_id: "<channel_id>"
    include_roles: ["<role_id>"]        # Optional
    exclude_roles: ["<role_id>"]        # Optional
    fallback_response: "Please attach media."  # Optional
```

### Scheduled Messages

```yaml
scheduled_messages:
  - channel_id: "<channel_id>"
    cron: "0 0 * * *"
    monitor_slug: "slug"                # Sentry cron monitor slug
    messages: ["Message content"]
```

### Role Requests

```yaml
role_requests:
  channel_id: "<channel_id>"
  roles:
    - id: "<role_id>"
      ttl: 86400000                     # Optional, TTL in ms
```

### Quick Responses

```yaml
quick_responses:                        # Max 25
  - label: "FAQ Label"
    value: "faq_key"
    response: "Response content"
```

### Rules

```yaml
rules:
  channel_id: "<channel_id>"            # Channel referenced for all rules
  entries:
    - title: "Rule 1"
      content: "Description of rule 1"
```

### Nickname Censorship

```yaml
nickname_censorship:
  exclude_roles: ["<role_id>"]
  exclusion_response: "Cannot censor this user."
  nickname: "Censored User {n}"         # {n} = discriminator
```

### Stage Event Overrides

```yaml
stage_event_overrides:
  - channel_id: "<channel_id>"
```

### User Flags

```yaml
user_flags:                             # Max 18
  - label: "Flag Label"
    roles: ["<role_id>"]
```

### Infraction Reasons

```yaml
infraction_reasons:
  exclude_domains: ["example.com"]
  message_links:
    include_channels: []
    exclude_channels: []
```

### Ephemeral Scoping

```yaml
ephemeral_scoping:
  default:
    include_channels: []
    exclude_channels: []
  moderation_activity:
    include_channels: []
    exclude_channels: []
```

### Emojis

```yaml
emojis:
  reactions:
    approve: "<emoji>"
    deny: "<emoji>"
    quick_mute_30: "<emoji>"
    quick_mute_60: "<emoji>"
    purge_messages: "<emoji>"
    report_message: "<emoji>"
  display:
    checkmark: "<emoji_id>"
    warning: "<emoji_id>"
    alert: "<emoji_id>"
```

## Highlights

Highlights are managed via the `/highlight` commands at runtime — no YAML configuration is needed. See [commands.md](commands.md#highlights).
