/**
 * Ce que les modules importent des comptes connectés (côté serveur).
 *
 * Un module n'a jamais accès à un jeton : il lit des résumés de comptes et
 * des descriptions de connecteurs, et demande des actions que le cœur
 * exécute. Le navigateur n'importe que `types.ts` et `templates.ts`.
 */

export type {
  AccountSummary,
  ChannelQuery,
  ChannelReadOptions,
  ChannelVideo,
  ChannelVideos,
  ConnectionCapability,
  ConnectorInfo,
  PostPatch,
  PostSummary,
  PublishField,
  PublishJobSummary,
  PublishFieldRole,
  PublishFollowUp,
  PublishFollowUpKind,
  PublishFollowUpState,
  PublishFollowUpSummary,
  PublishFollowUpsInput,
  PublishLimits,
  PublishSource,
  PublishTextSource,
  PublishFileSource,
  PublishCarouselSource,
  QuotaUsage,
  AccountQuotaUsage,
  WatermarkTiming,
} from "./types";
export { checkPublishLimits, describeMediaLimits, estimatePublishCost, measureText } from "./limits";
export { listAccounts, getAccountSummary } from "./accounts";
export { listConnectors, getConnector, describeConnector } from "./registry";
export { enqueuePublish, listJobs, getJob, cancelJob, retryJob, retryFollowUp, cancelFollowUp } from "./publish-queue";
export { setProfileImage, listPosts, peekPosts, quotaForAccount, accountQuotaForAccount, readChannelVideos, channelReadCost } from "./manage";
