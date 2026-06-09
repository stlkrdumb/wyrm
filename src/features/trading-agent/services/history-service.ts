import fs from "node:fs";
import path from "node:path";
import { DecisionRecord } from "@/features/trading-agent/types/history.types";

const HISTORY_FILE = path.join(process.cwd(), ".data/decision-history.json");

/**
 * HistoryService
 * Manages the persistence and retrieval of agent decisions.
 */
export class HistoryService {
  /**
   * Saves a new decision record to the history file.
   * @param record The decision record to save.
   */
  public async saveDecision(record: DecisionRecord): Promise<void> {
    try {
      let history: DecisionRecord[] = [];

      if (fs.existsSync(HISTORY_FILE)) {
        const data = fs.readFileSync(HISTORY_FILE, "utf-8");
        history = JSON.parse(data);
      }

      history.push(record);

      // Keep only the last 1000 records to prevent file bloat
      const trimmedHistory = history.slice(-1000);

      fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2));
    } catch (err) {
      console.error("[History] Failed to save decision:", err);
    }
  }

  /**
   * Retrieves all decision records.
   * @returns A promise resolving to an array of DecisionRecords.
   */
  public async getHistory(): Promise<DecisionRecord[]> {
    try {
      if (!fs.existsSync(HISTORY_FILE)) {
        return [];
      }

      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      const rawHistory = JSON.parse(data);

      // Convert timestamp strings back to Date objects
      return rawHistory.map((h: any) => ({
        ...h,
        timestamp: new Date(h.timestamp),
      }));
    } catch (err) {
      console.error("[History] Failed to read history:", err);
      return [];
    }
  }

  /**
   * Retrieves history filtered by symbol.
   * @param symbol The trading symbol (e.g., "BTCUSDT").
   */
  public async getHistoryBySymbol(symbol: string): Promise<DecisionRecord[]> {
    const history = await this.getHistory();
    return history.filter(h => h.symbol === symbol);
  }
}

export const historyService = new HistoryService();
