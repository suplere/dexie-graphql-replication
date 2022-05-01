import { ApolloQueryResult } from "@apollo/client/core/types";
import { ApolloError } from "@apollo/client/errors";
import { DocumentNode } from "graphql";
import { ApplicationDexie } from "../DataStore";
import { metadataModel, QueryMetadata } from "../metadata/MetadataModels";
import { NetworkStatusEvent } from "../network/NetworkStatus";
import { buildQuery } from "./builders/buildQuery";
import { PullReplicationConfig } from "./types";

export class PullReplicator {
  private config: PullReplicationConfig;
  private activePullInterval?: number | undefined; // number setInterval for pulled query
  private pullQuery: DocumentNode;
  private performLock: boolean = false;

  constructor(config: PullReplicationConfig) {
    this.config = config;
    this.pullQuery = buildQuery(this.config);

    // subscribe to change network
    this.config.networkIndicator.subscribe({
      next: (message: NetworkStatusEvent) => {
        if (message.isOnline) {
          if (this.config.model.canRead()) {
            if (this.activePullInterval) {
              // We just want to get extra delta when becoming online
              this.perform();
            } else {
              this.start();
            }
          }
        } else {
          this.stop();
        }
      },
      complete: () => {},
      error: () => {},
    });
  }

  // run pull replication
  public async perform() {
    // Check if perform loc is turned
    if (!this.performLock && this.config.client) {
      this.performLock = true;
      try {
        // console.log("Delta about to be fetched");
        let lastSync = await this.loadLastSync();
        if (!lastSync) {
          lastSync = new Date(0).toISOString();
        }
        const result = await this.config.client.query({
          query: this.pullQuery,
          variables: {
            lastSync,
          },
        });
        // console.log(result)
        await this.processResult(result);
      } catch (error) {
        // logger(`Replication error ${error}`);
      } finally {
        this.performLock = false;
      }
    } else {
      // logger("Delta already processing. Interval suspended");
    }
  }

  // setup repeat replication
  public async start() {
    // Only when online
    if (await this.config.networkIndicator.isNetworkReachable()) {
      // console.log('Online. Delta executing delta')
      if (this.config.pullInterval) {
        this.perform()
          .then(() => {
            this.activePullInterval = window.setInterval(() => {
              this.perform();
            }, this.config.pullInterval);
          })
          .catch((error: ApolloError) => {
            console.log(error);
          });
      } else {
        // one time replication
        this.perform();
      }
    } else {
      // logger("Offline. Delta suspended");
    }
  }

  private async processResult(result: ApolloQueryResult<any>) {
    if (result.error) {
      // logger('Delta error')
      throw result.error;
    }
    const model = this.config.model;
    if (result.data) {
      // console.log('Delta retrieved from server', result.data)
      const keys = Object.keys(result.data);
      if (keys.length !== 1) {
        console.log(
          `Invalid GraphQL result. Please review your network requests: ${JSON.stringify(
            result.data
          )}`
        );
        return;
      }
      const firstOperationName = keys[0];
      const deltaResult = result.data[firstOperationName];
      // console.log('Delta retrieved from server', deltaResult)
      await model.processPullChanges(deltaResult);
      await this.saveLastSync(new Date().toISOString());
    }
  }

  // stop replication
  public stop() {
    clearInterval(this.activePullInterval);
    this.activePullInterval = undefined;
  }

  private async saveLastSync(lastSync: string) {
    const storeName = metadataModel.getStoreName();
    const idKey = metadataModel.getPrimaryKey();
    const objectToSave = {
      [idKey]: this.config.model.getStoreName(),
      lastSync,
    };
    return await this.config.db?.table(storeName).put(objectToSave);
  }

  private async loadLastSync(
    db: ApplicationDexie = this.config.db as ApplicationDexie
  ) {
    const storeName = metadataModel.getStoreName();
    const idKey = metadataModel.getPrimaryKey();
    const item: QueryMetadata = await db
      .table(storeName)
      .get({ [idKey]: this.config.model.getStoreName() });

    return item?.lastSync;
  }
}
