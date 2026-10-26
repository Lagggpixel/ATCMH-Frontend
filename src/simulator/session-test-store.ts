import {positionPresence, allPositionSeats} from "./server/position-state";
import {SessionError, sessionCode} from "./sessions";
import {availableControl, summary, type SessionRecord, type SessionStore} from "./server/session-service";
export class MemoryStore implements SessionStore {
  records = new Map<string, SessionRecord>();
  preferences = new Map<string, boolean>();
  async autoReadback(accountId: string) {return this.preferences.get(accountId);}
  async saveAutoReadback(accountId: string, enabled: boolean) {this.preferences.set(accountId, enabled);}
  private queue = Promise.resolve();
  async list(now: number) {return [...this.records.values()].map(r => summary(r, now));}
  async create(record: SessionRecord) {this.records.set(record.id, structuredClone(record));}
  async read(id: string) {const record = this.records.get(id); if (!record) throw new SessionError("not-found", "Session ended", 404); return structuredClone(record);}
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
  async assigned(discordId: string, now: number) {
    return [...this.records.values()].filter(r => (r.assignment?.discordId === discordId || Object.values(r.positionState ?? {}).some(p => p.assignment?.discordId === discordId))).map(r => ({id: r.id, title: r.title, airport: r.exercise.airport ?? "EGPH",
      ...(r.ownerName ? {trainerName: r.ownerName} : {}), positions: positionPresence(r, now).filter(p => p.assignedId === discordId), assignedAt: r.assignment?.assignedAt ?? Math.max(0, ...Object.values(r.positionState ?? {}).map(p => p.assignment?.assignedAt ?? 0)), trainerConnected: !!r.staff && r.staff.expiresAt > now,
      youConnected: !!r.mentee && r.mentee.expiresAt > now && r.mentee.discordId === discordId || allPositionSeats(r).some(s => s.expiresAt > now && s.discordId === discordId), paused: !!r.exercise.pausedByStaff}));
  }
  async hasAssignment(discordId: string) {return [...this.records.values()].some(r => (r.assignment?.discordId === discordId || Object.values(r.positionState ?? {}).some(p => p.assignment?.discordId === discordId)));}
  async lookup(entry: {code: string} | {id: string}) {
    const r = [...this.records.values()].find(r => "id" in entry ? r.id === entry.id : sessionCode(r.id, r.exercise.airport ?? "EGPH") === entry.code);
    return r ? {id: r.id, title: r.title, airport: r.exercise.airport ?? "EGPH", ...(r.ownerName ? {ownerName: r.ownerName} : {}), ...(r.assignment ? {assignedDiscordId: r.assignment.discordId} : {})} : null;
  }
}
