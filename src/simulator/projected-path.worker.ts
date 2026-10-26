import {calculateProjectedPath, type PathPredictionRequest, type PathPredictionResponse} from "./projected-path";

self.onmessage = (event: MessageEvent<PathPredictionRequest>) => {
  const {id, input} = event.data;
  let response: PathPredictionResponse;
  try {response = {id, points: calculateProjectedPath(input)};}
  catch {response = {id, error: true};}
  self.postMessage(response);
};
