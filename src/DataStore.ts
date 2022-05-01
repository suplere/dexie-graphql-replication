import Dexie from "dexie";
import { DataStoreConfig } from "./DataStoreConfig";
import { GraphQLReplicator } from "./GraphQLReplication/GraphQLReplicator";
import {
  metadataModel,
  MODEL_METADATA_KEY,
  mutationQueueModel,
  uploadQueueModel,
} from "./metadata/MetadataModels";
import { Model } from "./Model";
import { ModelJsonSchema, ModelSchema } from "./ModelSchema";
import { DexieStoresType } from "./types";

export class ApplicationDexie extends Dexie {
  // private replicator?: GraphQLReplicator
  private config: DataStoreConfig;
  private models: Model[];
  private versionDB: number;
  private replicator?: GraphQLReplicator;

  constructor(config: DataStoreConfig) {
    const dbName = `dexie-${config.dbName ? config.dbName : "db"}`;
    const version = config.schemaVersion ? config.schemaVersion : 1;
    super(dbName);
    this.config = config;
    this.versionDB = version;
    this.models = [];
  }

  /**
   * Initialize specific model using it's schema.
   *
   * @param schema - model schema containing fields and other details used to persist data
   * @param replicationConfig optional override for replication configuration for this particular model
   */
  public setupModel<T>(schema: ModelJsonSchema<T>) {
    const modelSchema = new ModelSchema(schema);
    const model = new Model<T>(modelSchema, this);
    this.models.push(model);
    return model;
  }

  public getModels(): Model[] {
    return this.models;
  }

  public getVersion(): number {
    return this.versionDB;
  }

  public getAuthProvider() {
    return this.config.authProvider;
  }

  public initDB() {
    let storesSchema: DexieStoresType = {};
    const models = this.getModels();
    const version = this.getVersion();
    const db = this;
    if (models) {
      // init DB tables via this.models
      models.forEach((model: Model) => {
        storesSchema[model.getStoreName()] = model.getIndexes().join(",");
      });
      // INIT METADATA tables
      const metaQueryStore = metadataModel.getStoreName();
      storesSchema[metaQueryStore] = `&${MODEL_METADATA_KEY}`;
      const metaMutationStoreName = mutationQueueModel.getStoreName();
      storesSchema[metaMutationStoreName] = `&${MODEL_METADATA_KEY}`;
      const metaUploadStoreName = uploadQueueModel.getStoreName();
      storesSchema[metaUploadStoreName] = `&${MODEL_METADATA_KEY}`;

      //create tables
      db.version(version).stores(storesSchema);

      //setup models replicator
      this.replicator = new GraphQLReplicator(models, {
        client: this.config.replicationConfig?.client,
        wsClient: this.config.replicationConfig?.wsClient,
        subsUrl: this.config.replicationConfig?.subsUrl,
        db,
        s3Client: this.config.replicationConfig?.s3Client,
      });
    }
  }

  public replicatorInit() {
    this.replicator?.init();
  }

  /**
   * Start fetch replication for the entire datastore
   *
   */
  public startReplication() {
    this.replicator?.startPullModelsReplication();
  }

  /**
   * Stop replication for the entire datastore
   *
   */
  public stopReplication() {
    this.replicator?.stoptPullModelsReplication();
  }

  /**
   * Expose the Datastore network indicator to
   * the client.
   */
  public getNetworkIndicator() {
    return this.replicator?.getNetworkIndicator();
  }

  /**
   * Initialize datastore
   */
}
