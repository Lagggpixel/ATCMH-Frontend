import {SessionError} from "./sessions";
import {availableControl, summary, type SessionRecord, type SessionStore} from "./server/session-service";
export class MemoryStore implements SessionStore {
  records = new Map<string, SessionRecord>();
  preferences = new Map<string, boolean>();
  async autoReadback(accountId: string) {return this.preferences.get(accountId);}
  async saveAutoReadback(accountId: string, enabled: boolean) {this.preferences.set(accountId, enabled);}
  private queue = Promise.resolve();
  async list(now: number) {return [...this.records.values()].map(r => summary(r, now));}
  async create(record: SessionRecord) {this.records.set(record.id, structuredClone(record));}
  transaction<T>(id: string, run: (record: SessionRecord) => T | Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const source = this.records.get(id); if (!source) throw new SessionError("not-found", "Session ended", 404);
      const record = structuredClone(source), value = await run(record); this.records.set(id, record); return value;
    });
    this.queue = result.then(() => {}, () => {}); return result;
  }
  async end(id: string, accountId: string, now: number) {
    await this.transaction(id, record => {availableControl(record, {accountId, staff: true}, now);});
    this.records.delete(id);
  }
}
