-- CreateIndex
CREATE INDEX "Infraction_target_id_guild_id_action_archived_at_archived_by_idx" ON "Infraction"("target_id", "guild_id", "action", "archived_at", "archived_by");

-- CreateIndex
CREATE INDEX "Infraction_target_id_guild_id_archived_at_archived_by_idx" ON "Infraction"("target_id", "guild_id", "archived_at", "archived_by");

-- CreateIndex
CREATE INDEX "Message_author_id_guild_id_idx" ON "Message"("author_id", "guild_id");
