import { EventEmitter } from "node:events";

export interface PricePayload {
  symbol: string;
  lastPrice: number;
  change24hPercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

class AgentEvents extends EventEmitter {
  emitPrice(payload: PricePayload): void {
    this.emit("price", payload);
  }

  onPrice(listener: (payload: PricePayload) => void): void {
    this.on("price", listener);
  }

  offPrice(listener: (payload: PricePayload) => void): void {
    this.off("price", listener);
  }
}

export const agentEvents = new AgentEvents();
agentEvents.setMaxListeners(100);