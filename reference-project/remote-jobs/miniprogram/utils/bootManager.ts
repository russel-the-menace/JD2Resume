/**
 * BootManager.ts - Industrial-Grade Bootstrap Orchestrator
 * High-performance task orchestration for mini-program startup.
 */

export type BootStatus = 'loading' | 'success' | 'error' | 'no-network' | 'server-down' | 'unauthorized';

type Listener = (status: BootStatus) => void;

class BootManager {
  private static instance: BootManager;
  private status: BootStatus = 'loading';
  private listeners: Set<Listener> = new Set();
  private startTime: number = 0;
  private readonly MIN_SPLASH_TIME = 1500;

  private constructor() {}

  public static getInstance(): BootManager {
    if (!BootManager.instance) {
      BootManager.instance = new BootManager();
    }
    return BootManager.instance;
  }

  /**
   * Initialize the boot process
   */
  public async start(tasks: Promise<any>[]): Promise<void> {
    console.log('[BootManager] Starting sequence...');
    this.startTime = Date.now();
    this.setStatus('loading');

    try {
      // 1. Core Parallel Execution
      await Promise.allSettled(tasks);
    } catch (err) {
      console.error('[BootManager] Task error:', err);
    } finally {
      // 2. Ensure minimal splash duration
      const elapsed = Date.now() - this.startTime;
      const remaining = Math.max(0, this.MIN_SPLASH_TIME - elapsed);
      
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
      
      console.log('[BootManager] Critical tasks and timing fulfilled.');
    }
  }

  public getStatus(): BootStatus {
    return this.status;
  }

  /**
   * Broadcasting principle: Notify all subscribers when status changes
   */
  public setStatus(newStatus: BootStatus) {
    if (this.status === newStatus) return;
    
    console.log(`[BootManager] Broadcasting status change: ${this.status} -> ${newStatus}`);
    this.status = newStatus;
    this.listeners.forEach(fn => {
        try {
            fn(newStatus);
        } catch (e) {
            console.error('[BootManager] Listener failed:', e);
        }
    });
  }

  /**
   * Register a listener for status changes (Radio/Broadcast pattern)
   */
  public onStatusChange(fn: Listener): () => void {
    this.listeners.add(fn);
    // Return unsubscribe function
    return () => this.listeners.delete(fn);
  }
}

export const bootManager = BootManager.getInstance();
