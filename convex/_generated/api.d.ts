/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authActions from "../authActions.js";
import type * as blogs from "../blogs.js";
import type * as contact from "../contact.js";
import type * as emailOtp from "../emailOtp.js";
import type * as helpChat from "../helpChat.js";
import type * as messaging from "../messaging.js";
import type * as news from "../news.js";
import type * as posts from "../posts.js";
import type * as signupVerification from "../signupVerification.js";
import type * as social from "../social.js";
import type * as stories from "../stories.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authActions: typeof authActions;
  blogs: typeof blogs;
  contact: typeof contact;
  emailOtp: typeof emailOtp;
  helpChat: typeof helpChat;
  messaging: typeof messaging;
  news: typeof news;
  posts: typeof posts;
  signupVerification: typeof signupVerification;
  social: typeof social;
  stories: typeof stories;
  users: typeof users;
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
