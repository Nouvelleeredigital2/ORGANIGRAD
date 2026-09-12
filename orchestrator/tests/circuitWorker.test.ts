import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { registerCircuitWorker } from '../src/api/circuitWorker.js';

afterEach(() => vi.useRealTimers());

it('starts on ready, never overlaps ticks, and drains before close', async () => {
 vi.useFakeTimers();
 const app=Fastify();
 let finish!:()=>void;
 const tick=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 registerCircuitWorker(app,{tick},1000);
 expect(tick).not.toHaveBeenCalled();
 await app.ready();
 expect(tick).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(5000);
 expect(tick).toHaveBeenCalledTimes(1);
 let closed=false;
 const closing=app.close().then(()=>{closed=true;});
 await vi.advanceTimersByTimeAsync(1);
 expect(closed).toBe(false);
 finish();
 await closing;
 await vi.advanceTimersByTimeAsync(5000);
 expect(tick).toHaveBeenCalledTimes(1);
});

it('recovers after a failed tick without logging error secrets', async()=>{
 vi.useFakeTimers();
 const app=Fastify();
 const log=vi.spyOn(app.log,'error');
 const tick=vi.fn().mockRejectedValueOnce(new Error('sensitive connection string')).mockResolvedValue([]);
 registerCircuitWorker(app,{tick},1000);
 await app.ready();
 await vi.advanceTimersByTimeAsync(1000);
 expect(tick).toHaveBeenCalledTimes(2);
 expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive');
 expect(log).toHaveBeenCalledWith('Circuit scheduler tick failed');
 await app.close();
});
