/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountModeration from "../accountModeration.js";
import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as appealEmailTemplates from "../appealEmailTemplates.js";
import type * as appeals from "../appeals.js";
import type * as appealsActions from "../appealsActions.js";
import type * as auth from "../auth.js";
import type * as blogs from "../blogs.js";
import type * as comments from "../comments.js";
import type * as contact from "../contact.js";
import type * as contentIntelligence from "../contentIntelligence.js";
import type * as contentIntelligenceDb from "../contentIntelligenceDb.js";
import type * as contentModeration from "../contentModeration.js";
import type * as contentModerationQueries from "../contentModerationQueries.js";
import type * as contextCardCandidatesDb from "../contextCardCandidatesDb.js";
import type * as contextCards from "../contextCards.js";
import type * as contextMatching from "../contextMatching.js";
import type * as crons from "../crons.js";
import type * as devPurge from "../devPurge.js";
import type * as draftUploads from "../draftUploads.js";
import type * as draftUploadsDb from "../draftUploadsDb.js";
import type * as emailOtp from "../emailOtp.js";
import type * as emailProvider from "../emailProvider.js";
import type * as feedIntelligence from "../feedIntelligence.js";
import type * as feedPools from "../feedPools.js";
import type * as feedRanking from "../feedRanking.js";
import type * as feedSignals from "../feedSignals.js";
import type * as follows from "../follows.js";
import type * as helpChat from "../helpChat.js";
import type * as http from "../http.js";
import type * as media from "../media.js";
import type * as mediaS3Config from "../mediaS3Config.js";
import type * as mediaUrl from "../mediaUrl.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as moderation from "../moderation.js";
import type * as moderationImageHeuristic from "../moderationImageHeuristic.js";
import type * as music from "../music.js";
import type * as news from "../news.js";
import type * as notifications from "../notifications.js";
import type * as postCollaborators from "../postCollaborators.js";
import type * as postCounterDeltas from "../postCounterDeltas.js";
import type * as postDistribution from "../postDistribution.js";
import type * as postInteractions from "../postInteractions.js";
import type * as postModeration from "../postModeration.js";
import type * as posts from "../posts.js";
import type * as productAnalytics from "../productAnalytics.js";
import type * as s3BucketConfig from "../s3BucketConfig.js";
import type * as staffVisibility from "../staffVisibility.js";
import type * as stories from "../stories.js";
import type * as storyDuration from "../storyDuration.js";
import type * as storyLikeNotifications from "../storyLikeNotifications.js";
import type * as storyTemplates from "../storyTemplates.js";
import type * as suggestedProfileEngines from "../suggestedProfileEngines.js";
import type * as suggestedProfiles from "../suggestedProfiles.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as verificationTier from "../verificationTier.js";
import type * as videoModeration from "../videoModeration.js";
import type * as viewerContentFilters from "../viewerContentFilters.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountModeration: typeof accountModeration;
  admin: typeof admin;
  analytics: typeof analytics;
  appealEmailTemplates: typeof appealEmailTemplates;
  appeals: typeof appeals;
  appealsActions: typeof appealsActions;
  auth: typeof auth;
  blogs: typeof blogs;
  comments: typeof comments;
  contact: typeof contact;
  contentIntelligence: typeof contentIntelligence;
  contentIntelligenceDb: typeof contentIntelligenceDb;
  contentModeration: typeof contentModeration;
  contentModerationQueries: typeof contentModerationQueries;
  contextCardCandidatesDb: typeof contextCardCandidatesDb;
  contextCards: typeof contextCards;
  contextMatching: typeof contextMatching;
  crons: typeof crons;
  devPurge: typeof devPurge;
  draftUploads: typeof draftUploads;
  draftUploadsDb: typeof draftUploadsDb;
  emailOtp: typeof emailOtp;
  emailProvider: typeof emailProvider;
  feedIntelligence: typeof feedIntelligence;
  feedPools: typeof feedPools;
  feedRanking: typeof feedRanking;
  feedSignals: typeof feedSignals;
  follows: typeof follows;
  helpChat: typeof helpChat;
  http: typeof http;
  media: typeof media;
  mediaS3Config: typeof mediaS3Config;
  mediaUrl: typeof mediaUrl;
  messages: typeof messages;
  migrations: typeof migrations;
  moderation: typeof moderation;
  moderationImageHeuristic: typeof moderationImageHeuristic;
  music: typeof music;
  news: typeof news;
  notifications: typeof notifications;
  postCollaborators: typeof postCollaborators;
  postCounterDeltas: typeof postCounterDeltas;
  postDistribution: typeof postDistribution;
  postInteractions: typeof postInteractions;
  postModeration: typeof postModeration;
  posts: typeof posts;
  productAnalytics: typeof productAnalytics;
  s3BucketConfig: typeof s3BucketConfig;
  staffVisibility: typeof staffVisibility;
  stories: typeof stories;
  storyDuration: typeof storyDuration;
  storyLikeNotifications: typeof storyLikeNotifications;
  storyTemplates: typeof storyTemplates;
  suggestedProfileEngines: typeof suggestedProfileEngines;
  suggestedProfiles: typeof suggestedProfiles;
  uploads: typeof uploads;
  users: typeof users;
  verificationTier: typeof verificationTier;
  videoModeration: typeof videoModeration;
  viewerContentFilters: typeof viewerContentFilters;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
