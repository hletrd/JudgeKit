import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_PENDING_EVENTS,
  clearInflightEvent,
  isValidPendingEvent,
  loadInflightEvent,
  loadPendingEvents,
  saveInflightEvent,
  savePendingEvents,
  type PendingEvent,
} from "@/components/exam/anti-cheat-storage";

const ASSIGNMENT_ID = "assign-test";
const STORAGE_PREFIX = "judgekit_anticheat_pending";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("anti-cheat-storage", () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    originalLocalStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: new MemoryStorage(),
    });
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: originalLocalStorage,
      });
    } else {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    }
  });

  describe("isValidPendingEvent", () => {
    it("accepts a well-formed event", () => {
      const event: PendingEvent = {
        eventType: "tab_switch",
        timestamp: Date.now(),
        retries: 1,
      };
      expect(isValidPendingEvent(event)).toBe(true);
    });

    it("rejects null", () => {
      expect(isValidPendingEvent(null)).toBe(false);
    });

    it("rejects non-object", () => {
      expect(isValidPendingEvent("string")).toBe(false);
      expect(isValidPendingEvent(42)).toBe(false);
    });

    it("rejects missing eventType", () => {
      expect(isValidPendingEvent({ timestamp: 1, retries: 0 })).toBe(false);
    });

    it("rejects wrong-type retries", () => {
      expect(
        isValidPendingEvent({ eventType: "x", timestamp: 1, retries: "0" }),
      ).toBe(false);
    });
  });

  describe("loadPendingEvents", () => {
    it("returns empty array when no entry exists", () => {
      expect(loadPendingEvents(ASSIGNMENT_ID)).toEqual([]);
    });

    it("returns empty array when stored value is malformed JSON", () => {
      localStorage.setItem(`${STORAGE_PREFIX}_${ASSIGNMENT_ID}`, "{not-json");
      expect(loadPendingEvents(ASSIGNMENT_ID)).toEqual([]);
    });

    it("returns empty array when stored value is not an array", () => {
      localStorage.setItem(
        `${STORAGE_PREFIX}_${ASSIGNMENT_ID}`,
        JSON.stringify({ not: "array" }),
      );
      expect(loadPendingEvents(ASSIGNMENT_ID)).toEqual([]);
    });

    it("filters out invalid entries", () => {
      const stored = [
        { eventType: "valid", timestamp: 1, retries: 0 },
        null,
        { eventType: "missing-timestamp", retries: 0 },
        { eventType: "valid2", timestamp: 2, retries: 1 },
      ];
      localStorage.setItem(
        `${STORAGE_PREFIX}_${ASSIGNMENT_ID}`,
        JSON.stringify(stored),
      );
      const result = loadPendingEvents(ASSIGNMENT_ID);
      expect(result.length).toBe(2);
      expect(result[0].eventType).toBe("valid");
      expect(result[1].eventType).toBe("valid2");
    });

    it("caps the returned array at MAX_PENDING_EVENTS even when storage holds more", () => {
      // Write 250 valid events to localStorage.
      const oversized: PendingEvent[] = Array.from({ length: 250 }, (_, i) => ({
        eventType: `event-${i}`,
        timestamp: 1000 + i,
        retries: 0,
      }));
      localStorage.setItem(
        `${STORAGE_PREFIX}_${ASSIGNMENT_ID}`,
        JSON.stringify(oversized),
      );

      const result = loadPendingEvents(ASSIGNMENT_ID);
      expect(result.length).toBe(MAX_PENDING_EVENTS);
      expect(MAX_PENDING_EVENTS).toBe(200);
      // Cap takes the first N (slice(0, N) semantics) — earliest entries kept.
      expect(result[0].eventType).toBe("event-0");
      expect(result[result.length - 1].eventType).toBe(`event-${MAX_PENDING_EVENTS - 1}`);
    });

    it("returns the full array when storage holds fewer than the cap", () => {
      const small: PendingEvent[] = Array.from({ length: 5 }, (_, i) => ({
        eventType: `event-${i}`,
        timestamp: 1000 + i,
        retries: 0,
      }));
      localStorage.setItem(
        `${STORAGE_PREFIX}_${ASSIGNMENT_ID}`,
        JSON.stringify(small),
      );
      expect(loadPendingEvents(ASSIGNMENT_ID).length).toBe(5);
    });
  });

  describe("savePendingEvents", () => {
    it("removes the entry when events array is empty", () => {
      localStorage.setItem(
        `${STORAGE_PREFIX}_${ASSIGNMENT_ID}`,
        JSON.stringify([{ eventType: "x", timestamp: 1, retries: 0 }]),
      );
      savePendingEvents(ASSIGNMENT_ID, []);
      expect(localStorage.getItem(`${STORAGE_PREFIX}_${ASSIGNMENT_ID}`)).toBeNull();
    });

    it("persists the events array as JSON", () => {
      const events: PendingEvent[] = [
        { eventType: "a", timestamp: 1, retries: 0 },
        { eventType: "b", timestamp: 2, retries: 1 },
      ];
      savePendingEvents(ASSIGNMENT_ID, events);
      const raw = localStorage.getItem(`${STORAGE_PREFIX}_${ASSIGNMENT_ID}`);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual(events);
    });
  });

  describe("MAX_PENDING_EVENTS contract", () => {
    it("is exported and equals 200", () => {
      expect(MAX_PENDING_EVENTS).toBe(200);
    });
  });

  // RPF cycle-5 AGG5-4: single-occupancy crash-recovery slot for the event
  // currently being sent by the flush claim loop.
  describe("in-flight slot", () => {
    const INFLIGHT_PREFIX = "judgekit_anticheat_inflight";

    it("round-trips save → load → clear", () => {
      const event: PendingEvent = { eventType: "copy", timestamp: 1, retries: 2 };
      saveInflightEvent(ASSIGNMENT_ID, event);
      expect(loadInflightEvent(ASSIGNMENT_ID)).toEqual(event);
      clearInflightEvent(ASSIGNMENT_ID);
      expect(loadInflightEvent(ASSIGNMENT_ID)).toBeNull();
    });

    it("returns null for an empty slot", () => {
      expect(loadInflightEvent(ASSIGNMENT_ID)).toBeNull();
    });

    it("drops corrupt slot JSON gracefully", () => {
      localStorage.setItem(`${INFLIGHT_PREFIX}_${ASSIGNMENT_ID}`, "{not json");
      expect(loadInflightEvent(ASSIGNMENT_ID)).toBeNull();
    });

    it("rejects slot entries that are not valid pending events", () => {
      localStorage.setItem(
        `${INFLIGHT_PREFIX}_${ASSIGNMENT_ID}`,
        JSON.stringify({ eventType: 42 }),
      );
      expect(loadInflightEvent(ASSIGNMENT_ID)).toBeNull();
    });

    it("is scoped per assignment", () => {
      const event: PendingEvent = { eventType: "blur", timestamp: 9, retries: 0 };
      saveInflightEvent("assign-a", event);
      expect(loadInflightEvent("assign-b")).toBeNull();
      expect(loadInflightEvent("assign-a")).toEqual(event);
      clearInflightEvent("assign-a");
    });
  });
});
