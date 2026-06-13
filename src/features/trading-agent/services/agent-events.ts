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

// Share the Event Emitter instance across Next.js bundles using Node's global object
const globalForAgentEvents = global as unknown as { agentEvents?: AgentEvents };

export const agentEvents = globalForAgentEvents.agentEvents ?? new AgentEvents();

if (process.env.NODE_ENV !== "production") {
  globalForAgentEvents.agentEvents = agentEvents;
}

agentEvents.setMaxListeners(100);