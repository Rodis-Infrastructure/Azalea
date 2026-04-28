# Database Optimization Plan

## 1. Add Missing Indexes to Schema (prisma/schema.prisma)

### BanRequest - add:
```prisma
@@index([target_id, guild_id, status])
```

### MuteRequest - add:
```prisma
@@index([target_id, guild_id, status])
```

### Infraction - add:
```prisma
@@index([executor_id, guild_id])
@@index([action, target_id, guild_id, archived_at, archived_by])
```

### MessageReport - add:
```prisma
@@index([author_id, status, message_deleted])
@@index([created_at, status])
```

### UserReport - add:
```prisma
@@index([target_id, status])
@@index([created_at, status, guild_id])
```

## 2. Fix updateContent Bug (src/utils/messages.ts:253-262)

Replace raw SQL with Prisma transaction. The current RETURNING subquery reads the NEW content, not the old one.

**Before:**
```ts
const { old_content } = await prisma.$queryRaw<{ old_content: string | null }>`
    UPDATE Message
    SET content = ${newContent}
    WHERE id = ${id} 
    RETURNING (
        SELECT content
        FROM Message
        WHERE id = ${id}
    ) AS old_content;
`;
```

**After:**
```ts
const [oldMessage] = await prisma.$transaction([
    prisma.message.findUnique({ where: { id }, select: { content: true } }),
    prisma.message.update({ where: { id }, data: { content: newContent } })
]);
const old_content = oldMessage?.content ?? null;
```

## 3. Optimize ModerationActivity._getActivity() (src/commands/ModerationActivity.ts:220-259)

Replace strftime raw SQL with date-range Prisma queries. Compute date boundaries in JS.

**Before:** 3 sequential raw SQL queries using `strftime()` with `SELECT *`
**After:** Compute start/end dates in JS, use Prisma `where: { created_at: { gte, lt } }`, batch with `$transaction`, select only needed fields.

## 4. Optimize Temporary Role Removal (src/events/Ready.ts:49-104)

Batch delete expired roles instead of one-by-one.

**Before:** Delete each role individually inside the loop
**After:** Collect successfully-removed role keys, then `deleteMany` at the end

## 5. Optimize Infraction.search() (src/commands/Infraction.ts:878-905)

Skip archived count query when filter is already "Archived" since it's redundant with infractionCount.

## 6. Generate Migration

Run `npx prisma migrate dev --name optimize_indexes` to create the migration file.
