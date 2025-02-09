# Azalea

## Global Configuration

A global configuration file must be present in the root directory of the project. This file must be named `azalea.cfg.yml` and must contain the following properties:

```yaml
database:
    messages:
        insert_cron: "0 0 * * *" # Every day at midnight
        delete_cron: "0 */6 * * *" # Every 6 hours
        ttl: 2419200000 # 28 days
```

* `database.messages.insert_cron`: The cron expression for the insertion of cached messages into the database.
* `database.messages.delete_cron`: The cron expression for the deletion of messages older than 12 days from the database.
* `database.messages.ttl`: The time-to-live (TTL) for messages in the database. Messages older than this value will be removed from the database.

## Guild Configuration

> [!NOTE]
> ❗ Properties marked with an exclamation mark are required

Each guild must have a configuration file in the `configs` directory (see the [example file](/configs/example.yml) for more info). The file must be named `<guild_id>.yml` and must contain the following properties:

### Surface-level properties

Non-object properties that are not nested within other properties.

```yaml
default_purge_amount: 100
response_ttl: 3000 # 3 seconds
notification_channel: "<channel_id>"
media_conversion_channel: "<channel_id>"
auto_publish_announcements: ["<channel_id>"]
```

* `default_purge_amount`: The default amount of messages to purge when the `purge` command is used without an amount.
* `response_ttl`: The time in milliseconds that the client will wait before deleting a temporary response.
* `notification_channel`: ID of the channel where the client will send notifications (such as a ban being executed in a channel with ephemeral responses)
* `media_conversion_channel`: ID of the channel where the client will log uploaded media (without message content) and respond with a link to the log - media logs are required for this to work.
* `auto_publish_announcements`: An array of announcement channel IDs where the client will automatically publish messages to other servers.

### Logging

Logging-related properties.

```yaml
logging:
  default_scoping:
    include_channels: []
    exclude_channels: []

  logs:
    - events: ["<logging_event>"]
      channel_id: "<channel_id>"
      scoping:
        include_channels: []
        exclude_channels: []
```

* `default_scoping` / `scoping` - Scoping applied to all logging events that do not have a `scoping` property.
  * `include_channels` - Whitelist channels for logging events, if this array is not empty, only channels specified here will trigger logging events.
  * `exclude_channels` - Blacklist channels from triggering logging events
* ❗ `logs[].channel_id` - ID of the channel where the client should log the specified events.
* ❗ `logs[].events` - An array of logging events that this rule should listen for. The following values can be specified:
  * `message_bulk_delete` - Message purging/bulk deletion
  * `message_delete` - Regular message deletion
  * `message_update` - Message edits
  * `message_reaction_add` - Details of the first reaction added to a message
  * `interaction_create` - Interaction usage 
  * `voice_join` - Joining a voice channel
  * `voice_leave` - Leaving a voice channel
  * `voice_move` - Moving from one voice channel to another
  * `thread_create` - Thread creation
  * `thread_delete` - Thread deletion
  * `thread_update` - Modifying a thread's data
  * `media_store` - Storing media
  * `infraction_create` - Moderating a user
  * `infraction_archive` - Archiving an infraction 
  * `infraction_restore` - Restoring an archived infraction
  * `infraction_update` - Modifying an infraction (excludes archiving)
  * `ban_request_approve` - Approving a ban request
  * `ban_request_deny` - Denying a ban request
  * `mute_request_approve` - Approving a mute request
  * `mute_request_deny` - Denying a mute request
  * `message_report_create` - Creating a message report
  * `message_report_resolve` - Resolving a message report (including quick actions)
  * `user_report_create` - Creating a user report
  * `user_report_resolve` - Resolving a user report
  * `user_report_update` - Report initiator modifying the report reason