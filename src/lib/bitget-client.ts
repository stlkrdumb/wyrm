import { BitgetRestClient, loadConfig } from "bitget-core";

export const bitgetClient = new BitgetRestClient(
  loadConfig({ modules: "", readOnly: true })
);
