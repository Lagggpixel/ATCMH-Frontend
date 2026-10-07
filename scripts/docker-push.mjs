import { runDockerBuild } from "./docker-build.mjs";

process.exitCode = runDockerBuild({ publish: true });
