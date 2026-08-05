"""
Audit Log Module
Comprehensive audit logging for compliance, troubleshooting, and accountability.
"""

import { ProductData, SyncOperation, SyncResult, AuditLogEntry, AuditChange } from '../types';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger';

export class AuditLogger {
  private logLevel: string;
  private maxLogSize: number;
  private retentionDays: number;
  private logs: Map<string, AuditLogEntry[]>;

  constructor(config: {
    logLevel?: string;
    maxLogSize?: number;
    retentionDays?: number;
  } = {}) {
    this.logLevel = config.logLevel || 'info';
    this.maxLogSize = config.maxLogSize || 10485760; // 10MB
    this.retentionDays = config.retentionDays || 30;
    this.logs = new Map();
  }

  log(
    action: string,
    entityType: 'product' | 'image' | 'sync' | 'ai_suggestion',
    entityId: string,
    changes?: AuditChange[],
    metadata?: Record<string, any>,
    error?: string,
    userId?: string,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): string {
    const logId = nanoid();
    const timestamp = new Date();

    const logEntry: AuditLogEntry = {
      id: logId,
      timestamp,
      action: action as any,
      entity_type: entityType,
      entity_id: entityId,
      changes,
      metadata,
      error,
      user_id: userId,
      session_id: sessionId,
      ip_address: ipAddress,
      user_agent: userAgent
    };

    this.storeLog(entityType, logEntry);

    if (this.shouldLog(logEntry)) {
      this.outputLog(logEntry);
    }

    logger.info('Audit log created', {
      logId,
      action,
      entityType,
      entityId,
      hasChanges: !!changes?.length,
      hasError: !!error
    });

    return logId;
  }

  private storeLog(entityType: string, logEntry: AuditLogEntry): void {
    if (!this.logs.has(entityType)) {
      this.logs.set(entityType, []);
    }

    const entityLogs = this.logs.get(entityType)!;
    entityLogs.push(logEntry);

    // Clean up old logs
    this.cleanOldLogs(entityType);

    // Limit log size
    if (entityLogs.length > 1000) {
      entityLogs.splice(0, entityLogs.length - 1000);
    }
  }

  private cleanOldLogs(entityType: string): void {
    const entityLogs = this.logs.get(entityType)!;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const filteredLogs = entityLogs.filter(log => log.timestamp > cutoffDate);
    this.logs.set(entityType, filteredLogs);
  }

  private shouldLog(logEntry: AuditLogEntry): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const logLevelIndex = levels.indexOf(this.logLevel);
    const entryLevelIndex = levels.indexOf(logEntry.action.split('_')[0] as any);

    return entryLevelIndex >= logLevelIndex;
  }

  private outputLog(logEntry: AuditLogEntry): void {
    const logLine = this.formatLogEntry(logEntry);
    console.log(logLine);
  }

  private formatLogEntry(logEntry: AuditLogEntry): string {
    const timestamp = logEntry.timestamp.toISOString();
    const level = this.getLogLevel(logEntry.action);
    const entity = logEntry.entity_type;
    const action = logEntry.action;
    const entityId = logEntry.entity_id;

    let message = `[${timestamp}] ${level.toUpperCase()}: ${action.toUpperCase()} ${entity} ${entityId}`;

    if (logEntry.error) {
      message += ` | ERROR: ${logEntry.error}`;
    }

    if (logEntry.changes?.length) {
      message += ` | CHANGES: ${logEntry.changes.length} field(s) modified`;
    }

    if (logEntry.metadata) {
      const metadataStr = JSON.stringify(logEntry.metadata, null, 2);
      message += `\n  METADATA:\n${metadataStr}`;
    }

    if (logEntry.changes?.length) {
      message += `\n  CHANGES:\n${logEntry.changes.map(c => 
        `    ${c.field}: ${c.type} (${JSON.stringify(c.old_value)} → ${JSON.stringify(c.new_value)})`
      ).join('\n')}`;
    }

    return message;
  }

  private getLogLevel(action: string): string {
    if (action.includes('error') || action.includes('fail')) return 'error';
    if (action.includes('warn') || action.includes('invalid')) return 'warn';
    if (action.includes('debug')) return 'debug';
    return 'info';
  }

  async getLogs(
    entityType?: string,
    action?: string,
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<AuditLogEntry[]> {
    let allLogs: AuditLogEntry[] = [];

    for (const [type, logs] of this.logs.entries()) {
      if (entityType && type !== entityType) continue;

      allLogs = allLogs.concat(logs);
    }

    allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (startDate) {
      allLogs = allLogs.filter(log => log.timestamp >= startDate);
    }

    if (endDate) {
      allLogs = allLogs.filter(log => log.timestamp <= endDate);
    }

    if (userId) {
      allLogs = allLogs.filter(log => log.user_id === userId);
    }

    if (action) {
      allLogs = allLogs.filter(log => log.action === action);
    }

    return allLogs;
  }

  generateSummary(
    startDate: Date,
    endDate: Date,
    entityType?: string
  ): any {
    const logs = entityType 
      ? (this.logs.get(entityType) || [])
      : Array.from(this.logs.values()).flat();

    const relevantLogs = logs.filter(log => 
      log.timestamp >= startDate && log.timestamp <= endDate
    );

    const summary = {
      date_range: { start: startDate, end: endDate },
      total_operations: relevantLogs.length,
      operations_by_type: {} as Record<string, number>,
      entities_affected: {} as Record<string, number>,
      errors_by_type: {} as Record<string, number>,
      top_users: [] as Array<{ user_id: string; operations: number }>,
      top_actions: [] as Array<{ action: string; count: number }>
    };

    for (const log of relevantLogs) {
      // Count by action type
      const actionKey = log.action.split('_')[0];
      summary.operations_by_type[actionKey] = (summary.operations_by_type[actionKey] || 0) + 1;

      // Count by entity type
      summary.entities_affected[log.entity_type] = (summary.entities_affected[log.entity_type] || 0) + 1;

      // Count errors
      if (log.error) {
        const errorType = log.error.split(' ')[0];
        summary.errors_by_type[errorType] = (summary.errors_by_type[errorType] || 0) + 1;
      }

      // Count by user
      if (log.user_id) {
        summary.top_users[log.user_id] = (summary.top_users[log.user_id] || 0) + 1;
      }
    }

    // Convert top_users to array and sort
    summary.top_users = Object.entries(summary.top_users)
      .map(([user_id, operations]) => ({ user_id, operations }))
      .sort((a, b) => b.operations - a.operations)
      .slice(0, 10);

    // Convert top_actions to array and sort
    summary.top_actions = Object.entries(summary.operations_by_type)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return summary;
  }

  exportLogs(entityType?: string): any {
    const exportData: any = {
      exported_at: new Date().toISOString(),
      metadata: {
        log_level: this.logLevel,
        max_log_size: this.maxLogSize,
        retention_days: this.retentionDays
      }
    };

    if (entityType) {
      const logs = this.logs.get(entityType) || [];
      exportData[entityType] = logs;
    } else {
      exportData.all_logs = {};
      for (const [type, logs] of this.logs.entries()) {
        exportData.all_logs[type] = logs;
      }
    }

    return exportData;
  }

  async importLogs(importData: any): Promise<void> {
    for (const [entityType, logs] of Object.entries(importData)) {
      if (entityType === 'metadata') continue;

      const entityLogs = this.logs.get(entityType as string) || [];
      entityLogs.push(...logs as AuditLogEntry[]);
      this.logs.set(entityType as string, entityLogs);

      logger.info('Imported audit logs', {
        entityType,
        count: (logs as AuditLogEntry[]).length
      });
    }
  }
}