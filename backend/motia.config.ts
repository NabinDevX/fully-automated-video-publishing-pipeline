import path from "node:path";
import {
  config,
  type MotiaPlugin,
  type MotiaPluginContext,
} from "@motiadev/core";

import endpointPlugin from "@motiadev/plugin-endpoint/plugin";
import logsPlugin from "@motiadev/plugin-logs/plugin";
import observabilityPlugin from "@motiadev/plugin-observability/plugin";
import statesPlugin from "@motiadev/plugin-states/plugin";
import bullmqPlugin from "@motiadev/plugin-bullmq/plugin";

function ytDashboardPlugin(motia: MotiaPluginContext): MotiaPlugin {
  return {
    dirname: path.join(__dirname, "plugins/plugin-yt-dashboard"),
    workbench: [
      {
        packageName: "~/plugins/plugin-yt-dashboard",
        componentName: "YTDashboardUI",
        label: "YouTube Dashboard",
        labelIcon: "youtube",
        position: "top",
      },
    ],
  };
}

export default config({
  plugins: [
    observabilityPlugin,
    statesPlugin,
    endpointPlugin,
    logsPlugin,
    bullmqPlugin,
    ytDashboardPlugin,
  ],
});
