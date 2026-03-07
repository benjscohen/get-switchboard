import type { KnownBlock, SectionBlock } from "@slack/types";

function errorSection(errorMessage: string): SectionBlock {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Sorry, something went wrong: ${errorMessage}`,
    },
  };
}

/**
 * Build Block Kit blocks for an error message with a "Retry" button.
 */
export function buildErrorWithRetryBlocks(
  errorMessage: string,
  sessionId: string,
): KnownBlock[] {
  return [
    errorSection(errorMessage),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Retry" },
          action_id: "retry_session",
          value: sessionId,
          style: "primary",
        },
      ],
    },
  ];
}

/**
 * Build Block Kit blocks for an error message with a disabled "Retrying..." indicator.
 */
export function buildRetryDisabledBlocks(
  errorMessage: string,
): KnownBlock[] {
  return [
    errorSection(errorMessage),
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "Retrying..." }],
    },
  ];
}

// ---------------------------------------------------------------------------
// Plan approval blocks
// ---------------------------------------------------------------------------

const SLACK_SECTION_LIMIT = 3000;

function truncateBlockText(text: string): string {
  if (text.length <= SLACK_SECTION_LIMIT) return text;
  return text.slice(0, SLACK_SECTION_LIMIT - 40) + "\n\n_(plan truncated)_";
}

/**
 * Build Block Kit blocks for a plan awaiting approval.
 */
export function buildPlanApprovalBlocks(
  planText: string,
  sessionId: string,
): KnownBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Plan" },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: truncateBlockText(planText) },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "Reply to request changes, or click *Approve* to execute." },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve" },
          action_id: "approve_plan",
          value: sessionId,
          style: "primary",
        },
      ],
    },
  ];
}

/**
 * Build Block Kit blocks for an approved plan (button removed).
 */
export function buildPlanApprovedBlocks(planText: string): KnownBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Plan (Approved)" },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: truncateBlockText(planText) },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: ":white_check_mark: Approved — executing..." }],
    },
  ];
}

/**
 * Build Block Kit blocks for a plan being revised (button removed, hourglass).
 */
export function buildPlanRevisingBlocks(planText: string): KnownBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Plan (Revising...)" },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: truncateBlockText(planText) },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: ":hourglass_flowing_sand: Revising based on your feedback..." }],
    },
  ];
}

/**
 * Build Block Kit blocks for an expired plan (session ended before approval).
 */
export function buildPlanExpiredBlocks(planText: string): KnownBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Plan (Expired)" },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: truncateBlockText(planText) },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: ":warning: This plan has expired \u2014 send a new message to start over." }],
    },
  ];
}

