import type { CircuitExecution } from './circuits.js';
import { executeBorealExternalStep, type BorealExternalService, type BorealReceiptPort } from './borealExternalExecutor.js';

type CircuitStorePort={
    getRun(id:string):Promise<CircuitExecution>;
    completeExternal(id:string,input:{stepId:string;expectedVersion:number;outputs:import('@apps2026/contracts').ArtifactReference[]}):Promise<CircuitExecution>;
    waitForEngine(id:string,input:{stepId:string;expectedVersion:number}):Promise<CircuitExecution>;
};

/** Internal worker only. It owns no user session and advances a run only after a settled receipt. */
export class PgBorealExecutor {
    constructor(
        private readonly store:CircuitStorePort,
        private readonly receipts:BorealReceiptPort,
        private readonly service:BorealExternalService,
        private readonly mandateId:string,
    ) {}

    async execute(runId:string):Promise<CircuitExecution> {
        const run=await this.store.getRun(runId);
        const result=await executeBorealExternalStep(run,{mandateId:this.mandateId,receipts:this.receipts,service:this.service});
        if(result.kind==='waiting_engine')return this.store.waitForEngine(run.id,{stepId:run.currentStepId,expectedVersion:run.version});
        return this.store.completeExternal(run.id,{stepId:run.currentStepId,expectedVersion:run.version,outputs:result.outputs});
    }
}