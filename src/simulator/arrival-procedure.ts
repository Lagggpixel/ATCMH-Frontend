/** The route transition remains in the stored procedure; displays use its STAR name. */
export function arrivalProcedureName(value: string): string {
  return value.split("·", 1)[0].trim();
}
