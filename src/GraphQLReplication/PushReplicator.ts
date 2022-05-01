import { FetchResult } from "@apollo/client/link/core/types";
import { DocumentNode } from "graphql";
import {
  mutationQueueModel,
  MODEL_METADATA_KEY,
} from "../metadata/MetadataModels";
import { Model } from "../Model";
import { NetworkStatusEvent } from "../network/NetworkStatus";
import { CRUDEvents } from "../utils/CRUDEvents";
import { getFirstOperationData, removeUnderscore } from "../utils/Utils";
import { buildMutation } from "./builders/buildMutation";
import { MutationRequest, PushReplicationConfig } from "./types";

/**
 * Interface that is injected into model in order to add new items to replication engine
 */
export interface ModelChangeReplication {
  /**
   * Save replication request
   * @param model
   * @param data
   * @param eventType
   */
  saveChangeForReplication(
    model: Model,
    data: any,
    eventType: CRUDEvents
  ): Promise<void>;
}

/**
 * Represents single row where we persist all items
 * We use single row to ensure consistency
 */
// const MUTATION_ROW_ID = "offline_changes";

export class PushReplicator implements ModelChangeReplication {
  private config: PushReplicationConfig;
  private pushQuery: DocumentNode;
  // Queue is open (available to process data) if needed
  private open?: boolean;
  // Queue is currently procesisng requests (used as semaphore to avoid processing multiple times)
  private processing: boolean;
  private replicating: boolean;

  constructor(config: PushReplicationConfig) {
    this.config = config;
    this.pushQuery = buildMutation(this.config);
    this.processing = false;
    this.replicating = false;

    // Subscribe to network updates and open and close replication
    this.config.networkIndicator.subscribe({
      next: (message: NetworkStatusEvent) => {
        console.log(`Network state changed: ${message}`);
        this.open = message.isOnline;
        if (this.open) {
          this.process();
        }
      },
      complete: () => {
        this.open = false;
      },
      error: () => {},
    });

    // Intentionally async to start replication in background
    this.config.networkIndicator.isNetworkReachable().then((result) => {
      if (this.open === undefined) {
        // first time
        this.open = result;
      } else if (this.open === result) {
        // No state change
        return;
      }

      if (result === true) {
        // Going online
        this.process();
      }
      this.open = result;
    });
  }

  /**
   * Save user change to bereplicated by engine
   */
  public async saveChangeForReplication(data: any, eventType: CRUDEvents) {
    // const storeName = this.config.model.getStoreName()
    const saveData = removeUnderscore(data);
    const mutationRequest = {
      data: saveData,
      eventType,
    };
    // console.log("PUSH MUTATION", mutationRequest)
    await this.enqueueRequest(mutationRequest);
    this.process();
  }

  public async process() {
    // console.log('process')
    if (!this.open) {
      // console.log('Client offline. Stop processsing queue')
      return;
    }

    if (this.processing) {
      // console.log('Client is processing already. Stop processsing queue')
      return;
    }

    this.processing = true;
    // console.log("OPEN, REPLICATING", this.open, this.replicating)
    while (this.open && this.replicating) {
      const storedMutations = await this.getStoredMutations();
      if (!storedMutations) {
        // console.log('Mutation Queue is empty - nothing to replicate')
        break;
      }

      const item: MutationRequest = storedMutations[0];
      // console.log('Mutation queue processing - online')

      let variables = { data: item.data };

      try {
        // console.log('PUSH ITEM', item, this.pushQuery, variables)
        const result = await this.config.client?.mutate({
          mutation: this.pushQuery,
          variables,
        });
        if (result) {
          // console.log('RESULT MUTATION', result)
          await this.resultProcessor(item, result);
          await this.dequeueRequest();
          // console.log('Mutation dequeued')
        }
      } catch (error) {
        console.error(error);
      }
    }
    this.processing = false;
    // console.log('END Process')
  }

  /**
   * Helper method to flag that replication and start
   * processing the mutation queue.
   *
   */
  public startReplication() {
    this.replicating = true;
    this.process();
  }

  /**
   * Helper method to stop replication and stop the
   * processing of the mutation queue.
   */
  public stopReplication() {
    this.replicating = false;
  }

  private async resultProcessor(item: MutationRequest, data: FetchResult<any>) {
    // logger('Processing result from server')
    if (data.errors) {
      throw data.errors;
    }
    // const primaryKey = this.config.model.schema.getPrimaryKey()

    const returnedData = getFirstOperationData(data);
    if (!returnedData) {
      // Should not happen for valid queries/server
      throw new Error("Missing data from query.");
    }
    await this.config.model.processPushChanges(returnedData.returning[0]);
  }

  private async dequeueRequest() {
    // console.log('Removing request from the queue')
    const items = await this.getStoredMutations();
    if (items && items instanceof Array) {
      items.shift();
      const storeName = this.config.model.schema.getStoreName();
      const tableName = mutationQueueModel.getStoreName();
      await this.config.db?.table(tableName).put({
        [MODEL_METADATA_KEY]: storeName,
        items,
      });
      // invariant(saved, 'Store should be saved after mutation is rejected')
    } else {
      // logger('Should not happen')
    }
  }

  private async enqueueRequest(mutationRequest: MutationRequest) {
    // console.log('enqueueRequest')
    let items = await this.getStoredMutations();
    if (items && items instanceof Array) {
      items.push(mutationRequest);
    } else {
      items = [mutationRequest];
    }
    const tableName = mutationQueueModel.getStoreName();
    const storeName = this.config.model.schema.getStoreName();
    await this.config.db?.table(tableName).put({
      [MODEL_METADATA_KEY]: storeName,
      items,
    });
  }

  private async getStoredMutations() {
    const tableName = mutationQueueModel.getStoreName();
    const storeName = this.config.model.schema.getStoreName();
    const data = await this.config.db?.table(tableName).get(storeName);
    if (data) {
      if (data.items.length !== 0) {
        return data.items;
      }
    }
  }
}
