// PIV Orchestrator — Lifecycle Event Bus
//
// Typed EventEmitter for Mission Controller lifecycle events.
// All agent lifecycle transitions flow through this bus.

import { EventEmitter } from "node:events";
import type { LifecycleEvent, EventPayload } from "./types.js";

type EventHandler = (payload: EventPayload) => void;

export class MissionEventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  emit(event: LifecycleEvent, payload: EventPayload): void {
    console.log(`  📡 Event: ${event} [${payload.module}/${payload.slice}]${payload.details ? ` — ${payload.details}` : ""}`);
    this.emitter.emit(event, payload);
  }

  on(event: LifecycleEvent, handler: EventHandler): void {
    this.emitter.on(event, handler);
  }

  off(event: LifecycleEvent, handler: EventHandler): void {
    this.emitter.off(event, handler);
  }

  once(event: LifecycleEvent, handler: EventHandler): void {
    this.emitter.once(event, handler);
  }

  listenerCount(event: LifecycleEvent): number {
    return this.emitter.listenerCount(event);
  }

  removeAllListeners(event?: LifecycleEvent): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}
