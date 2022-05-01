import { AuthIndicator } from './../auth/AuthIndicator';
import { Model } from "../Model";
import { NetworkIndicator } from "../network/NetworkIndicator";
import { WebNetworkStatus } from "../network/WebNetworkStatus";
import { ModelReplicator } from "./ModelReplicator";
import { GraphQLReplicationConfig } from "./types";

export class GraphQLReplicator {
  private config: GraphQLReplicationConfig
  private models: Model[]
  private networkIndicator: NetworkIndicator
  private authStatus!: AuthIndicator

  constructor(models: Model[], config: GraphQLReplicationConfig) {
    this.config = config
    this.models = models
    this.networkIndicator = new NetworkIndicator(new WebNetworkStatus())
    if (this.config.db) {
      this.authStatus = new AuthIndicator(this.config.db.getAuthProvider())
      this.authStatus.subscribe({
        next: (authStatus) => {
          this.models.forEach((model) => {
            const canRead = model.getModelReplicator()?.canRead()
            const canWrite = model.getModelReplicator()?.canWrite()
            model.stopPullReplication()
            model.stopPushReplication()
            model.stopSubscriptionReplication()
            model.stopUploadReplication()
            if (canRead) {
              console.log(`Model ${model.schema.getStoreName()} - start model replication`)
              model.startPullReplication()
              model.startSubscriptionReplication()
            } else {
              console.log(`Model ${model.schema.getStoreName()} - delete synced data`)
              model.deleteSynced()
            }
            if (canWrite) {
              console.log(`Model ${model.schema.getStoreName()} - start model push replication`)
              model.startPushReplication()
              model.startUploadReplication()
            }
          })
        },
        complete: () => {},
        error: () => {},
      })
    } 
    this.networkIndicator.initialize(this.config.wsClient)
  }

  public init() {
    if (!this.models.length) {
      throw 'No models provided for replication'
    }
    for (const model of this.models) {
      const modelReplicator = new ModelReplicator({
        client: this.config.client,
        db: this.config.db,
        subsUrl: this.config.subsUrl,
        // wsClient: this.config.wsClient,
        networkIndicator: this.networkIndicator,
        authStatus: this.authStatus,
        model,
        deletedField: 'deleted',
        s3Client: this.config.s3Client
      })
      // console.log('set model replicator', model, modelReplicator)
      model.setModelReplicator(modelReplicator)
    }
  }

  public startPullModelsReplication() {
    this.models.forEach((model) => {
      model.getModelReplicator()?.startPullReplication()
    })
  }

  public stoptPullModelsReplication() {
    this.models.forEach((model) => {
      model.getModelReplicator()?.stopPullReplication()
    })
  }

  public getNetworkIndicator() {
    return this.networkIndicator
  }

  public getAuthIndicator() {
    return this.authStatus
  }
}