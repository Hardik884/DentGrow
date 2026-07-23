/**
 * Business Brain — Centralized Logger
 *
 * A minimal, framework-agnostic logger scoped to the Business Brain. Supports
 * info / warn / error levels with an optional structured context object.
 *
 * Deliberately simple: no telemetry, monitoring, transports, or analytics.
 * Those are out of scope for this phase.
 */

export type LogLevel = "info" | "warn" | "error";

/** Optional structured metadata attached to a log entry. */
export type LogContext = Readonly<Record<string, unknown>>;

/** The logger contract consumed across the Business Brain. */
export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const PREFIX = "[BusinessBrain]";

/**
 * Console-backed logger. A different implementation can be swapped in later
 * without changing call sites, since callers depend on the {@link Logger}
 * interface.
 */
export class ConsoleLogger implements Logger {
  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const line = `${PREFIX} ${message}`;
    if (context) {
      console[level](line, context);
    } else {
      console[level](line);
    }
  }
}

/** Shared default logger instance for the Business Brain. */
export const logger: Logger = new ConsoleLogger();
