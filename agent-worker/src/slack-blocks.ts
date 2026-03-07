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
