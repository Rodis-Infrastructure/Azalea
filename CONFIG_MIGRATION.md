# Config Migration Guide

This document describes all configuration property renames and structural changes. Update your guild YAML config files accordingly.

## Property Renames

| Old Name | New Name | Context |
|----------|----------|---------|
| `notification_channel` | `notification_channel_id` | Top-level |
| `media_conversion_channel` | `media_conversion_channel_id` | Top-level |
| `delete_message_days_on_ban` | `ban_delete_message_days` | Top-level |
| `default_mute_duration_seconds` | `default_mute_duration` | Top-level (now in **milliseconds**) |
| `report_channel` | `channel_id` | Inside `message_reports` / `user_reports` |
| `report_ttl` | `ttl` | Inside `message_reports` / `user_reports` |
| `allowed_roles` | `include_roles` | Inside `media_channels` entries |
| `alert` | `review_reminder` | Inside `ban_requests` / `mute_requests` |

## Structural Changes

### Rules

`rules` (array) and `rules_channel_id` (string) have been merged into a single object:

**Before:**

```yaml
rules_channel_id: "<channel_id>"
rules:
  - title: "Rule 1"
    content: "Description"
```

**After:**

```yaml
rules:
  channel_id: "<channel_id>"
  entries:
    - title: "Rule 1"
      content: "Description"
```

### Emojis

`emojis` (reaction emojis) and `client_emojis` (display emojis) have been merged into a single nested object:

**Before:**

```yaml
emojis:
  approve: "123456789"
  deny: "987654321"
  quick_mute_30: "111111111"
  quick_mute_60: "222222222"
  purge_messages: "333333333"
  report_message: "444444444"

client_emojis:
  checkmark: "555555555"
  warning: "666666666"
  alert: "777777777"
```

**After:**

```yaml
emojis:
  reactions:
    approve: "123456789"
    deny: "987654321"
    quick_mute_30: "111111111"
    quick_mute_60: "222222222"
    purge_messages: "333333333"
    report_message: "444444444"
  display:
    checkmark: "555555555"
    warning: "666666666"
    alert: "777777777"
```

### Ephemeral Scoping

`ephemeral_scoping` (channel scoping) and `moderation_activity_ephemeral_scoping` (channel scoping) have been merged into a single nested object:

**Before:**

```yaml
ephemeral_scoping:
  exclude_channels:
    - "<channel_id>"

moderation_activity_ephemeral_scoping:
  exclude_channels:
    - "<channel_id>"
```

**After:**

```yaml
ephemeral_scoping:
  default:
    exclude_channels:
      - "<channel_id>"
  moderation_activity:
    exclude_channels:
      - "<channel_id>"
```

## Unit Changes

| Property | Old Unit | New Unit | Conversion |
|----------|----------|----------|------------|
| `default_mute_duration` (was `default_mute_duration_seconds`) | Seconds | Milliseconds | Multiply by 1000 |

All other time-based properties (`response_ttl`, `ttl`, `age_threshold`, role request `ttl`, message `ttl`) were already in milliseconds and are unchanged.

## Zod Validation

Unrecognized properties are silently stripped by Zod during config parsing. After migrating, old property names will be ignored without errors. Migrate all properties to ensure they take effect.
