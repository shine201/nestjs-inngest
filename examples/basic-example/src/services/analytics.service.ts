import { Injectable, Logger } from "@nestjs/common";
import { TypedInngestFunction, InngestEvent } from "nestjs-inngest";
import { UserEventRegistry } from "../events/user.events";

export interface AnalyticsMetric {
  id: string;
  eventType: string;
  category: string;
  userId?: string;
  properties: Record<string, any>;
  timestamp: Date;
  sessionId?: string;
}

export interface AnalyticsSummary {
  totalEvents: number;
  userRegistrations: number;
  emailsSent: number;
  emailFailures: number;
  userVerifications: number;
  topEventTypes: Array<{ eventType: string; count: number }>;
  lastUpdated: Date;
}

/**
 * Analytics service for tracking and analyzing application events
 *
 * This service demonstrates:
 * - Event-driven analytics collection
 * - Real-time metrics tracking
 * - Inngest functions for data processing
 * - Background analytics aggregation
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  // In-memory storage for demo purposes
  // In a real app, this would be a time-series database like InfluxDB, TimescaleDB, etc.
  private metrics = new Map<string, AnalyticsMetric>();
  private summary: AnalyticsSummary = {
    totalEvents: 0,
    userRegistrations: 0,
    emailsSent: 0,
    emailFailures: 0,
    userVerifications: 0,
    topEventTypes: [],
    lastUpdated: new Date(),
  };

  /**
   * Record a custom analytics event
   */
  async recordEvent(
    eventType: string,
    category: string,
    properties: Record<string, any>,
    userId?: string,
    sessionId?: string
  ): Promise<AnalyticsMetric> {
    const metric: AnalyticsMetric = {
      id: `metric-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      eventType,
      category,
      userId,
      properties,
      timestamp: new Date(),
      sessionId,
    };

    this.metrics.set(metric.id, metric);
    this.updateSummary();

    this.logger.debug(
      `Recorded analytics event: ${eventType} (Category: ${category})`
    );

    return metric;
  }

  /**
   * Get analytics summary
   */
  getSummary(): AnalyticsSummary {
    return { ...this.summary };
  }

  /**
   * Get metrics by category
   */
  getMetricsByCategory(category: string): AnalyticsMetric[] {
    return Array.from(this.metrics.values())
      .filter((metric) => metric.category === category)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get metrics by user
   */
  getMetricsByUser(userId: string): AnalyticsMetric[] {
    return Array.from(this.metrics.values())
      .filter((metric) => metric.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get metrics in date range
   */
  getMetricsInRange(startDate: Date, endDate: Date): AnalyticsMetric[] {
    return Array.from(this.metrics.values())
      .filter(
        (metric) => metric.timestamp >= startDate && metric.timestamp <= endDate
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Inngest Function: Track analytics events
   *
   * This function processes all analytics events from the system
   */
  @TypedInngestFunction<UserEventRegistry>({
    id: "track-analytics-event",
    name: "Track Analytics Event",
    triggers: [{ event: "analytics.event" }],
  })
  async trackAnalyticsEvent(
    event: InngestEvent<UserEventRegistry["analytics.event"]>,
    { step, logger }: any
  ) {
    const { userId, eventType, category, properties, sessionId } = event.data;

    logger.info(
      `Processing analytics event: ${eventType} (Category: ${category})`
    );

    // Step 1: Store the analytics event
    const metric = await step.run("store-analytics-event", async () => {
      return await this.recordEvent(
        eventType,
        category,
        properties,
        userId,
        sessionId
      );
    });

    // Step 2: Process special event types
    await step.run("process-special-events", async () => {
      switch (eventType) {
        case "user_registered":
          await this.processUserRegistration(properties, userId);
          break;
        case "email_sent":
          await this.processEmailSent(properties, userId);
          break;
        case "email_failed":
          await this.processEmailFailed(properties, userId);
          break;
        case "user_verified":
          await this.processUserVerification(properties, userId);
          break;
        default:
          // Generic event processing
          logger.debug(`Processed generic analytics event: ${eventType}`);
      }
    });

    // Step 3: Update real-time aggregations
    await step.run("update-aggregations", async () => {
      await this.updateAggregations(eventType, category, properties);
    });

    return {
      success: true,
      metricId: metric.id,
      eventType,
      category,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Inngest Function: User registration analytics
   *
   * Automatically triggered when users register
   */
  @TypedInngestFunction<UserEventRegistry>({
    id: "analytics-user-registered",
    name: "Analytics: User Registered",
    triggers: [{ event: "user.registered" }],
  })
  async analyzeUserRegistration(
    event: InngestEvent<UserEventRegistry["user.registered"]>,
    { step, logger }: any
  ) {
    const { userId, email, name, registrationSource, metadata } = event.data;

    logger.info(
      `Analyzing user registration: ${userId} from ${registrationSource}`
    );

    // Step 1: Record registration analytics
    await step.run("record-registration-analytics", async () => {
      await this.recordEvent(
        "user_registered",
        "user",
        {
          email,
          name,
          registrationSource,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          referrer: metadata?.referrer,
        },
        userId
      );
    });

    // Step 2: Track registration source
    await step.run("track-registration-source", async () => {
      await this.recordEvent(
        "registration_source",
        "acquisition",
        {
          source: registrationSource,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
        },
        userId
      );
    });

    // Step 3: Update conversion metrics
    await step.run("update-conversion-metrics", async () => {
      // In a real app, you might track conversion funnels
      await this.recordEvent(
        "conversion_step",
        "funnel",
        {
          step: "registration_completed",
          source: registrationSource,
        },
        userId
      );
    });

    return {
      success: true,
      userId,
      registrationSource,
      analyticsRecorded: 3,
    };
  }

  /**
   * Inngest Function: Email analytics
   *
   * Tracks email delivery and engagement
   */
  @TypedInngestFunction<UserEventRegistry>({
    id: "analytics-email-sent",
    name: "Analytics: Email Sent",
    triggers: [{ event: "user.email.sent" }],
  })
  async analyzeEmailSent(
    event: InngestEvent<UserEventRegistry["user.email.sent"]>,
    { step, logger }: any
  ) {
    const { userId, emailType, emailId, recipient, subject, metadata } =
      event.data;

    logger.info(`Analyzing email sent: ${emailType} to ${recipient}`);

    // Step 1: Record email delivery analytics
    await step.run("record-email-analytics", async () => {
      await this.recordEvent(
        "email_sent",
        "email",
        {
          emailType,
          emailId,
          recipient,
          subject,
          templateId: metadata?.templateId,
          provider: metadata?.provider,
          isRetry: false, // This is a new delivery, not a retry
        },
        userId
      );
    });

    // Step 2: Track email campaign performance
    await step.run("track-email-campaign", async () => {
      await this.recordEvent(
        "email_campaign_delivery",
        "marketing",
        {
          campaignType: emailType,
          deliveryStatus: "sent",
          templateId: metadata?.templateId,
        },
        userId
      );
    });

    return {
      success: true,
      userId,
      emailType,
      emailId,
    };
  }

  /**
   * Inngest Function: Email failure analytics
   *
   * Tracks email delivery failures for monitoring
   */
  @TypedInngestFunction<UserEventRegistry>({
    id: "analytics-email-failed",
    name: "Analytics: Email Failed",
    triggers: [{ event: "user.email.failed" }],
  })
  async analyzeEmailFailed(
    event: InngestEvent<UserEventRegistry["user.email.failed"]>,
    { step, logger }: any
  ) {
    const { userId, emailType, recipient, error, retryable } = event.data;

    logger.warn(
      `Analyzing email failure: ${emailType} to ${recipient} - ${error}`
    );

    // Step 1: Record email failure analytics
    await step.run("record-email-failure", async () => {
      await this.recordEvent(
        "email_failed",
        "email",
        {
          emailType,
          recipient,
          error,
          retryable,
          errorCategory: this.categorizeEmailError(error),
        },
        userId
      );
    });

    // Step 2: Update failure metrics
    await step.run("update-failure-metrics", async () => {
      await this.recordEvent(
        "email_delivery_failure",
        "system",
        {
          emailType,
          failureReason: error,
          retryable,
        },
        userId
      );
    });

    return {
      success: true,
      userId,
      emailType,
      errorRecorded: true,
    };
  }

  /**
   * Inngest Function: Daily analytics aggregation
   *
   * Runs daily to aggregate analytics data
   */
  @TypedInngestFunction<UserEventRegistry>({
    id: "daily-analytics-aggregation",
    name: "Daily Analytics Aggregation",
    triggers: [{ cron: "0 1 * * *" }], // Daily at 1 AM
  })
  async dailyAnalyticsAggregation(event: any, { step, logger }: any) {
    logger.info("Starting daily analytics aggregation");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    // Step 1: Aggregate daily metrics
    const dailyMetrics = await step.run("aggregate-daily-metrics", async () => {
      const metrics = this.getMetricsInRange(yesterday, today);

      const aggregation = {
        date: yesterday.toISOString().split("T")[0],
        totalEvents: metrics.length,
        uniqueUsers: new Set(metrics.map((m) => m.userId).filter(Boolean)).size,
        eventTypes: this.aggregateByProperty(metrics, "eventType"),
        categories: this.aggregateByProperty(metrics, "category"),
      };

      return aggregation;
    });

    // Step 2: Store daily aggregation
    await step.run("store-daily-aggregation", async () => {
      await this.recordEvent("daily_aggregation", "system", dailyMetrics);
    });

    // Step 3: Clean up old detailed metrics (keep last 30 days)
    await step.run("cleanup-old-metrics", async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      let deletedCount = 0;
      for (const [id, metric] of this.metrics.entries()) {
        if (metric.timestamp < cutoffDate) {
          this.metrics.delete(id);
          deletedCount++;
        }
      }

      logger.info(`Cleaned up ${deletedCount} old metrics`);
      return { deletedCount };
    });

    return {
      success: true,
      date: yesterday.toISOString().split("T")[0],
      metricsProcessed: dailyMetrics.totalEvents,
      uniqueUsers: dailyMetrics.uniqueUsers,
    };
  }

  /**
   * Process user registration analytics
   */
  private async processUserRegistration(
    properties: any,
    userId?: string
  ): Promise<void> {
    // Track registration source trends
    const source = properties.registrationSource || "unknown";
    await this.recordEvent(
      "registration_source_trend",
      "acquisition",
      { source, timestamp: new Date().toISOString() },
      userId
    );
  }

  /**
   * Process email sent analytics
   */
  private async processEmailSent(
    properties: any,
    userId?: string
  ): Promise<void> {
    // Track email delivery rates by type
    const emailType = properties.emailType || "unknown";
    await this.recordEvent(
      "email_delivery_rate",
      "email",
      { emailType, status: "delivered", timestamp: new Date().toISOString() },
      userId
    );
  }

  /**
   * Process email failure analytics
   */
  private async processEmailFailed(
    properties: any,
    userId?: string
  ): Promise<void> {
    // Track email failure rates by type
    const emailType = properties.emailType || "unknown";
    await this.recordEvent(
      "email_failure_rate",
      "email",
      { emailType, status: "failed", timestamp: new Date().toISOString() },
      userId
    );
  }

  /**
   * Process user verification analytics
   */
  private async processUserVerification(
    properties: any,
    userId?: string
  ): Promise<void> {
    // Track verification rates by method
    const method = properties.verificationMethod || "unknown";
    await this.recordEvent(
      "verification_rate",
      "user",
      { method, status: "verified", timestamp: new Date().toISOString() },
      userId
    );
  }

  /**
   * Update real-time aggregations
   */
  private async updateAggregations(
    eventType: string,
    category: string,
    properties: any
  ): Promise<void> {
    // Update in-memory aggregations for real-time dashboards
    this.updateSummary();
  }

  /**
   * Update analytics summary
   */
  private updateSummary(): void {
    const allMetrics = Array.from(this.metrics.values());

    this.summary = {
      totalEvents: allMetrics.length,
      userRegistrations: allMetrics.filter(
        (m) => m.eventType === "user_registered"
      ).length,
      emailsSent: allMetrics.filter((m) => m.eventType === "email_sent").length,
      emailFailures: allMetrics.filter((m) => m.eventType === "email_failed")
        .length,
      userVerifications: allMetrics.filter(
        (m) => m.eventType === "user_verified"
      ).length,
      topEventTypes: this.getTopEventTypes(allMetrics),
      lastUpdated: new Date(),
    };
  }

  /**
   * Get top event types
   */
  private getTopEventTypes(
    metrics: AnalyticsMetric[]
  ): Array<{ eventType: string; count: number }> {
    const eventTypeCounts = new Map<string, number>();

    for (const metric of metrics) {
      const count = eventTypeCounts.get(metric.eventType) || 0;
      eventTypeCounts.set(metric.eventType, count + 1);
    }

    return Array.from(eventTypeCounts.entries())
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Aggregate metrics by property
   */
  private aggregateByProperty(
    metrics: AnalyticsMetric[],
    property: string
  ): Record<string, number> {
    const aggregation: Record<string, number> = {};

    for (const metric of metrics) {
      const value = (metric as any)[property] || "unknown";
      aggregation[value] = (aggregation[value] || 0) + 1;
    }

    return aggregation;
  }

  /**
   * Categorize email errors
   */
  private categorizeEmailError(error: string): string {
    const lowerError = error.toLowerCase();

    if (lowerError.includes("network") || lowerError.includes("timeout")) {
      return "network";
    } else if (
      lowerError.includes("invalid") ||
      lowerError.includes("bounce")
    ) {
      return "invalid_email";
    } else if (lowerError.includes("rate") || lowerError.includes("limit")) {
      return "rate_limit";
    } else if (
      lowerError.includes("auth") ||
      lowerError.includes("permission")
    ) {
      return "authentication";
    } else {
      return "unknown";
    }
  }

  /**
   * Health check for analytics service
   */
  async healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    metricCount: number;
    lastEventTime?: Date;
  }> {
    try {
      const metricCount = this.metrics.size;
      const lastMetric = Array.from(this.metrics.values()).sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      )[0];

      return {
        status: "healthy",
        metricCount,
        lastEventTime: lastMetric?.timestamp,
      };
    } catch (error) {
      return { status: "unhealthy", metricCount: 0 };
    }
  }
}
