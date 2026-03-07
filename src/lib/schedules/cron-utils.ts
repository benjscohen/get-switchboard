import { CronExpressionParser } from "cron-parser";

/**
 * Validate a 5-field cron expression.
 */
export function validateCron(expression: string): { valid: boolean; error?: string } {
  try {
    CronExpressionParser.parse(expression);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid cron expression" };
  }
}

/**
 * Compute the next run time for a cron expression.
 */
export function getNextRun(expression: string, timezone: string, after?: Date): Date {
  const interval = CronExpressionParser.parse(expression, {
    currentDate: after ?? new Date(),
    tz: timezone,
  });
  return interval.next().toDate();
}

/**
 * Human-readable description of a cron expression.
 */
export function describeCron(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return expression;

  const [min, hour, dom, month, dow] = parts;

  // Common patterns
  if (expression === "* * * * *") return "Every minute";
  if (min !== "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `Every hour at minute ${min}`;
  }

  // "*/N * * * *"
  const everyNMin = min.match(/^\*\/(\d+)$/);
  if (everyNMin && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `Every ${everyNMin[1]} minutes`;
  }

  // "0 */N * * *"
  const everyNHour = hour.match(/^\*\/(\d+)$/);
  if (min === "0" && everyNHour && dom === "*" && month === "*" && dow === "*") {
    return `Every ${everyNHour[1]} hours`;
  }

  // Specific time patterns
  if (min !== "*" && hour !== "*" && dom === "*" && month === "*") {
    const time = formatTime(hour, min);

    if (dow === "*") return `Daily at ${time}`;
    if (dow === "1-5") return `Weekdays at ${time}`;
    if (dow === "0,6") return `Weekends at ${time}`;

    const days = parseDow(dow);
    if (days) return `${days} at ${time}`;
  }

  // Weekly
  if (min !== "*" && hour !== "*" && dow !== "*" && dom === "*" && month === "*") {
    const time = formatTime(hour, min);
    const days = parseDow(dow);
    if (days) return `${days} at ${time}`;
  }

  // Monthly
  if (min !== "*" && hour !== "*" && dom !== "*" && month === "*" && dow === "*") {
    const time = formatTime(hour, min);
    return `Monthly on day ${dom} at ${time}`;
  }

  return expression;
}

function formatTime(hour: string, min: string): string {
  const h = parseInt(hour, 10);
  const m = parseInt(min, 10);
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${m.toString().padStart(2, "0")} ${period}`;
}

function parseDow(dow: string): string | null {
  const dayNames: Record<string, string> = {
    "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday",
    "4": "Thursday", "5": "Friday", "6": "Saturday",
    "7": "Sunday",
  };

  // Ranges like "1-5"
  const range = dow.match(/^(\d)-(\d)$/);
  if (range) {
    const start = dayNames[range[1]];
    const end = dayNames[range[2]];
    if (start && end) return `${start}-${end}`;
  }

  // Lists like "1,3,5"
  const days = dow.split(",").map((d) => dayNames[d.trim()]).filter(Boolean);
  if (days.length > 0) return days.join(", ");

  return null;
}
