-- CreateIndex
CREATE INDEX "BanRequest_status_guild_id_idx" ON "BanRequest"("status", "guild_id");

-- CreateIndex
CREATE INDEX "BanRequest_target_id_guild_id_status_idx" ON "BanRequest"("target_id", "guild_id", "status");

-- CreateIndex
CREATE INDEX "Infraction_expires_at_archived_at_archived_by_idx" ON "Infraction"("expires_at", "archived_at", "archived_by");

-- CreateIndex
CREATE INDEX "Infraction_executor_id_guild_id_idx" ON "Infraction"("executor_id", "guild_id");

-- CreateIndex
CREATE INDEX "Infraction_action_target_id_guild_id_archived_at_archived_by_idx" ON "Infraction"("action", "target_id", "guild_id", "archived_at", "archived_by");

-- CreateIndex
CREATE INDEX "Message_author_id_channel_id_deleted_idx" ON "Message"("author_id", "channel_id", "deleted");

-- CreateIndex
CREATE INDEX "Message_created_at_idx" ON "Message"("created_at");

-- CreateIndex
CREATE INDEX "MessageReport_status_idx" ON "MessageReport"("status");

-- CreateIndex
CREATE INDEX "MessageReport_author_id_status_idx" ON "MessageReport"("author_id", "status");

-- CreateIndex
CREATE INDEX "MessageReport_author_id_status_message_deleted_idx" ON "MessageReport"("author_id", "status", "message_deleted");

-- CreateIndex
CREATE INDEX "MessageReport_created_at_status_idx" ON "MessageReport"("created_at", "status");

-- CreateIndex
CREATE INDEX "MuteRequest_status_guild_id_idx" ON "MuteRequest"("status", "guild_id");

-- CreateIndex
CREATE INDEX "MuteRequest_target_id_guild_id_status_idx" ON "MuteRequest"("target_id", "guild_id", "status");

-- CreateIndex
CREATE INDEX "Reminder_author_id_idx" ON "Reminder"("author_id");

-- CreateIndex
CREATE INDEX "Reminder_expires_at_idx" ON "Reminder"("expires_at");

-- CreateIndex
CREATE INDEX "TemporaryMessage_expires_at_idx" ON "TemporaryMessage"("expires_at");

-- CreateIndex
CREATE INDEX "TemporaryRole_expires_at_idx" ON "TemporaryRole"("expires_at");

-- CreateIndex
CREATE INDEX "UserReport_status_guild_id_idx" ON "UserReport"("status", "guild_id");

-- CreateIndex
CREATE INDEX "UserReport_target_id_status_idx" ON "UserReport"("target_id", "status");

-- CreateIndex
CREATE INDEX "UserReport_created_at_status_guild_id_idx" ON "UserReport"("created_at", "status", "guild_id");
