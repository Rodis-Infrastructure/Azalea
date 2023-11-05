export interface Ticket {
    target_id: string;
    guild_id: string;
    initiator_id: string;
    /** A comma-separated list of user IDs */
    participants: string;
    expires_at: string;
    /** The first message sent in the ticket channel */
    first_message_id: string;
    /** The last message sent in the ticket channel */
    last_message_id: string;
}