import type {RowDataPacket} from "mysql2/promise";
import {queryReadOnly, withWriteTransaction} from "../../lib/db";
export type NotificationPreferences = {feedback: boolean; assignment: boolean};
export async function readNotificationPreferences(accountId: string): Promise<NotificationPreferences> {
  const rows = await queryReadOnly<(RowDataPacket & {feedback_enabled: number; assignment_enabled: number})[]>("SELECT feedback_enabled,assignment_enabled FROM simulator_notification_preferences WHERE account_id=?", [accountId]);
  return {feedback: rows[0] ? !!rows[0].feedback_enabled : true, assignment: rows[0] ? !!rows[0].assignment_enabled : true};
}
export async function saveNotificationPreferences(accountId: string, value: NotificationPreferences) {
  await withWriteTransaction(connection => connection.execute("INSERT INTO simulator_notification_preferences (account_id,feedback_enabled,assignment_enabled) VALUES (?,?,?) ON DUPLICATE KEY UPDATE feedback_enabled=VALUES(feedback_enabled),assignment_enabled=VALUES(assignment_enabled)", [accountId, value.feedback, value.assignment]));
  return value;
}
