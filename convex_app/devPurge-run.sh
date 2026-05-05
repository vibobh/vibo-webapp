#!/usr/bin/env bash
# Purge all non-yousif data from the Convex dev DB.
# Each table is drained in a loop until 0 rows are deleted per batch.
set -euo pipefail

RUN="npx convex run"
BATCH="devPurge:purgeBatch"
UBATCH="devPurge:purgeOtherUsersBatch"

drain_table() {
  local table="$1"
  local mutation="$2"
  local extra="${3:-}"
  while true; do
    local out
    out=$($RUN "$mutation" "{\"confirm\":\"PURGE\",\"table\":\"$table\"$extra}" 2>&1)
    echo "  $table: $out"
    local deleted
    deleted=$(echo "$out" | grep -o '"deleted":[0-9]*' | grep -o '[0-9]*' || echo "0")
    if [[ "$deleted" == "0" ]]; then break; fi
  done
}

echo "=== Step 1: Wipe analytics/event tables (unconditional) ==="
for t in userEvents productEvents productViewDedupe productProfileViewDedupe moderationEvents feedCandidatePool postCounterDeltas; do
  drain_table "$t" "$BATCH"
done

echo ""
echo "=== Step 2: Wipe post-child tables (unconditional; posts deleted next) ==="
for t in postMedia postTags commentLikes comments savedPosts hiddenPosts reposts postModerationScores contentHashes globalContentHashes postFeedStats postPerformance downloadEvents postDownloadJobs postPerformance contextCardCandidates contentIntelligence; do
  drain_table "$t" "$BATCH"
done

echo ""
echo "=== Step 3: Wipe likes ==="
drain_table "likes" "$BATCH"

echo ""
echo "=== Step 4: Wipe story interaction tables ==="
for t in storyPollVotes storyQuestionResponses storyCountdownReminders storyNotifySubscriptions storyEmojiSliderVotes storyQuizAnswers storyPromptResponses storyPrompts storyViews storyEmojiReactions storyLikes storyReplies storyTemplates; do
  drain_table "$t" "$BATCH"
done

echo ""
echo "=== Step 5: Wipe stories (non-yousif) ==="
drain_table "stories" "$UBATCH"

echo ""
echo "=== Step 6: Wipe posts (non-yousif) ==="
drain_table "posts" "$UBATCH"

echo ""
echo "=== Step 7: Wipe conversations + messages ==="
for t in messages conversationMembers conversations; do
  drain_table "$t" "$BATCH"
done

echo ""
echo "=== Step 8: Wipe user-owned tables (non-yousif) ==="
for t in notificationGroups uploadSessions follows recentSearches closeFriends mutes restricts userBlocks userNotificationSettings pushDeviceTokens emailOtps userEngagementScores userContentPreferences sessionFeedState creatorTrust userPostRateLimit draftUploads appeals reports moderationActions; do
  drain_table "$t" "$UBATCH"
done

echo ""
echo "=== Step 9: Delete non-yousif users ==="
drain_table "users" "$UBATCH"

echo ""
echo "✅ Purge complete! Only yousif's data remains."
