import { AuditLogger } from '../backend/src/modules/audit-log/audit-log';
import { logger } from '../backend/src/utils/logger';
import { AuditLogEntry } from '../backend/src/types';

beforeAll(() => {
  logger.setLevel('error');
});

describe('AuditLogger', () => {
  describe('log', () => {
    it('stores a log entry and returns its id', () => {
      const audit = new AuditLogger();

      const id = audit.log('product_created', 'product', 'p1', [
        { field: 'name', type: 'added', new_value: 'Widget' }
      ]);

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('captures metadata, error, user and session information', async () => {
      const audit = new AuditLogger();
      const id = audit.log(
        'sync_failed',
        'sync',
        's1',
        undefined,
        { retry: 2 },
        'Connection refused',
        'alice',
        'sess-1',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      const logs = await audit.getLogs();
      const entry = logs.find(l => l.id === id);

      expect(entry).toMatchObject({
        entity_type: 'sync',
        entity_id: 's1',
        metadata: { retry: 2 },
        error: 'Connection refused',
        user_id: 'alice',
        session_id: 'sess-1',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0'
      });
    });
  });

  describe('getLogs', () => {
    it('returns logs sorted by timestamp descending', async () => {
      const audit = new AuditLogger();

      audit.log('product_created', 'product', 'p1');
      await new Promise(resolve => setTimeout(resolve, 5));
      audit.log('product_updated', 'product', 'p2');

      const logs = await audit.getLogs();

      expect(logs).toHaveLength(2);
      expect(logs[0].entity_id).toBe('p2');
      expect(logs[1].entity_id).toBe('p1');
    });

    it('filters by entity type', async () => {
      const audit = new AuditLogger();

      audit.log('product_created', 'product', 'p1');
      audit.log('image_uploaded', 'image', 'i1');

      expect(await audit.getLogs('product')).toHaveLength(1);
      expect(await audit.getLogs('image')).toHaveLength(1);
    });

    it('filters by action', async () => {
      const audit = new AuditLogger();

      audit.log('product_created', 'product', 'p1');
      audit.log('product_updated', 'product', 'p2');

      expect(await audit.getLogs(undefined, 'product_created')).toHaveLength(1);
    });

    it('filters by user id', async () => {
      const audit = new AuditLogger();

      audit.log('product_created', 'product', 'p1', undefined, undefined, undefined, 'alice');
      audit.log('product_created', 'product', 'p2', undefined, undefined, undefined, 'bob');

      expect(await audit.getLogs(undefined, undefined, undefined, undefined, 'alice')).toHaveLength(1);
    });

    it('filters by date range', async () => {
      const audit = new AuditLogger();

      audit.log('product_created', 'product', 'p1');
      const past = new Date(Date.now() - 10000);
      const future = new Date(Date.now() + 10000);

      expect(await audit.getLogs(undefined, undefined, past, future)).toHaveLength(1);
      expect(await audit.getLogs(undefined, undefined, future)).toHaveLength(0);
    });
  });

  describe('generateSummary', () => {
    it('aggregates operations, errors, and top users', () => {
      const audit = new AuditLogger();
      const start = new Date(Date.now() - 10000);
      const end = new Date(Date.now() + 10000);

      audit.log('product_created', 'product', 'p1', undefined, undefined, undefined, 'alice');
      audit.log('product_updated', 'product', 'p1', undefined, undefined, undefined, 'alice');
      audit.log('sync_failed', 'sync', 's1', undefined, undefined, 'Connection refused', 'bob');

      const summary = audit.generateSummary(start, end);

      expect(summary.total_operations).toBe(3);
      expect(summary.operations_by_type).toEqual({ product: 2, sync: 1 });
      expect(summary.entities_affected).toEqual({ product: 2, sync: 1 });
      expect(summary.errors_by_type).toEqual({ Connection: 1 });
      expect(summary.top_users).toEqual([
        { user_id: 'alice', operations: 2 },
        { user_id: 'bob', operations: 1 }
      ]);
    });

    it('filters by entity type', () => {
      const audit = new AuditLogger();
      const start = new Date(Date.now() - 10000);
      const end = new Date(Date.now() + 10000);

      audit.log('product_created', 'product', 'p1');
      audit.log('image_uploaded', 'image', 'i1');

      const summary = audit.generateSummary(start, end, 'image');

      expect(summary.total_operations).toBe(1);
      expect(summary.entities_affected).toEqual({ image: 1 });
    });
  });

  describe('exportLogs and importLogs', () => {
    it('exports all logs grouped by entity type', async () => {
      const audit = new AuditLogger();

      audit.log('product_created', 'product', 'p1');

      const exported = audit.exportLogs();

      expect(Object.keys(exported.all_logs)).toContain('product');
      expect(exported.all_logs.product).toHaveLength(1);
      expect(exported.metadata).toMatchObject({ retention_days: 30 });
    });

    it('exports a single entity type', () => {
      const audit = new AuditLogger();

      audit.log('product_created', 'product', 'p1');
      audit.log('image_uploaded', 'image', 'i1');

      const exported = audit.exportLogs('image');

      expect(exported.product).toBeUndefined();
      expect(exported.image).toHaveLength(1);
    });

    it('imports previously exported logs', async () => {
      const source = new AuditLogger();
      source.log('product_created', 'product', 'p1');
      const exported = source.exportLogs();

      const target = new AuditLogger();
      await target.importLogs(exported.all_logs);

      const logs = await target.getLogs('product');
      expect(logs).toHaveLength(1);
      expect(logs[0].entity_id).toBe('p1');
    });
  });

  describe('Retention and size limits', () => {
    it('removes logs older than the retention period', async () => {
      const audit = new AuditLogger({ retentionDays: -1 });

      audit.log('product_created', 'product', 'p1');

      expect(await audit.getLogs()).toHaveLength(0);
    });

    it('caps in-memory logs per entity type at 1000 entries', async () => {
      const audit = new AuditLogger();

      for (let i = 0; i < 1001; i++) {
        audit.log('product_created', 'product', `p${i}`);
      }

      const logs = await audit.getLogs('product');
      expect(logs).toHaveLength(1000);
      expect(logs.every(l => l.entity_type === 'product')).toBe(true);
    });
  });
});
