
import {sessionJson} from "../shared-transport";

export const endlessEndpoint = "/api/simulator/endless";
export const endlessRequest = (csrf: string, body: object) =>
  fetch(endlessEndpoint, {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf}, body: JSON.stringify(body)}).then(sessionJson);
